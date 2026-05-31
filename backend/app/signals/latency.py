"""
Signal 1 — Reply Latency Distribution.

Real users follow a power-law / log-normal reply-time distribution:
a few very fast replies, most replies in a moderate window, a long tail.
Bots show one of two suspicious patterns:
  • Uniform bursts: many replies within a very short window (seconds apart).
  • Suspiciously regular spacing: all inter-reply gaps nearly identical.

What we compute
---------------
Per-author:
  latency_burst_score   float [0–1]  — fraction of this author's replies
                                        that arrived within BURST_WINDOW_S
                                        of the previous reply in the thread.
  latency_regularity    float [0–1]  — coefficient of variation (CV) of
                                        inter-reply gaps; LOW CV = suspicious
                                        regularity. Inverted so 1 = most
                                        suspicious.

Thread-level:
  burst_ratio           float [0–1]  — fraction of all reply-pairs with gap
                                        < BURST_WINDOW_S.
  regularity_score      float [0–1]  — mean per-author regularity suspicion.
  latency_suspicion     float [0–1]  — combined thread-level latency signal.

Design notes
------------
• We only look at replies that have a parent (i.e. not the OP).
• Timestamps come from the graph node attributes (set by the adapter).
• Removed/deleted comments are included for timing purposes — their
  timestamp is still meaningful for the graph topology.
• With very few comments (< 3 reply-pairs) the signal is unreliable;
  we return 0.0 (neutral) rather than a noisy estimate.
"""

from __future__ import annotations

import logging
import math
from dataclasses import dataclass, field

import networkx as nx

logger = logging.getLogger(__name__)

# A reply arriving within this many seconds of the previous one is a "burst".
BURST_WINDOW_S: float = 30.0

# Minimum number of reply-pairs needed for a meaningful latency signal.
MIN_PAIRS: int = 3


@dataclass
class LatencyResult:
    """Output of the latency signal computation."""

    # Per-author suspicion scores (author → 0–1)
    author_burst_scores: dict[str, float] = field(default_factory=dict)
    author_regularity_scores: dict[str, float] = field(default_factory=dict)

    # Thread-level aggregates
    burst_ratio: float = 0.0
    regularity_score: float = 0.0
    latency_suspicion: float = 0.0   # combined 0–1 score

    # Per-node suspicion (node_id → 0–1), for graph node annotation
    node_scores: dict[str, float] = field(default_factory=dict)


def compute_latency_signal(G: nx.DiGraph) -> LatencyResult:
    """
    Compute reply-latency suspicion scores from the conversation graph.

    Args:
        G: A DiGraph enriched by `build_graph` (nodes have `timestamp`,
           `author`, `parent_id` attributes).

    Returns:
        A `LatencyResult` with per-author and thread-level scores.
    """
    result = LatencyResult()

    if G.number_of_nodes() < 2:
        return result

    # Collect all (parent_ts, child_ts, child_id, author) tuples for replies.
    reply_pairs: list[tuple[float, float, str, str]] = []
    for node_id in G.nodes:
        attrs = G.nodes[node_id]
        parent_id = attrs.get("parent_id")
        if parent_id is None or parent_id not in G:
            continue
        parent_ts = G.nodes[parent_id].get("timestamp", 0.0)
        child_ts = attrs.get("timestamp", 0.0)
        author = attrs.get("author", "")
        gap = max(0.0, child_ts - parent_ts)
        reply_pairs.append((parent_ts, gap, node_id, author))

    if len(reply_pairs) < MIN_PAIRS:
        return result

    # ── Thread-level burst ratio ──────────────────────────────────────
    burst_count = sum(1 for _, gap, _, _ in reply_pairs if gap < BURST_WINDOW_S)
    result.burst_ratio = round(burst_count / len(reply_pairs), 4)

    # ── Per-author burst + regularity ─────────────────────────────────
    author_gaps: dict[str, list[float]] = {}
    for _, gap, node_id, author in reply_pairs:
        author_gaps.setdefault(author, []).append(gap)

    for author, gaps in author_gaps.items():
        # Burst score: fraction of this author's replies that are bursts.
        burst_score = sum(1 for g in gaps if g < BURST_WINDOW_S) / len(gaps)
        result.author_burst_scores[author] = round(burst_score, 4)

        # Regularity: coefficient of variation (std/mean). Low CV = suspicious.
        if len(gaps) >= 2:
            mean_gap = sum(gaps) / len(gaps)
            if mean_gap > 0:
                variance = sum((g - mean_gap) ** 2 for g in gaps) / len(gaps)
                std_gap = math.sqrt(variance)
                cv = std_gap / mean_gap
                # Invert and clamp: CV=0 (perfectly regular) → suspicion=1.0
                # CV=2+ (very irregular) → suspicion≈0.0
                regularity_suspicion = max(0.0, 1.0 - min(cv / 2.0, 1.0))
            else:
                regularity_suspicion = 1.0  # all gaps = 0 → maximally suspicious
        else:
            regularity_suspicion = 0.0  # not enough data
        result.author_regularity_scores[author] = round(regularity_suspicion, 4)

    # ── Thread-level regularity score ─────────────────────────────────
    if result.author_regularity_scores:
        result.regularity_score = round(
            sum(result.author_regularity_scores.values())
            / len(result.author_regularity_scores),
            4,
        )

    # ── Combined latency suspicion ─────────────────────────────────────
    # Weighted: burst_ratio carries more weight (more reliable signal).
    result.latency_suspicion = round(
        0.6 * result.burst_ratio + 0.4 * result.regularity_score, 4
    )

    # ── Per-node scores ────────────────────────────────────────────────
    for _, gap, node_id, author in reply_pairs:
        burst_s = result.author_burst_scores.get(author, 0.0)
        reg_s = result.author_regularity_scores.get(author, 0.0)
        node_score = round(0.6 * burst_s + 0.4 * reg_s, 4)
        result.node_scores[node_id] = node_score

    return result
