"use client";

/**
 * Bake-Off page — Phase 6.
 *
 * The "show your homework" page. Runs the detector over a labelled synthetic
 * dataset and renders honest accuracy metrics: confusion matrix, precision /
 * recall / F1 / accuracy / false-positive-rate, plus a per-thread breakdown
 * highlighting exactly which threads the detector got wrong (and why).
 *
 * Everything here is live: it calls the real backend /bakeoff endpoint.
 */

import { useCallback, useEffect, useState } from "react";
import {
  runBakeoff,
  tuneThreshold,
  type BakeoffResponse,
  type ThresholdSweepResponse,
} from "@/lib/api";
import Background from "@/components/Background";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ConfusionMatrix from "@/components/ConfusionMatrix";

type State =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; data: BakeoffResponse; sweep: ThresholdSweepResponse | null };

export default function BakeoffPage() {
  const [state, setState] = useState<State>({ status: "loading" });
  const [threshold, setThreshold] = useState(60);

  const load = useCallback(async (thr: number) => {
    setState({ status: "loading" });
    const [res, sweepRes] = await Promise.all([
      runBakeoff({ threshold: thr }),
      tuneThreshold(),
    ]);
    if (!res.ok) {
      setState({
        status: "error",
        message: `${res.error}${res.detail ? " — " + res.detail : ""}`,
      });
      return;
    }
    setState({
      status: "ready",
      data: res.data,
      sweep: sweepRes.ok ? sweepRes.data : null,
    });
  }, []);

  useEffect(() => {
    // Kick off the initial evaluation once on mount.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load(threshold);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <>
      <Background />
      <Navbar />
      <main className="relative max-w-6xl mx-auto px-6 pt-24 pb-24">
        {/* Header */}
        <div className="text-center max-w-2xl mx-auto mb-12">
          <p className="text-xs uppercase tracking-[0.25em] text-[var(--brand)] mb-4 font-medium">
            Bake-Off · Accuracy report
          </p>
          <h1 className="font-display font-bold text-4xl sm:text-5xl text-white tracking-tight mb-4">
            We <span className="text-aurora">measured</span> it. Here are the numbers.
          </h1>
          <p className="text-[var(--fg-muted)] text-sm sm:text-base leading-relaxed">
            The detector runs over a labelled dataset of synthetic bot rings and
            organic human threads. No cherry-picking — including the threads it
            gets wrong. Reproducible (seeded), recomputed live from the backend.
          </p>
        </div>

        {state.status === "loading" && <LoadingPanel />}
        {state.status === "error" && <ErrorPanel message={state.message} onRetry={() => load(threshold)} />}
        {state.status === "ready" && (
          <ReadyView
            data={state.data}
            sweep={state.sweep}
            threshold={threshold}
            onThresholdChange={(t) => {
              setThreshold(t);
              load(t);
            }}
          />
        )}
      </main>
      <Footer />
    </>
  );
}

function ReadyView({
  data,
  sweep,
  threshold,
  onThresholdChange,
}: {
  data: BakeoffResponse;
  sweep: ThresholdSweepResponse | null;
  threshold: number;
  onThresholdChange: (t: number) => void;
}) {
  const m = data.metrics;
  return (
    <div className="space-y-8">
      {/* Metric cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard label="Accuracy" value={pct(m.accuracy)} tone="good" />
        <MetricCard label="Precision" value={pct(m.precision)} tone="good" />
        <MetricCard label="Recall" value={pct(m.recall)} tone={m.recall >= 0.8 ? "good" : "warn"} />
        <MetricCard label="F1 Score" value={pct(m.f1)} tone="good" />
        <MetricCard
          label="False Positive Rate"
          value={pct(m.false_positive_rate)}
          tone={m.false_positive_rate === 0 ? "good" : "bad"}
          highlight
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Confusion matrix */}
        <div className="glass-card tilt-card p-6">
          <span className="sheen" aria-hidden="true" />
          <div className="flex items-center justify-between mb-5">
            <h2 className="font-display font-semibold text-lg text-white">Confusion Matrix</h2>
            <span className="text-[10px] font-mono text-[var(--fg-dim)]">
              {data.dataset_size} threads
            </span>
          </div>
          <ConfusionMatrix confusion={data.confusion} total={data.dataset_size} />
        </div>

        {/* Threshold control + sweep */}
        <div className="glass-card tilt-card p-6">
          <span className="sheen" aria-hidden="true" />
          <h2 className="font-display font-semibold text-lg text-white mb-1">
            Classification Threshold
          </h2>
          <p className="text-xs text-[var(--fg-muted)] mb-5">
            A thread scoring below this health value is flagged as a bot ring.
            {sweep && (
              <>
                {" "}F1-optimal:{" "}
                <span className="text-[var(--accent-cyan)] font-mono">
                  {sweep.best_threshold}
                </span>{" "}
                (F1 {sweep.best_f1.toFixed(2)}).
              </>
            )}
          </p>

          <div className="flex items-center gap-4 mb-6">
            <input
              type="range"
              min={30}
              max={70}
              step={5}
              value={threshold}
              onChange={(e) => onThresholdChange(Number(e.target.value))}
              className="flex-1 accent-[var(--brand)]"
              aria-label="Classification threshold"
            />
            <span className="font-display font-bold text-2xl text-white w-12 text-right tabular">
              {threshold}
            </span>
          </div>

          {sweep && (
            <div className="space-y-1.5">
              {sweep.sweep.map((row) => (
                <div key={row.threshold} className="flex items-center gap-3 text-xs">
                  <span
                    className={`font-mono w-8 ${
                      row.threshold === threshold ? "text-[var(--brand)] font-bold" : "text-[var(--fg-dim)]"
                    }`}
                  >
                    {row.threshold}
                  </span>
                  <div className="flex-1 h-1.5 rounded-full bg-[rgba(255,255,255,0.06)] overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[var(--accent-cyan)] to-[var(--brand)]"
                      style={{ width: `${row.f1 * 100}%` }}
                    />
                  </div>
                  <span className="font-mono text-[var(--fg-muted)] w-10 text-right">
                    {row.f1.toFixed(2)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Per-thread breakdown */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-display font-semibold text-lg text-white">Per-thread results</h2>
          <span className="text-[10px] font-mono text-[var(--fg-dim)]">
            {data.predictions.filter((p) => p.correct).length}/{data.predictions.length} correct
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-[var(--fg-dim)] uppercase tracking-wider text-[10px] border-b border-[var(--glass-border)]">
                <th className="py-2 pr-3 font-medium">Thread</th>
                <th className="py-2 px-3 font-medium">Actual</th>
                <th className="py-2 px-3 font-medium">Predicted</th>
                <th className="py-2 px-3 font-medium">Health</th>
                <th className="py-2 px-3 font-medium hidden sm:table-cell">Echo rings</th>
                <th className="py-2 px-3 font-medium hidden md:table-cell">Scenario</th>
                <th className="py-2 pl-3 font-medium text-right">Result</th>
              </tr>
            </thead>
            <tbody>
              {data.predictions.map((p) => (
                <tr key={p.name} className="border-b border-[var(--glass-border)]/50">
                  <td className="py-2 pr-3 font-mono text-white/80">{p.name}</td>
                  <td className="py-2 px-3">
                    <Tag label={p.actual} kind={p.actual} />
                  </td>
                  <td className="py-2 px-3">
                    <Tag label={p.predicted} kind={p.predicted} />
                  </td>
                  <td className="py-2 px-3 font-mono text-white/80 tabular">{p.thread_health}</td>
                  <td className="py-2 px-3 font-mono text-[var(--fg-muted)] hidden sm:table-cell">
                    {p.echo_rings}
                  </td>
                  <td className="py-2 px-3 text-[var(--fg-dim)] hidden md:table-cell max-w-[260px] truncate">
                    {p.scenario}
                  </td>
                  <td className="py-2 pl-3 text-right">
                    {p.correct ? (
                      <span className="text-emerald-400">✓</span>
                    ) : (
                      <span className="text-red-400">✗ miss</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[11px] text-[var(--fg-muted)] mt-5 leading-relaxed">
          <span className="text-white font-medium">Reading the misses honestly:</span>{" "}
          the detector is tuned to never accuse a human (precision{" "}
          {pct(m.precision)}, FPR {pct(m.false_positive_rate)}). The cost is that a
          deliberately stealthy bot ring — one that varies its phrasing and timing —
          can occasionally slip through as the false negative you see above. That is
          the honest trade-off: we would rather miss a clever bot than falsely flag a
          real person.
        </p>
      </div>
    </div>
  );
}

function MetricCard({
  label,
  value,
  tone,
  highlight = false,
}: {
  label: string;
  value: string;
  tone: "good" | "warn" | "bad";
  highlight?: boolean;
}) {
  const toneCls = {
    good: "text-emerald-400",
    warn: "text-yellow-400",
    bad: "text-red-400",
  }[tone];
  return (
    <div className={`glass-card tilt-card px-5 py-4 ${highlight ? "glow-cyan" : ""}`}>
      <span className="sheen" aria-hidden="true" />
      <p className="text-[10px] uppercase tracking-wider text-[var(--fg-dim)] mb-1">{label}</p>
      <p className={`font-display font-bold text-2xl tabular ${toneCls}`}>{value}</p>
    </div>
  );
}

function Tag({ label, kind }: { label: string; kind: "bot" | "human" }) {
  const cls =
    kind === "bot"
      ? "bg-red-500/10 text-red-300 border-red-500/25"
      : "bg-emerald-500/10 text-emerald-300 border-emerald-500/25";
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-mono ${cls}`}>
      {label}
    </span>
  );
}

function LoadingPanel() {
  return (
    <div className="glass-card p-16 text-center">
      <div className="w-10 h-10 mx-auto mb-4 border-2 border-[var(--brand)] border-t-transparent rounded-full animate-spin" />
      <p className="text-sm text-[var(--fg-muted)]">
        Running the detector over the labelled dataset…
      </p>
    </div>
  );
}

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div role="alert" className="glass-card p-8 border-red-500/30 bg-red-950/20 text-center">
      <p className="font-display font-semibold text-red-300 mb-2">Couldn&apos;t run the Bake-Off</p>
      <p className="text-xs text-red-400/80 font-mono break-all mb-4">{message}</p>
      <p className="text-xs text-[var(--fg-muted)] mb-5">
        Make sure the backend is running and reachable.
      </p>
      <button onClick={onRetry} className="btn-primary">
        Retry
      </button>
    </div>
  );
}

function pct(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}
