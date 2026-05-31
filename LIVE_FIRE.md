# Live Fire — running SLOPGRAPH on real, wild threads

The Bake-Off proves accuracy on a *labelled* dataset. **Live Fire** proves the
tool works on **real, freshly-scraped content** — no synthetic test data.

## How to run a live scan

1. Make sure the backend is in live mode (not demo):
   - In `backend/.env` set `USE_DEMO_FIXTURE=false`.
   - Restart the backend (`uvicorn app.main:app --reload`).
2. Start the frontend (`npm run dev`) and open http://localhost:3000.
3. Paste a real URL and hit **Scan**. Reddit works with no API key. YouTube
   needs `YOUTUBE_API_KEY` set in `backend/.env` (free from Google Cloud
   Console → YouTube Data API v3).

## Recommended demo threads (3-up)

Pick three live threads to show the spread of verdicts:

| # | Pick | What it demonstrates |
| --- | --- | --- |
| 1 | A large organic discussion in an established subreddit (e.g. a long r/AskHistorians or r/programming thread) | High thread-health, diverse vocab, genuine disagreement → cleared |
| 2 | A comment section on a "get rich quick" / crypto / dropshipping promo video | Echo phrases + burst timing → low health, echo rings flagged |
| 3 | A mixed thread (popular product launch) | Some suspicious clusters inside an otherwise healthy thread |

> Choose threads **live during the demo** (or minutes before) so judges can
> see it isn't pre-baked. Reddit's public `.json` endpoint means any thread
> URL works instantly with no credentials.

## What to point at on screen

- The **thread-health gauge** (0–100) and its verdict label.
- The **3 signal bars** (latency / echo / consensus) — explain *why* the score
  is what it is.
- Any **echo rings** detected — the exact accounts sharing rare phrasing.
- The **interactive graph** — red-highlighted bot-rings vs. green human nodes.

## Capturing proof

For the submission, capture for each of the 3 threads:
- The URL and the timestamp you scanned it.
- A screenshot of the result panel (health + signals + rings).
- A one-line note on whether the verdict matched your manual read.

Drop the screenshots in `demo/` and reference them here.

## Honesty note

Live threads have **no ground-truth label**, so Live Fire is a qualitative
demonstration, not a measured accuracy number. The measured numbers live in
the Bake-Off (`/bakeoff`). Presenting both — measured accuracy *and* a live,
unscripted run — is the honest way to show the tool works.
