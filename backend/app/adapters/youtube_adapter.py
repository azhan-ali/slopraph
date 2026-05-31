"""
YouTube adapter — Phase 6 (cross-platform).

Converts a YouTube video's comment section into the same platform-neutral
`ThreadFetchResult` shape the rest of the engine consumes. The detection
signals (latency, vocab echo, consensus) are entirely platform-agnostic, so
once comments are normalised the whole pipeline "just works" on YouTube.

Data source
-----------
The official YouTube Data API v3 `commentThreads` + `comments` endpoints.
A free API key is required (env: YOUTUBE_API_KEY). Unlike Reddit there is no
no-auth JSON endpoint, so without a key we fail fast with a clear message
rather than scraping HTML (brittle + against ToS).

Threading model
---------------
YouTube has a 2-level model: top-level comments and their replies (no deeper
nesting). We map:
  • The video itself        → root node (depth 0, parent None)
  • Top-level comments      → depth 1, parent = video
  • Replies                 → depth 2, parent = the top-level comment

Demo mode
---------
When `settings.use_demo_fixture` is True the adapter loads a bundled fixture
(tests/fixtures/youtube_thread.json) shaped like a real API response, so the
cross-platform demo runs fully offline.

Design notes
------------
• `_parse_api_response()` is a pure function over the API JSON dict — fully
  unit-testable without any network call.
• Pagination is followed up to the `max_comments` cap (breadth-first over
  top-level threads) so we never make unbounded API calls.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse

import requests

from app.adapters.base import (
    AdapterFetchError,
    AdapterParseError,
    AdapterURLError,
    BaseAdapter,
)
from app.config import get_settings
from app.models import Comment, Platform, ThreadFetchResult

logger = logging.getLogger(__name__)

DEFAULT_TIMEOUT_S: float = 12.0
API_BASE = "https://www.googleapis.com/youtube/v3"
_MAX_PAGE_SIZE = 100  # YouTube API max per page

# YouTube video ids are 11 chars of [A-Za-z0-9_-].
_VIDEO_ID_RE = re.compile(r"^[A-Za-z0-9_-]{11}$")

_DEMO_FIXTURE_PATH = (
    Path(__file__).resolve().parent.parent.parent
    / "tests" / "fixtures" / "youtube_thread.json"
)


class YouTubeAdapter(BaseAdapter):
    """Adapter for YouTube video comment sections (Data API v3)."""

    name = "youtube"

    def __init__(
        self,
        *,
        session: requests.Session | None = None,
        timeout_s: float = DEFAULT_TIMEOUT_S,
        api_key: str | None = None,
    ) -> None:
        self._session = session or requests.Session()
        self._timeout_s = timeout_s
        # Allow explicit injection (tests); else read from settings at fetch time.
        self._explicit_api_key = api_key

    # ── Public API ───────────────────────────────────────────────────────
    def fetch(self, url: str, *, max_comments: int = 200) -> ThreadFetchResult:
        video_id = self._extract_video_id(url)

        if get_settings().use_demo_fixture:
            logger.info("USE_DEMO_FIXTURE=true — returning YouTube fixture for %s", video_id)
            return self._load_demo_fixture(original_url=url, max_comments=max_comments)

        api_key = self._explicit_api_key or get_settings().youtube_api_key
        if not api_key:
            raise AdapterFetchError(
                "YouTube scanning needs a YOUTUBE_API_KEY (free from Google Cloud "
                "Console → YouTube Data API v3). Set it in backend/.env, or enable "
                "USE_DEMO_FIXTURE=true for an offline demo."
            )

        video_meta = self._fetch_video_meta(video_id, api_key)
        raw_threads = self._fetch_comment_threads(video_id, api_key, max_comments)
        return self._parse_api_response(
            video_meta, raw_threads, video_id=video_id,
            original_url=url, max_comments=max_comments,
        )

    @staticmethod
    def _load_demo_fixture(*, original_url: str, max_comments: int) -> ThreadFetchResult:
        try:
            with open(_DEMO_FIXTURE_PATH, encoding="utf-8") as f:
                payload = json.load(f)
        except (OSError, ValueError) as exc:
            raise AdapterFetchError(f"YouTube demo fixture unavailable: {exc}") from exc
        return YouTubeAdapter._parse_api_response(
            payload.get("video", {}),
            payload.get("threads", []),
            video_id=payload.get("video_id", "demo"),
            original_url=original_url,
            max_comments=max_comments,
        )

    # ── URL parsing ──────────────────────────────────────────────────────
    @staticmethod
    def _extract_video_id(url: str) -> str:
        """
        Pull the 11-char video id from any YouTube URL variant:
          • https://www.youtube.com/watch?v=<id>
          • https://youtu.be/<id>
          • https://www.youtube.com/embed/<id>
          • https://www.youtube.com/shorts/<id>
          • https://www.youtube.com/live/<id>
        """
        if not url or not isinstance(url, str):
            raise AdapterURLError("URL is empty.")

        try:
            parsed = urlparse(url.strip())
        except (ValueError, AttributeError) as exc:
            raise AdapterURLError(f"Malformed URL: {exc}") from exc

        host = (parsed.netloc or "").lower()
        if host.startswith("www."):
            host = host[4:]

        # youtu.be/<id>
        if host == "youtu.be":
            candidate = [p for p in (parsed.path or "").split("/") if p]
            if candidate and _VIDEO_ID_RE.match(candidate[0]):
                return candidate[0]
            raise AdapterURLError("Short-link did not contain a valid video id.")

        if "youtube.com" not in host:
            raise AdapterURLError("Not a YouTube URL.")

        # watch?v=<id>
        qs = parse_qs(parsed.query or "")
        if "v" in qs and qs["v"]:
            candidate = qs["v"][0]
            if _VIDEO_ID_RE.match(candidate):
                return candidate

        # /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
        parts = [p for p in (parsed.path or "").split("/") if p]
        for marker in ("embed", "shorts", "live", "v"):
            if marker in parts:
                idx = parts.index(marker)
                if idx + 1 < len(parts) and _VIDEO_ID_RE.match(parts[idx + 1]):
                    return parts[idx + 1]

        raise AdapterURLError(
            "YouTube URL must reference a video (watch?v=…, youtu.be/…, shorts/…)."
        )

    # ── Network ─────────────────────────────────────────────────────────
    def _get(self, path: str, params: dict) -> Any:
        try:
            resp = self._session.get(
                f"{API_BASE}/{path}", params=params, timeout=self._timeout_s
            )
        except requests.Timeout as exc:
            raise AdapterFetchError("YouTube API request timed out.") from exc
        except requests.RequestException as exc:
            raise AdapterFetchError(f"YouTube API request failed: {exc}") from exc

        if resp.status_code == 403:
            # Could be quota exceeded, comments disabled, or bad key.
            raise AdapterFetchError(
                "YouTube API returned 403 (quota exceeded, comments disabled, "
                "or invalid API key)."
            )
        if resp.status_code == 404:
            raise AdapterFetchError("YouTube video not found (404).")
        if resp.status_code != 200:
            raise AdapterFetchError(f"Unexpected status {resp.status_code} from YouTube API.")

        try:
            return resp.json()
        except ValueError as exc:
            raise AdapterParseError("YouTube API response was not valid JSON.") from exc

    def _fetch_video_meta(self, video_id: str, api_key: str) -> dict:
        data = self._get(
            "videos",
            {"part": "snippet", "id": video_id, "key": api_key},
        )
        items = data.get("items") or []
        if not items:
            raise AdapterFetchError("YouTube video not found or is private.")
        return items[0].get("snippet", {})

    def _fetch_comment_threads(
        self, video_id: str, api_key: str, max_comments: int
    ) -> list[dict]:
        """Fetch commentThreads, following pagination up to max_comments."""
        threads: list[dict] = []
        page_token: str | None = None

        while len(threads) < max_comments:
            params = {
                "part": "snippet,replies",
                "videoId": video_id,
                "maxResults": min(_MAX_PAGE_SIZE, max_comments - len(threads)),
                "order": "relevance",
                "textFormat": "plainText",
                "key": api_key,
            }
            if page_token:
                params["pageToken"] = page_token

            data = self._get("commentThreads", params)
            threads.extend(data.get("items", []))

            page_token = data.get("nextPageToken")
            if not page_token:
                break

        return threads

    # ── Parsing (pure function — no I/O) ───────────────────────────────
    @staticmethod
    def _parse_api_response(
        video_snippet: dict,
        threads: list[dict],
        *,
        video_id: str,
        original_url: str,
        max_comments: int,
    ) -> ThreadFetchResult:
        """
        Convert YouTube API JSON into a ThreadFetchResult.

        The video becomes the root node; top-level comments hang off it;
        replies hang off their top-level comment.
        """
        if not isinstance(threads, list):
            raise AdapterParseError("YouTube threads payload was not a list.")

        title = video_snippet.get("title")
        channel = video_snippet.get("channelTitle")
        published = _to_epoch(video_snippet.get("publishedAt"))

        root_id = f"yt_video_{video_id}"
        comments: list[Comment] = [
            Comment(
                id=root_id,
                author=channel or "[channel]",
                parent_id=None,
                timestamp=published,
                text=title or "",
                score=0,
                depth=0,
                is_removed=False,
            )
        ]

        for thread in threads:
            if len(comments) >= max_comments:
                break
            snippet = (thread.get("snippet") or {})
            top = (snippet.get("topLevelComment") or {})
            top_id = top.get("id")
            top_data = (top.get("snippet") or {})
            if not top_id:
                continue

            top_comment = YouTubeAdapter._comment_from_snippet(
                top_id, top_data, parent_id=root_id, depth=1
            )
            if top_comment is None:
                continue
            comments.append(top_comment)

            # Replies (YouTube only nests one level).
            replies = (thread.get("replies") or {}).get("comments", []) or []
            for reply in replies:
                if len(comments) >= max_comments:
                    break
                r_id = reply.get("id")
                r_data = (reply.get("snippet") or {})
                if not r_id:
                    continue
                r_comment = YouTubeAdapter._comment_from_snippet(
                    r_id, r_data, parent_id=top_comment.id, depth=2
                )
                if r_comment is not None:
                    comments.append(r_comment)

        return ThreadFetchResult(
            platform=Platform.YOUTUBE,
            url=original_url,
            title=title,
            subreddit=None,
            op_author=channel,
            comments=comments,
        )

    @staticmethod
    def _comment_from_snippet(
        comment_id: str, snippet: dict, *, parent_id: str, depth: int
    ) -> Comment | None:
        """Convert a single YouTube comment snippet into our Comment model."""
        author = snippet.get("authorDisplayName") or "[unknown]"
        text = snippet.get("textOriginal") or snippet.get("textDisplay") or ""
        try:
            score = int(snippet.get("likeCount") or 0)
        except (TypeError, ValueError):
            score = 0
        ts = _to_epoch(snippet.get("publishedAt"))

        return Comment(
            id=f"yt_{comment_id}",
            author=author,
            parent_id=parent_id,
            timestamp=ts,
            text=text,
            score=score,
            depth=depth,
            is_removed=False,
        )


def _to_epoch(iso_ts: str | None) -> float:
    """Convert an ISO-8601 timestamp (e.g. '2023-01-15T10:30:00Z') to epoch."""
    if not iso_ts or not isinstance(iso_ts, str):
        return 0.0
    from datetime import datetime

    try:
        # Handle trailing 'Z' (UTC) which fromisoformat accepts on 3.11+.
        cleaned = iso_ts.replace("Z", "+00:00")
        return datetime.fromisoformat(cleaned).timestamp()
    except (ValueError, OSError):
        return 0.0
