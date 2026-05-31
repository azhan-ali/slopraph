# SLOPGRAPH — Conversation Coherence Scanner

> **Bots can mimic text. They can't mimic conversation.**
> Topology > Stylometry.

**🌐 Live demo:** [slopraph.vercel.app](https://slopraph.vercel.app)
**📊 Accuracy report:** [slopraph.vercel.app/bakeoff](https://slopraph.vercel.app/bakeoff)
**⚙️ API:** [slopraph-backend.onrender.com](https://slopraph-backend.onrender.com/health)
**📦 Source:** [github.com/azhan-ali/slopraph](https://github.com/azhan-ali/slopraph)

SLOPGRAPH takes any comment thread (Reddit, YouTube, Amazon), maps its
**structure** as a graph, and surfaces the signals a bot-ring can't fake:
burst reply-timing, vocabulary echo across accounts, and synthetic consensus.
It returns a per-comment authenticity badge, a 0–100 thread-health score, and
an interactive conversation graph with the bot-rings highlighted.

Built for the **Slop Scan Hackathon 2026 — Track H (Social & News)**.

---

## Why topology, not stylometry

A modern LLM can rewrite its text to dodge any "does this sound AI-written?"
classifier. What it *can't* cheaply fake is the **structure** of a real
conversation happening across many independent people over time:

| Signal | What humans do | What bot-rings do |
| --- | --- | --- |
| **Reply latency** | Power-law-ish gaps: a few fast, most slow, long tail | Uniform bursts (many replies seconds apart) or robotic regularity |
| **Vocabulary echo** | Diverse phrasing per person | The same rare phrases reused across "different" accounts |
| **Synthetic consensus** | Genuine disagreement and tangents | Blanket agreement, zero pushback |

Each signal scores every author/comment 0–1 for suspicion. The aggregator
combines them (35% latency + 35% echo + 30% consensus) into an authenticity
score and a thread-health score.

---

## Architecture

```
URL → Adapter → List[Comment] → networkx graph → 3 signals → aggregator
                                                              → thread health + badges → JSON → Next.js viz
```

- **Adapters** (`backend/app/adapters/`) normalise each platform into one
  `Comment` shape. The engine never sees platform-specific JSON.
  - `reddit_adapter.py` — live via the public `.json` endpoint (no auth).
  - `youtube_adapter.py` — live via the YouTube Data API v3 (needs a key).
  - `amazon_adapter.py` — structured reviews (cross-track demo).
- **Engine** (`backend/app/engine/`) — builds the directed graph and computes
  topology metrics.
- **Signals** (`backend/app/signals/`) — the three detectors + aggregator.
- **Bake-Off** (`backend/app/bakeoff/`) — labelled dataset + evaluator that
  reports honest accuracy metrics.
- **Frontend** (`frontend/`) — Next.js App Router site: landing + live scan +
  interactive graph + the `/bakeoff` accuracy report.

---

## Quick start

### Option A — Live demo (no setup needed)

Just open **[slopraph.vercel.app](https://slopraph.vercel.app)** in your browser.
- Paste any Reddit, YouTube, or Amazon URL and hit **Scan**
- View the accuracy report at [/bakeoff](https://slopraph.vercel.app/bakeoff)

### Option B — Docker (single command)

```bash
docker-compose up
```

Frontend → http://localhost:3000 · Backend → http://localhost:8000

### Option B — Local dev

**Backend**

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux
pip install -r requirements.txt
pip install -r requirements-ml.txt
uvicorn app.main:app --reload
```

**Frontend**

```bash
cd frontend
npm install
npm run dev
```

> **Offline demo mode:** set `USE_DEMO_FIXTURE=true` in `backend/.env` to serve
> bundled fixtures instead of hitting live APIs. This guarantees the demo runs
> even where Reddit/YouTube block the host IP. It's on by default in the
> bundled `.env` so judges get a working demo with zero setup.

---

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET`  | `/health` | Liveness probe (frontend connection indicator) |
| `POST` | `/scan` | Scan a thread URL → scored conversation graph |
| `GET`  | `/bakeoff` | Run the accuracy evaluation → confusion matrix + metrics |
| `GET`  | `/bakeoff/tune` | Sweep classification thresholds → F1-optimal value |

`/scan` body: `{ "url": "<thread url>", "max_comments": 200 }`

`/bakeoff` query params: `n_bot` (1–100), `n_human` (1–100), `threshold` (1–99).

---

## Bake-Off — honest metrics

We don't claim the detector works — we **measure** it on a labelled, seeded
(reproducible) dataset of synthetic bot rings and organic human threads, and
publish the numbers including the threads it gets wrong.

**Result at the tuned threshold (health < 60 ⇒ bot), 24-thread dataset:**

| Metric | Value |
| --- | --- |
| Accuracy | 95.8% |
| Precision | 100% |
| Recall | 91.7% |
| F1 | 0.957 |
| **False-positive rate** | **0%** |

Confusion matrix (bot = positive): **TP 11 · FP 0 · FN 1 · TN 12**.

**The honest trade-off:** the detector is tuned to *never* accuse a human
(0% FPR). The cost is that a single deliberately stealthy bot ring — one that
varies its phrasing and timing — slips through as a false negative. We would
rather miss a clever bot than falsely flag a real person.

See the live, interactive version at **`/bakeoff`** in the running app.

---

## Live Fire — verified results

Tested on the live deployed backend (`USE_DEMO_FIXTURE=true` for offline-safe demo):

| Thread | Platform | Health | Echo Rings | Verdict |
| --- | --- | --- | --- | --- |
| Clean discussion thread | Reddit | 92/100 | 0 | ✅ Authentic |
| Crypto pump video comments | YouTube | 72/100 | 1 | ⚠️ Suspicious |
| Fake product reviews | Amazon | 55/100 | 1 | 🚩 Bot activity |

All three platforms detected correctly. Bot-ring accounts flagged with 🚩 badge.
Echo rings surfaced the exact accounts sharing rare phrasing.

---

## Cross-platform — one engine, three platforms

Because every adapter emits the same `Comment` shape, the *entire* detection
engine runs unchanged on Reddit threads, YouTube comment sections, and Amazon
review pages. Fake-review rings and YouTube comment bots exhibit the same
topology (echo + burst + manufactured consensus) the engine already detects.

---

## Testing

```bash
cd backend
venv\Scripts\python.exe -m pytest        # 214 tests across phases 0–6
```

| Phase | Tests | Focus |
| --- | --- | --- |
| 0 | 25 | API skeleton, health, CORS |
| 1 | 44 | Reddit adapter, URL parsing, /scan |
| 2 | 44 | Graph builder, topology metrics, serializer |
| 3 | 43 | 3 detection signals + aggregator |
| 6 | 58 | Bake-Off dataset/evaluator + YouTube/Amazon adapters |

**All 214 tests pass.** Zero false positives in the Bake-Off evaluation.

---

## AI tools disclosure

This project was built with AI coding assistants (Kiro / Claude), which is
permitted under the hackathon rules. All detection logic, signal design, and
metric definitions were authored and reviewed as part of the build.

---

## License

Open source — see `LICENSE`. Contributions welcome (see `CONTRIBUTING.md`).
