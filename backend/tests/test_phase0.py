"""
Phase 0 test suite.

Covers:
  • /health liveness
  • / root discovery
  • /scan happy paths for each supported platform
  • /scan edge cases: invalid URL, unsupported platform, empty body,
    missing field, whitespace handling
  • the platform-detection utility in isolation (incl. tricky hostnames)

Run with:  pytest -v
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.models import Platform
from app.utils import detect_platform, is_http_url

client = TestClient(app)


# ──────────────────────────── meta endpoints ────────────────────────────
def test_health_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"]
    assert body["version"]
    assert "environment" in body


def test_root_discovery():
    resp = client.get("/")
    assert resp.status_code == 200
    body = resp.json()
    assert body["health"] == "/health"
    assert body["docs"] == "/docs"


# Note: Reddit happy-path and platform-dispatch tests live in test_phase1.py
# (they require adapter mocking now that /scan actually fetches).


# ──────────────────────────── /scan edge cases ──────────────────────────
def test_scan_rejects_non_http_url():
    resp = client.post("/scan", json={"url": "ftp://example.com/file"})
    assert resp.status_code == 400
    body = resp.json()
    assert body["ok"] is False
    assert body["error"] == "invalid_url"


def test_scan_rejects_garbage_string():
    resp = client.post("/scan", json={"url": "not a url at all"})
    assert resp.status_code == 400
    assert resp.json()["error"] == "invalid_url"


def test_scan_rejects_unsupported_platform():
    resp = client.post("/scan", json={"url": "https://example.com/some/thread"})
    assert resp.status_code == 400
    assert resp.json()["error"] == "unsupported_platform"


def test_scan_rejects_empty_url():
    resp = client.post("/scan", json={"url": ""})
    # Empty string fails pydantic min_length → 422 validation envelope
    assert resp.status_code == 422
    assert resp.json()["error"] == "validation_error"


def test_scan_rejects_missing_field():
    resp = client.post("/scan", json={})
    assert resp.status_code == 422
    assert resp.json()["error"] == "validation_error"


def test_scan_rejects_wrong_type():
    resp = client.post("/scan", json={"url": 12345})
    assert resp.status_code == 422


# ──────────────────────────── utility unit tests ────────────────────────
@pytest.mark.parametrize(
    "url,expected",
    [
        ("https://www.reddit.com/r/x/comments/1/t/", Platform.REDDIT),
        ("https://old.reddit.com/r/x/comments/1/t/", Platform.REDDIT),
        ("https://redd.it/abc", Platform.REDDIT),
        ("https://youtube.com/watch?v=1", Platform.YOUTUBE),
        ("https://youtu.be/1", Platform.YOUTUBE),
        ("https://music.youtube.com/watch?v=1", Platform.YOUTUBE),
        ("https://www.amazon.com/dp/1", Platform.AMAZON),
        ("https://www.amazon.co.uk/dp/1", Platform.AMAZON),
        ("https://example.com/", Platform.UNKNOWN),
        ("", Platform.UNKNOWN),
        # Tricky: platform name only in the path must NOT match
        ("https://evil.com/redirect?to=reddit.com", Platform.UNKNOWN),
    ],
)
def test_detect_platform(url, expected):
    assert detect_platform(url) == expected


@pytest.mark.parametrize(
    "url,expected",
    [
        ("https://x.com", True),
        ("http://localhost:8000", True),
        ("ftp://x.com", False),
        ("not a url", False),
        ("", False),
        ("javascript:alert(1)", False),
    ],
)
def test_is_http_url(url, expected):
    assert is_http_url(url) is expected
