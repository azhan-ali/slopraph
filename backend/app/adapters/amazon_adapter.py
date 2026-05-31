"""
Amazon adapter — Phase 6 (cross-track bonus, "Sharpest Signal").

Amazon product reviews are a perfect target for the *same* engine: fake-review
rings reuse phrasing, post in coordinated bursts, and manufacture blanket
5-star consensus — exactly the topology our vocab-echo + consensus + latency
signals detect. "One engine, two tracks."

Threading model
---------------
Amazon reviews are flat (a review can have comments, but the public surface is
effectively review-level). We model:
  • The product            → root node (depth 0, parent None)
  • Each review            → depth 1, parent = product

Data source & honesty
---------------------
Amazon has no free public reviews API, and scraping product pages violates
their ToS and breaks constantly behind bot-protection. Rather than ship a
fragile scraper, this adapter is **fixture/demo-driven**: it normalises a
structured reviews payload (bundled fixture, or a caller-provided JSON) into
the common `Comment` shape. This is an honest, reproducible cross-track demo
of the engine's portability — not a claim of live Amazon scraping.

When `settings.use_demo_fixture` is True (or always, since there's no live
backend), it loads tests/fixtures/amazon_reviews.json.

Design notes
------------
• `_parse_reviews()` is a pure function over a reviews dict — fully testable.
• URL parsing extracts the ASIN (Amazon's product id) for display/metadata.
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

# ASIN: 10-char alphanumeric product id (usually starts with B).
_ASIN_RE = re.compile(r"^[A-Z0-9]{10}$")

_DEMO_FIXTURE_PATH = (
    Path(__file__).resolve().parent.parent.parent
    / "tests" / "fixtures" / "amazon_reviews.json"
)


class AmazonAdapter(BaseAdapter):
    """Adapter for Amazon product reviews (fixture/demo-driven)."""

    name = "amazon"

    def __init__(
        self,
        *,
        session: requests.Session | None = None,
        timeout_s: float = 12.0,
    ) -> None:
        self._session = session or requests.Session()
        self._timeout_s = timeout_s

    # ── Public API ───────────────────────────────────────────────────────
    def fetch(self, url: str, *, max_comments: int = 200) -> ThreadFetchResult:
        asin = self._extract_asin(url)
        # Amazon has no free live API; always serve the structured fixture.
        # (USE_DEMO_FIXTURE is irrelevant here — there is no live path to gate.)
        logger.info("Amazon adapter: serving structured reviews fixture for ASIN %s", asin)
        return self._load_demo_fixture(asin=asin, original_url=url, max_comments=max_comments)

    @staticmethod
    def _load_demo_fixture(
        *, asin: str, original_url: str, max_comments: int
    ) -> ThreadFetchResult:
        try:
            with open(_DEMO_FIXTURE_PATH, encoding="utf-8") as f:
                payload = json.load(f)
        except (OSError, ValueError) as exc:
            raise AdapterFetchError(f"Amazon demo fixture unavailable: {exc}") from exc
        return AmazonAdapter._parse_reviews(
            payload, asin=asin, original_url=original_url, max_comments=max_comments
        )

    # ── URL parsing ──────────────────────────────────────────────────────
    @staticmethod
    def _extract_asin(url: str) -> str:
        """
        Extract the ASIN from any Amazon product URL variant:
          • https://www.amazon.com/dp/<ASIN>
          • https://www.amazon.com/gp/product/<ASIN>
          • https://www.amazon.com/<slug>/dp/<ASIN>/...
          • https://amzn.to/<short>  → cannot resolve offline; rejected clearly
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

        if host.endswith("amzn.to"):
            raise AdapterURLError(
                "Shortened amzn.to links can't be resolved offline. "
                "Paste the full amazon.com/dp/<ASIN> URL."
            )

        if "amazon." not in host:
            raise AdapterURLError("Not an Amazon URL.")

        parts = [p for p in (parsed.path or "").split("/") if p]
        # Look for dp/<ASIN> or gp/product/<ASIN>
        for i, part in enumerate(parts):
            if part in ("dp", "product") and i + 1 < len(parts):
                candidate = parts[i + 1].upper()
                if _ASIN_RE.match(candidate):
                    return candidate
        # Fallback: any 10-char ASIN-looking path segment.
        for part in parts:
            if _ASIN_RE.match(part.upper()):
                return part.upper()

        raise AdapterURLError(
            "Amazon URL must contain a product id (…/dp/<ASIN> or …/gp/product/<ASIN>)."
        )

    # ── Parsing (pure function — no I/O) ───────────────────────────────
    @staticmethod
    def _parse_reviews(
        payload: Any, *, asin: str, original_url: str, max_comments: int
    ) -> ThreadFetchResult:
        """
        Convert a structured reviews payload into a ThreadFetchResult.

        Expected payload shape:
            {
              "product": {"title": str, "asin": str},
              "reviews": [
                 {"id", "author", "rating", "timestamp", "text", "helpful_votes"}
              ]
            }
        """
        if not isinstance(payload, dict):
            raise AdapterParseError("Amazon reviews payload must be an object.")

        product = payload.get("product") or {}
        reviews = payload.get("reviews")
        if not isinstance(reviews, list):
            raise AdapterParseError("Amazon payload missing a 'reviews' list.")

        title = product.get("title") or f"Amazon product {asin}"
        product_asin = product.get("asin") or asin

        root_id = f"amz_product_{product_asin}"
        comments: list[Comment] = [
            Comment(
                id=root_id,
                author="[product]",
                parent_id=None,
                timestamp=float(payload.get("fetched_at") or 0.0),
                text=title,
                score=0,
                depth=0,
                is_removed=False,
            )
        ]

        for i, review in enumerate(reviews):
            if len(comments) >= max_comments:
                break
            if not isinstance(review, dict):
                continue
            rid = review.get("id") or f"r{i}"
            author = review.get("author") or "[anonymous]"
            text = review.get("text") or ""
            try:
                ts = float(review.get("timestamp") or 0.0)
            except (TypeError, ValueError):
                ts = 0.0
            try:
                score = int(review.get("helpful_votes") or 0)
            except (TypeError, ValueError):
                score = 0

            comments.append(
                Comment(
                    id=f"amz_{rid}",
                    author=author,
                    parent_id=root_id,
                    timestamp=ts,
                    text=text,
                    score=score,
                    depth=1,
                    is_removed=False,
                )
            )

        return ThreadFetchResult(
            platform=Platform.AMAZON,
            url=original_url,
            title=title,
            subreddit=None,
            op_author=None,
            comments=comments,
        )
