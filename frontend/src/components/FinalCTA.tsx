/**
 * FinalCTA — closing conversion block.
 * Solid dark surface so text is always crisp over the 3D background.
 */

export default function FinalCTA() {
  return (
    <section className="relative py-24 px-6 max-w-5xl mx-auto">
      {/* Gradient border wrapper */}
      <div
        className="rounded-3xl p-px"
        style={{
          background:
            "linear-gradient(135deg, rgba(239,68,68,0.5), rgba(168,85,247,0.4) 50%, rgba(34,211,238,0.3))",
        }}
      >
        {/* Solid dark card */}
        <div
          className="relative rounded-3xl overflow-hidden px-8 sm:px-14 py-14 text-center"
          style={{
            background: "rgba(10, 10, 20, 0.96)",
            backdropFilter: "blur(40px)",
          }}
        >
          {/* Decorative glow blobs inside */}
          <div
            aria-hidden="true"
            className="absolute -top-20 -left-20 w-64 h-64 rounded-full pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, rgba(239,68,68,0.25), transparent 65%)",
              filter: "blur(30px)",
            }}
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-20 -right-20 w-72 h-72 rounded-full pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, rgba(34,211,238,0.2), transparent 65%)",
              filter: "blur(30px)",
            }}
          />

          <div className="relative">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--brand)] mb-5 font-semibold">
              Ready when you are
            </p>

            <h2 className="font-display font-bold text-3xl sm:text-5xl text-white tracking-tight leading-tight mb-6">
              Stop reading comments.{" "}
              <span
                style={{
                  background:
                    "linear-gradient(135deg, #ef4444 0%, #a855f7 50%, #22d3ee 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                }}
              >
                Start reading the graph.
              </span>
            </h2>

            <p className="text-white/65 text-base sm:text-lg max-w-2xl mx-auto mb-10 leading-relaxed">
              Paste a URL, get a verdict in under a second. No login, no setup,
              no credit card. Just the topology —{" "}
              <span className="text-white font-medium">
                the part bots can&apos;t fake.
              </span>
            </p>

            {/* CTAs */}
            <div className="flex flex-wrap items-center justify-center gap-4 mb-10">
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

            {/* Trust checks */}
            <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-sm text-white/50">
              {[
                "Open architecture",
                "Reddit · YouTube · Amazon",
                "Sub-second verdicts",
                "No credentials needed",
              ].map((item) => (
                <span key={item} className="inline-flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full bg-emerald-500/15 inline-flex items-center justify-center flex-shrink-0">
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
                  {item}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
