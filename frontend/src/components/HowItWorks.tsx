/**
 * HowItWorks — 4-step pipeline visualization.
 *
 * Communicates that the system is concrete and shippable, not just an idea.
 * Steps map 1:1 to phases of the build plan.
 */

import { SectionHeader } from "./Features";

const STEPS = [
  {
    num: "01",
    title: "Fetch the thread",
    desc:
      "Adapter normalises Reddit, YouTube, or Amazon URLs into a single Comment shape.",
  },
  {
    num: "02",
    title: "Build the graph",
    desc:
      "Nodes = comments, edges = replies. Topology metrics + author groupings extracted.",
  },
  {
    num: "03",
    title: "Run 3 signals",
    desc:
      "Reply latency, vocabulary echo, consensus pattern — each scores authors and threads.",
  },
  {
    num: "04",
    title: "Score & visualise",
    desc:
      "Per-comment authenticity badges + interactive graph with red-highlighted bot-rings.",
  },
];

export default function HowItWorks() {
  return (
    <section id="how" className="relative py-20 px-6 max-w-7xl mx-auto">
      <SectionHeader
        eyebrow="Pipeline"
        title={
          <>
            From URL to <span className="text-gradient-cool">verdict</span> in
            seconds
          </>
        }
        sub="Four stages. Each one platform-agnostic, testable in isolation, and fast enough to run in real time on a typical comment thread."
      />

      <div className="relative mt-14 grid md:grid-cols-4 gap-4">
        {/* Connector line behind cards (desktop only) */}
        <div
          className="hidden md:block absolute left-[12%] right-[12%] top-12 h-px bg-gradient-to-r from-transparent via-[var(--glass-border-bright)] to-transparent"
          aria-hidden="true"
        />
        {STEPS.map((s) => (
          <Step key={s.num} step={s} />
        ))}
      </div>
    </section>
  );
}

function Step({ step }: { step: (typeof STEPS)[number] }) {
  return (
    <div className="relative glass-card tilt-card p-6">
      <span className="sheen" aria-hidden="true" />
      <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-[var(--brand)] to-[var(--brand-deep)] flex items-center justify-center font-display font-bold text-white text-sm mb-4 shadow-[var(--shadow-brand)]">
        {step.num}
      </div>
      <h3 className="font-display font-semibold text-lg text-white mb-2">
        {step.title}
      </h3>
      <p className="text-sm text-[var(--fg-muted)] leading-relaxed">
        {step.desc}
      </p>
    </div>
  );
}
