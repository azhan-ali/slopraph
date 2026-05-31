/**
 * Features — the 3 detection signals + the topology angle.
 *
 * This is the section that sells the project's defensibility:
 * "Topology > Stylometry". Each card reads like a one-liner pitch.
 */

const FEATURES = [
  {
    icon: "⏱",
    title: "Reply Latency",
    tag: "Signal #1",
    body:
      "Real users follow a power-law reply distribution. Bots show suspicious uniformity or unnatural bursts.",
    accent: "from-red-500/20 to-transparent",
  },
  {
    icon: "🔁",
    title: "Vocabulary Echo",
    tag: "Signal #2",
    body:
      "Bot-rings reuse the same rare phrases. We cluster accounts by n-gram fingerprint to expose them.",
    accent: "from-purple-500/20 to-transparent",
  },
  {
    icon: "📈",
    title: "Synthetic Consensus",
    tag: "Signal #3",
    body:
      "Real threads disagree. Bot threads show unnatural agreement curves — a topology a bot can't fake.",
    accent: "from-cyan-500/20 to-transparent",
  },
];

export default function Features() {
  return (
    <section id="features" className="relative py-20 px-6 max-w-7xl mx-auto">
      <SectionHeader
        eyebrow="Detection signals"
        title={
          <>
            Topology <span className="text-gradient-brand">&gt;</span> Stylometry
          </>
        }
        sub="Bots can rewrite their text. They can't simultaneously fake reply timing, vocabulary clustering, and agreement curves. We watch all three."
      />

      <div className="grid md:grid-cols-3 gap-5 mt-12">
        {FEATURES.map((f, i) => (
          <FeatureCard key={f.title} feature={f} index={i} />
        ))}
      </div>
    </section>
  );
}

function FeatureCard({
  feature,
  index,
}: {
  feature: (typeof FEATURES)[number];
  index: number;
}) {
  return (
    <div
      className="glass-card tilt-card group p-6"
      style={{ animationDelay: `${index * 100}ms` }}
    >
      <span className="sheen" aria-hidden="true" />
      {/* Accent gradient blob inside the card */}
      <div
        className={`absolute inset-0 bg-gradient-to-br ${feature.accent} opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none`}
        aria-hidden="true"
      />

      <div className="relative">
        <div className="flex items-center justify-between mb-5">
          <div className="w-12 h-12 rounded-xl glass-strong flex items-center justify-center text-2xl">
            {feature.icon}
          </div>
          <span className="font-mono text-[10px] uppercase tracking-wider text-[var(--fg-dim)]">
            {feature.tag}
          </span>
        </div>

        <h3 className="font-display font-semibold text-xl text-white mb-2">
          {feature.title}
        </h3>
        <p className="text-sm text-[var(--fg-muted)] leading-relaxed">
          {feature.body}
        </p>
      </div>
    </div>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  sub,
}: {
  eyebrow: string;
  title: React.ReactNode;
  sub: string;
}) {
  return (
    <div className="text-center max-w-2xl mx-auto">
      <p className="text-xs uppercase tracking-[0.25em] text-[var(--brand)] mb-4 font-medium">
        {eyebrow}
      </p>
      <h2 className="font-display font-bold text-3xl sm:text-4xl text-white tracking-tight leading-tight mb-4">
        {title}
      </h2>
      <p className="text-[var(--fg-muted)] text-sm sm:text-base leading-relaxed">
        {sub}
      </p>
    </div>
  );
}
