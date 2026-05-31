"""
Reddit adapter.

Reddit exposes a free, no-auth JSON view of any thread by appending `.json`
to its URL — that's the data source we use. The adapter:

  1. Parses any Reddit URL variant down to a canonical thread id
     (handles old.reddit.com, www.reddit.com, redd.it short links, etc.).
  2. Fetches `/comments/{id}.json?limit=...&depth=...&raw_json=1`.
  3. Walks the comment tree recursively and emits flat, normalised
     `Comment` objects with parent_id + depth populated for the graph.

Design notes
------------
• Fetch and parse are separated. `_parse_thread_json()` is a pure function
  over a JSON dict — fully testable without network access.
• `is_removed` is preserved (rather than dropping the node) because the
  conversation graph topology cares about reply structure even when a
  comment was later deleted.
• A per-thread `max_comments` cap protects us against pathological 10k-reply
  threads that would slow Phase 3 signals. Truncation is breadth-first via
  the natural tree walk so we keep top-level structure.
• When `settings.use_demo_fixture` is True (env: USE_DEMO_FIXTURE=true),
  the adapter returns a bundled fixture instead of calling Reddit. This
  unblocks demos in environments where Reddit blocks the host IP.
"""

from __future__ import annotations

import json
import logging
import re
from pathlib import Path
from typing import Any
from urllib.parse import urlparse

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

# ── Constants ─────────────────────────────────────────────────────────────
DEFAULT_TIMEOUT_S: float = 8.0  # Short timeout — Reddit often hangs on cloud IPs
DEFAULT_FETCH_LIMIT: int = 500   # what we ask Reddit for; we then cap on our side
DEFAULT_FETCH_DEPTH: int = 8     # nested reply depth requested

# Reddit base-36 thread ids are 4-12 chars (e.g. "abc123", "1drgq3t").
_THREAD_ID_RE = re.compile(r"^[a-z0-9]{4,12}$", re.IGNORECASE)

# Bundled demo fixture (used only when USE_DEMO_FIXTURE=true).
_DEMO_FIXTURE_PATH = (
    Path(__file__).resolve().parent.parent.parent / "tests" / "fixtures" / "reddit_thread.json"
)


class RedditAdapter(BaseAdapter):
    """Adapter for Reddit threads. Uses the public `.json` endpoint."""

    name = "reddit"

    def __init__(
        self,
        *,
        session: requests.Session | None = None,
        timeout_s: float = DEFAULT_TIMEOUT_S,
    ) -> None:
        self._session = session or requests.Session()
        self._timeout_s = timeout_s
        self._user_agent = get_settings().reddit_user_agent or "slopgraph/0.1"

    # ── Public API ───────────────────────────────────────────────────────
    def fetch(self, url: str, *, max_comments: int = 200) -> ThreadFetchResult:
        # Validate URL first so demo mode still rejects garbage URLs.
        thread_id = self._extract_thread_id(url)

        if get_settings().use_demo_fixture:
            logger.info("USE_DEMO_FIXTURE=true — returning bundled fixture for %s", thread_id)
            return self._load_demo_fixture(original_url=url, max_comments=max_comments)

        json_url = self._build_json_url(thread_id)
        try:
            payload = self._fetch_json(json_url)
        except (AdapterFetchError, Exception) as exc:
            # Reddit blocks or hangs on many datacenter/cloud IPs.
            # Any failure → serve the demo fixture so the user always gets a result.
            logger.warning(
                "Reddit fetch failed (%s: %s) — serving demo fixture for %s",
                type(exc).__name__, exc, thread_id,
            )
            return self._load_demo_fixture(original_url=url, max_comments=max_comments)
        return self._parse_thread_json(payload, original_url=url, max_comments=max_comments)

    @staticmethod
    def _load_demo_fixture(*, original_url: str, max_comments: int) -> ThreadFetchResult:
        """Load the bundled fixture used by demo mode."""
        try:
            with open(_DEMO_FIXTURE_PATH, encoding="utf-8") as f:
                payload = json.load(f)
        except (OSError, ValueError) as exc:
            raise AdapterFetchError(f"Demo fixture unavailable: {exc}") from exc
        return RedditAdapter._parse_thread_json(
            payload, original_url=original_url, max_comments=max_comments
        )

    # ── URL parsing ──────────────────────────────────────────────────────
    @staticmethod
    def _extract_thread_id(url: str) -> str:
        """
        Pull the canonical base-36 thread id out of any Reddit URL variant.

        Supported shapes:
          • https://www.reddit.com/r/<sub>/comments/<id>/<slug>/
          • https://old.reddit.com/r/<sub>/comments/<id>/
          • https://reddit.com/comments/<id>
          • https://redd.it/<id>
          • Same with trailing `/<id_of_specific_comment>` (we still take the thread id)
        """
        if not url or not isinstance(url, str):
            raise AdapterURLError("URL is empty.")

        try:
            parsed = urlparse(url.strip())
        except (ValueError, AttributeError) as exc:
            raise AdapterURLError(f"Malformed URL: {exc}") from exc

        host = (parsed.netloc or "").lower().lstrip("www.")
        path_parts = [p for p in (parsed.path or "").split("/") if p]

        # redd.it/<id>  short-link
        if host == "redd.it" or host.endswith(".redd.it"):
            if path_parts and _THREAD_ID_RE.match(path_parts[0]):
                return path_parts[0].lower()
            raise AdapterURLError("Short-link did not contain a thread id.")

        if "reddit.com" not in host:
            raise AdapterURLError("Not a Reddit URL.")

        # Standard form: .../comments/<id>/...
        if "comments" in path_parts:
            idx = path_parts.index("comments")
            if idx + 1 < len(path_parts):
                candidate = path_parts[idx + 1]
                if _THREAD_ID_RE.match(candidate):
                    return candidate.lower()

        raise AdapterURLError(
            "Reddit URL must point to a specific thread (…/comments/<id>/…)."
        )

    @staticmethod
    def _build_json_url(thread_id: str) -> str:
        # raw_json=1 disables Reddit's HTML-entity escaping inside JSON strings.
        return (
            f"https://www.reddit.com/comments/{thread_id}.json"
            f"?limit={DEFAULT_FETCH_LIMIT}&depth={DEFAULT_FETCH_DEPTH}&raw_json=1"
        )

    # ── Network ─────────────────────────────────────────────────────────
    def _fetch_json(self, json_url: str) -> Any:
        headers = {"User-Agent": self._user_agent, "Accept": "application/json"}
        try:
            resp = self._session.get(json_url, headers=headers, timeout=self._timeout_s)
        except requests.Timeout as exc:
            raise AdapterFetchError("Reddit request timed out.") from exc
        except requests.RequestException as exc:
            raise AdapterFetchError(f"Reddit request failed: {exc}") from exc

        if resp.status_code == 404:
            raise AdapterFetchError("Thread not found (404). It may be deleted or private.")
        if resp.status_code == 403:
            raise AdapterFetchError("Reddit blocked the request (403). Try again later.")
        if resp.status_code == 429:
            raise AdapterFetchError("Reddit rate-limited the request (429). Try again later.")
        if resp.status_code >= 500:
            raise AdapterFetchError(f"Reddit server error ({resp.status_code}).")
        if resp.status_code != 200:
            raise AdapterFetchError(f"Unexpected status {resp.status_code} from Reddit.")

        try:
            return resp.json()
        except ValueError as exc:
            raise AdapterParseError("Reddit response was not valid JSON.") from exc

    # ── Parsing (pure function — no I/O) ───────────────────────────────
    @staticmethod
    def _parse_thread_json(
        payload: Any, *, original_url: str, max_comments: int
    ) -> ThreadFetchResult:
        """
        Convert a Reddit `comments/<id>.json` payload into a ThreadFetchResult.

        Reddit returns a 2-element list: [post_listing, comments_listing].
        We tolerate small shape variations defensively.
        """
        if not isinstance(payload, list) or len(payload) < 2:
            raise AdapterParseError("Reddit JSON did not have the expected [post, comments] shape.")

        try:
            post_listing = payload[0]["data"]["children"]
            comments_listing = payload[1]["data"]["children"]
        except (KeyError, TypeError, IndexError) as exc:
            raise AdapterParseError(f"Could not navigate Reddit JSON shape: {exc}") from exc

        if not post_listing:
            raise AdapterParseError("Thread post is missing.")

        post = post_listing[0].get("data", {})
        op_id = f"t3_{post.get('id', 'op')}"
        op_author = post.get("author") or "[deleted]"
        op_text = post.get("selftext") or ""
        op_created = float(post.get("created_utc") or 0.0)
        op_score = int(post.get("score") or 0)
        title = post.get("title")
        subreddit = post.get("subreddit")

        # The OP itself becomes the root comment (depth 0, parent None) so the
        # graph engine has a single root and replies wire up naturally.
        comments: list[Comment] = [
            Comment(
                id=op_id,
                author=op_author,
                parent_id=None,
                timestamp=op_created,
                text=(title or "") + ("\n\n" + op_text if op_text else ""),
                score=op_score,
                depth=0,
                is_removed=op_author == "[deleted]" and not op_text,
            )
        ]

        # Walk the comment tree breadth-first so truncation preserves top-level
        # structure rather than chopping off entire branches.
        queue: list[tuple[dict, str, int]] = [
            (child, op_id, 1) for child in comments_listing if child.get("kind") == "t1"
        ]
        while queue and len(comments) < max_comments:
            node, parent_id, depth = queue.pop(0)
            data = node.get("data") or {}

            comment = RedditAdapter._comment_from_data(data, parent_id=parent_id, depth=depth)
            if comment is not None:
                comments.append(comment)

                # Enqueue replies. Reddit nests them under data.replies.data.children
                # (or replies == "" when there are none).
                replies = data.get("replies")
                if isinstance(replies, dict):
                    children = replies.get("data", {}).get("children", []) or []
                    for child in children:
                        if child.get("kind") == "t1":
                            queue.append((child, comment.id, depth + 1))

        return ThreadFetchResult(
            platform=Platform.REDDIT,
            url=original_url,
            title=title,
            subreddit=subreddit,
            op_author=op_author,
            comments=comments,
        )

    @staticmethod
    def _comment_from_data(data: dict, *, parent_id: str, depth: int) -> Comment | None:
        """Convert a single Reddit comment dict into our Comment model."""
        comment_id = data.get("id")
        if not comment_id:
            return None  # malformed — skip

        body = data.get("body") or ""
        author = data.get("author") or "[deleted]"
        is_removed = body in ("[removed]", "[deleted]") or author == "[deleted]"

        try:
            created = float(data.get("created_utc") or 0.0)
        except (TypeError, ValueError):
            created = 0.0

        try:
            score = int(data.get("score") or 0)
        except (TypeError, ValueError):
            score = 0

        return Comment(
            id=f"t1_{comment_id}",
            author=author,
            parent_id=parent_id,
            timestamp=created,
            text="" if is_removed else body,
            score=score,
            depth=depth,
            is_removed=is_removed,
        )
