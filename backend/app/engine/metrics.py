"""
Topology metrics — Phase 2.

Computes per-node and thread-level structural metrics from the conversation
graph. These metrics are:

  1. Stored as node attributes (enriching the graph in-place).
  2. Aggregated into a `ThreadMetrics` dataclass for the API response.

All metrics are computed from graph structure alone — no text analysis.
Text-based signals (latency, vocab echo, consensus) arrive in Phase 3.

Per-node metrics
----------------
  reply_count     int     — number of direct children (out-degree of node)
  subtree_size    int     — total descendants (all nodes reachable from this node)
  is_leaf         bool    — True if the node has no children
  centrality      float   — betweenness centrality (0–1), normalised

Thread-level metrics
--------------------
  node_count          int
  edge_count          int
  max_depth           int     — longest path from root
  avg_depth           float
  unique_authors      int
  branching_factor    float   — mean out-degree of non-leaf nodes
  leaf_ratio          float   — fraction of nodes with no replies
  is_connected        bool    — True if the underlying undirected graph is connected
  density             float   — edge_count / (node_count * (node_count - 1))
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import networkx as nx

logger = logging.getLogger(__name__)


@dataclass
class ThreadMetrics:
    """Aggregated thread-level topology metrics."""

    node_count: int = 0
    edge_count: int = 0
    max_depth: int = 0
    avg_depth: float = 0.0
    unique_authors: int = 0
    branching_factor: float = 0.0
    leaf_ratio: float = 0.0
    is_connected: bool = True
    density: float = 0.0
    # Per-node metrics are stored on the graph itself; this dict is a
    # convenience copy for the API serializer.
    node_metrics: dict[str, dict] = field(default_factory=dict)


def compute_metrics(G: nx.DiGraph) -> ThreadMetrics:
    """
    Enrich the graph with per-node metrics and return thread-level aggregates.

    The graph is mutated in-place (node attributes added). The returned
    `ThreadMetrics` object mirrors those attributes for easy serialization.

    Args:
        G: A DiGraph as produced by `build_graph`. May be empty.

    Returns:
        A `ThreadMetrics` instance with all fields populated.
    """
    if G.number_of_nodes() == 0:
        return ThreadMetrics()

    n = G.number_of_nodes()
    e = G.number_of_edges()

    # ── Per-node: reply_count, subtree_size, is_leaf ──────────────────
    for node in G.nodes:
        reply_count = G.out_degree(node)
        # Subtree size = all nodes reachable from this node (descendants only).
        # nx.descendants returns a set; +1 to include the node itself.
        subtree_size = len(nx.descendants(G, node)) + 1
        is_leaf = reply_count == 0

        G.nodes[node]["reply_count"] = reply_count
        G.nodes[node]["subtree_size"] = subtree_size
        G.nodes[node]["is_leaf"] = is_leaf

    # ── Per-node: betweenness centrality ──────────────────────────────
    # Normalised betweenness centrality (0–1). Expensive on huge graphs
    # but our max_comments cap (≤1000) keeps it tractable.
    try:
        centrality: dict[str, float] = nx.betweenness_centrality(G, normalized=True)
    except Exception as exc:  # pragma: no cover
        logger.warning("Betweenness centrality failed: %s — defaulting to 0", exc)
        centrality = {node: 0.0 for node in G.nodes}

    for node, c_val in centrality.items():
        G.nodes[node]["centrality"] = round(c_val, 6)

    # ── Thread-level aggregates ────────────────────────────────────────
    depths: list[int] = [
        G.nodes[node].get("depth", 0) for node in G.nodes
    ]
    max_depth = max(depths) if depths else 0
    avg_depth = sum(depths) / len(depths) if depths else 0.0

    authors: set[str] = {
        G.nodes[node].get("author", "") for node in G.nodes
    }
    unique_authors = len(authors)

    # Branching factor = mean out-degree of non-leaf nodes.
    non_leaf_degrees = [G.out_degree(n) for n in G.nodes if G.out_degree(n) > 0]
    branching_factor = (
        sum(non_leaf_degrees) / len(non_leaf_degrees) if non_leaf_degrees else 0.0
    )

    leaf_count = sum(1 for n in G.nodes if G.out_degree(n) == 0)
    leaf_ratio = leaf_count / n if n > 0 else 0.0

    # Connectivity check on the underlying undirected graph.
    try:
        is_connected = nx.is_weakly_connected(G) if n > 1 else True
    except Exception:  # pragma: no cover
        is_connected = True

    # Graph density: e / (n*(n-1)) for directed graphs.
    density = nx.density(G)

    # ── Build per-node metrics dict for serializer ─────────────────────
    node_metrics: dict[str, dict] = {}
    for node in G.nodes:
        attrs = G.nodes[node]
        node_metrics[node] = {
            "reply_count": attrs.get("reply_count", 0),
            "subtree_size": attrs.get("subtree_size", 1),
            "is_leaf": attrs.get("is_leaf", True),
            "centrality": attrs.get("centrality", 0.0),
            "depth": attrs.get("depth", 0),
        }

    return ThreadMetrics(
        node_count=n,
        edge_count=e,
        max_depth=max_depth,
        avg_depth=round(avg_depth, 3),
        unique_authors=unique_authors,
        branching_factor=round(branching_factor, 3),
        leaf_ratio=round(leaf_ratio, 3),
        is_connected=is_connected,
        density=round(density, 6),
        node_metrics=node_metrics,
    )
