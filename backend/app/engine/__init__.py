"""
Graph engine package.

Phase 2 components:
  graph_builder  — List[Comment] → networkx.DiGraph
  metrics        — per-node and thread-level topology metrics
  serializer     — DiGraph → {nodes, edges} JSON for the frontend
"""

from app.engine.graph_builder import build_graph
from app.engine.metrics import compute_metrics
from app.engine.serializer import serialize_graph

__all__ = ["build_graph", "compute_metrics", "serialize_graph"]
