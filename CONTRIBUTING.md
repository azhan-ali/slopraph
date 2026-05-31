# Contributing to SLOPGRAPH

Thanks for your interest! SLOPGRAPH is designed to be extended — especially
with new platform adapters.

## Project layout

```
backend/app/
  adapters/   # one file per platform — all emit the common Comment shape
  engine/     # graph builder + topology metrics + serializer
  signals/    # the 3 detectors + aggregator
  bakeoff/    # labelled dataset + accuracy evaluator
frontend/src/
  app/        # Next.js routes (/, /bakeoff)
  components/ # UI
  lib/        # typed API client
```

## Adding a new platform adapter

1. Create `backend/app/adapters/<platform>_adapter.py`.
2. Subclass `BaseAdapter` and implement `fetch(url, *, max_comments) -> ThreadFetchResult`.
3. Keep parsing in a **pure function** (`_parse_*`) that takes a dict and
   returns the result — this is what unit tests target (no network needed).
4. Register the adapter in `app/main.py`'s `ADAPTERS` dict and add platform
   detection in `app/utils.py:detect_platform`.
5. Add a fixture under `tests/fixtures/` and tests under `tests/test_*.py`.

Because every adapter returns the same `Comment` shape, the graph engine and
all three detection signals work on your platform with **zero** further changes.

## Running tests

```bash
cd backend
venv\Scripts\python.exe -m pytest        # all phases
venv\Scripts\python.exe -m pytest tests/test_phase6.py -v
```

All new code must:
- Keep the full suite green (currently 214 tests).
- Add tests for new behaviour (happy path + at least one edge case).
- Never widen the false-positive rate in the Bake-Off without discussion —
  not accusing real humans is a core design goal.

## Code style

- Backend: type hints throughout, dataclasses for results, pure parse
  functions, defensive error handling via the `Adapter*Error` taxonomy.
- Frontend: TypeScript strict, typed API client, no business logic in
  components (presentation only).

## Commits & PRs

- Keep PRs focused. Describe what you changed, how you tested it, and any
  trade-offs. Include before/after Bake-Off numbers if you touch a signal.
