"""
Adapter base class and shared error taxonomy.

The error hierarchy lets the API layer translate failures into stable
HTTP responses without leaking adapter internals.
"""

from __future__ import annotations

from abc import ABC, abstractmethod

from app.models import ThreadFetchResult


class AdapterError(Exception):
    """Base class for all adapter failures."""


class AdapterURLError(AdapterError):
    """The URL couldn't be parsed into a thread/video/product id."""


class AdapterFetchError(AdapterError):
    """The remote request failed (network, timeout, non-200, blocked)."""


class AdapterParseError(AdapterError):
    """The remote response didn't have the expected shape."""


class BaseAdapter(ABC):
    """Abstract adapter — every platform implementation conforms to this."""

    name: str = "base"

    @abstractmethod
    def fetch(self, url: str, *, max_comments: int = 200) -> ThreadFetchResult:
        """
        Fetch a thread from the given URL and return a normalised result.

        Args:
            url: A platform-specific thread/video/product URL.
            max_comments: Hard cap on the number of comments returned (cost control).

        Raises:
            AdapterURLError: URL malformed or doesn't reference a thread.
            AdapterFetchError: Network / HTTP failure or rate-limited.
            AdapterParseError: Response shape unexpected.
        """
