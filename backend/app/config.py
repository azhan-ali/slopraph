"""
Application configuration.

Loads settings from environment variables (and an optional .env file).
Centralising config here keeps secrets and environment-specific values
out of the code and makes the app easy to configure across dev/prod.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Strongly-typed application settings."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # ── App metadata ──
    app_name: str = "SLOPGRAPH API"
    app_version: str = "0.1.0"
    environment: str = "development"
    debug: bool = True

    # ── CORS ──
    # Comma-separated list of allowed frontend origins.
    cors_origins: str = (
        "http://localhost:3000,http://127.0.0.1:3000,"
        "http://localhost:3001,http://127.0.0.1:3001,"
        "http://localhost:3002,http://127.0.0.1:3002"
    )

    # ── External APIs (used in later phases) ──
    youtube_api_key: str = ""
    # Reddit requires a unique, descriptive User-Agent to avoid 403s on the
    # public `.json` endpoint. Their guideline format is:
    # `<platform>:<app id>:<version> (by /u/<username>)`. We use a generic but
    # well-formed UA; users can override via env if they hit blocks.
    reddit_user_agent: str = (
        "web:slopgraph.hackathon:0.1.0 (by /u/slopgraph_scanner)"
    )

    # ── Demo mode ──
    # When True, the Reddit adapter returns a bundled fixture instead of
    # making a live network call. Useful for offline demos and for
    # environments where Reddit blocks the host IP (datacenter ranges,
    # CI, some residential ISPs). Off by default.
    use_demo_fixture: bool = False

    @property
    def cors_origins_list(self) -> list[str]:
        """Parse the comma-separated CORS origins into a clean list."""
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    """Return a cached Settings instance (read once per process)."""
    return Settings()
