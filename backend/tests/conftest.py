"""
Test-suite fixtures and config.

Forces the real (non-demo) adapter behaviour by default so adapter unit
tests aren't affected by a developer's local `.env` having
`USE_DEMO_FIXTURE=true`.

We can't simply unset the env var because pydantic-settings *also* reads
the `.env` file. So instead we tell pydantic-settings to ignore `.env`
entirely during tests by pointing `env_file` at /dev/null.

Tests that want demo mode opt in by setting USE_DEMO_FIXTURE=true via
monkeypatch.setenv (which beats .env precedence even if .env were loaded).
"""

from __future__ import annotations

import os

import pytest


@pytest.fixture(autouse=True)
def _isolate_settings(monkeypatch, tmp_path):
    """
    Per-test settings isolation.

    Strategy:
      1. Point `Settings.model_config.env_file` at a non-existent path so
         `.env` in the project root cannot leak into tests.
      2. Strip USE_DEMO_FIXTURE from the environment.
      3. Bust the lru_cache around get_settings().
    """
    # 1) Disable the real .env file for the duration of the test
    from app.config import Settings, get_settings

    fake_env_path = tmp_path / "no.env"  # guaranteed not to exist
    original_env_file = Settings.model_config.get("env_file")
    Settings.model_config["env_file"] = str(fake_env_path)

    # 2) Make sure no leftover env var from previous runs is set
    monkeypatch.delenv("USE_DEMO_FIXTURE", raising=False)

    # 3) Force a fresh Settings on first use this test
    get_settings.cache_clear()

    yield

    # Restore for safety even though pytest re-imports per test
    Settings.model_config["env_file"] = original_env_file  # type: ignore[assignment]
    get_settings.cache_clear()


# Provide an opt-in helper for tests that want demo mode
@pytest.fixture
def enable_demo_mode(monkeypatch):
    from app.config import get_settings

    monkeypatch.setenv("USE_DEMO_FIXTURE", "true")
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
