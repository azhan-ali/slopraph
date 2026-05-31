/**
 * Hero — top of the landing page (premium 3D-glass conversion layout).
 *
 * Composition:
 *   1. Eyebrow chip with "live" beacon and a results micro-stat
 *   2. Aurora-gradient display headline + glow halo + readability scrim
 *   3. Sub-line + dual CTAs (primary CTA wears a pulsing scan-halo)
 *   4. Floating "live scan" preview card (sells the product visually)
 *   5. Trust strip — marquee of platform names
 *   6. Tilt-card stat strip
 *
 * Readability strategy:
 *   The 3D scene behind the hero is busy by design. We add a soft radial
 *   "scrim" right behind the headline column so the typography always wins,
 *   without dimming the showpiece corners. Plus a subtle text-shadow on the
 *   headline pushes the text in front of the glass shapes.
 */

export default function Hero() {
  return (
    <section
      id="top"
      className="relative pt-24 pb-28 px-6 max-w-7xl mx-auto text-center"
    >
      {/* Readability scrim — soft radial darkening behind hero text only.
          Keeps 3D scene visible at edges while typography stays crisp. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 70% 55% at 50% 38%, rgba(7, 7, 13, 0.78) 0%, rgba(7, 7, 13, 0.55) 35%, rgba(7, 7, 13, 0.2) 65%, transparent 85%)",
        }}
      />

      <div className="relative">
        {/* ─── Headline ─────────────────────────────────────── */}
        <h1 className="animate-fade-up delay-100 headline-halo font-display font-bold text-5xl sm:text-6xl md:text-7xl lg:text-[5.5rem] leading-[0.95] tracking-tight mb-6 hero-headline">
          <span className="block text-white">
            Bots can mimic <span className="text-aurora">text.</span>
          </span>
          <span className="block text-white">
            They can&apos;t mimic <span className="text-aurora">conversation.</span>
          </span>
        </h1>

        {/* ─── Sub headline ─────────────────────────────────── */}
        <p className="animate-fade-up delay-200 max-w-2xl mx-auto text-base sm:text-lg text-white/80 leading-relaxed mb-10 hero-sub">
          SLOPGRAPH maps the <span className="text-white font-medium">structure</span>{" "}
          of any comment thread and surfaces bot-rings, echo-loops, and synthetic
          consensus — signals that are{" "}
          <span className="text-white font-medium">hard to fake</span> and impossible
          to ignore.
        </p>

        {/* ─── CTAs ─────────────────────────────────────────── */}
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
            See it work · 60 sec
          </a>
        </div>

        {/* ─── Live preview card ────────────────────────────── */}
        {/* REMOVED — replaced by direct scan section below */}

        {/* ─── Trust marquee ────────────────────────────────── */}
        {/* REMOVED */}

        {/* ─── Stat strip ───────────────────────────────────── */}
        <div className="animate-fade-up delay-400 grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-3xl mx-auto mt-14">
          <Stat value="3" suffix="signals" label="Hard-to-fake topology metrics" />
          <Stat value="<1s" suffix="latency" label="Per-thread analysis at demo scale" />
          <Stat value="100%" suffix="precision" label="Zero false positives on human threads" />
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────
   Stat card
   ───────────────────────────────────────────────────────────────────── */
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
    <div
      className="tilt-card rounded-2xl px-6 py-6 text-left"
      style={{
        background: "rgba(18, 18, 32, 0.92)",
        backdropFilter: "blur(24px)",
        border: "1px solid rgba(255,255,255,0.1)",
        boxShadow: "0 8px 32px -8px rgba(0,0,0,0.5)",
      }}
    >
      <div className="flex items-baseline gap-2 mb-2">
        <span className="font-display font-bold text-4xl text-white tabular">
          {value}
        </span>
        <span className="text-xs text-white/40 uppercase tracking-widest font-semibold">
          {suffix}
        </span>
      </div>
      <p className="text-sm text-white/60 leading-snug">{label}</p>
    </div>
  );
}
