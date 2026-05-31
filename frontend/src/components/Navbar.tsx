"use client";

/**
 * Navbar — premium, high-converting navigation header.
 *
 *   • Animated 3D logo (rotating glow ring + node-graph mark inside)
 *   • Trust micro-strip under brand: "3 platforms · 0% FPR · live"
 *   • Active-page underline indicator
 *   • Icon + label nav links with hover glow
 *   • Live status badge that pulses when connected
 *   • Pulsing "Scan now" CTA with gradient border on scroll
 *   • Mobile menu (hamburger) with full-screen glass overlay
 */

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { checkHealth, type HealthResponse } from "@/lib/api";

type ConnectionStatus = "checking" | "connected" | "disconnected";

const NAV_LINKS = [
  { href: "/#features", label: "Features", icon: FeaturesIcon },
  { href: "/#how", label: "How it works", icon: HowIcon },
  { href: "/#scan", label: "Try it", icon: TryIcon },
  { href: "/bakeoff", label: "Bake-Off", icon: BakeoffIcon },
] as const;

export default function Navbar() {
  const pathname = usePathname();
  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const res = await checkHealth();
      if (cancelled) return;
      if (res.ok) {
        setHealth(res.data);
        setStatus("connected");
      } else {
        setStatus("disconnected");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <>
      <header
        className={`sticky top-0 z-50 transition-all duration-300 ${
          scrolled
            ? "py-2.5 bg-[rgba(7,7,13,0.78)] backdrop-blur-2xl shadow-[0_8px_32px_-12px_rgba(0,0,0,0.6)]"
            : "py-4 bg-transparent"
        }`}
      >
        {/* Gradient bottom border that materialises on scroll */}
        <div
          className={`absolute bottom-0 left-0 right-0 h-px transition-opacity ${
            scrolled ? "opacity-100" : "opacity-0"
          }`}
          style={{
            background:
              "linear-gradient(90deg, transparent 0%, rgba(239,68,68,0.45) 25%, rgba(168,85,247,0.45) 50%, rgba(34,211,238,0.45) 75%, transparent 100%)",
          }}
        />

        <div className="max-w-7xl mx-auto px-6 flex items-center justify-between gap-4">
          {/* ── Brand ─────────────────────────────────────────── */}
          <Link href="/#top" className="flex items-center gap-3 group flex-shrink-0">
            <Logo />
            <div className="leading-tight hidden sm:block">
              <p className="font-display font-bold text-white text-lg tracking-tight flex items-center gap-1.5">
                SLOPGRAPH
                <span className="text-[8px] font-mono px-1.5 py-0.5 rounded-full bg-[var(--brand)]/15 text-[var(--brand)] border border-[var(--brand)]/30 uppercase tracking-wider">
                  v1
                </span>
              </p>
              <p className="text-[10px] tracking-[0.18em] text-[var(--fg-dim)] flex items-center gap-1.5 mt-0.5">
                <span className="text-emerald-400 font-mono">3 platforms</span>
                <span className="text-[var(--fg-dim)]">·</span>
                <span className="text-[var(--accent-cyan)] font-mono">0% FPR</span>
                <span className="text-[var(--fg-dim)]">·</span>
                <span className="font-mono">live</span>
              </p>
            </div>
          </Link>

          {/* ── Desktop nav links ─────────────────────────────── */}
          <nav className="hidden md:flex items-center gap-1 text-sm">
            {NAV_LINKS.map((link) => {
              const isActive =
                link.href === "/bakeoff"
                  ? pathname === "/bakeoff"
                  : pathname === "/" && link.href.startsWith("/#");
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`nav-pill group ${isActive ? "nav-pill-active" : ""}`}
                >
                  <link.icon />
                  <span>{link.label}</span>
                </Link>
              );
            })}

            {/* GitHub open source button */}
            <a
              href="https://github.com/azhan-ali/slopraph"
              target="_blank"
              rel="noreferrer"
              className="nav-pill group"
            >
              <GitHubIcon />
              <span>Open Source</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 text-[var(--fg-dim)] group-hover:text-white transition-colors">
                <path d="M7 17L17 7M17 7H7M17 7v10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
          </nav>

          {/* ── Right side: status + CTA ─────────────────────── */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <ConnectionBadge status={status} health={health} />

            <Link
              href="/#scan"
              className="hidden md:inline-flex relative items-center gap-1.5 px-4 py-2 rounded-xl font-display font-semibold text-xs text-white overflow-hidden group"
              style={{
                background:
                  "linear-gradient(135deg, var(--brand) 0%, #c91f1f 60%, var(--accent-purple) 130%)",
                boxShadow:
                  "0 8px 24px -8px rgba(239, 68, 68, 0.55), inset 0 1px 0 rgba(255, 255, 255, 0.18)",
              }}
            >
              {/* Animated shimmer */}
              <span
                aria-hidden="true"
                className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700"
                style={{
                  background:
                    "linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.25) 50%, transparent 70%)",
                }}
              />
              <span className="relative flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-white pulse-dot" />
                Scan now
                <svg
                  className="w-3.5 h-3.5 transition-transform group-hover:translate-x-0.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
            </Link>

            {/* Mobile burger */}
            <button
              onClick={() => setMobileOpen((v) => !v)}
              className="md:hidden glass rounded-lg p-2 text-white"
              aria-label="Toggle menu"
              aria-expanded={mobileOpen}
            >
              {mobileOpen ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                  <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                  <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile menu overlay ──────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 md:hidden bg-[rgba(7,7,13,0.92)] backdrop-blur-xl pt-24 pb-10 px-6"
          onClick={() => setMobileOpen(false)}
        >
          <nav className="flex flex-col gap-2" onClick={(e) => e.stopPropagation()}>
            {NAV_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                onClick={() => setMobileOpen(false)}
                className="glass-card flex items-center gap-3 px-5 py-4 text-white font-display"
              >
                <link.icon />
                <span>{link.label}</span>
                <svg className="ml-auto w-4 h-4 text-[var(--fg-dim)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M9 6l6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </Link>
            ))}
            <a
              href="https://github.com/azhan-ali/slopraph"
              target="_blank"
              rel="noreferrer"
              onClick={() => setMobileOpen(false)}
              className="glass-card flex items-center gap-3 px-5 py-4 text-white font-display"
            >
              <GitHubIcon />
              <span>Open Source</span>
              <svg className="ml-auto w-4 h-4 text-[var(--fg-dim)]" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 17L17 7M17 7H7M17 7v10" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </a>
            <Link
              href="/#scan"
              onClick={() => setMobileOpen(false)}
              className="btn-primary mt-3 justify-center"
            >
              Scan a Thread — Free
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </Link>
          </nav>
        </div>
      )}
    </>
  );
}

/* ─────────────────────────────────────────────────────────────
   Logo — animated glass tile with rotating glow ring
   ───────────────────────────────────────────────────────────── */
function Logo() {
  return (
    <div className="relative w-10 h-10 flex-shrink-0">
      {/* Rotating conic glow ring */}
      <div
        aria-hidden="true"
        className="absolute -inset-1 rounded-2xl opacity-70 blur-md group-hover:opacity-100 transition-opacity"
        style={{
          background:
            "conic-gradient(from 0deg, var(--brand), var(--accent-purple), var(--accent-cyan), var(--brand))",
          animation: "spin 6s linear infinite",
        }}
      />
      <div className="relative w-full h-full rounded-xl glass-strong flex items-center justify-center group-hover:scale-105 transition-transform">
        <svg
          viewBox="0 0 24 24"
          fill="none"
          className="w-5 h-5 text-white"
          aria-hidden="true"
        >
          <circle cx="6" cy="6" r="2" fill="currentColor" />
          <circle cx="18" cy="6" r="2" fill="currentColor" opacity="0.6" />
          <circle cx="12" cy="14" r="2.5" fill="var(--brand)" />
          <circle cx="6" cy="20" r="1.5" fill="currentColor" opacity="0.7" />
          <circle cx="18" cy="20" r="1.5" fill="currentColor" opacity="0.5" />
          <path
            d="M7 7L11 13M17 7L13 13M11 16L7 19M13 16L17 19"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.6"
          />
        </svg>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Connection status badge — animated dot + tooltip on hover
   ───────────────────────────────────────────────────────────── */
function ConnectionBadge({
  status,
  health,
}: {
  status: ConnectionStatus;
  health: HealthResponse | null;
}) {
  const cfg = {
    checking: {
      dot: "bg-yellow-400",
      label: "Connecting",
      ring: "pulse-dot",
      cls: "border-yellow-500/30 bg-yellow-500/5",
    },
    connected: {
      dot: "bg-emerald-400",
      label: "Live",
      ring: "pulse-dot",
      cls: "border-emerald-500/30 bg-emerald-500/5",
    },
    disconnected: {
      dot: "bg-red-500",
      label: "Offline",
      ring: "",
      cls: "border-red-500/30 bg-red-500/5",
    },
  }[status];

  return (
    <div
      title={
        health
          ? `${health.service} v${health.version} · ${health.environment}`
          : undefined
      }
      className={`hidden sm:flex items-center gap-2 rounded-full px-3 py-1.5 border backdrop-blur-md ${cfg.cls}`}
    >
      <span className={`w-2 h-2 rounded-full ${cfg.dot} ${cfg.ring}`} aria-hidden="true" />
      <span className="text-[11px] text-white font-medium tracking-wide">{cfg.label}</span>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────
   Nav-link icons (kept tiny + line-art for a refined look)
   ───────────────────────────────────────────────────────────── */
function FeaturesIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5">
      <path d="M12 2l2.6 6.4 6.9.6-5.2 4.6 1.6 6.7L12 16.9 6.1 20.3l1.6-6.7L2.5 9l6.9-.6L12 2z" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

function HowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" strokeLinecap="round" />
    </svg>
  );
}

function TryIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function BakeoffIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-3.5 h-3.5">
      <path d="M3 20V10M9 20V4M15 20v-8M21 20v-5" strokeLinecap="round" />
    </svg>
  );
}

function GitHubIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="w-3.5 h-3.5">
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}
