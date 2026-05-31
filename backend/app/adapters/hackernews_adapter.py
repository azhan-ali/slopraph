"""
Hacker News adapter.

Uses the official Firebase-based HN API — completely free, no auth required,
works from any IP including cloud servers. Perfect for live demos.

URL shapes supported:
  • https://news.ycombinator.com/item?id=<id>
  • https://hn.algolia.com/...  (not supported — use ycombinator.com)

Threading model:
  • The story itself → root node (depth 0, parent None)
  • Top-level comments → depth 1
  • Nested replies → depth 2, 3, ...

API:
  GET https://hacker-news.firebaseio.com/v0/item/<id>.json
  Returns story + kids[] (comment ids, fetched recursively)

Design notes:
  • We fetch comments breadth-first up to max_comments cap.
  • HTML entities in comment text are decoded.
  • Deleted/dead comments are kept for topology (is_removed=True).
  • No rate limiting needed — Firebase CDN handles it.
"""

from __future__ import annotations

import html
import logging
import re
from urllib.parse import parse_qs, urlparse

import requests

from app.adapters.base import (
    AdapterFetchError,
    AdapterParseError,
    AdapterURLError,
    BaseAdapter,
)
from app.models import Comment, Platform, ThreadFetchResult

logger = logging.getLogger(__name__)

HN_API_BASE = "https://hacker-news.firebaseio.com/v0"
DEFAULT_TIMEOUT_S = 10.0
_ITEM_ID_RE = re.compile(r"^\d+$")


class HackerNewsAdapter(BaseAdapter):
    """Adapter for Hacker News threads (official Firebase API, no auth)."""

    name = "hackernews"

    def __init__(
        self,
        *,
        session: requests.Session | None = None,
        timeout_s: float = DEFAULT_TIMEOUT_S,
    ) -> None:
        self._session = session or requests.Session()
        self._timeout_s = timeout_s

    # ── Public API ───────────────────────────────────────────────────────
    def fetch(self, url: str, *, max_comments: int = 200) -> ThreadFetchResult:
        item_id = self._extract_item_id(url)
        story = self._fetch_item(item_id)

        if not story or story.get("type") not in ("story", "ask", "show", "job", "poll"):
            raise AdapterParseError(
                f"HN item {item_id} is not a story (type={story.get('type') if story else 'none'})."
            )

        title = story.get("title") or ""
        op_author = story.get("by") or "[deleted]"
        op_ts = float(story.get("time") or 0.0)
        op_text = html.unescape(re.sub(r"<[^>]+>", " ", story.get("text") or "")).strip()
        op_score = int(story.get("score") or 0)

        root_id = f"hn_{item_id}"
        comments: list[Comment] = [
            Comment(
                id=root_id,
                author=op_author,
                parent_id=None,
                timestamp=op_ts,
                text=(title + ("\n\n" + op_text if op_text else "")),
                score=op_score,
                depth=0,
                is_removed=False,
            )
        ]

        # BFS over kid ids
        kid_ids: list[int] = story.get("kids") or []
        queue: list[tuple[int, str, int]] = [
            (kid, root_id, 1) for kid in kid_ids
        ]

        while queue and len(comments) < max_comments:
            item_id_int, parent_id, depth = queue.pop(0)
            item = self._fetch_item(str(item_id_int))
            if not item:
                continue

            is_deleted = item.get("deleted", False) or item.get("dead", False)
            author = item.get("by") or "[deleted]"
            raw_text = item.get("text") or ""
            # Strip HTML tags and decode entities
            clean_text = html.unescape(re.sub(r"<[^>]+>", " ", raw_text)).strip()
            ts = float(item.get("time") or 0.0)
            score = int(item.get("score") or 0)
            comment_id = f"hn_{item_id_int}"

            comments.append(
                Comment(
                    id=comment_id,
                    author=author,
                    parent_id=parent_id,
                    timestamp=ts,
                    text="" if is_deleted else clean_text,
                    score=score,
                    depth=depth,
                    is_removed=is_deleted,
                )
            )

            # Enqueue children
            for kid in (item.get("kids") or []):
                queue.append((kid, comment_id, depth + 1))

        return ThreadFetchResult(
            platform=Platform.HACKERNEWS,
            url=url,
            title=title,
            subreddit=None,
            op_author=op_author,
            comments=comments,
        )

    # ── URL parsing ──────────────────────────────────────────────────────
    @staticmethod
    def _extract_item_id(url: str) -> str:
        if not url or not isinstance(url, str):
            raise AdapterURLError("URL is empty.")
        try:
            parsed = urlparse(url.strip())
        except (ValueError, AttributeError) as exc:
            raise AdapterURLError(f"Malformed URL: {exc}") from exc

        host = (parsed.netloc or "").lower()
        if host.startswith("www."):
            host = host[4:]

        if "ycombinator.com" not in host:
            raise AdapterURLError("Not a Hacker News URL (news.ycombinator.com).")

        qs = parse_qs(parsed.query or "")
        if "id" in qs and qs["id"]:
            candidate = qs["id"][0]
            if _ITEM_ID_RE.match(candidate):
                return candidate

        raise AdapterURLError(
            "HN URL must contain an item id: news.ycombinator.com/item?id=<number>"
        )

    # ── Network ─────────────────────────────────────────────────────────
    def _fetch_item(self, item_id: str) -> dict | None:
        try:
            resp = self._session.get(
                f"{HN_API_BASE}/item/{item_id}.json",
                timeout=self._timeout_s,
                headers={"Accept": "application/json"},
            )
            if resp.status_code == 200:
                return resp.json()
            return None
        except (requests.RequestException, ValueError):
            return None
