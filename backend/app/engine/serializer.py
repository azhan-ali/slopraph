"""
Graph serializer — Phase 2.

Converts a `networkx.DiGraph` (enriched with per-node metrics by
`compute_metrics`) into the `{nodes, edges}` JSON shape that the
Next.js frontend's force-directed graph visualisation consumes.

Node shape (mirrors `GraphNode` in models.py):
    id          str
    author      str
    text        str         (truncated to 200 chars for payload size)
    score       int
    depth       int
    is_removed  bool
    reply_count int
    subtree_size int
    centrality  float
    is_leaf     bool

Edge shape (mirrors `GraphEdge` in models.py):
    source      str         (parent node id)
    target      str         (child node id)

The serializer is intentionally a thin transformation layer — it does not
compute anything new. All metrics must already be on the graph nodes before
calling `serialize_graph`.
"""

from __future__ import annotations

import networkx as nx

# Maximum text length included in each node payload.
# Keeps the JSON response size bounded even for large threads.
_MAX_TEXT_LEN = 200


def serialize_graph(G: nx.DiGraph) -> tuple[list[dict], list[dict]]:
    """
    Serialize a metrics-enriched DiGraph into (nodes, edges) lists.

    Args:
        G: A DiGraph that has been processed by `compute_metrics`.

    Returns:
        A 2-tuple (nodes, edges) where each element is a list of dicts
        ready for JSON serialization.
    """
    nodes: list[dict] = []
    for node_id in G.nodes:
        attrs = G.nodes[node_id]
        text = attrs.get("text", "")
        if len(text) > _MAX_TEXT_LEN:
            text = text[:_MAX_TEXT_LEN - 1] + "…"

        nodes.append(
            {
                "id": node_id,
                "author": attrs.get("author", ""),
                "text": text,
                "score": attrs.get("score", 0),
                "depth": attrs.get("depth", 0),
                "is_removed": attrs.get("is_removed", False),
                "reply_count": attrs.get("reply_count", 0),
                "subtree_size": attrs.get("subtree_size", 1),
                "centrality": attrs.get("centrality", 0.0),
                "is_leaf": attrs.get("is_leaf", True),
            }
        )

    edges: list[dict] = [
        {"source": src, "target": tgt}
        for src, tgt in G.edges
    ]

    return nodes, edges
