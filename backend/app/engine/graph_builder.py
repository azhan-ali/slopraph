"""
Graph builder — Phase 2.

Converts a flat list of `Comment` objects (as produced by any adapter) into
a `networkx.DiGraph` where:

  • Every comment is a node, keyed by its `id`.
  • Every reply relationship is a directed edge: parent → child.
  • All Comment fields are stored as node attributes so downstream
    metrics and signals can read them without touching the original list.

Design decisions
----------------
• Directed graph (DiGraph) rather than undirected: the direction of a reply
  (parent → child) carries information — it tells us who initiated the
  sub-conversation. Signals like reply-vacuity and latency need this.
• Orphan handling: if a comment's parent_id is not in the node set (can
  happen with truncated threads), we attach it to the root node rather than
  dropping it. This keeps the graph connected and avoids silent data loss.
• The root node (OP, parent_id == None) is always present; if somehow
  missing from the list we synthesise a minimal placeholder so the graph
  is never empty.
"""

from __future__ import annotations

import logging
from typing import Sequence

import networkx as nx

from app.models import Comment

logger = logging.getLogger(__name__)


def build_graph(comments: Sequence[Comment]) -> nx.DiGraph:
    """
    Build a directed conversation graph from a list of normalised comments.

    Args:
        comments: Flat list of Comment objects. The OP (parent_id == None)
                  should be first, but the function is order-independent.

    Returns:
        A `networkx.DiGraph` with one node per comment and one directed edge
        per reply relationship (parent → child).

    Node attributes (all accessible via `G.nodes[node_id]`):
        author      str
        timestamp   float   (unix epoch)
        text        str
        score       int
        depth       int
        is_removed  bool
        in_degree   int     (number of direct replies received)
        out_degree  int     (number of comments this node replied to; 0 or 1)
    """
    if not comments:
        logger.warning("build_graph called with empty comment list — returning empty graph")
        return nx.DiGraph()

    G: nx.DiGraph = nx.DiGraph()

    # ── Pass 1: add all nodes ──────────────────────────────────────────
    root_id: str | None = None
    for c in comments:
        G.add_node(
            c.id,
            author=c.author,
            timestamp=c.timestamp,
            text=c.text,
            score=c.score,
            depth=c.depth,
            is_removed=c.is_removed,
            parent_id=c.parent_id,
        )
        if c.parent_id is None:
            root_id = c.id

    # If no root found (shouldn't happen with well-formed data), use first node.
    if root_id is None:
        root_id = comments[0].id
        logger.warning("No root node (parent_id=None) found; using %s as root", root_id)

    # ── Pass 2: add directed edges (parent → child) ────────────────────
    orphan_count = 0
    for c in comments:
        if c.parent_id is None:
            continue  # root node — no incoming edge

        if c.parent_id in G:
            G.add_edge(c.parent_id, c.id)
        else:
            # Orphan: parent was truncated away. Attach to root to keep
            # the graph connected and preserve the node.
            logger.debug(
                "Orphan comment %s (parent %s not in graph) — attaching to root %s",
                c.id,
                c.parent_id,
                root_id,
            )
            G.add_edge(root_id, c.id)
            orphan_count += 1

    if orphan_count:
        logger.info("Attached %d orphan comment(s) to root node", orphan_count)

    return G
