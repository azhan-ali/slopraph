"use client";

/**
 * ScanSection — the live, interactive part of the page.
 *
 * Encapsulates the full scan flow:
 *   • URL input + example chips
 *   • Async fetch with loading/error/success states
 *   • Result panel with thread metadata + comment list
 *
 * Backend contract is already typed in `lib/api.ts`. This component is
 * presentation only — no business logic about *what* counts as slop.
 */

import { useRef, useState } from "react";
import { scanThread, type Comment, type GraphMetrics, type GraphNode, type ScanResponse, type SignalScores } from "@/lib/api";
import { SectionHeader } from "./Features";
import ConversationGraph from "./ConversationGraph";

type ScanState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; result: ScanResponse }
  | { status: "error"; message: string };

const EXAMPLES = [
  {
    label: "Reddit thread",
    url: "https://www.reddit.com/r/TestSub/comments/abc123/sample-thread/",
    icon: "📰",
  },
  {
    label: "YouTube video",
    url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
    icon: "▶",
  },
  {
    label: "Amazon product",
    url: "https://www.amazon.com/dp/B0EXAMPLE1",
    icon: "🛒",
  },
];

const PLATFORM_STYLES: Record<string, string> = {
  reddit: "bg-orange-500/10 text-orange-300 border-orange-500/30",
  youtube: "bg-red-500/10 text-red-300 border-red-500/30",
  amazon: "bg-yellow-500/10 text-yellow-300 border-yellow-500/30",
  unknown: "bg-gray-500/10 text-gray-300 border-gray-500/30",
};

export default function ScanSection() {
  const [url, setUrl] = useState("");
  const [scan, setScan] = useState<ScanState>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleScan(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      inputRef.current?.focus();
      return;
    }

    setScan({ status: "loading" });
    const res = await scanThread(trimmed);
    if (res.ok) {
      setScan({ status: "success", result: res.data });
    } else {
      setScan({
        status: "error",
        message: `${res.error}${res.detail ? " — " + res.detail : ""}`,
      });
    }
  }

  function fillExample(u: string) {
    setUrl(u);
    setScan({ status: "idle" });
    inputRef.current?.focus();
  }

  return (
    <section id="scan" className="relative py-24 px-6 max-w-6xl mx-auto">
      {/* Section scrim */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none rounded-3xl"
        style={{
          background:
            "radial-gradient(ellipse 85% 75% at 50% 50%, rgba(7,7,13,0.82) 0%, rgba(7,7,13,0.55) 65%, transparent 100%)",
        }}
      />

      <div className="relative">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--brand)] mb-4 font-semibold">
            Live Demo
          </p>
          <h2 className="font-display font-bold text-4xl sm:text-5xl text-white tracking-tight leading-tight mb-4">
            Try it on a{" "}
            <span
              style={{
                background: "linear-gradient(135deg, #ef4444, #ff8a8a)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              real thread
            </span>
          </h2>
          <p className="text-white/70 text-base leading-relaxed">
            Paste any supported URL. We&apos;ll fetch the thread, normalise its
            structure, and show you the conversation graph.
          </p>
        </div>

        {/* Scan form — solid dark card */}
        <div
          className="rounded-2xl p-px mb-6"
          style={{
            background:
              "linear-gradient(135deg, rgba(239,68,68,0.4), rgba(168,85,247,0.2) 50%, rgba(255,255,255,0.06))",
          }}
        >
          <div
            className="rounded-2xl p-6 sm:p-8"
            style={{
              background: "rgba(10, 10, 20, 0.95)",
              backdropFilter: "blur(32px)",
            }}
          >
            <form onSubmit={handleScan} className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-3">
                <input
                  ref={inputRef}
                  type="url"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://www.reddit.com/r/…"
                  aria-label="Thread URL to scan"
                  className="input-glass flex-1"
                />
                <button
                  type="submit"
                  disabled={scan.status === "loading"}
                  className="btn-primary whitespace-nowrap min-w-[140px]"
                >
                  {scan.status === "loading" ? (
                    <>
                      <Spinner />
                      Scanning
                    </>
                  ) : (
                    <>
                      Scan
                      <svg
                        className="w-4 h-4"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                      >
                        <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    </>
                  )}
                </button>
              </div>

              {/* Example chips */}
              <div className="flex flex-wrap gap-2 items-center">
                <span className="text-xs text-white/40 mr-1 font-medium">Try:</span>
                {EXAMPLES.map((ex) => (
                  <button
                    key={ex.url}
                    type="button"
                    onClick={() => fillExample(ex.url)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-white/70 border border-white/10 bg-white/5 hover:bg-white/10 hover:text-white hover:border-white/20 transition-all"
                  >
                    <span aria-hidden="true">{ex.icon}</span>
                    {ex.label}
                  </button>
                ))}
              </div>
            </form>
          </div>
        </div>

        {/* Result area */}
        <div className="mt-4">
          {scan.status === "loading" && <LoadingPanel />}
          {scan.status === "error" && <ErrorPanel message={scan.message} />}
          {scan.status === "success" && <ResultPanel result={scan.result} />}
        </div>
      </div>
    </section>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Result states
// ════════════════════════════════════════════════════════════════════════

function Spinner() {
  return (
    <span
      className="w-4 h-4 inline-block border-2 border-white/40 border-t-white rounded-full animate-spin"
      role="status"
      aria-label="Loading"
    />
  );
}

function LoadingPanel() {
  return (
    <div className="glass-card p-12 text-center">
      <div className="w-10 h-10 mx-auto mb-4 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-[var(--fg-muted)]">
        Fetching thread and normalising comments…
      </p>
    </div>
  );
}

function ErrorPanel({ message }: { message: string }) {
  return (
    <div
      role="alert"
      className="glass-card p-6 border-red-500/30 bg-red-950/20"
    >
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-lg bg-red-500/15 flex items-center justify-center flex-shrink-0">
          <span className="text-red-400 text-xl">!</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-semibold text-red-300 mb-1">
            Scan failed
          </p>
          <p className="text-xs text-red-400/80 font-mono break-all mb-3">
            {message}
          </p>
          <p className="text-xs text-[var(--fg-muted)]">
            Make sure the URL is a valid Reddit, YouTube, or Amazon link and
            the backend is running.
          </p>
        </div>
      </div>
    </div>
  );
}

function ResultPanel({ result }: { result: ScanResponse }) {
  const platformStyle =
    PLATFORM_STYLES[result.platform] ?? PLATFORM_STYLES.unknown;

  return (
    <div className="glass-card overflow-hidden animate-fade-up">
      {/* Header bar */}
      <div className="px-6 py-4 border-b border-[var(--glass-border)] bg-gradient-to-r from-[rgba(239,68,68,0.05)] to-transparent flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-8 h-8 rounded-lg bg-emerald-500/15 flex items-center justify-center flex-shrink-0">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              className="w-4 h-4 text-emerald-400"
            >
              <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <p className="text-sm text-white truncate">{result.message}</p>
        </div>
        <span
          className={`text-[10px] px-3 py-1 rounded-full border font-mono uppercase tracking-wider whitespace-nowrap ${platformStyle}`}
        >
          {result.platform}
        </span>
      </div>

      {/* Metadata */}
      <div className="px-6 py-5 space-y-4 border-b border-[var(--glass-border)]">
        {result.title && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--fg-dim)] mb-1">
              Title
            </p>
            <p className="text-base text-white font-medium">{result.title}</p>
          </div>
        )}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {result.subreddit && (
            <MetaPill label="Subreddit" value={`r/${result.subreddit}`} />
          )}
          {result.op_author && (
            <MetaPill label="OP" value={`u/${result.op_author}`} />
          )}
          <MetaPill label="Comments" value={String(result.comment_count)} />
        </div>
      </div>

      {/* Comment list */}
      {result.comments.length > 0 && <CommentsList comments={result.comments} nodes={result.nodes} />}

      {/* Phase 3: Thread Health + Signal Scores */}
      {result.thread_health !== null && result.signal_scores && (
        <SignalPanel health={result.thread_health} signals={result.signal_scores} />
      )}

      {/* Phase 2: Graph metrics */}
      {result.graph_metrics && (
        <GraphMetricsPanel metrics={result.graph_metrics} nodes={result.nodes} />
      )}

      {/* Phase 5: Interactive force-directed conversation graph */}
      {result.nodes.length > 0 && (
        <ConversationGraph
          nodes={result.nodes}
          edges={result.edges}
          signalScores={result.signal_scores}
        />
      )}

      {/* Footer */}
      <div className="px-6 py-3 bg-[rgba(7,7,13,0.4)] border-t border-[var(--glass-border)]">
        <p className="text-[11px] text-[var(--fg-dim)]">
          <span className="text-white font-medium">All phases complete.</span>{" "}
          Thread health:{" "}
          <span className="text-white font-mono">{result.thread_health}/100</span>.
          Graph: {result.nodes.length} nodes · {result.edges.length} edges.
        </p>
      </div>
    </div>
  );
}

function MetaPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-[rgba(255,255,255,0.03)] border border-[var(--glass-border)] px-4 py-3">
      <p className="text-[10px] uppercase tracking-wider text-[var(--fg-dim)] mb-1">
        {label}
      </p>
      <p className="text-sm font-mono text-white truncate">{value}</p>
    </div>
  );
}

function CommentsList({ comments, nodes }: { comments: Comment[]; nodes: GraphNode[] }) {
  const SHOW_LIMIT = 25;
  const visible = comments.slice(0, SHOW_LIMIT);
  const hidden = Math.max(0, comments.length - SHOW_LIMIT);
  // Build a badge lookup from graph nodes
  const badgeMap = Object.fromEntries(nodes.map((n) => [n.id, n.badge]));

  return (
    <div className="px-6 py-5 max-h-[480px] overflow-y-auto">
      <p className="text-[10px] uppercase tracking-wider text-[var(--fg-dim)] mb-4">
        Conversation tree · {comments.length} nodes
      </p>
      <ol className="space-y-2">
        {visible.map((c) => (
          <CommentRow key={c.id} comment={c} badge={badgeMap[c.id]} />
        ))}
      </ol>
      {hidden > 0 && (
        <p className="text-xs text-[var(--fg-dim)] mt-4 italic">
          + {hidden} more comments hidden from preview (still in the data).
        </p>
      )}
    </div>
  );
}

function CommentRow({ comment, badge }: { comment: Comment; badge?: string }) {
  const indent = Math.min(comment.depth, 6) * 14;
  const isOp = comment.parent_id === null;

  const badgeConfig = {
    human: { label: "✅ human", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    suspicious: { label: "⚠️ suspicious", cls: "bg-yellow-500/10 text-yellow-400 border-yellow-500/20" },
    bot: { label: "🚩 bot", cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  }[badge ?? "human"] ?? { label: "", cls: "" };

  return (
    <li
      style={{ marginLeft: indent }}
      className={`pl-3 py-2 border-l-2 transition-colors ${
        badge === "bot"
          ? "border-red-500/50"
          : badge === "suspicious"
          ? "border-yellow-500/40"
          : isOp
          ? "border-[var(--brand)]/60"
          : "border-[var(--glass-border)] hover:border-[var(--glass-border-bright)]"
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs mb-1">
        <span className={isOp ? "text-[var(--brand)] font-semibold" : "text-white font-medium"}>
          u/{comment.author}
        </span>
        {isOp && (
          <span className="px-1.5 py-0.5 rounded bg-[var(--brand)]/15 text-[var(--brand)] text-[9px] font-bold uppercase tracking-wider">
            OP
          </span>
        )}
        {badge && (
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${badgeConfig.cls}`}>
            {badgeConfig.label}
          </span>
        )}
        <span className="text-[var(--fg-dim)]">·</span>
        <span className="text-[var(--fg-dim)] font-mono">d{comment.depth}</span>
        <span className="text-[var(--fg-dim)]">·</span>
        <span className={`font-mono ${comment.score >= 0 ? "text-[var(--fg-muted)]" : "text-red-400"}`}>
          {comment.score >= 0 ? "▲" : "▼"} {comment.score}
        </span>
        {comment.is_removed && (
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-gray-700/50 text-gray-400 uppercase tracking-wider">
            removed
          </span>
        )}
      </div>
      <p className={`text-sm leading-relaxed ${comment.is_removed ? "italic text-[var(--fg-dim)]" : "text-[var(--fg)]"}`}>
        {comment.is_removed ? "[content removed — node kept for graph topology]" : truncate(comment.text, 280)}
      </p>
    </li>
  );
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.slice(0, max - 1) + "…";
}

// ════════════════════════════════════════════════════════════════════════
// Phase 2: Graph metrics panel
// ════════════════════════════════════════════════════════════════════════

function GraphMetricsPanel({
  metrics,
  nodes,
}: {
  metrics: GraphMetrics;
  nodes: GraphNode[];
}) {
  // Find the most central node (highest betweenness centrality).
  const mostCentral = nodes.reduce(
    (best, n) => (n.centrality > best.centrality ? n : best),
    nodes[0],
  );

  // Find the node with the largest subtree (most influential branch).
  const mostInfluential = nodes.reduce(
    (best, n) => (n.subtree_size > best.subtree_size ? n : best),
    nodes[0],
  );

  return (
    <div className="border-t border-[var(--glass-border)]">
      {/* Section header */}
      <div className="px-6 py-4 bg-gradient-to-r from-[rgba(34,211,238,0.04)] to-transparent border-b border-[var(--glass-border)]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-cyan-500/15 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-cyan-400">
              <circle cx="6" cy="6" r="2" fill="currentColor" />
              <circle cx="18" cy="6" r="2" fill="currentColor" opacity="0.6" />
              <circle cx="12" cy="14" r="2.5" fill="currentColor" />
              <circle cx="6" cy="20" r="1.5" fill="currentColor" opacity="0.7" />
              <circle cx="18" cy="20" r="1.5" fill="currentColor" opacity="0.5" />
              <path d="M7 7L11 13M17 7L13 13M11 16L7 19M13 16L17 19" stroke="currentColor" strokeWidth="1" strokeLinecap="round" opacity="0.5" />
            </svg>
          </div>
          <p className="text-xs font-semibold text-white">Conversation Graph</p>
          <span className="ml-auto text-[10px] font-mono text-cyan-400/70 uppercase tracking-wider">
            Phase 2
          </span>
        </div>
      </div>

      {/* Metrics grid */}
      <div className="px-6 py-5 space-y-4">
        <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
          <GraphStat label="Nodes" value={String(metrics.node_count)} />
          <GraphStat label="Edges" value={String(metrics.edge_count)} />
          <GraphStat label="Max depth" value={String(metrics.max_depth)} />
          <GraphStat label="Authors" value={String(metrics.unique_authors)} />
          <GraphStat
            label="Leaf ratio"
            value={`${(metrics.leaf_ratio * 100).toFixed(0)}%`}
          />
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <GraphStat
            label="Avg depth"
            value={metrics.avg_depth.toFixed(1)}
          />
          <GraphStat
            label="Branch factor"
            value={metrics.branching_factor.toFixed(2)}
          />
          <GraphStat
            label="Density"
            value={metrics.density.toFixed(4)}
          />
          <GraphStat
            label="Connected"
            value={metrics.is_connected ? "Yes" : "No"}
            highlight={!metrics.is_connected}
          />
        </div>

        {/* Top nodes */}
        {nodes.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TopNodeCard
              label="Most central node"
              sublabel="Highest betweenness centrality"
              node={mostCentral}
              badge={`centrality ${mostCentral.centrality.toFixed(4)}`}
              color="cyan"
            />
            <TopNodeCard
              label="Largest subtree"
              sublabel="Most influential branch"
              node={mostInfluential}
              badge={`${mostInfluential.subtree_size} descendants`}
              color="purple"
            />
          </div>
        )}

        {/* Graph topology hint */}
        <div className="rounded-xl bg-[rgba(34,211,238,0.04)] border border-cyan-500/15 px-4 py-3">
          <p className="text-[11px] text-[var(--fg-muted)] leading-relaxed">
            <span className="text-cyan-300 font-medium">Graph built.</span>{" "}
            {metrics.node_count} nodes, {metrics.edge_count} directed edges.
            Branching factor {metrics.branching_factor.toFixed(2)} —
            {metrics.branching_factor > 3
              ? " high fan-out (many replies per comment)."
              : metrics.branching_factor < 1.5
              ? " low fan-out (mostly linear chain)."
              : " moderate fan-out."}
            {" "}Phase 3 will run the 3 detection signals on this topology.
          </p>
        </div>
      </div>
    </div>
  );
}

function GraphStat({
  label,
  value,
  highlight = false,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="rounded-xl bg-[rgba(255,255,255,0.02)] border border-[var(--glass-border)] px-3 py-2.5">
      <p className="text-[9px] uppercase tracking-wider text-[var(--fg-dim)] mb-1">
        {label}
      </p>
      <p
        className={`text-sm font-mono font-semibold ${
          highlight ? "text-red-400" : "text-white"
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function TopNodeCard({
  label,
  sublabel,
  node,
  badge,
  color,
}: {
  label: string;
  sublabel: string;
  node: GraphNode;
  badge: string;
  color: "cyan" | "purple";
}) {
  const colorMap = {
    cyan: {
      bg: "bg-cyan-500/10",
      border: "border-cyan-500/20",
      text: "text-cyan-300",
      badge: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
    },
    purple: {
      bg: "bg-purple-500/10",
      border: "border-purple-500/20",
      text: "text-purple-300",
      badge: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    },
  }[color];

  return (
    <div
      className={`rounded-xl ${colorMap.bg} border ${colorMap.border} px-4 py-3`}
    >
      <p className="text-[9px] uppercase tracking-wider text-[var(--fg-dim)] mb-1">
        {label}
      </p>
      <p className="text-xs text-[var(--fg-muted)] mb-2">{sublabel}</p>
      <div className="flex items-center gap-2 flex-wrap">
        <span className={`text-sm font-semibold ${colorMap.text}`}>
          u/{node.author}
        </span>
        <span
          className={`text-[9px] px-2 py-0.5 rounded-full border font-mono ${colorMap.badge}`}
        >
          {badge}
        </span>
      </div>
      <p className="text-[10px] text-[var(--fg-dim)] mt-1 font-mono">
        depth {node.depth} · {node.reply_count} replies · score {node.score}
      </p>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Phase 3: Thread Health gauge + Signal Scores panel
// ════════════════════════════════════════════════════════════════════════

function SignalPanel({ health, signals }: { health: number; signals: SignalScores }) {
  const healthColor =
    health >= 70 ? "text-emerald-400" : health >= 40 ? "text-yellow-400" : "text-red-400";
  const healthBg =
    health >= 70 ? "from-emerald-500/20" : health >= 40 ? "from-yellow-500/20" : "from-red-500/20";
  const healthLabel =
    health >= 70 ? "Likely Authentic" : health >= 40 ? "Suspicious" : "Likely Bot Activity";

  return (
    <div className="border-t border-[var(--glass-border)]">
      {/* Section header */}
      <div className={`px-6 py-4 bg-gradient-to-r ${healthBg} to-transparent border-b border-[var(--glass-border)]`}>
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md bg-[var(--brand)]/15 flex items-center justify-center">
            <span className="text-[var(--brand)] text-xs">⚡</span>
          </div>
          <p className="text-xs font-semibold text-white">Detection Signals</p>
          <span className="ml-auto text-[10px] font-mono text-[var(--brand)]/70 uppercase tracking-wider">
            Phase 3
          </span>
        </div>
      </div>

      <div className="px-6 py-5 space-y-5">
        {/* Thread Health Score — the headline number */}
        <div className="flex items-center gap-6">
          <div className="relative w-20 h-20 flex-shrink-0">
            <svg viewBox="0 0 36 36" className="w-full h-full -rotate-90">
              <circle cx="18" cy="18" r="15.9" fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="3" />
              <circle
                cx="18" cy="18" r="15.9" fill="none"
                stroke={health >= 70 ? "#34d399" : health >= 40 ? "#fbbf24" : "#ef4444"}
                strokeWidth="3"
                strokeDasharray={`${health} ${100 - health}`}
                strokeLinecap="round"
              />
            </svg>
            <div className="absolute inset-0 flex items-center justify-center">
              <span className={`font-display font-bold text-xl ${healthColor}`}>{health}</span>
            </div>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--fg-dim)] mb-1">Thread Health</p>
            <p className={`font-display font-semibold text-lg ${healthColor}`}>{healthLabel}</p>
            <p className="text-xs text-[var(--fg-muted)] mt-1">
              {signals.human_count} human · {signals.suspicious_count} suspicious · {signals.bot_count} bot
            </p>
          </div>
        </div>

        {/* 3 signal bars */}
        <div className="space-y-3">
          <SignalBar
            label="Reply Latency"
            description="Burst detection + timing regularity"
            suspicion={signals.latency_suspicion}
          />
          <SignalBar
            label="Vocabulary Echo"
            description="Shared rare phrases across accounts"
            suspicion={signals.echo_suspicion}
          />
          <SignalBar
            label="Synthetic Consensus"
            description="Unnatural agreement patterns"
            suspicion={signals.consensus_suspicion}
          />
        </div>

        {/* Echo rings */}
        {signals.echo_rings.length > 0 && (
          <div className="rounded-xl bg-red-950/20 border border-red-500/20 px-4 py-3">
            <p className="text-[10px] uppercase tracking-wider text-red-400 mb-2">
              🚩 Echo rings detected ({signals.echo_rings.length})
            </p>
            {signals.echo_rings.map((ring, i) => (
              <p key={i} className="text-xs font-mono text-red-300/80">
                Ring {i + 1}: {ring.map((a) => `u/${a}`).join(" · ")}
              </p>
            ))}
          </div>
        )}

        {/* Combined suspicion */}
        <div className="rounded-xl bg-[rgba(255,255,255,0.02)] border border-[var(--glass-border)] px-4 py-3">
          <p className="text-[11px] text-[var(--fg-muted)] leading-relaxed">
            <span className="text-white font-medium">Combined suspicion:</span>{" "}
            <span className="font-mono text-[var(--brand)]">
              {(signals.combined_suspicion * 100).toFixed(1)}%
            </span>
            {" "}— weighted 35% latency + 35% echo + 30% consensus.
          </p>
        </div>
      </div>
    </div>
  );
}

function SignalBar({
  label,
  description,
  suspicion,
}: {
  label: string;
  description: string;
  suspicion: number;
}) {
  const pct = Math.round(suspicion * 100);
  const barColor =
    pct >= 60 ? "bg-red-500" : pct >= 30 ? "bg-yellow-500" : "bg-emerald-500";
  const textColor =
    pct >= 60 ? "text-red-400" : pct >= 30 ? "text-yellow-400" : "text-emerald-400";

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <div>
          <span className="text-xs text-white font-medium">{label}</span>
          <span className="text-[10px] text-[var(--fg-dim)] ml-2">{description}</span>
        </div>
        <span className={`text-xs font-mono font-semibold ${textColor}`}>{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-700 ${barColor}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
