"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { checkHealth, type HealthResponse } from "@/lib/api";

type ConnectionStatus = "checking" | "connected" | "disconnected";

export default function Navbar() {
  const [status, setStatus] = useState<ConnectionStatus>("checking");
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [scrolled, setScrolled] = useState(false);

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
    <header
      className={`sticky top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "py-3 bg-[rgba(7,7,13,0.7)] backdrop-blur-xl border-b border-[var(--glass-border)]"
          : "py-5 bg-transparent border-b border-transparent"
      }`}
    >
      <div className="max-w-7xl mx-auto px-6 flex items-center justify-between">
        <Link href="/#top" className="flex items-center gap-3 group">
          <Logo />
          <div className="leading-tight">
            <p className="font-display font-bold text-white text-lg tracking-tight">
              SLOPGRAPH
            </p>
            <p className="text-[10px] uppercase tracking-[0.2em] text-[var(--fg-dim)]">
              Coherence Scanner
            </p>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-8 text-sm text-[var(--fg-muted)]">
          <Link href="/#features" className="hover:text-white transition">
            Features
          </Link>
          <Link href="/#how" className="hover:text-white transition">
            How it works
          </Link>
          <Link href="/#scan" className="hover:text-white transition">
            Try it
          </Link>
          <Link href="/bakeoff" className="hover:text-white transition">
            Bake-Off
          </Link>
          <a
            href="https://slopscan.dev"
            target="_blank"
            rel="noreferrer"
            className="hover:text-white transition"
          >
            Hackathon ↗
          </a>
        </nav>

        <div className="flex items-center gap-3">
          <ConnectionBadge status={status} health={health} />
          <Link href="/#scan" className="hidden md:inline-flex btn-primary !py-2 !px-4 !text-xs">
            Scan now
            <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M5 12h14M13 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      </div>
    </header>
  );
}

function Logo() {
  return (
    <div className="relative w-9 h-9 rounded-xl glass-strong flex items-center justify-center group-hover:scale-105 transition-transform">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        className="w-5 h-5 text-[var(--brand)]"
        aria-hidden="true"
      >
        {/* Stylised conversation graph: nodes + edges */}
        <circle cx="6" cy="6" r="2" fill="currentColor" />
        <circle cx="18" cy="6" r="2" fill="currentColor" opacity="0.6" />
        <circle cx="12" cy="14" r="2.5" fill="currentColor" />
        <circle cx="6" cy="20" r="1.5" fill="currentColor" opacity="0.7" />
        <circle cx="18" cy="20" r="1.5" fill="currentColor" opacity="0.5" />
        <path
          d="M7 7L11 13M17 7L13 13M11 16L7 19M13 16L17 19"
          stroke="currentColor"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.5"
        />
      </svg>
    </div>
  );
}

function ConnectionBadge({
  status,
  health,
}: {
  status: ConnectionStatus;
  health: HealthResponse | null;
}) {
  const cfg = {
    checking: { dot: "bg-yellow-400", label: "Connecting", ring: "pulse-dot" },
    connected: { dot: "bg-emerald-400", label: "Online", ring: "pulse-dot" },
    disconnected: { dot: "bg-red-500", label: "Offline", ring: "" },
  }[status];

  return (
    <div
      title={
        health
          ? `${health.service} v${health.version} · ${health.environment}`
          : undefined
      }
      className="hidden sm:flex items-center gap-2 glass rounded-full px-3 py-1.5"
    >
      <span className={`w-2 h-2 rounded-full ${cfg.dot} ${cfg.ring}`} aria-hidden="true" />
      <span className="text-xs text-[var(--fg-muted)] font-medium">{cfg.label}</span>
    </div>
  );
}
