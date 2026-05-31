"""
Signal 3 — Synthetic Consensus Pattern.

Real threads disagree. Bot threads show unnatural agreement:
  • Most replies are generic affirmations ("totally agree", "great point").
  • The distribution of sentiment/stance is unnaturally skewed.
  • Replies don't actually engage with the parent's content.

What we compute
---------------
We use a lightweight lexicon-based approach (no external model required)
to classify each reply as:
  • AFFIRM   — generic agreement / positive affirmation
  • NEUTRAL  — no clear stance
  • DISSENT  — disagreement / counter-argument

Per-comment:
  stance          str         — "affirm" | "neutral" | "dissent"
  affirmation_score float     — 0–1, how strongly this comment affirms

Thread-level:
  affirm_ratio    float       — fraction of replies that are affirmations
  dissent_ratio   float       — fraction of replies that are dissents
  consensus_suspicion float   — 0–1 suspicion score

The suspicion score is high when:
  1. affirm_ratio is very high (>0.7) — unnatural agreement.
  2. dissent_ratio is very low (<0.05) — no pushback at all.
  3. The combination of both.

Design notes
------------
• We only score non-OP comments (replies), not the original post.
• Removed/deleted comments are scored as NEUTRAL (no text to analyse).
• The lexicon is intentionally simple and fast — this is a structural
  signal, not a sentiment classifier. False positives are acceptable
  because the signal is combined with 2 others in the aggregator.
• With fewer than 3 replies the signal is unreliable; we return neutral.
"""

from __future__ import annotations

import logging
import re
from dataclasses import dataclass, field

import networkx as nx

logger = logging.getLogger(__name__)

# Minimum replies needed for a meaningful consensus signal.
MIN_REPLIES: int = 3

# ── Affirmation lexicon ────────────────────────────────────────────────────
# Phrases that strongly indicate generic agreement / bot-like affirmation.
# Ordered from most specific to least specific.
_AFFIRM_PHRASES: list[str] = [
    "totally agree",
    "couldn't agree more",
    "absolutely agree",
    "100% agree",
    "so true",
    "well said",
    "great point",
    "good point",
    "exactly right",
    "spot on",
    "this is so true",
    "couldn't have said it better",
    "perfectly said",
    "very insightful",
    "great insight",
    "thanks for sharing",
    "thank you for sharing",
    "very helpful",
    "so helpful",
    "great post",
    "great article",
    "love this",
    "love it",
    "amazing",
    "awesome",
    "fantastic",
    "wonderful",
    "excellent",
    "brilliant",
    "delve into",
    "tapestry of",
    "rich tapestry",
    "in conclusion",
    "it is worth noting",
    "it is important to note",
    "as an ai",
    "as a language model",
]

# ── Dissent lexicon ────────────────────────────────────────────────────────
_DISSENT_PHRASES: list[str] = [
    "disagree",
    "don't agree",
    "do not agree",
    "not true",
    "that's wrong",
    "that is wrong",
    "incorrect",
    "actually",
    "however",
    "but wait",
    "on the contrary",
    "i think you're wrong",
    "i think you are wrong",
    "not necessarily",
    "that's not",
    "that is not",
    "wrong",
    "false",
    "misleading",
    "no, ",
    "nope",
    "nah,",
    "counterpoint",
    "counter-point",
    "to be fair",
    "to be honest",
    "tbh",
    "imo",
    "in my opinion",
    "i disagree",
]


def _normalise(text: str) -> str:
    """Lowercase, collapse whitespace, strip punctuation for matching."""
    text = text.lower()
    text = re.sub(r"[^\w\s]", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text


def _classify_stance(text: str) -> tuple[str, float]:
    """
    Classify a comment as 'affirm', 'neutral', or 'dissent'.

    Returns:
        (stance, affirmation_score) where affirmation_score is 0–1.
    """
    if not text or not text.strip():
        return "neutral", 0.0

    norm = _normalise(text)

    # Count matching phrases.
    affirm_hits = sum(1 for p in _AFFIRM_PHRASES if p in norm)
    dissent_hits = sum(1 for p in _DISSENT_PHRASES if p in norm)

    if dissent_hits > affirm_hits:
        return "dissent", 0.0

    if affirm_hits > 0:
        # Score based on density of affirmation phrases relative to text length.
        word_count = max(1, len(norm.split()))
        density = min(affirm_hits / (word_count / 10), 1.0)
        return "affirm", round(density, 4)

    return "neutral", 0.0


@dataclass
class ConsensusResult:
    """Output of the consensus signal computation."""

    # Per-node stance and affirmation score
    node_stances: dict[str, str] = field(default_factory=dict)
    node_affirmation_scores: dict[str, float] = field(default_factory=dict)

    # Thread-level aggregates
    affirm_ratio: float = 0.0
    dissent_ratio: float = 0.0
    neutral_ratio: float = 0.0
    consensus_suspicion: float = 0.0   # 0–1

    # Per-node suspicion (node_id → 0–1)
    node_scores: dict[str, float] = field(default_factory=dict)


def compute_consensus_signal(G: nx.DiGraph) -> ConsensusResult:
    """
    Compute synthetic consensus suspicion scores from the conversation graph.

    Args:
        G: A DiGraph enriched by `build_graph` (nodes have `text`,
           `is_removed`, `parent_id` attributes).

    Returns:
        A `ConsensusResult` with per-node and thread-level scores.
    """
    result = ConsensusResult()

    if G.number_of_nodes() < 2:
        return result

    # Only score replies (non-root nodes).
    reply_nodes = [
        node_id for node_id in G.nodes
        if G.nodes[node_id].get("parent_id") is not None
    ]

    if len(reply_nodes) < MIN_REPLIES:
        return result

    # ── Classify each reply ────────────────────────────────────────────
    affirm_count = 0
    dissent_count = 0
    neutral_count = 0

    for node_id in reply_nodes:
        attrs = G.nodes[node_id]
        text = attrs.get("text", "")
        is_removed = attrs.get("is_removed", False)

        if is_removed:
            stance, aff_score = "neutral", 0.0
        else:
            stance, aff_score = _classify_stance(text)

        result.node_stances[node_id] = stance
        result.node_affirmation_scores[node_id] = aff_score

        if stance == "affirm":
            affirm_count += 1
        elif stance == "dissent":
            dissent_count += 1
        else:
            neutral_count += 1

    total = len(reply_nodes)
    result.affirm_ratio = round(affirm_count / total, 4)
    result.dissent_ratio = round(dissent_count / total, 4)
    result.neutral_ratio = round(neutral_count / total, 4)

    # ── Consensus suspicion ────────────────────────────────────────────
    # High affirm_ratio + low dissent_ratio = suspicious.
    # Formula: suspicion = affirm_ratio * (1 - dissent_ratio)
    # This gives 0 when there's no affirmation, and 1 when everything
    # affirms and nothing dissents.
    suspicion = result.affirm_ratio * (1.0 - result.dissent_ratio)
    result.consensus_suspicion = round(suspicion, 4)

    # ── Per-node scores ────────────────────────────────────────────────
    for node_id in reply_nodes:
        stance = result.node_stances.get(node_id, "neutral")
        aff_score = result.node_affirmation_scores.get(node_id, 0.0)
        # Affirming nodes get their affirmation score; others get 0.
        result.node_scores[node_id] = aff_score if stance == "affirm" else 0.0

    return result
