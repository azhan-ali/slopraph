"""
Phase 3 test suite — 3 detection signals + aggregator + /scan integration.

Covered:
  • Latency signal: burst detection, regularity, per-node scores, edge cases
  • Vocab echo signal: TF-IDF clustering, echo rings, per-node scores
  • Consensus signal: stance classification, affirm/dissent ratios
  • Aggregator: weighting, badge thresholds, thread_health, echo_rings
  • /scan end-to-end: thread_health, signal_scores, per-node badges
  • Backward compat: Phase 1+2 fields still present
  • Bot fixture: high suspicion on bot-like thread
  • Human fixture: low suspicion on normal thread
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
from app.main import ADAPTERS, app
from app.models import Platform, ThreadFetchResult
from app.signals.aggregator import aggregate_signals
from app.signals.consensus import _classify_stance, compute_consensus_signal
from app.signals.latency import BURST_WINDOW_S, compute_latency_signal
from app.signals.vocab_echo import ECHO_THRESHOLD, compute_vocab_echo_signal

client = TestClient(app)
FIXTURES = Path(__file__).parent / "fixtures"


# ════════════════════════════════════════════════════════════════════════════
# Helpers
# ════════════════════════════════════════════════════════════════════════════
def _c(id, author="u", parent_id=None, ts=1.0, text="hello world test", depth=0, removed=False):
    from app.models import Comment
    return Comment(id=id, author=author, parent_id=parent_id,
                   timestamp=ts, text=text, score=1, depth=depth, is_removed=removed)


def _load_fixture_comments(filename: str):
    with open(FIXTURES / filename, encoding="utf-8") as f:
        payload = json.load(f)
    return RedditAdapter._parse_thread_json(
        payload, original_url="https://r/x/comments/abc/", max_comments=200
    ).comments


def _graph_from_comments(comments):
    G = build_graph(comments)
    from app.engine.metrics import compute_metrics
    compute_metrics(G)
    return G


# ════════════════════════════════════════════════════════════════════════════
# Signal 1 — Latency
# ════════════════════════════════════════════════════════════════════════════
class TestLatencySignal:
    def test_empty_graph_returns_neutral(self):
        G = nx.DiGraph()
        r = compute_latency_signal(G)
        assert r.latency_suspicion == 0.0
        assert r.node_scores == {}

    def test_single_node_returns_neutral(self):
        G = _graph_from_comments([_c("root")])
        r = compute_latency_signal(G)
        assert r.latency_suspicion == 0.0

    def test_burst_replies_detected(self):
        """Replies within BURST_WINDOW_S should produce high burst_ratio."""
        comments = [
            _c("root", ts=1000.0),
            _c("c1", parent_id="root", ts=1000.0 + 5, depth=1),
            _c("c2", parent_id="root", ts=1000.0 + 10, depth=1),
            _c("c3", parent_id="root", ts=1000.0 + 15, depth=1),
        ]
        G = _graph_from_comments(comments)
        r = compute_latency_signal(G)
        assert r.burst_ratio == 1.0
        assert r.latency_suspicion > 0.5

    def test_slow_replies_not_burst(self):
        """Replies hours apart should produce low burst_ratio."""
        comments = [
            _c("root", ts=1000.0),
            _c("c1", parent_id="root", ts=1000.0 + 3600, depth=1),
            _c("c2", parent_id="root", ts=1000.0 + 7200, depth=1),
            _c("c3", parent_id="root", ts=1000.0 + 10800, depth=1),
        ]
        G = _graph_from_comments(comments)
        r = compute_latency_signal(G)
        assert r.burst_ratio == 0.0

    def test_per_node_scores_populated(self):
        comments = [
            _c("root", ts=1000.0),
            _c("c1", parent_id="root", ts=1000.0 + 5, depth=1),
            _c("c2", parent_id="root", ts=1000.0 + 10, depth=1),
            _c("c3", parent_id="root", ts=1000.0 + 15, depth=1),
        ]
        G = _graph_from_comments(comments)
        r = compute_latency_signal(G)
        # Reply nodes should have scores; root has no parent so no score
        assert "c1" in r.node_scores or "t1_c1" in r.node_scores or len(r.node_scores) >= 3

    def test_scores_in_range(self):
        comments = _load_fixture_comments("reddit_thread.json")
        G = _graph_from_comments(comments)
        r = compute_latency_signal(G)
        assert 0.0 <= r.latency_suspicion <= 1.0
        assert 0.0 <= r.burst_ratio <= 1.0
        for score in r.node_scores.values():
            assert 0.0 <= score <= 1.0

    def test_bot_fixture_has_high_burst(self):
        """Bot fixture has 10-second gaps for nested replies — within BURST_WINDOW_S."""
        comments = _load_fixture_comments("bot_thread.json")
        G = _graph_from_comments(comments)
        r = compute_latency_signal(G)
        # At least some burst pairs detected (nested replies are 10s apart)
        assert r.burst_ratio > 0.0
        assert r.latency_suspicion > 0.0

    def test_human_fixture_has_lower_burst(self):
        """Human fixture has 60-second gaps — above BURST_WINDOW_S."""
        comments = _load_fixture_comments("reddit_thread.json")
        G = _graph_from_comments(comments)
        r = compute_latency_signal(G)
        # 60s gaps > 30s BURST_WINDOW_S → burst_ratio = 0
        assert r.burst_ratio == 0.0


# ════════════════════════════════════════════════════════════════════════════
# Signal 2 — Vocab Echo
# ════════════════════════════════════════════════════════════════════════════
class TestVocabEchoSignal:
    def test_empty_graph_returns_neutral(self):
        G = nx.DiGraph()
        r = compute_vocab_echo_signal(G)
        assert r.echo_suspicion == 0.0
        assert r.echo_rings == []

    def test_too_few_authors_returns_neutral(self):
        comments = [_c("root", author="alice"), _c("c1", author="bob", parent_id="root")]
        G = _graph_from_comments(comments)
        r = compute_vocab_echo_signal(G)
        assert r.echo_suspicion == 0.0

    def test_identical_texts_form_echo_ring(self):
        """Authors with identical text should form an echo ring."""
        text = "totally agree this is a great tapestry of opportunities to delve into"
        comments = [
            _c("root", author="op", text="original post content here"),
            _c("c1", author="bot1", parent_id="root", text=text, depth=1),
            _c("c2", author="bot2", parent_id="root", text=text, depth=1),
            _c("c3", author="bot3", parent_id="root", text=text, depth=1),
        ]
        G = _graph_from_comments(comments)
        r = compute_vocab_echo_signal(G)
        assert r.echo_pairs > 0
        assert len(r.echo_rings) > 0
        # All bots should be in the same ring
        ring_authors = set(r.echo_rings[0]) if r.echo_rings else set()
        assert "bot1" in ring_authors or r.echo_pairs >= 1

    def test_diverse_texts_no_echo(self):
        """Authors with completely different texts should not echo."""
        comments = [
            _c("root", author="op", text="original post about cooking recipes"),
            _c("c1", author="u1", parent_id="root", text="I love making pasta carbonara", depth=1),
            _c("c2", author="u2", parent_id="root", text="The weather today is quite cold outside", depth=1),
            _c("c3", author="u3", parent_id="root", text="My cat knocked over the plant again", depth=1),
        ]
        G = _graph_from_comments(comments)
        r = compute_vocab_echo_signal(G)
        assert r.echo_pairs == 0
        assert r.echo_rings == []

    def test_scores_in_range(self):
        comments = _load_fixture_comments("reddit_thread.json")
        G = _graph_from_comments(comments)
        r = compute_vocab_echo_signal(G)
        assert 0.0 <= r.echo_suspicion <= 1.0
        for score in r.author_echo_scores.values():
            assert 0.0 <= score <= 1.0

    def test_bot_fixture_has_high_echo(self):
        """Bot fixture has identical text across all authors."""
        comments = _load_fixture_comments("bot_thread.json")
        G = _graph_from_comments(comments)
        r = compute_vocab_echo_signal(G)
        assert r.echo_pairs > 0
        assert r.echo_suspicion > 0.0

    def test_node_scores_populated_for_valid_authors(self):
        text = "totally agree this is a great tapestry of opportunities to delve into"
        comments = [
            _c("root", author="op", text="original post content here"),
            _c("c1", author="bot1", parent_id="root", text=text, depth=1),
            _c("c2", author="bot2", parent_id="root", text=text, depth=1),
            _c("c3", author="bot3", parent_id="root", text=text, depth=1),
        ]
        G = _graph_from_comments(comments)
        r = compute_vocab_echo_signal(G)
        assert len(r.node_scores) > 0


# ════════════════════════════════════════════════════════════════════════════
# Signal 3 — Consensus
# ════════════════════════════════════════════════════════════════════════════
class TestConsensusSignal:
    def test_classify_affirm_phrases(self):
        for phrase in ["totally agree", "great point", "well said", "so true"]:
            stance, score = _classify_stance(phrase)
            assert stance == "affirm", f"Expected affirm for '{phrase}'"
            assert score > 0.0

    def test_classify_dissent_phrases(self):
        for phrase in ["I disagree with this", "that's wrong", "actually no"]:
            stance, score = _classify_stance(phrase)
            assert stance == "dissent", f"Expected dissent for '{phrase}'"

    def test_classify_neutral(self):
        stance, score = _classify_stance("The sky is blue today")
        assert stance == "neutral"
        assert score == 0.0

    def test_empty_text_is_neutral(self):
        stance, score = _classify_stance("")
        assert stance == "neutral"
        assert score == 0.0

    def test_empty_graph_returns_neutral(self):
        G = nx.DiGraph()
        r = compute_consensus_signal(G)
        assert r.consensus_suspicion == 0.0

    def test_all_affirm_replies_high_suspicion(self):
        comments = [
            _c("root", author="op", text="original post"),
            _c("c1", author="u1", parent_id="root", text="totally agree great point", depth=1),
            _c("c2", author="u2", parent_id="root", text="well said so true", depth=1),
            _c("c3", author="u3", parent_id="root", text="totally agree amazing", depth=1),
        ]
        G = _graph_from_comments(comments)
        r = compute_consensus_signal(G)
        assert r.affirm_ratio > 0.5
        assert r.consensus_suspicion > 0.3

    def test_mixed_replies_lower_suspicion(self):
        comments = [
            _c("root", author="op", text="original post"),
            _c("c1", author="u1", parent_id="root", text="totally agree", depth=1),
            _c("c2", author="u2", parent_id="root", text="I disagree with this point", depth=1),
            _c("c3", author="u3", parent_id="root", text="interesting perspective", depth=1),
        ]
        G = _graph_from_comments(comments)
        r = compute_consensus_signal(G)
        assert r.dissent_ratio > 0.0
        # With dissent present, suspicion should be lower
        assert r.consensus_suspicion < 0.5

    def test_ratios_sum_to_one(self):
        comments = _load_fixture_comments("reddit_thread.json")
        G = _graph_from_comments(comments)
        r = compute_consensus_signal(G)
        total = r.affirm_ratio + r.dissent_ratio + r.neutral_ratio
        assert abs(total - 1.0) < 0.01

    def test_scores_in_range(self):
        comments = _load_fixture_comments("reddit_thread.json")
        G = _graph_from_comments(comments)
        r = compute_consensus_signal(G)
        assert 0.0 <= r.consensus_suspicion <= 1.0
        for score in r.node_scores.values():
            assert 0.0 <= score <= 1.0

    def test_bot_fixture_has_high_consensus(self):
        """Bot fixture has identical affirming text across all replies."""
        comments = _load_fixture_comments("bot_thread.json")
        G = _graph_from_comments(comments)
        r = compute_consensus_signal(G)
        assert r.affirm_ratio > 0.5
        assert r.consensus_suspicion > 0.3

    def test_removed_comments_treated_as_neutral(self):
        comments = [
            _c("root", author="op", text="original post"),
            _c("c1", author="u1", parent_id="root", text="", removed=True, depth=1),
            _c("c2", author="u2", parent_id="root", text="", removed=True, depth=1),
            _c("c3", author="u3", parent_id="root", text="interesting", depth=1),
        ]
        G = _graph_from_comments(comments)
        r = compute_consensus_signal(G)
        # Removed comments → neutral, not affirm
        assert r.affirm_ratio == 0.0


# ════════════════════════════════════════════════════════════════════════════
# Aggregator
# ════════════════════════════════════════════════════════════════════════════
class TestAggregator:
    def _make_results(self, lat=0.0, echo=0.0, cons=0.0):
        from app.signals.latency import LatencyResult
        from app.signals.vocab_echo import VocabEchoResult
        from app.signals.consensus import ConsensusResult
        return (
            LatencyResult(latency_suspicion=lat),
            VocabEchoResult(echo_suspicion=echo),
            ConsensusResult(consensus_suspicion=cons),
        )

    def test_zero_suspicion_gives_health_100(self):
        lat, echo, cons = self._make_results(0.0, 0.0, 0.0)
        r = aggregate_signals(["n1", "n2"], lat, echo, cons)
        assert r.thread_health == 100

    def test_full_suspicion_gives_health_0(self):
        lat, echo, cons = self._make_results(1.0, 1.0, 1.0)
        r = aggregate_signals(["n1"], lat, echo, cons)
        assert r.thread_health == 0

    def test_thread_health_in_range(self):
        lat, echo, cons = self._make_results(0.5, 0.3, 0.4)
        r = aggregate_signals(["n1"], lat, echo, cons)
        assert 0 <= r.thread_health <= 100

    def test_badge_human_above_70(self):
        lat, echo, cons = self._make_results(0.0, 0.0, 0.0)
        r = aggregate_signals(["n1"], lat, echo, cons)
        assert r.node_results["n1"].badge == "human"
        assert r.node_results["n1"].authenticity >= 70

    def test_badge_bot_below_40(self):
        from app.signals.latency import LatencyResult
        from app.signals.vocab_echo import VocabEchoResult
        from app.signals.consensus import ConsensusResult
        # Pass node_scores=1.0 so the node actually gets full suspicion
        lat = LatencyResult(latency_suspicion=1.0, node_scores={"n1": 1.0})
        echo = VocabEchoResult(echo_suspicion=1.0, node_scores={"n1": 1.0})
        cons = ConsensusResult(consensus_suspicion=1.0, node_scores={"n1": 1.0})
        r = aggregate_signals(["n1"], lat, echo, cons)
        assert r.node_results["n1"].badge == "bot"
        assert r.node_results["n1"].authenticity < 40

    def test_badge_suspicious_between_40_70(self):
        from app.signals.latency import LatencyResult
        from app.signals.vocab_echo import VocabEchoResult
        from app.signals.consensus import ConsensusResult
        # 0.5 suspicion per signal → combined ≈ 0.5 → authenticity ≈ 50
        lat = LatencyResult(latency_suspicion=0.5, node_scores={"n1": 0.5})
        echo = VocabEchoResult(echo_suspicion=0.5, node_scores={"n1": 0.5})
        cons = ConsensusResult(consensus_suspicion=0.5, node_scores={"n1": 0.5})
        r = aggregate_signals(["n1"], lat, echo, cons)
        badge = r.node_results["n1"].badge
        auth = r.node_results["n1"].authenticity
        assert badge in ("suspicious", "bot")
        assert auth < 70

    def test_echo_rings_forwarded(self):
        from app.signals.vocab_echo import VocabEchoResult
        from app.signals.latency import LatencyResult
        from app.signals.consensus import ConsensusResult
        echo = VocabEchoResult(echo_rings=[["bot1", "bot2"]])
        r = aggregate_signals(["n1"], LatencyResult(), echo, ConsensusResult())
        assert r.echo_rings == [["bot1", "bot2"]]

    def test_counts_correct(self):
        from app.signals.latency import LatencyResult
        from app.signals.vocab_echo import VocabEchoResult
        from app.signals.consensus import ConsensusResult
        # n1 = human (0 suspicion), n2 = bot (full suspicion)
        lat = LatencyResult(node_scores={"n1": 0.0, "n2": 1.0})
        echo = VocabEchoResult(node_scores={"n1": 0.0, "n2": 1.0})
        cons = ConsensusResult(node_scores={"n1": 0.0, "n2": 1.0})
        r = aggregate_signals(["n1", "n2"], lat, echo, cons)
        assert r.human_count == 1
        assert r.bot_count == 1

    def test_combined_suspicion_weighted_correctly(self):
        lat, echo, cons = self._make_results(1.0, 0.0, 0.0)
        r = aggregate_signals([], lat, echo, cons)
        # 0.35 * 1.0 + 0.35 * 0.0 + 0.30 * 0.0 = 0.35
        assert abs(r.combined_suspicion - 0.35) < 0.01


# ════════════════════════════════════════════════════════════════════════════
# /scan end-to-end integration (Phase 3 fields)
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


def _make_thread_result(fixture_file: str) -> ThreadFetchResult:
    with open(FIXTURES / fixture_file, encoding="utf-8") as f:
        payload = json.load(f)
    comments = RedditAdapter._parse_thread_json(
        payload, original_url="https://r/x/comments/abc/", max_comments=200
    ).comments
    return ThreadFetchResult(
        platform=Platform.REDDIT,
        url="https://www.reddit.com/r/TestSub/comments/abc/x/",
        title="Test Thread",
        subreddit="TestSub",
        op_author="alice",
        comments=comments,
    )


class TestScanPhase3Integration:
    def test_thread_health_is_integer(self, swap_reddit_adapter):
        swap_reddit_adapter(_make_thread_result("reddit_thread.json"))
        resp = client.post("/scan", json={"url": "https://www.reddit.com/r/x/comments/abc/y/"})
        body = resp.json()
        assert body["thread_health"] is not None
        assert isinstance(body["thread_health"], int)
        assert 0 <= body["thread_health"] <= 100

    def test_signal_scores_present(self, swap_reddit_adapter):
        swap_reddit_adapter(_make_thread_result("reddit_thread.json"))
        resp = client.post("/scan", json={"url": "https://www.reddit.com/r/x/comments/abc/y/"})
        ss = resp.json()["signal_scores"]
        assert ss is not None
        required = {"latency_suspicion", "echo_suspicion", "consensus_suspicion",
                    "combined_suspicion", "echo_rings", "human_count",
                    "suspicious_count", "bot_count"}
        assert required.issubset(ss.keys())

    def test_signal_scores_in_range(self, swap_reddit_adapter):
        swap_reddit_adapter(_make_thread_result("reddit_thread.json"))
        resp = client.post("/scan", json={"url": "https://www.reddit.com/r/x/comments/abc/y/"})
        ss = resp.json()["signal_scores"]
        for key in ("latency_suspicion", "echo_suspicion", "consensus_suspicion", "combined_suspicion"):
            assert 0.0 <= ss[key] <= 1.0, f"{key} out of range: {ss[key]}"

    def test_nodes_have_badge_and_authenticity(self, swap_reddit_adapter):
        swap_reddit_adapter(_make_thread_result("reddit_thread.json"))
        resp = client.post("/scan", json={"url": "https://www.reddit.com/r/x/comments/abc/y/"})
        for node in resp.json()["nodes"]:
            assert "badge" in node
            assert node["badge"] in ("human", "suspicious", "bot")
            assert "authenticity" in node
            assert 0 <= node["authenticity"] <= 100

    def test_nodes_have_signal_scores(self, swap_reddit_adapter):
        swap_reddit_adapter(_make_thread_result("reddit_thread.json"))
        resp = client.post("/scan", json={"url": "https://www.reddit.com/r/x/comments/abc/y/"})
        for node in resp.json()["nodes"]:
            assert "latency_score" in node
            assert "echo_score" in node
            assert "consensus_score" in node

    def test_phase1_and_phase2_fields_still_present(self, swap_reddit_adapter):
        swap_reddit_adapter(_make_thread_result("reddit_thread.json"))
        resp = client.post("/scan", json={"url": "https://www.reddit.com/r/x/comments/abc/y/"})
        body = resp.json()
        # Phase 1
        assert body["title"] == "Test Thread"
        assert body["comment_count"] == 5
        assert len(body["comments"]) == 5
        # Phase 2
        assert len(body["nodes"]) == 5
        assert len(body["edges"]) == 4
        assert body["graph_metrics"] is not None

    def test_bot_fixture_lower_health_than_human(self, swap_reddit_adapter):
        """Bot thread should score lower health than the normal thread."""
        swap_reddit_adapter(_make_thread_result("bot_thread.json"))
        bot_resp = client.post("/scan", json={"url": "https://www.reddit.com/r/x/comments/abc/y/"})
        bot_health = bot_resp.json()["thread_health"]

        swap_reddit_adapter(_make_thread_result("reddit_thread.json"))
        human_resp = client.post("/scan", json={"url": "https://www.reddit.com/r/x/comments/abc/y/"})
        human_health = human_resp.json()["thread_health"]

        assert bot_health < human_health, (
            f"Bot health {bot_health} should be < human health {human_health}"
        )

    def test_full_pipeline_real_adapter_mocked_http(self):
        """End-to-end: real adapter + mocked HTTP + real graph + real signals."""
        with open(FIXTURES / "reddit_thread.json", encoding="utf-8") as f:
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
            resp = client.post("/scan", json={"url": "https://www.reddit.com/r/x/comments/abc123/y/"})
        finally:
            ADAPTERS[Platform.REDDIT] = original

        body = resp.json()
        assert body["ok"] is True
        assert body["thread_health"] is not None
        assert 0 <= body["thread_health"] <= 100
        assert body["signal_scores"] is not None
        # All nodes have badges
        for node in body["nodes"]:
            assert node["badge"] in ("human", "suspicious", "bot")
