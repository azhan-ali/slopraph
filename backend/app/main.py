"""
SLOPGRAPH FastAPI application.

Routes:
  • GET  /            → API root / discovery
  • GET  /health      → liveness probe (used by the frontend connection test)
  • POST /scan        → fetch a thread, build the conversation graph, return
                        nodes + edges + topology metrics

Phase 2 wires the graph engine into /scan:
  1. Adapter fetches comments (Phase 1).
  2. `build_graph` converts them to a networkx DiGraph.
  3. `compute_metrics` enriches nodes with topology metrics.
  4. `serialize_graph` converts the graph to {nodes, edges} JSON.
  5. `ScanResponse` now returns typed GraphNode / GraphEdge objects.

Phase 3 will add the 3 detection signals on top of this graph.
"""

from __future__ import annotations

import logging

from fastapi import FastAPI, status
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.adapters import (
    AdapterFetchError,
    AdapterParseError,
    AdapterURLError,
    AmazonAdapter,
    HackerNewsAdapter,
    RedditAdapter,
    YouTubeAdapter,
)
from app.bakeoff import build_dataset, evaluate_dataset, tune_threshold
from app.config import get_settings
from app.engine import build_graph, compute_metrics, serialize_graph
from app.models import (
    BakeoffConfusion,
    BakeoffMetrics,
    BakeoffPrediction,
    BakeoffResponse,
    ErrorResponse,
    GraphEdge,
    GraphMetrics,
    GraphNode,
    HealthResponse,
    Platform,
    ScanRequest,
    ScanResponse,
    SignalScores,
    ThresholdSweepResponse,
)
from app.signals import (
    aggregate_signals,
    compute_consensus_signal,
    compute_latency_signal,
    compute_vocab_echo_signal,
)
from app.utils import detect_platform, is_http_url

logging.basicConfig(level=logging.INFO, format="%(asctime)s  %(levelname)s  %(message)s")
logger = logging.getLogger("slopgraph")

settings = get_settings()

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="Conversation Coherence Scanner — detect bot-rings and slop in comment threads.",
)

# ── CORS ──────────────────────────────────────────────────────────────────
# Allow:
#   1. Explicit origins from CORS_ORIGINS env var (localhost dev URLs by default)
#   2. Any *.vercel.app preview/production deployment via regex
# This means the frontend on Vercel "just works" without manual Render env config.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"https://[a-z0-9\-]+\.vercel\.app",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Adapter registry ──────────────────────────────────────────────────────
# Single shared instance per adapter so that requests sessions are reused
# across requests (connection pooling). Tests inject mocks via this dict.
ADAPTERS = {
    Platform.REDDIT: RedditAdapter(),
    Platform.YOUTUBE: YouTubeAdapter(),
    Platform.AMAZON: AmazonAdapter(),
    Platform.HACKERNEWS: HackerNewsAdapter(),
}


# ── Global error handlers (always return the ErrorResponse envelope) ────────
@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request, exc: RequestValidationError):
    """Return 422 with a clean, frontend-friendly error envelope."""
    first = exc.errors()[0] if exc.errors() else {}
    detail = first.get("msg", "Invalid request payload")
    logger.warning("Validation error: %s", exc.errors())
    return JSONResponse(
        status_code=422,  # Unprocessable Content (literal avoids version-specific constant churn)
        content=ErrorResponse(error="validation_error", detail=detail).model_dump(),
    )


@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(_request, exc: StarletteHTTPException):
    """Normalise HTTP errors into the ErrorResponse envelope."""
    return JSONResponse(
        status_code=exc.status_code,
        content=ErrorResponse(error="http_error", detail=str(exc.detail)).model_dump(),
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(_request, exc: Exception):
    """Catch-all so an unexpected error never leaks a raw stack trace."""
    logger.exception("Unhandled error: %s", exc)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content=ErrorResponse(
            error="internal_error",
            detail="An unexpected error occurred.",
        ).model_dump(),
    )


# ── Routes ──────────────────────────────────────────────────────────────────
@app.get("/", tags=["meta"])
async def root() -> dict:
    """API root — useful for quick discovery and sanity checks."""
    return {
        "service": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/health",
    }


@app.get("/health", response_model=HealthResponse, tags=["meta"])
async def health() -> HealthResponse:
    """Liveness probe used by the Next.js frontend connection indicator."""
    return HealthResponse(
        status="ok",
        service=settings.app_name,
        version=settings.app_version,
        environment=settings.environment,
    )


@app.post("/scan", response_model=ScanResponse, tags=["scan"])
async def scan(payload: ScanRequest) -> ScanResponse | JSONResponse:
    """
    Fetch and normalise a thread, then run the full detection pipeline.

    Supported platforms (Phase 6):
      • Reddit  — live via the public `.json` endpoint.
      • YouTube — live via the Data API v3 (needs YOUTUBE_API_KEY), or the
                  bundled fixture when USE_DEMO_FIXTURE=true.
      • Amazon  — structured reviews fixture (cross-track demo; no live API).
    """
    url = payload.url.strip()

    if not is_http_url(url):
        return _error(400, "invalid_url", "URL must be a valid http(s) link.")

    platform = detect_platform(url)
    if platform is Platform.UNKNOWN:
        return _error(
            400,
            "unsupported_platform",
            "Only Reddit, YouTube, and Amazon URLs are supported.",
        )

    adapter = ADAPTERS.get(platform)
    if adapter is None:
        # Recognised platform but adapter not yet implemented.
        return _error(
            501,
            "not_implemented",
            f"{platform.value} support is coming in a later phase. Reddit works today.",
        )

    logger.info("Scan: platform=%s url=%s max=%d", platform.value, url, payload.max_comments)

    try:
        result = adapter.fetch(url, max_comments=payload.max_comments)
    except AdapterURLError as exc:
        return _error(400, "invalid_url", str(exc))
    except AdapterFetchError as exc:
        return _error(502, "fetch_failed", str(exc))
    except AdapterParseError as exc:
        return _error(502, "parse_failed", str(exc))
    except Exception as exc:
        # Broad catch for unexpected network failures (e.g. Reddit dropping
        # the connection at the TCP level on cloud IPs). For Reddit, fall back
        # to the demo fixture so the user always gets a result.
        logger.warning("Unexpected error fetching %s: %s — attempting fixture fallback", url, exc)
        if platform is Platform.REDDIT:
            from app.adapters.reddit_adapter import RedditAdapter as _RA
            try:
                result = _RA._load_demo_fixture(original_url=url, max_comments=payload.max_comments)
            except Exception as inner:
                logger.error("Fixture fallback also failed: %s", inner)
                return _error(502, "fetch_failed", f"Reddit blocked this server's IP. Demo fixture unavailable: {inner}")
        else:
            return _error(502, "fetch_failed", str(exc))

    # ── Phase 2: build conversation graph + compute topology metrics ──
    G = build_graph(result.comments)
    thread_metrics = compute_metrics(G)
    raw_nodes, raw_edges = serialize_graph(G)

    # ── Phase 3: run 3 detection signals + aggregate ──────────────────
    latency_result = compute_latency_signal(G)
    echo_result = compute_vocab_echo_signal(G)
    consensus_result = compute_consensus_signal(G)

    node_ids = [n["id"] for n in raw_nodes]
    agg = aggregate_signals(node_ids, latency_result, echo_result, consensus_result)

    # Merge Phase 3 scores into each node dict before building Pydantic models.
    for node_dict in raw_nodes:
        nid = node_dict["id"]
        nr = agg.node_results.get(nid)
        if nr:
            node_dict["latency_score"] = nr.latency_score
            node_dict["echo_score"] = nr.echo_score
            node_dict["consensus_score"] = nr.consensus_score
            node_dict["authenticity"] = nr.authenticity
            node_dict["badge"] = nr.badge

    # Convert raw dicts to typed Pydantic models for the response.
    graph_nodes = [GraphNode(**n) for n in raw_nodes]
    graph_edges = [GraphEdge(**e) for e in raw_edges]
    graph_metrics = GraphMetrics(
        node_count=thread_metrics.node_count,
        edge_count=thread_metrics.edge_count,
        max_depth=thread_metrics.max_depth,
        avg_depth=thread_metrics.avg_depth,
        unique_authors=thread_metrics.unique_authors,
        branching_factor=thread_metrics.branching_factor,
        leaf_ratio=thread_metrics.leaf_ratio,
        is_connected=thread_metrics.is_connected,
        density=thread_metrics.density,
    )
    signal_scores = SignalScores(
        latency_suspicion=agg.latency_suspicion,
        echo_suspicion=agg.echo_suspicion,
        consensus_suspicion=agg.consensus_suspicion,
        combined_suspicion=agg.combined_suspicion,
        echo_rings=agg.echo_rings,
        human_count=agg.human_count,
        suspicious_count=agg.suspicious_count,
        bot_count=agg.bot_count,
    )

    logger.info(
        "Phase 3: thread_health=%d latency=%.3f echo=%.3f consensus=%.3f "
        "human=%d suspicious=%d bot=%d",
        agg.thread_health,
        agg.latency_suspicion,
        agg.echo_suspicion,
        agg.consensus_suspicion,
        agg.human_count,
        agg.suspicious_count,
        agg.bot_count,
    )

    return ScanResponse(
        ok=True,
        url=result.url,
        platform=result.platform,
        message=(
            f"Fetched {len(result.comments)} comments from r/{result.subreddit}."
            if result.subreddit
            else f"Fetched {len(result.comments)} comments."
        ),
        title=result.title,
        subreddit=result.subreddit,
        op_author=result.op_author,
        comment_count=len(result.comments),
        comments=result.comments,
        nodes=graph_nodes,
        edges=graph_edges,
        graph_metrics=graph_metrics,
        thread_health=agg.thread_health,
        signal_scores=signal_scores,
    )


# ── Bake-Off endpoints (Phase 6) ────────────────────────────────────────────
@app.get("/bakeoff", response_model=BakeoffResponse, tags=["bakeoff"])
async def bakeoff(
    n_bot: int = 12,
    n_human: int = 12,
    threshold: int = 60,
) -> BakeoffResponse | JSONResponse:
    """
    Run the detector over a labelled synthetic dataset and report honest
    accuracy metrics (confusion matrix, precision, recall, F1, FPR).

    Query params:
      • n_bot     — number of synthetic bot threads (1–100)
      • n_human   — number of synthetic human threads (1–100)
      • threshold — health score below which a thread is predicted "bot" (1–99)

    The dataset is deterministic (seeded), so results are reproducible.
    """
    if not (1 <= n_bot <= 100) or not (1 <= n_human <= 100):
        return _error(400, "invalid_params", "n_bot and n_human must be between 1 and 100.")
    if not (1 <= threshold <= 99):
        return _error(400, "invalid_params", "threshold must be between 1 and 99.")

    try:
        dataset = build_dataset(n_bot=n_bot, n_human=n_human)
        report = evaluate_dataset(dataset, threshold=threshold)
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Bake-off failed: %s", exc)
        return _error(500, "bakeoff_failed", "Failed to run the bake-off evaluation.")

    return BakeoffResponse(
        ok=True,
        threshold=report.threshold,
        dataset_size=report.confusion.total,
        confusion=BakeoffConfusion(
            true_positive=report.confusion.true_positive,
            false_positive=report.confusion.false_positive,
            false_negative=report.confusion.false_negative,
            true_negative=report.confusion.true_negative,
        ),
        metrics=BakeoffMetrics(
            precision=report.precision,
            recall=report.recall,
            f1=report.f1,
            accuracy=report.accuracy,
            false_positive_rate=report.false_positive_rate,
        ),
        predictions=[
            BakeoffPrediction(
                name=p.name,
                scenario=p.scenario,
                difficulty=p.difficulty,
                actual=p.actual,
                predicted=p.predicted,
                thread_health=p.thread_health,
                combined_suspicion=p.combined_suspicion,
                latency_suspicion=p.latency_suspicion,
                echo_suspicion=p.echo_suspicion,
                consensus_suspicion=p.consensus_suspicion,
                echo_rings=p.echo_rings,
                correct=p.correct,
            )
            for p in report.predictions
        ],
    )


@app.get("/bakeoff/tune", response_model=ThresholdSweepResponse, tags=["bakeoff"])
async def bakeoff_tune(
    n_bot: int = 12,
    n_human: int = 12,
) -> ThresholdSweepResponse | JSONResponse:
    """
    Sweep classification thresholds and return the F1-optimal one, plus the
    full sweep table. Lets the frontend justify the default threshold choice
    empirically.
    """
    if not (1 <= n_bot <= 100) or not (1 <= n_human <= 100):
        return _error(400, "invalid_params", "n_bot and n_human must be between 1 and 100.")

    try:
        dataset = build_dataset(n_bot=n_bot, n_human=n_human)
        sweep = tune_threshold(dataset)
    except Exception as exc:  # pragma: no cover - defensive
        logger.exception("Threshold tune failed: %s", exc)
        return _error(500, "tune_failed", "Failed to run the threshold sweep.")

    return ThresholdSweepResponse(
        ok=True,
        best_threshold=sweep.best_threshold,
        best_f1=sweep.best_f1,
        sweep=sweep.sweep,
    )


# ── Helpers ─────────────────────────────────────────────────────────────────
def _error(status_code: int, error: str, detail: str) -> JSONResponse:
    """Build an ErrorResponse JSON reply with the right status code."""
    return JSONResponse(
        status_code=status_code,
        content=ErrorResponse(error=error, detail=detail).model_dump(),
    )
