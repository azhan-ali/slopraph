"use client";

/**
 * ConversationGraph — Phase 5.
 *
 * Interactive force-directed SVG graph of the conversation topology.
 * Built from scratch — no external graph library.
 *
 * Features:
 *   • Force-directed layout (repulsion + spring + gravity + damping)
 *   • Node colour by badge: green=human, yellow=suspicious, red=bot
 *   • Node size by subtree_size (more descendants = bigger node)
 *   • Red-highlighted echo-ring edges (bot-ring connections)
 *   • Click node → detail sidebar (author, badge, all signal scores)
 *   • Hover tooltip (author + badge)
 *   • Zoom + pan (mouse wheel + drag)
 *   • "Reset view" button
 *   • Animated entrance (nodes fade in as simulation runs)
 *   • Fully accessible (keyboard-navigable nodes, ARIA labels)
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphEdge, GraphNode, SignalScores } from "@/lib/api";
import { createSimulation, type SimNode } from "@/lib/forceGraph";

// ── Colour maps ────────────────────────────────────────────────────────
const NODE_FILL: Record<string, string> = {
  human: "#34d399",      // emerald
  suspicious: "#fbbf24", // amber
  bot: "#ef4444",        // red
};
const NODE_STROKE: Record<string, string> = {
  human: "#059669",
  suspicious: "#d97706",
  bot: "#b91c1c",
};
const NODE_GLOW: Record<string, string> = {
  human: "rgba(52,211,153,0.35)",
  suspicious: "rgba(251,191,36,0.35)",
  bot: "rgba(239,68,68,0.45)",
};

// ── Props ──────────────────────────────────────────────────────────────
interface ConversationGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  signalScores: SignalScores | null;
  width?: number;
  height?: number;
}

// ── Component ──────────────────────────────────────────────────────────
export default function ConversationGraph({
  nodes,
  edges,
  signalScores,
  width = 700,
  height = 480,
}: ConversationGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const animRef = useRef<number>(0);
  const simRef = useRef<ReturnType<typeof createSimulation> | null>(null);

  // Rendered state (updated each animation frame)
  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [simEdges, setSimEdges] = useState<Array<{ source: SimNode; target: SimNode }>>([]);
  const [settled, setSettled] = useState(false);

  // Interaction state
  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; w: number; node: SimNode } | null>(null);

  // Zoom / pan
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  // Echo-ring node set (for red-highlight edges). Derived from props, so it's
  // a memoised value — not a ref — and safe to read during render.
  const echoRingSet = useMemo(() => {
    const s = new Set<string>();
    if (signalScores?.echo_rings) {
      for (const ring of signalScores.echo_rings) {
        for (const author of ring) {
          s.add(author);
        }
      }
    }
    return s;
  }, [signalScores]);

  // ── Initialise + run simulation ──────────────────────────────────────
  useEffect(() => {
    if (!nodes.length) return;

    cancelAnimationFrame(animRef.current);

    const sim = createSimulation(nodes, edges, width, height);
    simRef.current = sim;

    let frameCount = 0;
    function tick() {
      sim.step();
      frameCount++;

      // Snapshot node positions for React render (every 2 frames for perf)
      if (frameCount % 2 === 0) {
        setSimNodes([...sim.nodes]);
        const resolvedEdges = sim.edges
          .filter((e) => e.sourceNode && e.targetNode)
          .map((e) => ({ source: e.sourceNode!, target: e.targetNode! }));
        setSimEdges(resolvedEdges);
      }

      if (!sim.settled) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        setSimNodes([...sim.nodes]);
        const resolvedEdges = sim.edges
          .filter((e) => e.sourceNode && e.targetNode)
          .map((e) => ({ source: e.sourceNode!, target: e.targetNode! }));
        setSimEdges(resolvedEdges);
        setSettled(true);
      }
    }

    // Reset settled flag and start the force-simulation animation loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettled(false);
    animRef.current = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animRef.current);
  }, [nodes, edges, width, height]);

  // ── Zoom handler ─────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((t) => ({
      ...t,
      scale: Math.max(0.3, Math.min(3, t.scale * delta)),
    }));
  }, []);

  // ── Pan handlers ─────────────────────────────────────────────────────
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    isPanning.current = true;
    panStart.current = {
      x: e.clientX,
      y: e.clientY,
      tx: transform.x,
      ty: transform.y,
    };
  }, [transform]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isPanning.current) return;
    setTransform((t) => ({
      ...t,
      x: panStart.current.tx + (e.clientX - panStart.current.x),
      y: panStart.current.ty + (e.clientY - panStart.current.y),
    }));
  }, []);

  const handleMouseUp = useCallback(() => {
    isPanning.current = false;
  }, []);

  // ── Node interaction ─────────────────────────────────────────────────
  function handleNodeClick(e: React.MouseEvent, node: SimNode) {
    e.stopPropagation();
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  }

  function handleNodeHover(e: React.MouseEvent, node: SimNode | null) {
    setHoveredNode(node);
    if (node) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect) {
        setTooltip({
          x: e.clientX - rect.left,
          y: e.clientY - rect.top - 12,
          w: rect.width,
          node,
        });
      }
    } else {
      setTooltip(null);
    }
  }

  function resetView() {
    setTransform({ x: 0, y: 0, scale: 1 });
    setSelectedNode(null);
  }

  function reheat() {
    simRef.current?.reheat();
    setSettled(false);
    cancelAnimationFrame(animRef.current);
    function tick() {
      const sim = simRef.current;
      if (!sim) return;
      sim.step();
      setSimNodes([...sim.nodes]);
      const resolvedEdges = sim.edges
        .filter((e) => e.sourceNode && e.targetNode)
        .map((e) => ({ source: e.sourceNode!, target: e.targetNode! }));
      setSimEdges(resolvedEdges);
      if (!sim.settled) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        setSettled(true);
      }
    }
    animRef.current = requestAnimationFrame(tick);
  }

  // ── Edge colour: red for echo-ring connections ────────────────────────
  function edgeColor(src: SimNode, tgt: SimNode): string {
    const srcInRing = echoRingSet.has(src.author);
    const tgtInRing = echoRingSet.has(tgt.author);
    if (srcInRing && tgtInRing) return "#ef4444";
    if (src.badge === "bot" || tgt.badge === "bot") return "rgba(239,68,68,0.4)";
    if (src.badge === "suspicious" || tgt.badge === "suspicious") return "rgba(251,191,36,0.3)";
    return "rgba(255,255,255,0.12)";
  }

  function edgeWidth(src: SimNode, tgt: SimNode): number {
    const srcInRing = echoRingSet.has(src.author);
    const tgtInRing = echoRingSet.has(tgt.author);
    if (srcInRing && tgtInRing) return 2.5;
    return 1;
  }

  if (!nodes.length) return null;

  return (
    <div className="border-t border-[var(--glass-border)]">
      {/* Section header */}
      <div className="px-6 py-4 bg-gradient-to-r from-[rgba(239,68,68,0.06)] to-transparent border-b border-[var(--glass-border)]">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="w-6 h-6 rounded-md bg-[var(--brand)]/15 flex items-center justify-center">
            <svg viewBox="0 0 24 24" fill="none" className="w-3.5 h-3.5 text-[var(--brand)]">
              <circle cx="5" cy="5" r="2" fill="currentColor" />
              <circle cx="19" cy="5" r="2" fill="currentColor" opacity="0.6" />
              <circle cx="12" cy="12" r="2.5" fill="currentColor" />
              <circle cx="5" cy="19" r="1.5" fill="currentColor" opacity="0.7" />
              <circle cx="19" cy="19" r="1.5" fill="currentColor" opacity="0.5" />
              <path d="M6.5 6.5L10.5 10.5M17.5 6.5L13.5 10.5M10.5 13.5L6.5 17.5M13.5 13.5L17.5 17.5"
                stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
            </svg>
          </div>
          <p className="text-xs font-semibold text-white">Conversation Graph</p>
          {!settled && (
            <span className="text-[10px] text-[var(--fg-dim)] animate-pulse">simulating…</span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={reheat} className="btn-ghost text-[10px] py-1 px-2">
              ↺ Reheat
            </button>
            <button onClick={resetView} className="btn-ghost text-[10px] py-1 px-2">
              ⊡ Reset
            </button>
            <span className="text-[10px] font-mono text-[var(--brand)]/70 uppercase tracking-wider">
              Phase 5
            </span>
          </div>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-4 mt-3">
          {[
            { color: "#34d399", label: "Human" },
            { color: "#fbbf24", label: "Suspicious" },
            { color: "#ef4444", label: "Bot / Echo ring" },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
              <span className="text-[10px] text-[var(--fg-muted)]">{l.label}</span>
            </div>
          ))}
          <div className="flex items-center gap-1.5">
            <span className="w-5 h-0.5 bg-red-500 rounded" />
            <span className="text-[10px] text-[var(--fg-muted)]">Echo-ring edge</span>
          </div>
          <span className="text-[10px] text-[var(--fg-dim)] ml-auto">
            Scroll to zoom · Drag to pan · Click node for details
          </span>
        </div>
      </div>

      {/* Graph canvas + sidebar */}
      <div className="flex flex-col lg:flex-row">
        {/* SVG canvas */}
        <div
          className="relative overflow-hidden bg-[rgba(5,5,10,0.6)]"
          style={{ width: "100%", height }}
        >
          <svg
            ref={svgRef}
            width="100%"
            height={height}
            role="img"
            aria-label="Conversation graph showing comment relationships and bot detection"
            className="cursor-grab active:cursor-grabbing select-none"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={() => setSelectedNode(null)}
          >
            <defs>
              {/* Glow filters for each badge type */}
              {(["human", "suspicious", "bot"] as const).map((badge) => (
                <filter key={badge} id={`glow-${badge}`} x="-50%" y="-50%" width="200%" height="200%">
                  <feGaussianBlur stdDeviation="4" result="blur" />
                  <feFlood floodColor={NODE_GLOW[badge]} result="color" />
                  <feComposite in="color" in2="blur" operator="in" result="glow" />
                  <feMerge>
                    <feMergeNode in="glow" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              ))}
              {/* Arrow marker for directed edges */}
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255,255,255,0.2)" />
              </marker>
              <marker
                id="arrow-bot"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(239,68,68,0.6)" />
              </marker>
            </defs>

            <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
              {/* Edges */}
              {simEdges.map((e, i) => {
                const isEchoEdge =
                  echoRingSet.has(e.source.author) &&
                  echoRingSet.has(e.target.author);
                const color = edgeColor(e.source, e.target);
                const strokeW = edgeWidth(e.source, e.target);
                // Shorten edge to not overlap node circles
                const dx = e.target.x - e.source.x;
                const dy = e.target.y - e.source.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;
                const x1 = e.source.x + (dx / dist) * e.source.radius;
                const y1 = e.source.y + (dy / dist) * e.source.radius;
                const x2 = e.target.x - (dx / dist) * (e.target.radius + 6);
                const y2 = e.target.y - (dy / dist) * (e.target.radius + 6);

                return (
                  <line
                    key={i}
                    x1={x1} y1={y1} x2={x2} y2={y2}
                    stroke={color}
                    strokeWidth={strokeW}
                    strokeDasharray={isEchoEdge ? "none" : "none"}
                    markerEnd={isEchoEdge ? "url(#arrow-bot)" : "url(#arrow)"}
                    opacity={settled ? 1 : 0.6}
                  />
                );
              })}

              {/* Nodes */}
              {simNodes.map((node) => {
                const isSelected = selectedNode?.id === node.id;
                const isHovered = hoveredNode?.id === node.id;
                const fill = NODE_FILL[node.badge] ?? NODE_FILL.human;
                const stroke = NODE_STROKE[node.badge] ?? NODE_STROKE.human;
                const isInEchoRing = echoRingSet.has(node.author);

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x},${node.y})`}
                    onClick={(e) => handleNodeClick(e, node)}
                    onMouseEnter={(e) => handleNodeHover(e, node)}
                    onMouseLeave={(e) => handleNodeHover(e, null)}
                    style={{ cursor: "pointer" }}
                    role="button"
                    aria-label={`${node.author} — ${node.badge}`}
                    tabIndex={0}
                    onKeyDown={(e) => e.key === "Enter" && setSelectedNode(node)}
                  >
                    {/* Outer glow ring for selected / echo-ring nodes */}
                    {(isSelected || isInEchoRing) && (
                      <circle
                        r={node.radius + 5}
                        fill="none"
                        stroke={isInEchoRing ? "#ef4444" : fill}
                        strokeWidth={isInEchoRing ? 2 : 1.5}
                        opacity={0.5}
                        strokeDasharray={isInEchoRing ? "4 2" : "none"}
                      />
                    )}

                    {/* Main circle */}
                    <circle
                      r={node.radius}
                      fill={fill}
                      fillOpacity={node.is_removed ? 0.3 : isHovered ? 0.95 : 0.8}
                      stroke={isSelected ? "#fff" : stroke}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      filter={
                        node.badge === "bot" || isSelected
                          ? `url(#glow-${node.badge})`
                          : undefined
                      }
                    />

                    {/* Author initial */}
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={Math.max(7, node.radius * 0.55)}
                      fontWeight="600"
                      fill={node.badge === "suspicious" ? "#1a1a00" : "#fff"}
                      fillOpacity={node.is_removed ? 0.5 : 1}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {node.author === "[deleted]" ? "✕" : node.author.charAt(0).toUpperCase()}
                    </text>

                    {/* Depth label below node */}
                    {node.radius >= 12 && (
                      <text
                        y={node.radius + 10}
                        textAnchor="middle"
                        fontSize="8"
                        fill="rgba(255,255,255,0.45)"
                        style={{ pointerEvents: "none", userSelect: "none" }}
                      >
                        d{node.depth}
                      </text>
                    )}
                  </g>
                );
              })}
            </g>
          </svg>

          {/* Hover tooltip */}
          {tooltip && (
            <div
              className="absolute pointer-events-none z-10 glass rounded-lg px-3 py-2 text-xs max-w-[200px]"
              style={{
                left: Math.min(tooltip.x + 12, (tooltip.w || 700) - 220),
                top: Math.max(8, tooltip.y - 40),
              }}
            >
              <p className="font-semibold text-white">u/{tooltip.node.author}</p>
              <p className="text-[var(--fg-muted)]">
                {tooltip.node.badge === "bot" ? "🚩 Bot" :
                 tooltip.node.badge === "suspicious" ? "⚠️ Suspicious" : "✅ Human"}
                {" "}· auth {tooltip.node.authenticity}
              </p>
              <p className="text-[var(--fg-dim)] mt-0.5">
                {tooltip.node.reply_count} replies · depth {tooltip.node.depth}
              </p>
            </div>
          )}

          {/* Zoom indicator */}
          <div className="absolute bottom-3 right-3 glass rounded-lg px-2 py-1 text-[10px] font-mono text-[var(--fg-dim)]">
            {Math.round(transform.scale * 100)}%
          </div>
        </div>

        {/* Node detail sidebar */}
        {selectedNode && (
          <NodeDetailSidebar
            node={selectedNode}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>

      {/* Graph summary footer */}
      <div className="px-6 py-3 bg-[rgba(7,7,13,0.4)] border-t border-[var(--glass-border)]">
        <p className="text-[11px] text-[var(--fg-dim)] leading-relaxed">
          <span className="text-white font-medium">Phase 5 complete.</span>{" "}
          Force-directed conversation graph — {nodes.length} nodes, {edges.length} edges.
          Node size = subtree influence. Red edges = echo-ring connections.
          Click any node to inspect its signal scores.
        </p>
      </div>
    </div>
  );
}

// ── Node detail sidebar ────────────────────────────────────────────────
function NodeDetailSidebar({
  node,
  onClose,
}: {
  node: SimNode;
  onClose: () => void;
}) {
  const badgeCfg = {
    human: { label: "✅ Human", cls: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
    suspicious: { label: "⚠️ Suspicious", cls: "text-yellow-400", bg: "bg-yellow-500/10 border-yellow-500/20" },
    bot: { label: "🚩 Bot", cls: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
  }[node.badge];

  return (
    <div className="lg:w-64 flex-shrink-0 border-t lg:border-t-0 lg:border-l border-[var(--glass-border)] bg-[rgba(7,7,13,0.5)] p-5 overflow-y-auto max-h-[480px]">
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-xs text-[var(--fg-dim)] mb-0.5">Selected node</p>
          <p className="font-display font-semibold text-white text-base">
            u/{node.author}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-[var(--fg-dim)] hover:text-white transition text-lg leading-none"
          aria-label="Close detail panel"
        >
          ×
        </button>
      </div>

      {/* Badge */}
      <div className={`rounded-lg border px-3 py-2 mb-4 ${badgeCfg.bg}`}>
        <p className={`text-sm font-semibold ${badgeCfg.cls}`}>{badgeCfg.label}</p>
        <p className="text-xs text-[var(--fg-muted)] mt-0.5">
          Authenticity score: <span className="font-mono text-white">{node.authenticity}/100</span>
        </p>
      </div>

      {/* Signal scores */}
      <div className="space-y-2 mb-4">
        <p className="text-[10px] uppercase tracking-wider text-[var(--fg-dim)]">Signal scores</p>
        <MiniBar label="Latency" value={node.latency_score} />
        <MiniBar label="Echo" value={node.echo_score} />
        <MiniBar label="Consensus" value={node.consensus_score} />
      </div>

      {/* Topology */}
      <div className="space-y-2 mb-4">
        <p className="text-[10px] uppercase tracking-wider text-[var(--fg-dim)]">Topology</p>
        <div className="grid grid-cols-2 gap-2">
          <DetailStat label="Depth" value={String(node.depth)} />
          <DetailStat label="Replies" value={String(node.reply_count)} />
          <DetailStat label="Subtree" value={String(node.subtree_size)} />
          <DetailStat label="Score" value={String(node.score)} />
        </div>
        <DetailStat label="Centrality" value={node.centrality.toFixed(4)} />
      </div>

      {/* Comment text */}
      {node.text && (
        <div>
          <p className="text-[10px] uppercase tracking-wider text-[var(--fg-dim)] mb-1">Text</p>
          <p className={`text-xs leading-relaxed ${node.is_removed ? "italic text-[var(--fg-dim)]" : "text-[var(--fg-muted)]"}`}>
            {node.is_removed
              ? "[removed — topology preserved]"
              : node.text.length > 200
              ? node.text.slice(0, 199) + "…"
              : node.text}
          </p>
        </div>
      )}
    </div>
  );
}

function MiniBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 60 ? "bg-red-500" : pct >= 30 ? "bg-yellow-500" : "bg-emerald-500";
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-0.5">
        <span className="text-[var(--fg-muted)]">{label}</span>
        <span className="font-mono text-white">{pct}%</span>
      </div>
      <div className="h-1 rounded-full bg-[rgba(255,255,255,0.06)]">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-[rgba(255,255,255,0.03)] border border-[var(--glass-border)] px-2.5 py-2">
      <p className="text-[9px] text-[var(--fg-dim)] uppercase tracking-wider">{label}</p>
      <p className="text-xs font-mono text-white">{value}</p>
    </div>
  );
}
