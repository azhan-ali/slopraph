/**
 * Typed API client for the SLOPGRAPH backend.
 *
 * Centralises all HTTP communication so components never hardcode URLs or
 * duplicate fetch/error logic. Every call returns a discriminated result
 * ({ ok: true, data } | { ok: false, error }) so the UI can handle success
 * and failure without try/catch sprawl.
 */

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") || "http://127.0.0.1:8000";

// ── Backend response shapes (mirror app/models.py) ──
export type Platform = "reddit" | "youtube" | "amazon" | "unknown";

export interface HealthResponse {
  status: string;
  service: string;
  version: string;
  environment: string;
}

export interface Comment {
  id: string;
  author: string;
  parent_id: string | null;
  timestamp: number;
  text: string;
  score: number;
  depth: number;
  is_removed: boolean;
}

export interface GraphNode {
  id: string;
  author: string;
  text: string;
  score: number;
  depth: number;
  is_removed: boolean;
  reply_count: number;
  subtree_size: number;
  centrality: number;
  is_leaf: boolean;
  // Phase 3 detection signals
  latency_score: number;
  echo_score: number;
  consensus_score: number;
  authenticity: number;
  badge: "human" | "suspicious" | "bot";
}

export interface GraphEdge {
  source: string;
  target: string;
}

export interface GraphMetrics {
  node_count: number;
  edge_count: number;
  max_depth: number;
  avg_depth: number;
  unique_authors: number;
  branching_factor: number;
  leaf_ratio: number;
  is_connected: boolean;
  density: number;
}

export interface SignalScores {
  latency_suspicion: number;
  echo_suspicion: number;
  consensus_suspicion: number;
  combined_suspicion: number;
  echo_rings: string[][];
  human_count: number;
  suspicious_count: number;
  bot_count: number;
}

export interface ScanResponse {
  ok: boolean;
  url: string;
  platform: Platform;
  message: string;
  // Phase 1
  title: string | null;
  subreddit: string | null;
  op_author: string | null;
  comment_count: number;
  comments: Comment[];
  // Phase 2
  nodes: GraphNode[];
  edges: GraphEdge[];
  graph_metrics: GraphMetrics | null;
  // Phase 3
  thread_health: number | null;
  signal_scores: SignalScores | null;
}

export interface ApiError {
  error: string;
  detail?: string;
}

// ── Discriminated result wrapper ──
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; detail?: string };

/** Default timeout for API calls (ms). */
const DEFAULT_TIMEOUT = 10_000;

async function request<T>(
  path: string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_TIMEOUT,
): Promise<Result<T>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });

    // Attempt to parse JSON regardless of status (backend always returns JSON).
    let body: unknown = null;
    const text = await res.text();
    if (text) {
      try {
        body = JSON.parse(text);
      } catch {
        return { ok: false, error: "bad_response", detail: "Response was not valid JSON." };
      }
    }

    if (!res.ok) {
      const err = body as ApiError | null;
      return {
        ok: false,
        error: err?.error ?? `http_${res.status}`,
        detail: err?.detail ?? res.statusText,
      };
    }

    return { ok: true, data: body as T };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, error: "timeout", detail: "Request timed out." };
    }
    return {
      ok: false,
      error: "network_error",
      detail: "Could not reach the backend. Is it running?",
    };
  } finally {
    clearTimeout(timer);
  }
}

/** Check backend liveness (used by the connection indicator). */
export function checkHealth(): Promise<Result<HealthResponse>> {
  return request<HealthResponse>("/health", { method: "GET" }, 5_000);
}

/** Submit a thread URL to be scanned. */
export function scanThread(
  url: string,
  options: { maxComments?: number } = {},
): Promise<Result<ScanResponse>> {
  const body: Record<string, unknown> = { url };
  if (options.maxComments !== undefined) {
    body.max_comments = options.maxComments;
  }
  return request<ScanResponse>(
    "/scan",
    {
      method: "POST",
      body: JSON.stringify(body),
    },
    // Live network fetches can be slow on big threads — extend the timeout.
    30_000,
  );
}


// ════════════════════════════════════════════════════════════════════════
// Phase 6 — Bake-Off (accuracy evaluation) types + client
// ════════════════════════════════════════════════════════════════════════

export interface BakeoffConfusion {
  true_positive: number;
  false_positive: number;
  false_negative: number;
  true_negative: number;
}

export interface BakeoffMetrics {
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  false_positive_rate: number;
}

export interface BakeoffPrediction {
  name: string;
  scenario: string;
  difficulty: string;
  actual: "bot" | "human";
  predicted: "bot" | "human";
  thread_health: number;
  combined_suspicion: number;
  latency_suspicion: number;
  echo_suspicion: number;
  consensus_suspicion: number;
  echo_rings: number;
  correct: boolean;
}

export interface BakeoffResponse {
  ok: boolean;
  threshold: number;
  dataset_size: number;
  confusion: BakeoffConfusion;
  metrics: BakeoffMetrics;
  predictions: BakeoffPrediction[];
}

export interface ThresholdSweepRow {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  accuracy: number;
  false_positive_rate: number;
}

export interface ThresholdSweepResponse {
  ok: boolean;
  best_threshold: number;
  best_f1: number;
  sweep: ThresholdSweepRow[];
}

/** Run the Bake-Off evaluation on the labelled synthetic dataset. */
export function runBakeoff(
  options: { nBot?: number; nHuman?: number; threshold?: number } = {},
): Promise<Result<BakeoffResponse>> {
  const params = new URLSearchParams();
  if (options.nBot !== undefined) params.set("n_bot", String(options.nBot));
  if (options.nHuman !== undefined) params.set("n_human", String(options.nHuman));
  if (options.threshold !== undefined) params.set("threshold", String(options.threshold));
  const qs = params.toString();
  return request<BakeoffResponse>(`/bakeoff${qs ? `?${qs}` : ""}`, { method: "GET" }, 30_000);
}

/** Sweep classification thresholds and return the F1-optimal one. */
export function tuneThreshold(): Promise<Result<ThresholdSweepResponse>> {
  return request<ThresholdSweepResponse>("/bakeoff/tune", { method: "GET" }, 30_000);
}
