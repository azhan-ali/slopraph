"use client";

/**
 * ConfusionMatrix — 2×2 heatmap (bot = positive class).
 *
 * Cells are tinted by correctness: the diagonal (TP, TN) is "good" green,
 * the off-diagonal (FP, FN) is "bad" red. Intensity scales with the count
 * relative to the dataset size, so a single misclassification reads as a
 * faint tint rather than a full block.
 */

import type { BakeoffConfusion } from "@/lib/api";

export default function ConfusionMatrix({
  confusion,
  total,
}: {
  confusion: BakeoffConfusion;
  total: number;
}) {
  const { true_positive, false_positive, false_negative, true_negative } = confusion;

  const cell = (count: number, good: boolean) => {
    const intensity = total > 0 ? count / total : 0;
    const base = good ? "52, 211, 153" : "239, 68, 68"; // emerald / red rgb
    return {
      background: `rgba(${base}, ${0.12 + intensity * 0.55})`,
      borderColor: `rgba(${base}, ${0.3 + intensity * 0.4})`,
    };
  };

  return (
    <div className="w-full">
      <div className="grid grid-cols-[auto_1fr_1fr] gap-2 text-center">
        {/* Header row */}
        <div />
        <div className="text-[10px] uppercase tracking-wider text-[var(--fg-dim)] pb-1">
          Predicted: Bot
        </div>
        <div className="text-[10px] uppercase tracking-wider text-[var(--fg-dim)] pb-1">
          Predicted: Human
        </div>

        {/* Actual Bot row */}
        <div className="flex items-center justify-end pr-2 text-[10px] uppercase tracking-wider text-[var(--fg-dim)]">
          Actual: Bot
        </div>
        <Cell label="True Positive" count={true_positive} style={cell(true_positive, true)} />
        <Cell label="False Negative" count={false_negative} style={cell(false_negative, false)} sub="missed bot" />

        {/* Actual Human row */}
        <div className="flex items-center justify-end pr-2 text-[10px] uppercase tracking-wider text-[var(--fg-dim)]">
          Actual: Human
        </div>
        <Cell label="False Positive" count={false_positive} style={cell(false_positive, false)} sub="accused human" />
        <Cell label="True Negative" count={true_negative} style={cell(true_negative, true)} />
      </div>
    </div>
  );
}

function Cell({
  label,
  count,
  sub,
  style,
}: {
  label: string;
  count: number;
  sub?: string;
  style: React.CSSProperties;
}) {
  return (
    <div
      className="rounded-xl border px-4 py-6 flex flex-col items-center justify-center transition-colors"
      style={style}
    >
      <span className="font-display font-bold text-3xl text-white tabular">{count}</span>
      <span className="text-[10px] uppercase tracking-wider text-white/70 mt-1">{label}</span>
      {sub && <span className="text-[9px] text-white/50 mt-0.5">{sub}</span>}
    </div>
  );
}
