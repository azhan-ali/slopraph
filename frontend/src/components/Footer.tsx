/**
 * Footer — minimal, on-brand, with attribution.
 */

export default function Footer() {
  return (
    <footer className="relative mt-20 border-t border-[var(--glass-border)] bg-[rgba(7,7,13,0.4)] backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-6 py-10">
        <div className="flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="text-center md:text-left">
            <p className="font-display font-bold text-white text-lg mb-1">
              SLOPGRAPH
            </p>
            <p className="text-xs text-[var(--fg-muted)]">
              Bots can mimic text. They can&apos;t mimic conversation.
            </p>
          </div>

          <div className="flex items-center gap-6 text-xs text-[var(--fg-muted)]">
            <a
              href="https://slopscan.dev"
              target="_blank"
              rel="noreferrer"
              className="hover:text-white transition"
            >
              Slop Scan Hackathon
            </a>
            <span className="text-[var(--fg-dim)]">·</span>
            <span>Track H — Social &amp; News</span>
            <span className="text-[var(--fg-dim)]">·</span>
            <span>2026</span>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-[var(--glass-border)] text-center">
          <p className="text-[11px] text-[var(--fg-dim)] font-mono tracking-wider">
            <span className="text-[var(--brand)]">▲</span> Topology &gt;
            Stylometry
          </p>
        </div>
      </div>
    </footer>
  );
}
