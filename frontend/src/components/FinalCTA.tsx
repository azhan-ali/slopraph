/**
 * FinalCTA — closing conversion block.
 *
 * Placed after the live-scan demo: by this point the visitor has *seen* the
 * product work, so the CTA reframes the pitch around urgency + outcome.
 * Pure presentational; the action button just deep-links back to #scan.
 */

export default function FinalCTA() {
  return (
    <section className="relative py-24 px-6 max-w-5xl mx-auto">
      <div className="relative glass-card glass-strong overflow-hidden p-10 sm:p-14 text-center">
        {/* Layered glow blobs inside the card for depth */}
        <div
          aria-hidden="true"
          className="absolute -top-24 -left-24 w-72 h-72 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(239,68,68,0.35), transparent 65%)",
            filter: "blur(40px)",
          }}
        />
        <div
          aria-hidden="true"
          className="absolute -bottom-24 -right-24 w-80 h-80 rounded-full"
          style={{
            background:
              "radial-gradient(circle, rgba(34,211,238,0.28), transparent 65%)",
            filter: "blur(40px)",
          }}
        />

        <div className="relative">
          <p className="text-xs uppercase tracking-[0.25em] text-[var(--brand)] mb-4 font-medium">
            Ready when you are
          </p>
          <h2 className="font-display font-bold text-3xl sm:text-5xl text-white tracking-tight leading-tight mb-5">
            Stop reading comments.{" "}
            <span className="text-aurora">Start reading the graph.</span>
          </h2>
          <p className="text-[var(--fg-muted)] text-base sm:text-lg max-w-2xl mx-auto mb-8 leading-relaxed">
            Paste a URL, get a verdict in under a second. No login, no setup,
            no credit card. Just the topology — the part bots can&apos;t fake.
          </p>

          <div className="flex flex-wrap items-center justify-center gap-4">
            <a href="#scan" className="btn-primary cta-halo">
              Run a free scan
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
            <a href="#features" className="btn-ghost">
              See the 3 signals
            </a>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-[var(--fg-muted)]">
            <span className="inline-flex items-center gap-2">
              <CheckIcon /> Open architecture
            </span>
            <span className="inline-flex items-center gap-2">
              <CheckIcon /> Reddit · YouTube · Amazon
            </span>
            <span className="inline-flex items-center gap-2">
              <CheckIcon /> Sub-second verdicts
            </span>
            <span className="inline-flex items-center gap-2">
              <CheckIcon /> No credentials needed
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

function CheckIcon() {
  return (
    <span className="w-4 h-4 rounded-full bg-emerald-500/15 inline-flex items-center justify-center">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="3"
        className="w-2.5 h-2.5 text-emerald-400"
      >
        <path
          d="M5 13l4 4L19 7"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
