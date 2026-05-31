"""
Signal aggregator — Phase 3.

Combines the 3 detection signals into:
  1. Per-node authenticity score (0–100, higher = more authentic).
  2. Per-node badge: "human" | "suspicious" | "bot".
  3. Thread health score (0–100, higher = healthier / more authentic).

Weighting rationale
-------------------
  Latency    35%  — timing is hard to fake at scale
  Vocab echo 35%  — shared rare phrases are a strong bot-ring signal
  Consensus  30%  — affirmation patterns are common but less unique

Thread health formula
---------------------
  raw_suspicion = 0.35 * latency + 0.35 * echo + 0.30 * consensus
  thread_health = round((1 - raw_suspicion) * 100)

Per-node score
--------------
  Each node gets a suspicion score from each signal that produced one.
  Missing signals default to 0 (neutral). The combined suspicion is
  converted to an authenticity score: auth = (1 - suspicion) * 100.

Badge thresholds
----------------
  auth >= 70  → "human"      (✅)
  auth >= 40  → "suspicious" (⚠️)
  auth <  40  → "bot"        (🚩)
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from app.signals.consensus import ConsensusResult
from app.signals.latency import LatencyResult
from app.signals.vocab_echo import VocabEchoResult

logger = logging.getLogger(__name__)

# Signal weights (must sum to 1.0).
_W_LATENCY = 0.35
_W_ECHO = 0.35
_W_CONSENSUS = 0.30

# Badge thresholds (authenticity score 0–100).
BADGE_HUMAN = 70
BADGE_SUSPICIOUS = 40


@dataclass
class NodeSignalResult:
    """Per-node aggregated signal output."""

    node_id: str
    latency_score: float = 0.0      # 0–1 suspicion
    echo_score: float = 0.0         # 0–1 suspicion
    consensus_score: float = 0.0    # 0–1 suspicion
    combined_suspicion: float = 0.0 # 0–1 weighted
    authenticity: int = 100         # 0–100 (higher = more authentic)
    badge: str = "human"            # "human" | "suspicious" | "bot"


@dataclass
class AggregatorResult:
    """Full output of the signal aggregator."""

    # Per-node results
    node_results: dict[str, NodeSignalResult] = field(default_factory=dict)

    # Thread-level signal scores (0–1 suspicion)
    latency_suspicion: float = 0.0
    echo_suspicion: float = 0.0
    consensus_suspicion: float = 0.0
    combined_suspicion: float = 0.0

    # Thread health (0–100, higher = more authentic)
    thread_health: int = 100

    # Echo rings (from vocab echo signal)
    echo_rings: list[list[str]] = field(default_factory=list)

    # Counts by badge
    human_count: int = 0
    suspicious_count: int = 0
    bot_count: int = 0


def aggregate_signals(
    node_ids: list[str],
    latency: LatencyResult,
    echo: VocabEchoResult,
    consensus: ConsensusResult,
) -> AggregatorResult:
    """
    Combine the 3 signal results into per-node scores and thread health.

    Args:
        node_ids:  All node ids in the graph (from serializer output).
        latency:   Output of `compute_latency_signal`.
        echo:      Output of `compute_vocab_echo_signal`.
        consensus: Output of `compute_consensus_signal`.

    Returns:
        An `AggregatorResult` with all scores populated.
    """
    result = AggregatorResult(
        latency_suspicion=latency.latency_suspicion,
        echo_suspicion=echo.echo_suspicion,
        consensus_suspicion=consensus.consensus_suspicion,
        echo_rings=echo.echo_rings,
    )

    # ── Thread-level combined suspicion ───────────────────────────────
    result.combined_suspicion = round(
        _W_LATENCY * latency.latency_suspicion
        + _W_ECHO * echo.echo_suspicion
        + _W_CONSENSUS * consensus.consensus_suspicion,
        4,
    )
    result.thread_health = max(0, min(100, round((1.0 - result.combined_suspicion) * 100)))

    # ── Per-node scores ────────────────────────────────────────────────
    for node_id in node_ids:
        lat_s = latency.node_scores.get(node_id, 0.0)
        echo_s = echo.node_scores.get(node_id, 0.0)
        cons_s = consensus.node_scores.get(node_id, 0.0)

        combined = round(
            _W_LATENCY * lat_s + _W_ECHO * echo_s + _W_CONSENSUS * cons_s, 4
        )
        authenticity = max(0, min(100, round((1.0 - combined) * 100)))

        if authenticity >= BADGE_HUMAN:
            badge = "human"
            result.human_count += 1
        elif authenticity >= BADGE_SUSPICIOUS:
            badge = "suspicious"
            result.suspicious_count += 1
        else:
            badge = "bot"
            result.bot_count += 1

        result.node_results[node_id] = NodeSignalResult(
            node_id=node_id,
            latency_score=lat_s,
            echo_score=echo_s,
            consensus_score=cons_s,
            combined_suspicion=combined,
            authenticity=authenticity,
            badge=badge,
        )

    logger.info(
        "Aggregator: thread_health=%d human=%d suspicious=%d bot=%d",
        result.thread_health,
        result.human_count,
        result.suspicious_count,
        result.bot_count,
    )

    return result
