/**
 * Hero — top of the landing page (premium 3D-glass conversion layout).
 *
 *   1. Eyebrow chip with live status
 *   2. Aurora-gradient display headline + glow halo
 *   3. Sub-line + dual CTAs (primary CTA wears a pulsing scan-halo)
 *   4. Floating "live scan" preview card (sells the product visually)
 *   5. Trust strip — marquee of platform names + a metric row
 *   6. Tilt-card stat strip
 */

export default function Hero() {
  return (
    <section
      id="top"
      className="relative pt-24 pb-28 px-6 max-w-7xl mx-auto text-center"
    >
      {/* Eyebrow */}
      <div className="animate-fade-up inline-flex items-center gap-2 glass rounded-full px-4 py-1.5 mb-8">
        <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)] pulse-dot" />
        <span className="text-xs font-medium tracking-wide text-[var(--fg-muted)]">
          Track H · Slop Scan Hackathon 2026
        </span>
        <span className="w-px h-3 bg-[var(--glass-border-bright)] mx-1" />
        <span className="text-xs font-medium text-[var(--accent-cyan)]">
          Live demo inside →
        </span>
      </div>

      {/* Headline */}
      <h1 className="animate-fade-up delay-100 headline-halo font-display font-bold text-5xl sm:text-6xl md:text-7xl lg:text-[5.25rem] leading-[0.95] tracking-tight mb-6">
        <span className="text-white">Bots can mimic </span>
        <span className="text-aurora">text.</span>
        <br />
        <span className="text-white">They can&apos;t mimic </span>
        <span className="text-aurora">conversation.</span>
      </h1>

      {/* Sub */}
      <p className="animate-fade-up delay-200 max-w-2xl mx-auto text-base sm:text-lg text-[var(--fg-muted)] leading-relaxed mb-10">
        SLOPGRAPH maps the structure of any comment thread and surfaces
        bot-rings, echo-loops, and synthetic consensus — signals that are
        hard to fake and impossible to ignore.
      </p>

      {/* CTAs */}
      <div className="animate-fade-up delay-300 flex flex-wrap items-center justify-center gap-4 mb-14">
        <a href="#scan" className="btn-primary cta-halo">
          Scan a Thread — Free
          <svg
            className="w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
        <a href="#how" className="btn-ghost">
          <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5" stroke="currentColor" strokeWidth="2">
            <polygon points="6,4 20,12 6,20" fill="currentColor" />
          </svg>
          How it works · 60 sec
        </a>
      </div>

      {/* Floating preview card — the visual "sell" */}
      <ScanPreview />

      {/* Trust marquee */}
      <TrustStrip />

      {/* Stats strip */}
      <div className="animate-fade-up delay-400 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto mt-14">
        <Stat value="3" suffix="signals" label="Hard-to-fake topology metrics" />
        <Stat value="<1s" suffix="latency" label="Per-thread analysis at demo scale" />
        <Stat value="$1,800" suffix="prize pool" label="Slop Scan Hackathon 2026" />
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Floating "live scan" preview — sells the value before scrolling.
   Pure presentational mock; the real interactive scan lives in
   <ScanSection />.
   ───────────────────────────────────────────────────────────────────── */
function ScanPreview() {
  return (
    <div className="animate-fade-up delay-300 relative max-w-3xl mx-auto mb-16">
      <div className="glass-card glass-strong p-5 sm:p-6 text-left floaty-slow">
        <div className="flex items-center gap-2 mb-4">
          <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-yellow-400/70" />
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400/70" />
          <span className="ml-3 text-[10px] font-mono uppercase tracking-wider text-[var(--fg-dim)]">
            slopgraph · live thread scan
          </span>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[10px] font-mono text-emerald-400">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
            scanning
          </span>
        </div>

        <div className="space-y-2.5 mb-5">
          <PreviewRow author="alex_92" badge="human" text="Anyone else notice the suspicious upvote pattern at the top?" />
          <PreviewRow author="user_8431" badge="bot" text="Great point! Totally agree, this product changed my life." indent={1} />
          <PreviewRow author="acct_22a" badge="bot" text="Great point! Same experience here, totally agree." indent={1} />
          <PreviewRow author="newuser_xx9" badge="suspicious" text="100% this. Couldn't have said it better myself." indent={2} />
          <PreviewRow author="real_jane" badge="human" text="…that reads like three accounts running off the same script." indent={1} />
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-[var(--glass-border)]">
          <PreviewMetric label="Thread Health" value="32" tone="bad" />
          <PreviewMetric label="Echo Rings" value="2" tone="bad" />
          <PreviewMetric label="Bot-likely" value="3 / 14" tone="warn" />
          <span className="ml-auto text-[10px] font-mono text-[var(--fg-dim)]">
            verdict in 740ms
          </span>
        </div>
      </div>

      {/* Floating verdict tag — adds the 3D depth feel */}
      <div className="hidden sm:flex absolute -top-5 -right-5 floaty">
        <div className="glass-strong glow-brand rounded-2xl px-4 py-2.5 flex items-center gap-2">
          <span className="text-2xl">🚩</span>
          <div className="text-left">
            <p className="text-[9px] uppercase tracking-wider text-[var(--fg-dim)]">
              Verdict
            </p>
            <p className="font-display font-semibold text-sm text-red-300">
              Bot-ring detected
            </p>
          </div>
        </div>
      </div>

      <div className="hidden sm:flex absolute -bottom-5 -left-5 floaty-slow">
        <div className="glass-strong glow-cyan rounded-2xl px-4 py-2.5 flex items-center gap-2">
          <svg viewBox="0 0 24 24" fill="none" className="w-5 h-5 text-cyan-300">
            <circle cx="6" cy="6" r="2" fill="currentColor" />
            <circle cx="18" cy="6" r="2" fill="currentColor" opacity="0.6" />
            <circle cx="12" cy="14" r="2.5" fill="currentColor" />
            <path d="M7 7L11 13M17 7L13 13" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          <div className="text-left">
            <p className="text-[9px] uppercase tracking-wider text-[var(--fg-dim)]">
              Topology
            </p>
            <p className="font-display font-semibold text-sm text-cyan-200">
              14 nodes · 17 edges
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PreviewRow({
  author,
  badge,
  text,
  indent = 0,
}: {
  author: string;
  badge: "human" | "suspicious" | "bot";
  text: string;
  indent?: number;
}) {
  const cfg = {
    human: { label: "✅ human", cls: "bg-emerald-500/10 text-emerald-300 border-emerald-500/25", border: "border-[var(--glass-border)]" },
    suspicious: { label: "⚠️ suspicious", cls: "bg-yellow-500/10 text-yellow-300 border-yellow-500/25", border: "border-yellow-500/30" },
    bot: { label: "🚩 bot", cls: "bg-red-500/10 text-red-300 border-red-500/25", border: "border-red-500/40" },
  }[badge];

  return (
    <div
      style={{ marginLeft: indent * 18 }}
      className={`pl-3 py-2 border-l-2 ${cfg.border} flex items-start gap-3`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs text-white font-medium">u/{author}</span>
          <span className={`text-[9px] px-1.5 py-0.5 rounded-full border ${cfg.cls}`}>
            {cfg.label}
          </span>
        </div>
        <p className="text-xs text-[var(--fg)] leading-relaxed">{text}</p>
      </div>
    </div>
  );
}

function PreviewMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "good" | "warn" | "bad";
}) {
  const toneCls = {
    good: "text-emerald-400",
    warn: "text-yellow-400",
    bad: "text-red-400",
  }[tone];
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] uppercase tracking-wider text-[var(--fg-dim)]">
        {label}
      </span>
      <span className={`font-mono font-semibold text-sm ${toneCls}`}>{value}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Trust strip — platform marquee + a 4-up metric row.
   ───────────────────────────────────────────────────────────────────── */
function TrustStrip() {
  const platforms = [
    "Reddit",
    "YouTube",
    "Amazon",
    "Hacker News",
    "Product Hunt",
    "Twitter / X",
    "TikTok",
  ];
  return (
    <div className="animate-fade-up delay-400 mt-2">
      <p className="text-[10px] uppercase tracking-[0.25em] text-[var(--fg-dim)] mb-4">
        Built to scan threads from
      </p>
      <div className="marquee-mask overflow-hidden">
        <div className="marquee-track text-sm font-display font-medium text-[var(--fg-muted)]">
          {[...platforms, ...platforms].map((p, i) => (
            <span key={i} className="inline-flex items-center gap-2 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-[var(--brand)]/60" />
              {p}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Stat({
  value,
  suffix,
  label,
}: {
  value: string;
  suffix: string;
  label: string;
}) {
  return (
    <div className="glass-card tilt-card px-6 py-5 text-left">
      <span className="sheen" aria-hidden="true" />
      <div className="flex items-baseline gap-2 mb-1">
        <span className="font-display font-bold text-3xl text-white tabular">
          {value}
        </span>
        <span className="text-xs text-[var(--fg-dim)] uppercase tracking-wider">
          {suffix}
        </span>
      </div>
      <p className="text-xs text-[var(--fg-muted)]">{label}</p>
    </div>
  );
}
