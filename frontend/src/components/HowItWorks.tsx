/**
 * HowItWorks — 4-step pipeline visualization.
 * Redesigned for maximum readability + high-converting premium feel.
 */

import { SectionHeader } from "./Features";

const STEPS = [
  {
    num: "01",
    title: "Fetch the thread",
    desc: "Adapter normalises Reddit, YouTube, or Amazon URLs into a single Comment shape. One URL — that's all you need.",
    color: "#ef4444",
    colorBg: "rgba(239,68,68,0.12)",
    colorBorder: "rgba(239,68,68,0.35)",
  },
  {
    num: "02",
    title: "Build the graph",
    desc: "Nodes = comments, edges = replies. Topology metrics + author groupings extracted in milliseconds.",
    color: "#a855f7",
    colorBg: "rgba(168,85,247,0.12)",
    colorBorder: "rgba(168,85,247,0.35)",
  },
  {
    num: "03",
    title: "Run 3 signals",
    desc: "Reply latency, vocabulary echo, consensus pattern — each scores authors and threads independently.",
    color: "#22d3ee",
    colorBg: "rgba(34,211,238,0.12)",
    colorBorder: "rgba(34,211,238,0.35)",
  },
  {
    num: "04",
    title: "Score & visualise",
    desc: "Per-comment authenticity badges + interactive graph with red-highlighted bot-rings. Verdict in under a second.",
    color: "#34d399",
    colorBg: "rgba(52,211,153,0.12)",
    colorBorder: "rgba(52,211,153,0.35)",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="relative py-24 px-6 max-w-7xl mx-auto">
      {/* Section scrim */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none rounded-3xl"
        style={{
          background:
            "radial-gradient(ellipse 80% 70% at 50% 50%, rgba(7,7,13,0.72) 0%, rgba(7,7,13,0.45) 60%, transparent 100%)",
        }}
      />

      <div className="relative">
        <SectionHeader
          eyebrow="Pipeline"
          title={
            <>
              From URL to{" "}
              <span
                style={{
                  background: "linear-gradient(135deg, #22d3ee, #a855f7)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                verdict
              </span>{" "}
              in seconds
            </>
          }
          sub="Four stages. Each one platform-agnostic, testable in isolation, and fast enough to run in real time on a typical comment thread."
        />

        <div className="relative mt-16 grid md:grid-cols-4 gap-5">
          {/* Connector line (desktop) */}
          <div
            aria-hidden="true"
            className="hidden md:block absolute left-[12.5%] right-[12.5%] top-10 h-px"
            style={{
              background:
                "linear-gradient(90deg, rgba(239,68,68,0.5), rgba(168,85,247,0.5), rgba(34,211,238,0.5), rgba(52,211,153,0.5))",
            }}
          />

          {STEPS.map((s, i) => (
            <Step key={s.num} step={s} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Step({
  step,
  index,
}: {
  step: (typeof STEPS)[number];
  index: number;
}) {
  return (
    <div
      className="relative rounded-2xl p-px overflow-hidden group tilt-card"
      style={{
        background: `linear-gradient(135deg, ${step.colorBorder}, rgba(255,255,255,0.05) 60%, transparent)`,
        animationDelay: `${index * 80}ms`,
      }}
    >
      <div
        className="relative rounded-2xl p-6 h-full flex flex-col"
        style={{
          background: "rgba(12, 12, 22, 0.88)",
          backdropFilter: "blur(24px)",
        }}
      >
        {/* Hover glow */}
        <div
          aria-hidden="true"
          className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at top left, ${step.colorBg} 0%, transparent 65%)`,
          }}
        />

        {/* Number badge */}
        <div
          className="relative w-12 h-12 rounded-xl flex items-center justify-center font-display font-bold text-white text-sm mb-5 flex-shrink-0"
          style={{
            background: `linear-gradient(135deg, ${step.color}, ${step.color}99)`,
            boxShadow: `0 8px 24px -8px ${step.color}88`,
          }}
        >
          {step.num}
        </div>

        {/* Title */}
        <h3 className="font-display font-bold text-lg text-white mb-2.5 leading-tight">
          {step.title}
        </h3>

        {/* Description */}
        <p className="text-white/65 text-sm leading-relaxed flex-1">
          {step.desc}
        </p>

        {/* Bottom accent */}
        <div
          className="mt-5 h-px opacity-40"
          style={{
            background: `linear-gradient(90deg, ${step.color}, transparent)`,
          }}
        />
      </div>
    </div>
  );
}
