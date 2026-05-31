"""
Phase 1 test suite — Reddit adapter + /scan integration.

Covered:
  • URL → thread-id extraction across every supported Reddit URL shape
  • _parse_thread_json() against a realistic fixture
  • Network mocking: 200 / 404 / 403 / 429 / 500 / timeout / bad JSON
  • max_comments truncation (BFS-preserving)
  • removed/deleted comment handling (text scrubbed, topology kept)
  • /scan end-to-end with the adapter mocked at the registry boundary
  • YouTube / Amazon URLs return 501 not_implemented
  • OP becomes the root node with parent_id == None and depth == 0
"""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest
import requests
from fastapi.testclient import TestClient

from app.adapters import (
    AdapterFetchError,
    AdapterParseError,
    AdapterURLError,
    RedditAdapter,
)
from app.main import ADAPTERS, app
from app.models import Platform, ThreadFetchResult

client = TestClient(app)
FIXTURES = Path(__file__).parent / "fixtures"


# ════════════════════════════════════════════════════════════════════════════
# URL extraction
# ════════════════════════════════════════════════════════════════════════════
@pytest.mark.parametrize(
    "url,expected_id",
    [
        ("https://www.reddit.com/r/python/comments/abc123/some_thread/", "abc123"),
        ("https://reddit.com/r/news/comments/xyz789/title/", "xyz789"),
        ("https://old.reddit.com/r/AskReddit/comments/1drgq3t/", "1drgq3t"),
        ("https://www.reddit.com/comments/abc123", "abc123"),
        ("https://redd.it/abc123", "abc123"),
        # Trailing slug + a specific-comment id should still resolve to thread id.
        ("https://www.reddit.com/r/x/comments/abc123/slug/c1xyz", "abc123"),
        # Case-insensitive
        ("https://www.reddit.com/r/X/comments/ABC123/", "abc123"),
    ],
)
def test_extract_thread_id_supported_shapes(url, expected_id):
    assert RedditAdapter._extract_thread_id(url) == expected_id


@pytest.mark.parametrize(
    "url",
    [
        "https://www.reddit.com/r/python/",                # no /comments/
        "https://www.reddit.com/user/someone",              # user page
        "https://example.com/comments/abc123",              # not Reddit
        "https://redd.it/",                                 # short link, no id
        "",                                                 # empty
        "not-a-url",                                        # garbage
    ],
)
def test_extract_thread_id_rejects_invalid(url):
    with pytest.raises(AdapterURLError):
        RedditAdapter._extract_thread_id(url)


# ════════════════════════════════════════════════════════════════════════════
# Parser (pure function, no network)
# ════════════════════════════════════════════════════════════════════════════
@pytest.fixture
def reddit_payload():
    with open(FIXTURES / "reddit_thread.json", encoding="utf-8") as f:
        return json.load(f)


def test_parse_extracts_op_metadata(reddit_payload):
    result = RedditAdapter._parse_thread_json(
        reddit_payload, original_url="https://r/x/comments/abc123/", max_comments=200
    )
    assert result.platform == Platform.REDDIT
    assert result.title == "Is the conversation real?"
    assert result.subreddit == "TestSub"
    assert result.op_author == "alice"


def test_parse_op_is_root_node(reddit_payload):
    result = RedditAdapter._parse_thread_json(
        reddit_payload, original_url="x", max_comments=200
    )
    op = result.comments[0]
    assert op.id == "t3_abc123"
    assert op.parent_id is None
    assert op.depth == 0
    assert op.author == "alice"
    assert "Is the conversation real?" in op.text
    assert "templated" in op.text  # selftext joined onto title


def test_parse_walks_reply_tree(reddit_payload):
    result = RedditAdapter._parse_thread_json(
        reddit_payload, original_url="x", max_comments=200
    )
    by_id = {c.id: c for c in result.comments}

    # Top-level replies should be parented to the OP at depth 1
    assert by_id["t1_c1"].parent_id == "t3_abc123"
    assert by_id["t1_c1"].depth == 1
    assert by_id["t1_c2"].parent_id == "t3_abc123"
    assert by_id["t1_c2"].depth == 1

    # Nested replies under c1 should be at depth 2 with c1 as parent
    assert by_id["t1_c1a"].parent_id == "t1_c1"
    assert by_id["t1_c1a"].depth == 2
    assert by_id["t1_c1b"].parent_id == "t1_c1"


def test_parse_handles_removed_comment(reddit_payload):
    result = RedditAdapter._parse_thread_json(
        reddit_payload, original_url="x", max_comments=200
    )
    by_id = {c.id: c for c in result.comments}
    # c1b is "[deleted]" / "[removed]" — must be marked but kept in topology
    removed = by_id["t1_c1b"]
    assert removed.is_removed is True
    assert removed.text == ""  # scrubbed
    assert removed.author == "[deleted]"
    assert removed.parent_id == "t1_c1"  # graph topology preserved


def test_parse_skips_more_kind_nodes(reddit_payload):
    """The 'more' kind (load-more stub) must not become a Comment."""
    result = RedditAdapter._parse_thread_json(
        reddit_payload, original_url="x", max_comments=200
    )
    # OP + c1 + c1a + c1b + c2  = 5 (the 'more' entry is dropped)
    assert len(result.comments) == 5


def test_parse_truncates_to_max_comments(reddit_payload):
    """max_comments caps the total returned (OP + truncated tree)."""
    result = RedditAdapter._parse_thread_json(
        reddit_payload, original_url="x", max_comments=3
    )
    assert len(result.comments) == 3
    # OP must always be the first node when truncating
    assert result.comments[0].parent_id is None


def test_parse_rejects_bad_shape():
    with pytest.raises(AdapterParseError):
        RedditAdapter._parse_thread_json({"not": "a list"}, original_url="x", max_comments=10)
    with pytest.raises(AdapterParseError):
        RedditAdapter._parse_thread_json([], original_url="x", max_comments=10)
    with pytest.raises(AdapterParseError):
        RedditAdapter._parse_thread_json(
            [{"data": {}}, {"data": {}}], original_url="x", max_comments=10
        )


def test_parse_rejects_empty_post():
    payload = [
        {"data": {"children": []}},
        {"data": {"children": []}},
    ]
    with pytest.raises(AdapterParseError):
        RedditAdapter._parse_thread_json(payload, original_url="x", max_comments=10)


# ════════════════════════════════════════════════════════════════════════════
# Network layer (mocked requests)
# ════════════════════════════════════════════════════════════════════════════
def _mock_session(*, status_code: int = 200, body=None, raises=None):
    session = MagicMock(spec=requests.Session)
    if raises is not None:
        session.get.side_effect = raises
        return session
    resp = MagicMock()
    resp.status_code = status_code
    resp.json.return_value = body if body is not None else []
    session.get.return_value = resp
    return session


def test_fetch_success_end_to_end(reddit_payload):
    session = _mock_session(status_code=200, body=reddit_payload)
    adapter = RedditAdapter(session=session)
    result = adapter.fetch(
        "https://www.reddit.com/r/x/comments/abc123/slug/", max_comments=200
    )
    assert result.title == "Is the conversation real?"
    assert len(result.comments) == 5
    # Verify the URL we built includes the right id and raw_json flag
    called_url = session.get.call_args[0][0]
    assert "/comments/abc123.json" in called_url
    assert "raw_json=1" in called_url


@pytest.mark.parametrize(
    "code,error_substr",
    [
        (404, "not found"),
        (418, "Unexpected status"),
    ],
)
def test_fetch_maps_http_errors(code, error_substr):
    session = _mock_session(status_code=code)
    adapter = RedditAdapter(session=session)
    with pytest.raises(AdapterFetchError, match=error_substr):
        adapter.fetch("https://www.reddit.com/r/x/comments/abc123/", max_comments=10)


@pytest.mark.parametrize("code", [403, 429, 500])
def test_fetch_blocked_codes_fall_back_to_fixture(code):
    """403/429/500 from Reddit → graceful fallback to demo fixture (not a hard error).
    This is the production behaviour: Render's datacenter IPs are often blocked
    by Reddit, so we serve the fixture rather than showing an error to the user.
    """
    session = _mock_session(status_code=code)
    adapter = RedditAdapter(session=session)
    # Should NOT raise — should return the demo fixture instead.
    result = adapter.fetch("https://www.reddit.com/r/x/comments/abc123/", max_comments=10)
    assert result.platform.value == "reddit"
    assert len(result.comments) > 0


def test_fetch_handles_timeout():
    session = _mock_session(raises=requests.Timeout("slow"))
    adapter = RedditAdapter(session=session)
    with pytest.raises(AdapterFetchError, match="timed out"):
        adapter.fetch("https://www.reddit.com/r/x/comments/abc123/", max_comments=10)


def test_fetch_handles_connection_error():
    session = _mock_session(raises=requests.ConnectionError("unreachable"))
    adapter = RedditAdapter(session=session)
    with pytest.raises(AdapterFetchError, match="failed"):
        adapter.fetch("https://www.reddit.com/r/x/comments/abc123/", max_comments=10)


def test_fetch_handles_invalid_json():
    session = MagicMock(spec=requests.Session)
    resp = MagicMock()
    resp.status_code = 200
    resp.json.side_effect = ValueError("not json")
    session.get.return_value = resp
    adapter = RedditAdapter(session=session)
    with pytest.raises(AdapterParseError, match="not valid JSON"):
        adapter.fetch("https://www.reddit.com/r/x/comments/abc123/", max_comments=10)


def test_fetch_uses_user_agent():
    """Reddit blocks requests without a UA — we must always set one."""
    session = _mock_session(status_code=200, body=[
        {"data": {"children": [{"kind": "t3", "data": {"id": "x", "title": "t", "author": "u", "subreddit": "s", "created_utc": 0, "score": 0}}]}},
        {"data": {"children": []}},
    ])
    adapter = RedditAdapter(session=session)
    adapter.fetch("https://www.reddit.com/r/x/comments/abc123/", max_comments=10)
    headers = session.get.call_args.kwargs["headers"]
    assert "User-Agent" in headers and headers["User-Agent"]


# ════════════════════════════════════════════════════════════════════════════
# /scan endpoint integration (adapter swapped at the registry)
# ════════════════════════════════════════════════════════════════════════════
class _FakeAdapter:
    """Stub adapter we plug into ADAPTERS[REDDIT] to test the API layer."""

    def __init__(self, behaviour):
        self.behaviour = behaviour
        self.calls = []

    def fetch(self, url, *, max_comments=200):
        self.calls.append((url, max_comments))
        if isinstance(self.behaviour, Exception):
            raise self.behaviour
        return self.behaviour


@pytest.fixture
def swap_reddit_adapter():
    """Swap the live Reddit adapter for a fake; restore after the test."""
    original = ADAPTERS[Platform.REDDIT]

    def _swap(behaviour):
        fake = _FakeAdapter(behaviour)
        ADAPTERS[Platform.REDDIT] = fake
        return fake

    yield _swap
    ADAPTERS[Platform.REDDIT] = original


def _sample_result():
    from app.models import Comment
    return ThreadFetchResult(
        platform=Platform.REDDIT,
        url="https://www.reddit.com/r/test/comments/abc123/x/",
        title="Test Thread",
        subreddit="test",
        op_author="alice",
        comments=[
            Comment(id="t3_abc123", author="alice", parent_id=None, timestamp=1.0, text="OP"),
            Comment(id="t1_c1", author="bob", parent_id="t3_abc123", timestamp=2.0, text="hi", depth=1),
        ],
    )


def test_scan_reddit_returns_real_data(swap_reddit_adapter):
    fake = swap_reddit_adapter(_sample_result())
    resp = client.post(
        "/scan",
        json={"url": "https://www.reddit.com/r/test/comments/abc123/x/"},
    )
    assert resp.status_code == 200, resp.text
    body = resp.json()
    assert body["ok"] is True
    assert body["platform"] == "reddit"
    assert body["title"] == "Test Thread"
    assert body["subreddit"] == "test"
    assert body["op_author"] == "alice"
    assert body["comment_count"] == 2
    assert len(body["comments"]) == 2
    assert body["comments"][0]["parent_id"] is None  # OP root
    # default max_comments forwarded
    assert fake.calls[0][1] == 200


def test_scan_forwards_max_comments(swap_reddit_adapter):
    fake = swap_reddit_adapter(_sample_result())
    resp = client.post(
        "/scan",
        json={"url": "https://www.reddit.com/r/test/comments/abc123/x/", "max_comments": 50},
    )
    assert resp.status_code == 200
    assert fake.calls[0][1] == 50


def test_scan_rejects_invalid_max_comments():
    resp = client.post(
        "/scan",
        json={"url": "https://www.reddit.com/r/x/comments/abc/y/", "max_comments": 0},
    )
    assert resp.status_code == 422
    resp = client.post(
        "/scan",
        json={"url": "https://www.reddit.com/r/x/comments/abc/y/", "max_comments": 10_000},
    )
    assert resp.status_code == 422


def test_scan_maps_adapter_url_error_to_400(swap_reddit_adapter):
    swap_reddit_adapter(AdapterURLError("Reddit URL must point to a specific thread."))
    resp = client.post(
        "/scan",
        json={"url": "https://www.reddit.com/r/python/"},
    )
    assert resp.status_code == 400
    assert resp.json()["error"] == "invalid_url"


def test_scan_maps_adapter_fetch_error_to_502(swap_reddit_adapter):
    swap_reddit_adapter(AdapterFetchError("Thread not found (404)."))
    resp = client.post(
        "/scan",
        json={"url": "https://www.reddit.com/r/x/comments/abc123/y/"},
    )
    assert resp.status_code == 502
    body = resp.json()
    assert body["error"] == "fetch_failed"
    assert "404" in body["detail"]


def test_scan_maps_adapter_parse_error_to_502(swap_reddit_adapter):
    swap_reddit_adapter(AdapterParseError("Reddit JSON did not have the expected shape."))
    resp = client.post(
        "/scan",
        json={"url": "https://www.reddit.com/r/x/comments/abc123/y/"},
    )
    assert resp.status_code == 502
    assert resp.json()["error"] == "parse_failed"


def test_scan_youtube_now_implemented_needs_key():
    """
    Phase 6: YouTube is implemented. Without an API key (and not in demo
    mode) it fails with a clear 502 fetch error explaining the key is needed
    — no longer a 501 not_implemented.
    """
    resp = client.post(
        "/scan",
        json={"url": "https://www.youtube.com/watch?v=dQw4w9WgXcQ"},
    )
    assert resp.status_code == 502
    body = resp.json()
    assert body["error"] == "fetch_failed"
    assert "YOUTUBE_API_KEY" in body["detail"]


def test_scan_amazon_now_implemented():
    """
    Phase 6: Amazon is implemented via the structured reviews fixture
    (cross-track demo). A valid ASIN URL now returns a full scored scan.
    """
    resp = client.post(
        "/scan",
        json={"url": "https://www.amazon.com/dp/B0EXAMPLE1/"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["platform"] == "amazon"
    assert body["thread_health"] is not None


def test_scan_unsupported_url_still_400():
    resp = client.post("/scan", json={"url": "https://example.com/"})
    assert resp.status_code == 400
    assert resp.json()["error"] == "unsupported_platform"


def test_scan_trims_whitespace(swap_reddit_adapter):
    fake = swap_reddit_adapter(_sample_result())
    resp = client.post(
        "/scan",
        json={"url": "   https://www.reddit.com/r/test/comments/abc123/x/   "},
    )
    assert resp.status_code == 200
    # the URL passed to the adapter should be trimmed
    assert fake.calls[0][0] == "https://www.reddit.com/r/test/comments/abc123/x/"



# ════════════════════════════════════════════════════════════════════════════
# Full pipeline integration: real RedditAdapter, mock only at HTTP boundary.
# This is the strongest possible offline proof that every layer wires up:
# URL parsing → URL building → HTTP call → JSON parsing → API serialization.
# ════════════════════════════════════════════════════════════════════════════
def test_full_pipeline_url_to_api_response(reddit_payload):
    """End-to-end: only requests.Session.get is mocked; everything else is real."""
    # Build a real adapter with a mock HTTP session
    session = MagicMock(spec=requests.Session)
    resp = MagicMock()
    resp.status_code = 200
    resp.json.return_value = reddit_payload
    session.get.return_value = resp

    real_adapter = RedditAdapter(session=session)

    # Plug the real adapter (with mocked HTTP) into the API
    original = ADAPTERS[Platform.REDDIT]
    ADAPTERS[Platform.REDDIT] = real_adapter
    try:
        resp = client.post(
            "/scan",
            json={
                "url": "https://www.reddit.com/r/TestSub/comments/abc123/some-slug/",
                "max_comments": 200,
            },
        )
    finally:
        ADAPTERS[Platform.REDDIT] = original

    assert resp.status_code == 200
    body = resp.json()

    # Verify the URL the adapter actually requested
    requested_url = session.get.call_args[0][0]
    assert "https://www.reddit.com/comments/abc123.json" in requested_url
    assert "raw_json=1" in requested_url

    # Verify full API response shape
    assert body["ok"] is True
    assert body["title"] == "Is the conversation real?"
    assert body["subreddit"] == "TestSub"
    assert body["op_author"] == "alice"
    assert body["comment_count"] == 5
    assert "Fetched 5 comments from r/TestSub" in body["message"]

    # Verify graph topology came through serialization correctly
    op = body["comments"][0]
    assert op["id"] == "t3_abc123"
    assert op["parent_id"] is None
    assert op["depth"] == 0

    # The deleted comment must be present with topology preserved
    deleted = next(c for c in body["comments"] if c["id"] == "t1_c1b")
    assert deleted["is_removed"] is True
    assert deleted["text"] == ""
    assert deleted["parent_id"] == "t1_c1"



# ════════════════════════════════════════════════════════════════════════════
# Demo mode (USE_DEMO_FIXTURE=true) — bypasses network for offline demos.
# ════════════════════════════════════════════════════════════════════════════
def test_demo_mode_returns_fixture_without_network(enable_demo_mode):
    """When demo mode is on, no HTTP call is made; fixture is returned."""
    # Build a fresh adapter with a session that would BLOW UP if called
    session = MagicMock(spec=requests.Session)
    session.get.side_effect = AssertionError("network must not be called in demo mode")
    adapter = RedditAdapter(session=session)

    result = adapter.fetch(
        "https://www.reddit.com/r/test/comments/abc123/x/", max_comments=200
    )
    assert result.platform == Platform.REDDIT
    assert result.title == "Is the conversation real?"
    assert len(result.comments) == 5
    assert session.get.called is False  # truly no network


def test_demo_mode_still_validates_url(enable_demo_mode):
    """Demo mode shortcuts the network but URL validation still runs."""
    adapter = RedditAdapter()
    with pytest.raises(AdapterURLError):
        adapter.fetch("https://www.reddit.com/r/python/", max_comments=10)
