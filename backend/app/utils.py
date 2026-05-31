"""
Small, dependency-free utility helpers used across the backend.
"""

from __future__ import annotations

from urllib.parse import urlparse

from app.models import Platform


def detect_platform(url: str) -> Platform:
    """
    Detect which platform a URL belongs to from its hostname.

    Uses hostname matching (not a naive substring search) so that URLs
    which merely *contain* a platform name in a path/query do not get
    misclassified. Returns Platform.UNKNOWN when nothing matches.
    """
    if not url or not isinstance(url, str):
        return Platform.UNKNOWN

    parsed = urlparse(url.strip())
    host = (parsed.netloc or parsed.path).lower()

    # Strip a leading "www." and any port for clean matching.
    host = host.split("@")[-1]  # drop any userinfo
    host = host.split(":")[0]  # drop port
    if host.startswith("www."):
        host = host[4:]

    if host.endswith("reddit.com") or host == "redd.it" or host.endswith(".redd.it"):
        return Platform.REDDIT
    if host.endswith("youtube.com") or host == "youtu.be" or host.endswith(".youtu.be"):
        return Platform.YOUTUBE
    if "amazon." in host or host.endswith("amzn.to"):
        return Platform.AMAZON

    return Platform.UNKNOWN


def is_http_url(url: str) -> bool:
    """Return True if the string is a syntactically valid http(s) URL."""
    if not url or not isinstance(url, str):
        return False
    try:
        parsed = urlparse(url.strip())
    except (ValueError, AttributeError):
        return False
    return parsed.scheme in {"http", "https"} and bool(parsed.netloc)
