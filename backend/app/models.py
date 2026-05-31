"""
Pydantic data models shared across the application.

The `Comment` model is the common internal format that every platform
adapter (Reddit, YouTube, Amazon...) converts its raw data into. The
detection engine only ever sees `Comment` objects, which keeps it
platform-agnostic. The response models define the stable API contract
that the Next.js frontend consumes.
"""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field


class Platform(str, Enum):
    """Supported content platforms."""

    REDDIT = "reddit"
    YOUTUBE = "youtube"
    AMAZON = "amazon"
    HACKERNEWS = "hackernews"
    UNKNOWN = "unknown"


class Comment(BaseModel):
    """
    Normalised representation of a single comment/post in a conversation.

    Every adapter must emit comments in this shape so the downstream
    graph engine and detection signals stay platform-independent.
    """

    id: str = Field(..., description="Unique comment id within the thread")
    author: str = Field(..., description="Author username/handle")
    parent_id: str | None = Field(
        default=None,
        description="Parent comment id, or None for a top-level comment / OP",
    )
    timestamp: float = Field(..., description="Creation time as a unix epoch (seconds)")
    text: str = Field(default="", description="Comment body text")
    score: int = Field(default=0, description="Upvotes / likes / score")
    depth: int = Field(default=0, ge=0, description="Nesting depth (0 = top level / OP)")
    is_removed: bool = Field(
        default=False,
        description="True if the body was deleted/removed (kept for graph topology)",
    )


class ThreadFetchResult(BaseModel):
    """
    Result of an adapter fetch — the platform-neutral thread payload.

    Adapters return this; the API layer maps it into ScanResponse.
    """

    platform: Platform
    url: str
    title: str | None = None
    subreddit: str | None = None       # Reddit-specific metadata
    op_author: str | None = None
    comments: list[Comment] = Field(default_factory=list)


class HealthResponse(BaseModel):
    """Payload returned by the /health endpoint."""

    status: str
    service: str
    version: str
    environment: str


class ScanRequest(BaseModel):
    """Request body for the /scan endpoint."""

    url: str = Field(..., min_length=1, description="Thread / comment-section URL to scan")
    max_comments: int = Field(
        default=200,
        ge=1,
        le=1000,
        description="Hard cap on comments returned (protects against giant threads)",
    )


class GraphNode(BaseModel):
    """
    A single node in the serialised conversation graph.

    Mirrors the shape produced by `app.engine.serializer.serialize_graph`
    and enriched by Phase 3 signal aggregation.
    """

    id: str
    author: str
    text: str
    score: int = 0
    depth: int = 0
    is_removed: bool = False
    # ── Phase 2 topology metrics ──
    reply_count: int = 0
    subtree_size: int = 1
    centrality: float = 0.0
    is_leaf: bool = True
    # ── Phase 3 detection signals ──
    latency_score: float = 0.0       # 0–1 suspicion from latency signal
    echo_score: float = 0.0          # 0–1 suspicion from vocab echo signal
    consensus_score: float = 0.0     # 0–1 suspicion from consensus signal
    authenticity: int = 100          # 0–100 (higher = more authentic)
    badge: str = "human"             # "human" | "suspicious" | "bot"


class GraphEdge(BaseModel):
    """A directed edge in the conversation graph (parent → child reply)."""

    source: str
    target: str


class GraphMetrics(BaseModel):
    """Thread-level topology metrics computed by the graph engine."""

    node_count: int = 0
    edge_count: int = 0
    max_depth: int = 0
    avg_depth: float = 0.0
    unique_authors: int = 0
    branching_factor: float = 0.0
    leaf_ratio: float = 0.0
    is_connected: bool = True
    density: float = 0.0


class SignalScores(BaseModel):
    """Thread-level signal suspicion scores (0–1 each)."""

    latency_suspicion: float = 0.0
    echo_suspicion: float = 0.0
    consensus_suspicion: float = 0.0
    combined_suspicion: float = 0.0
    echo_rings: list[list[str]] = Field(default_factory=list)
    human_count: int = 0
    suspicious_count: int = 0
    bot_count: int = 0


class ScanResponse(BaseModel):
    """
    Response from the /scan endpoint.

    The shape is stable across phases:
      • Phase 0 returned the contract scaffold only.
      • Phase 1 populates `title`, `comments`, `comment_count` for Reddit URLs.
      • Phase 2 populates `nodes`, `edges`, `graph_metrics`.
      • Phase 3 (this) populates `thread_health`, `signal_scores`, and
        per-node `authenticity`, `badge`, and signal scores.
    The frontend can render any subset that's present.
    """

    ok: bool
    url: str
    platform: Platform
    message: str

    # ── Phase 1: thread metadata + comments ──
    title: str | None = None
    subreddit: str | None = None
    op_author: str | None = None
    comment_count: int = 0
    comments: list[Comment] = Field(default_factory=list)

    # ── Phase 2: graph topology ──
    nodes: list[GraphNode] = Field(default_factory=list)
    edges: list[GraphEdge] = Field(default_factory=list)
    graph_metrics: GraphMetrics | None = None

    # ── Phase 3: detection scoring ──
    thread_health: int | None = None
    signal_scores: SignalScores | None = None


class ErrorResponse(BaseModel):
    """Standard error envelope returned for handled failures."""

    ok: bool = False
    error: str
    detail: str | None = None


# ──────────────────────────────────────────────────────────────────────────
# Phase 6 — Bake-Off response models
# ──────────────────────────────────────────────────────────────────────────
class BakeoffConfusion(BaseModel):
    """2×2 confusion matrix (bot = positive class)."""

    true_positive: int = 0
    false_positive: int = 0
    false_negative: int = 0
    true_negative: int = 0


class BakeoffMetrics(BaseModel):
    """Accuracy metrics derived from the confusion matrix."""

    precision: float = 0.0
    recall: float = 0.0
    f1: float = 0.0
    accuracy: float = 0.0
    false_positive_rate: float = 0.0


class BakeoffPrediction(BaseModel):
    """Per-thread prediction detail."""

    name: str
    scenario: str
    difficulty: str
    actual: str
    predicted: str
    thread_health: int
    combined_suspicion: float
    latency_suspicion: float
    echo_suspicion: float
    consensus_suspicion: float
    echo_rings: int
    correct: bool


class BakeoffResponse(BaseModel):
    """Response from the /bakeoff endpoint."""

    ok: bool = True
    threshold: int
    dataset_size: int
    confusion: BakeoffConfusion
    metrics: BakeoffMetrics
    predictions: list[BakeoffPrediction] = Field(default_factory=list)


class ThresholdSweepResponse(BaseModel):
    """Response from the /bakeoff/tune endpoint."""

    ok: bool = True
    best_threshold: int
    best_f1: float
    sweep: list[dict] = Field(default_factory=list)
