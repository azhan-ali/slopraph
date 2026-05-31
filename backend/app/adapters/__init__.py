"""
Adapter package.

Each adapter knows how to fetch a thread from a single platform and
return it in the platform-neutral `ThreadFetchResult` shape. The detection
engine never sees raw platform JSON — only normalised Comments.

Phase 1 shipped the Reddit adapter. Phase 6 adds YouTube (cross-platform via
the Data API v3) and Amazon (cross-track bonus, fixture-driven) — both emit
the identical `Comment` shape, so the entire detection engine runs unchanged
on all three. "One engine, three platforms."
"""

from app.adapters.amazon_adapter import AmazonAdapter
from app.adapters.base import (
    AdapterError,
    AdapterFetchError,
    AdapterParseError,
    AdapterURLError,
    BaseAdapter,
)
from app.adapters.hackernews_adapter import HackerNewsAdapter
from app.adapters.reddit_adapter import RedditAdapter
from app.adapters.youtube_adapter import YouTubeAdapter

__all__ = [
    "AdapterError",
    "AdapterFetchError",
    "AdapterParseError",
    "AdapterURLError",
    "BaseAdapter",
    "RedditAdapter",
    "YouTubeAdapter",
    "AmazonAdapter",
    "HackerNewsAdapter",
]
