/**
 * Features — 3 detection signals.
 * Redesigned for maximum readability + high-converting premium feel.
 * Each card has a strong glass surface, bright icon, and crisp text.
 */

const FEATURES = [
  {
    icon: "⏱",
    title: "Reply Latency",
    tag: "Signal 01",
    body: "Real users follow a power-law reply distribution. Bots show suspicious uniformity or unnatural bursts — a timing pattern no bot farm can hide.",
    accent: "#ef4444",
    accentBg: "rgba(239,68,68,0.12)",
    accentBorder: "rgba(239,68,68,0.3)",
    tagColor: "text-red-400",
  },
  {
    icon: "🔁",
    title: "Vocabulary Echo",
    tag: "Signal 02",
    body: "Bot-rings reuse the same rare phrases across accounts. We cluster authors by n-gram fingerprint and expose the ring — no matter how many accounts it spans.",
    accent: "#a855f7",
    accentBg: "rgba(168,85,247,0.12)",
    accentBorder: "rgba(168,85,247,0.3)",
    tagColor: "text-purple-400",
  },
  {
    icon: "📈",
    title: "Synthetic Consensus",
    tag: "Signal 03",
    body: "Real threads disagree. Bot threads show unnatural agreement curves — blanket affirmation with zero pushback. A topology a bot simply can't fake.",
    accent: "#22d3ee",
    accentBg: "rgba(34,211,238,0.12)",
    accentBorder: "rgba(34,211,238,0.3)",
    tagColor: "text-cyan-400",
  },
];

export default function Features() {
  return (
    <section id="features" className="relative py-24 px-6 max-w-7xl mx-auto">
      {/* Section scrim — keeps text readable over 3D background */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none rounded-3xl"
        style={{
          background:
            "radial-gradient(ellipse 80% 70% at 50% 50%, rgba(7,7,13,0.72) 0%, rgba(7,7,13,0.45) 60%, transparent 100%)",
        }}
      />

      <div className="relative">
        {/* Section header */}
        <div className="text-center max-w-2xl mx-auto mb-16">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--brand)] mb-4 font-semibold">
            Detection Signals
          </p>
          <h2 className="font-display font-bold text-4xl sm:text-5xl text-white tracking-tight leading-tight mb-5">
            Topology{" "}
            <span
              className="relative inline-block"
              style={{
                background: "linear-gradient(135deg, #ef4444, #a855f7)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
              }}
            >
              &gt;
            </span>{" "}
            Stylometry
          </h2>
          <p className="text-white/70 text-base sm:text-lg leading-relaxed">
            Bots can rewrite their text. They can&apos;t simultaneously fake reply
            timing, vocabulary clustering, and agreement curves.{" "}
            <span className="text-white font-medium">We watch all three.</span>
          </p>
        </div>

        {/* Feature cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {FEATURES.map((f, i) => (
            <FeatureCard key={f.title} feature={f} index={i} />
          ))}
        </div>
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
      className="relative rounded-2xl p-px overflow-hidden group tilt-card"
      style={{
        background: `linear-gradient(135deg, ${feature.accentBorder}, rgba(255,255,255,0.06) 50%, transparent)`,
        animationDelay: `${index * 100}ms`,
      }}
    >
      {/* Card inner */}
      <div
        className="relative rounded-2xl p-7 h-full flex flex-col"
        style={{
          background: "rgba(12, 12, 22, 0.88)",
          backdropFilter: "blur(24px)",
        }}
      >
        {/* Accent glow blob */}
        <div
          aria-hidden="true"
          className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
          style={{
            background: `radial-gradient(circle, ${feature.accentBg} 0%, transparent 70%)`,
            filter: "blur(20px)",
          }}
        />

        {/* Top row: icon + tag */}
        <div className="flex items-start justify-between mb-6">
          <div
            className="w-14 h-14 rounded-2xl flex items-center justify-center text-2xl flex-shrink-0"
            style={{
              background: feature.accentBg,
              border: `1px solid ${feature.accentBorder}`,
              boxShadow: `0 0 20px -8px ${feature.accent}`,
            }}
          >
            {feature.icon}
          </div>
          <span
            className={`text-[10px] font-mono font-bold uppercase tracking-[0.2em] ${feature.tagColor} mt-1`}
          >
            {feature.tag}
          </span>
        </div>

        {/* Title */}
        <h3 className="font-display font-bold text-xl text-white mb-3 leading-tight">
          {feature.title}
        </h3>

        {/* Body */}
        <p className="text-white/65 text-sm leading-relaxed flex-1">
          {feature.body}
        </p>

        {/* Bottom accent line */}
        <div
          className="mt-6 h-px w-full opacity-40"
          style={{
            background: `linear-gradient(90deg, ${feature.accent}, transparent)`,
          }}
        />
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
      <p className="text-xs uppercase tracking-[0.25em] text-[var(--brand)] mb-4 font-semibold">
        {eyebrow}
      </p>
      <h2 className="font-display font-bold text-3xl sm:text-4xl text-white tracking-tight leading-tight mb-4">
        {title}
      </h2>
      <p className="text-white/70 text-sm sm:text-base leading-relaxed">{sub}</p>
    </div>
  );
}
