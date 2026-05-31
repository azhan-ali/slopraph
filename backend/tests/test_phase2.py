"""
Phase 2 test suite — graph engine (builder + metrics + serializer) + /scan integration.

Covered:
  • build_graph: node/edge creation, root detection, orphan handling, empty input
  • compute_metrics: per-node attributes, thread-level aggregates, edge cases
  • serialize_graph: node/edge shape, text truncation, empty graph
  • /scan end-to-end: nodes/edges/graph_metrics populated in response
  • Backward compatibility: Phase 1 fields (comments, title, etc.) still present
  • Edge cases: single-node graph, linear chain, star topology, disconnected
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import networkx as nx
import pytest
import requests
from fastapi.testclient import TestClient

from app.adapters import RedditAdapter
from app.engine.graph_builder import build_graph
from app.engine.metrics import ThreadMetrics, compute_metrics
from app.engine.serializer import serialize_graph
from app.main import ADAPTERS, app
from app.models import Comment, Platform, ThreadFetchResult

client = TestClient(app)
FIXTURES = Path(__file__).parent / "fixtures"


# ════════════════════════════════════════════════════════════════════════════
# Helpers
# ════════════════════════════════════════════════════════════════════════════
def _comment(
    id: str,
    author: str = "user",
    parent_id: str | None = None,
    timestamp: float = 1.0,
    text: str = "hello",
    score: int = 1,
    depth: int = 0,
    is_removed: bool = False,
) -> Comment:
    return Comment(
        id=id,
        author=author,
        parent_id=parent_id,
        timestamp=timestamp,
        text=text,
        score=score,
        depth=depth,
        is_removed=is_removed,
    )


def _fixture_comments() -> list[Comment]:
    """Load the 5-node fixture used across Phase 1 tests."""
    fixture_path = FIXTURES / "reddit_thread.json"
    with open(fixture_path, encoding="utf-8") as f:
        payload = json.load(f)
    result = RedditAdapter._parse_thread_json(
        payload, original_url="https://r/x/comments/abc123/", max_comments=200
    )
    return result.comments


# ════════════════════════════════════════════════════════════════════════════
# build_graph
# ════════════════════════════════════════════════════════════════════════════
class TestBuildGraph:
    def test_empty_input_returns_empty_graph(self):
        G = build_graph([])
        assert G.number_of_nodes() == 0
        assert G.number_of_edges() == 0

    def test_single_node_no_edges(self):
        G = build_graph([_comment("root")])
        assert G.number_of_nodes() == 1
        assert G.number_of_edges() == 0

    def test_node_count_matches_comment_count(self):
        comments = _fixture_comments()
        G = build_graph(comments)
        assert G.number_of_nodes() == len(comments)

    def test_edge_count_is_node_count_minus_one_for_tree(self):
        """A tree with N nodes has exactly N-1 edges."""
        comments = _fixture_comments()
        G = build_graph(comments)
        # Our fixture is a tree (no cross-edges).
        assert G.number_of_edges() == G.number_of_nodes() - 1

    def test_root_node_has_no_incoming_edges(self):
        comments = _fixture_comments()
        G = build_graph(comments)
        root = next(n for n in G.nodes if G.nodes[n].get("parent_id") is None)
        assert G.in_degree(root) == 0

    def test_edges_are_directed_parent_to_child(self):
        comments = [
            _comment("root", depth=0),
            _comment("child", parent_id="root", depth=1),
        ]
        G = build_graph(comments)
        assert G.has_edge("root", "child")
        assert not G.has_edge("child", "root")

    def test_node_attributes_stored(self):
        c = _comment("n1", author="alice", text="hi", score=5, depth=2, is_removed=True)
        G = build_graph([_comment("root"), c])
        attrs = G.nodes["n1"]
        assert attrs["author"] == "alice"
        assert attrs["text"] == "hi"
        assert attrs["score"] == 5
        assert attrs["depth"] == 2
        assert attrs["is_removed"] is True

    def test_orphan_attached_to_root(self):
        """A comment whose parent is not in the list should attach to root."""
        comments = [
            _comment("root", depth=0),
            _comment("orphan", parent_id="missing_parent", depth=1),
        ]
        G = build_graph(comments)
        # Orphan should be attached to root
        assert G.has_edge("root", "orphan")

    def test_returns_digraph(self):
        G = build_graph(_fixture_comments())
        assert isinstance(G, nx.DiGraph)

    def test_fixture_tree_structure(self):
        """Verify the exact topology of the 5-node fixture."""
        comments = _fixture_comments()
        G = build_graph(comments)
        # OP is root
        assert G.in_degree("t3_abc123") == 0
        # c1 and c2 are direct children of OP
        assert G.has_edge("t3_abc123", "t1_c1")
        assert G.has_edge("t3_abc123", "t1_c2")
        # c1a and c1b are children of c1
        assert G.has_edge("t1_c1", "t1_c1a")
        assert G.has_edge("t1_c1", "t1_c1b")


# ════════════════════════════════════════════════════════════════════════════
# compute_metrics
# ════════════════════════════════════════════════════════════════════════════
class TestComputeMetrics:
    def test_empty_graph_returns_zero_metrics(self):
        G = nx.DiGraph()
        m = compute_metrics(G)
        assert m.node_count == 0
        assert m.edge_count == 0
        assert m.max_depth == 0

    def test_node_count_and_edge_count(self):
        comments = _fixture_comments()
        G = build_graph(comments)
        m = compute_metrics(G)
        assert m.node_count == 5
        assert m.edge_count == 4  # tree: N-1 edges

    def test_max_depth_fixture(self):
        """Fixture has depth 0 (OP), 1 (c1, c2), 2 (c1a, c1b) → max_depth = 2."""
        comments = _fixture_comments()
        G = build_graph(comments)
        m = compute_metrics(G)
        assert m.max_depth == 2

    def test_unique_authors(self):
        """Fixture has alice, bob, carol, [deleted], dave = 5 unique authors."""
        comments = _fixture_comments()
        G = build_graph(comments)
        m = compute_metrics(G)
        assert m.unique_authors == 5

    def test_leaf_ratio(self):
        """Fixture leaves: c1a, c1b, c2 (3 out of 5) → leaf_ratio = 0.6."""
        comments = _fixture_comments()
        G = build_graph(comments)
        m = compute_metrics(G)
        assert abs(m.leaf_ratio - 0.6) < 0.01

    def test_per_node_reply_count(self):
        comments = _fixture_comments()
        G = build_graph(comments)
        compute_metrics(G)
        # OP has 2 direct children (c1, c2)
        assert G.nodes["t3_abc123"]["reply_count"] == 2
        # c1 has 2 children (c1a, c1b)
        assert G.nodes["t1_c1"]["reply_count"] == 2
        # Leaves have 0
        assert G.nodes["t1_c1a"]["reply_count"] == 0
        assert G.nodes["t1_c2"]["reply_count"] == 0

    def test_per_node_subtree_size(self):
        comments = _fixture_comments()
        G = build_graph(comments)
        compute_metrics(G)
        # OP's subtree = all 5 nodes
        assert G.nodes["t3_abc123"]["subtree_size"] == 5
        # c1's subtree = c1 + c1a + c1b = 3
        assert G.nodes["t1_c1"]["subtree_size"] == 3
        # Leaves have subtree_size = 1
        assert G.nodes["t1_c1a"]["subtree_size"] == 1

    def test_per_node_is_leaf(self):
        comments = _fixture_comments()
        G = build_graph(comments)
        compute_metrics(G)
        assert G.nodes["t1_c1a"]["is_leaf"] is True
        assert G.nodes["t1_c1b"]["is_leaf"] is True
        assert G.nodes["t1_c2"]["is_leaf"] is True
        assert G.nodes["t3_abc123"]["is_leaf"] is False
        assert G.nodes["t1_c1"]["is_leaf"] is False

    def test_per_node_centrality_is_float_in_range(self):
        comments = _fixture_comments()
        G = build_graph(comments)
        compute_metrics(G)
        for node in G.nodes:
            c = G.nodes[node]["centrality"]
            assert isinstance(c, float)
            assert 0.0 <= c <= 1.0

    def test_is_connected_for_tree(self):
        comments = _fixture_comments()
        G = build_graph(comments)
        m = compute_metrics(G)
        assert m.is_connected is True

    def test_node_metrics_dict_populated(self):
        comments = _fixture_comments()
        G = build_graph(comments)
        m = compute_metrics(G)
        assert len(m.node_metrics) == 5
        for node_id, nm in m.node_metrics.items():
            assert "reply_count" in nm
            assert "subtree_size" in nm
            assert "is_leaf" in nm
            assert "centrality" in nm
            assert "depth" in nm

    def test_single_node_graph(self):
        G = build_graph([_comment("root")])
        m = compute_metrics(G)
        assert m.node_count == 1
        assert m.edge_count == 0
        assert m.leaf_ratio == 1.0
        assert m.branching_factor == 0.0
        assert m.is_connected is True

    def test_linear_chain(self):
        """A → B → C → D: max_depth=3, branching_factor=1.0, leaf_ratio=0.25."""
        comments = [
            _comment("a", depth=0),
            _comment("b", parent_id="a", depth=1),
            _comment("c", parent_id="b", depth=2),
            _comment("d", parent_id="c", depth=3),
        ]
        G = build_graph(comments)
        m = compute_metrics(G)
        assert m.max_depth == 3
        assert abs(m.branching_factor - 1.0) < 0.01
        assert abs(m.leaf_ratio - 0.25) < 0.01

    def test_star_topology(self):
        """Root with 4 direct children: branching_factor=4.0, leaf_ratio=0.8."""
        comments = [
            _comment("root", depth=0),
            _comment("c1", parent_id="root", depth=1),
            _comment("c2", parent_id="root", depth=1),
            _comment("c3", parent_id="root", depth=1),
            _comment("c4", parent_id="root", depth=1),
        ]
        G = build_graph(comments)
        m = compute_metrics(G)
        assert m.max_depth == 1
        assert abs(m.branching_factor - 4.0) < 0.01
        assert abs(m.leaf_ratio - 0.8) < 0.01


# ════════════════════════════════════════════════════════════════════════════
# serialize_graph
# ════════════════════════════════════════════════════════════════════════════
class TestSerializeGraph:
    def test_empty_graph_returns_empty_lists(self):
        G = nx.DiGraph()
        nodes, edges = serialize_graph(G)
        assert nodes == []
        assert edges == []

    def test_node_count_matches(self):
        comments = _fixture_comments()
        G = build_graph(comments)
        compute_metrics(G)
        nodes, _ = serialize_graph(G)
        assert len(nodes) == 5

    def test_edge_count_matches(self):
        comments = _fixture_comments()
        G = build_graph(comments)
        compute_metrics(G)
        _, edges = serialize_graph(G)
        assert len(edges) == 4

    def test_node_has_required_fields(self):
        comments = _fixture_comments()
        G = build_graph(comments)
        compute_metrics(G)
        nodes, _ = serialize_graph(G)
        required = {"id", "author", "text", "score", "depth", "is_removed",
                    "reply_count", "subtree_size", "centrality", "is_leaf"}
        for node in nodes:
            assert required.issubset(node.keys()), f"Missing keys in {node}"

    def test_edge_has_source_and_target(self):
        comments = _fixture_comments()
        G = build_graph(comments)
        compute_metrics(G)
        _, edges = serialize_graph(G)
        for edge in edges:
            assert "source" in edge
            assert "target" in edge

    def test_text_truncated_to_200_chars(self):
        long_text = "x" * 500
        comments = [_comment("root", text=long_text)]
        G = build_graph(comments)
        compute_metrics(G)
        nodes, _ = serialize_graph(G)
        assert len(nodes[0]["text"]) <= 200

    def test_short_text_not_truncated(self):
        comments = [_comment("root", text="short")]
        G = build_graph(comments)
        compute_metrics(G)
        nodes, _ = serialize_graph(G)
        assert nodes[0]["text"] == "short"

    def test_edge_direction_correct(self):
        """Edge source should be parent, target should be child."""
        comments = [
            _comment("root", depth=0),
            _comment("child", parent_id="root", depth=1),
        ]
        G = build_graph(comments)
        compute_metrics(G)
        _, edges = serialize_graph(G)
        assert len(edges) == 1
        assert edges[0]["source"] == "root"
        assert edges[0]["target"] == "child"

    def test_removed_node_preserved_in_serialization(self):
        comments = [
            _comment("root", depth=0),
            _comment("removed", parent_id="root", depth=1, is_removed=True, text=""),
        ]
        G = build_graph(comments)
        compute_metrics(G)
        nodes, _ = serialize_graph(G)
        removed_node = next(n for n in nodes if n["id"] == "removed")
        assert removed_node["is_removed"] is True
        assert removed_node["text"] == ""


# ════════════════════════════════════════════════════════════════════════════
# /scan end-to-end integration (Phase 2 graph fields)
# ════════════════════════════════════════════════════════════════════════════
class _FakeAdapter:
    def __init__(self, result):
        self.result = result

    def fetch(self, url, *, max_comments=200):
        if isinstance(self.result, Exception):
            raise self.result
        return self.result


@pytest.fixture
def swap_reddit_adapter():
    original = ADAPTERS[Platform.REDDIT]

    def _swap(result):
        ADAPTERS[Platform.REDDIT] = _FakeAdapter(result)

    yield _swap
    ADAPTERS[Platform.REDDIT] = original


def _sample_thread_result() -> ThreadFetchResult:
    """5-node fixture as a ThreadFetchResult."""
    fixture_path = FIXTURES / "reddit_thread.json"
    with open(fixture_path, encoding="utf-8") as f:
        payload = json.load(f)
    return ThreadFetchResult(
        platform=Platform.REDDIT,
        url="https://www.reddit.com/r/TestSub/comments/abc123/x/",
        title="Is the conversation real?",
        subreddit="TestSub",
        op_author="alice",
        comments=RedditAdapter._parse_thread_json(
            payload, original_url="x", max_comments=200
        ).comments,
    )


class TestScanPhase2Integration:
    def test_scan_returns_nodes_and_edges(self, swap_reddit_adapter):
        swap_reddit_adapter(_sample_thread_result())
        resp = client.post(
            "/scan",
            json={"url": "https://www.reddit.com/r/TestSub/comments/abc123/x/"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert len(body["nodes"]) == 5
        assert len(body["edges"]) == 4

    def test_scan_nodes_have_required_fields(self, swap_reddit_adapter):
        swap_reddit_adapter(_sample_thread_result())
        resp = client.post(
            "/scan",
            json={"url": "https://www.reddit.com/r/TestSub/comments/abc123/x/"},
        )
        body = resp.json()
        required = {"id", "author", "text", "score", "depth", "is_removed",
                    "reply_count", "subtree_size", "centrality", "is_leaf"}
        for node in body["nodes"]:
            assert required.issubset(node.keys())

    def test_scan_edges_have_source_and_target(self, swap_reddit_adapter):
        swap_reddit_adapter(_sample_thread_result())
        resp = client.post(
            "/scan",
            json={"url": "https://www.reddit.com/r/TestSub/comments/abc123/x/"},
        )
        body = resp.json()
        for edge in body["edges"]:
            assert "source" in edge
            assert "target" in edge

    def test_scan_returns_graph_metrics(self, swap_reddit_adapter):
        swap_reddit_adapter(_sample_thread_result())
        resp = client.post(
            "/scan",
            json={"url": "https://www.reddit.com/r/TestSub/comments/abc123/x/"},
        )
        body = resp.json()
        gm = body["graph_metrics"]
        assert gm is not None
        assert gm["node_count"] == 5
        assert gm["edge_count"] == 4
        assert gm["max_depth"] == 2
        assert gm["unique_authors"] == 5
        assert gm["is_connected"] is True

    def test_scan_graph_metrics_has_all_fields(self, swap_reddit_adapter):
        swap_reddit_adapter(_sample_thread_result())
        resp = client.post(
            "/scan",
            json={"url": "https://www.reddit.com/r/TestSub/comments/abc123/x/"},
        )
        gm = resp.json()["graph_metrics"]
        required = {
            "node_count", "edge_count", "max_depth", "avg_depth",
            "unique_authors", "branching_factor", "leaf_ratio",
            "is_connected", "density",
        }
        assert required.issubset(gm.keys())

    def test_scan_root_node_has_no_incoming_edge(self, swap_reddit_adapter):
        swap_reddit_adapter(_sample_thread_result())
        resp = client.post(
            "/scan",
            json={"url": "https://www.reddit.com/r/TestSub/comments/abc123/x/"},
        )
        body = resp.json()
        edges = body["edges"]
        targets = {e["target"] for e in edges}
        # OP (t3_abc123) should never be a target
        assert "t3_abc123" not in targets

    def test_scan_op_node_has_correct_metrics(self, swap_reddit_adapter):
        swap_reddit_adapter(_sample_thread_result())
        resp = client.post(
            "/scan",
            json={"url": "https://www.reddit.com/r/TestSub/comments/abc123/x/"},
        )
        body = resp.json()
        op = next(n for n in body["nodes"] if n["id"] == "t3_abc123")
        assert op["reply_count"] == 2
        assert op["subtree_size"] == 5
        assert op["is_leaf"] is False
        assert op["depth"] == 0

    def test_scan_removed_node_preserved_in_graph(self, swap_reddit_adapter):
        swap_reddit_adapter(_sample_thread_result())
        resp = client.post(
            "/scan",
            json={"url": "https://www.reddit.com/r/TestSub/comments/abc123/x/"},
        )
        body = resp.json()
        removed = next(n for n in body["nodes"] if n["id"] == "t1_c1b")
        assert removed["is_removed"] is True
        assert removed["text"] == ""

    def test_scan_phase1_fields_still_present(self, swap_reddit_adapter):
        """Phase 2 must not break Phase 1 fields."""
        swap_reddit_adapter(_sample_thread_result())
        resp = client.post(
            "/scan",
            json={"url": "https://www.reddit.com/r/TestSub/comments/abc123/x/"},
        )
        body = resp.json()
        assert body["title"] == "Is the conversation real?"
        assert body["subreddit"] == "TestSub"
        assert body["op_author"] == "alice"
        assert body["comment_count"] == 5
        assert len(body["comments"]) == 5

    def test_scan_thread_health_still_none(self, swap_reddit_adapter):
        """Phase 3 now populates thread_health — it should be an int 0-100."""
        swap_reddit_adapter(_sample_thread_result())
        resp = client.post(
            "/scan",
            json={"url": "https://www.reddit.com/r/TestSub/comments/abc123/x/"},
        )
        th = resp.json()["thread_health"]
        assert th is not None
        assert isinstance(th, int)
        assert 0 <= th <= 100

    def test_full_pipeline_with_real_adapter_and_mocked_http(self):
        """End-to-end: real adapter + mocked HTTP + real graph engine."""
        fixture_path = FIXTURES / "reddit_thread.json"
        with open(fixture_path, encoding="utf-8") as f:
            payload = json.load(f)

        session = MagicMock(spec=requests.Session)
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = payload
        session.get.return_value = mock_resp

        real_adapter = RedditAdapter(session=session)
        original = ADAPTERS[Platform.REDDIT]
        ADAPTERS[Platform.REDDIT] = real_adapter
        try:
            resp = client.post(
                "/scan",
                json={"url": "https://www.reddit.com/r/TestSub/comments/abc123/x/"},
            )
        finally:
            ADAPTERS[Platform.REDDIT] = original

        assert resp.status_code == 200
        body = resp.json()
        assert body["ok"] is True
        assert len(body["nodes"]) == 5
        assert len(body["edges"]) == 4
        assert body["graph_metrics"]["node_count"] == 5
        assert body["graph_metrics"]["max_depth"] == 2
        # Verify the graph engine ran (not just the adapter)
        op = next(n for n in body["nodes"] if n["id"] == "t3_abc123")
        assert op["subtree_size"] == 5
        assert op["reply_count"] == 2
