"use client";

/**
 * Background — layered decorative backdrop.
 *
 *   Layer 0 (CSS):  animated mesh gradient on body::before + dotted grid.
 *   Layer 1 (CSS):  floating blurred glass orbs (cheap, always-on ambience).
 *   Layer 2 (WebGL): real 3D glass objects + conversation-graph network.
 *
 * The WebGL layer is loaded client-only via next/dynamic (Three.js touches
 * `window`/`document` and must never run during SSR). A lightweight CSS
 * fallback is always visible, so the page looks complete before/if WebGL
 * fails to mount.
 */

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const Scene3D = dynamic(() => import("./Scene3D"), { ssr: false });

export default function Background() {
  const [enable3D, setEnable3D] = useState(false);

  useEffect(() => {
    // Respect reduced-motion + skip WebGL on very small/low-power screens.
    const prefersReduced = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    const tooSmall = window.matchMedia("(max-width: 640px)").matches;
    // One-time capability gate on mount — intentional, runs once.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!prefersReduced && !tooSmall) setEnable3D(true);
  }, []);

  return (
    <>
      {/* CSS ambience (always present) */}
      <div className="orb orb-red" aria-hidden="true" />
      <div className="orb orb-purple" aria-hidden="true" />
      <div className="orb orb-cyan" aria-hidden="true" />

      {/* Real 3D layer (client-only, capability-gated) */}
      {enable3D && (
        <div className="scene3d-layer" aria-hidden="true">
          <Scene3D />
        </div>
      )}
    </>
  );
}
