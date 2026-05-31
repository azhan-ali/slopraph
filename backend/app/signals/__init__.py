"""
Detection signals package — Phase 3.

Three hard-to-fake structural signals:
  latency    — reply timing distribution (burst detection + regularity)
  vocab_echo — vocabulary echo matrix (shared rare phrases = bot-ring)
  consensus  — synthetic consensus pattern (unnatural agreement curves)

The aggregator combines all three into per-node authenticity scores
and a thread-level health score (0–100).
"""

from app.signals.aggregator import AggregatorResult, NodeSignalResult, aggregate_signals
from app.signals.consensus import ConsensusResult, compute_consensus_signal
from app.signals.latency import LatencyResult, compute_latency_signal
from app.signals.vocab_echo import VocabEchoResult, compute_vocab_echo_signal

__all__ = [
    "AggregatorResult",
    "NodeSignalResult",
    "aggregate_signals",
    "ConsensusResult",
    "compute_consensus_signal",
    "LatencyResult",
    "compute_latency_signal",
    "VocabEchoResult",
    "compute_vocab_echo_signal",
]
