"use client";

/**
 * ConversationGraph — premium interactive force-directed visualisation.
 *
 * Layered visual hierarchy:
 *   • Section header with live stats badges (nodes, edges, rings, biggest threat)
 *   • Coloured legend pills with live counts
 *   • Background dot-grid for depth perception
 *   • Animated dash-flow on echo-ring edges → eyes drawn to bot connections
 *   • Concentric pulse rings around bot-ring nodes
 *   • Floating zoom + control toolbar
 *   • Premium right-side detail panel with signal bars + author avatar
 *   • Hover tooltip with badge + topology context
 *
 * Behaviour: pan/zoom, click for details, hover for tooltip, keyboard nav.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { GraphEdge, GraphNode, SignalScores } from "@/lib/api";
import { createSimulation, type SimNode } from "@/lib/forceGraph";

// ── Colour maps ────────────────────────────────────────────────────────
const NODE_FILL: Record<string, string> = {
  human: "#34d399",
  suspicious: "#fbbf24",
  bot: "#ef4444",
};
const NODE_STROKE: Record<string, string> = {
  human: "#10b981",
  suspicious: "#d97706",
  bot: "#dc2626",
};
const NODE_GLOW: Record<string, string> = {
  human: "rgba(52,211,153,0.45)",
  suspicious: "rgba(251,191,36,0.45)",
  bot: "rgba(239,68,68,0.6)",
};

// ── Props ──────────────────────────────────────────────────────────────
interface ConversationGraphProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  signalScores: SignalScores | null;
  width?: number;
  height?: number;
}

export default function ConversationGraph({
  nodes,
  edges,
  signalScores,
  width = 700,
  height = 560,
}: ConversationGraphProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const animRef = useRef<number>(0);
  const simRef = useRef<ReturnType<typeof createSimulation> | null>(null);

  const [simNodes, setSimNodes] = useState<SimNode[]>([]);
  const [simEdges, setSimEdges] = useState<Array<{ source: SimNode; target: SimNode }>>([]);
  const [settled, setSettled] = useState(false);

  const [selectedNode, setSelectedNode] = useState<SimNode | null>(null);
  const [hoveredNode, setHoveredNode] = useState<SimNode | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; w: number; node: SimNode } | null>(null);

  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 1 });
  const isPanning = useRef(false);
  const panStart = useRef({ x: 0, y: 0, tx: 0, ty: 0 });

  // Derive echo-ring author set
  const echoRingSet = useMemo(() => {
    const s = new Set<string>();
    if (signalScores?.echo_rings) {
      for (const ring of signalScores.echo_rings) for (const author of ring) s.add(author);
    }
    return s;
  }, [signalScores]);

  // Per-badge counts for legend pills
  const counts = useMemo(() => {
    const c = { human: 0, suspicious: 0, bot: 0 };
    for (const n of nodes) c[n.badge as keyof typeof c]++;
    return c;
  }, [nodes]);

  // ── Simulation loop ──────────────────────────────────────────────────
  useEffect(() => {
    if (!nodes.length) return;
    cancelAnimationFrame(animRef.current);

    const sim = createSimulation(nodes, edges, width, height);
    simRef.current = sim;

    let frameCount = 0;
    function tick() {
      sim.step();
      frameCount++;
      if (frameCount % 2 === 0) {
        setSimNodes([...sim.nodes]);
        const resolved = sim.edges
          .filter((e) => e.sourceNode && e.targetNode)
          .map((e) => ({ source: e.sourceNode!, target: e.targetNode! }));
        setSimEdges(resolved);
      }
      if (!sim.settled) {
        animRef.current = requestAnimationFrame(tick);
      } else {
        setSimNodes([...sim.nodes]);
        const resolved = sim.edges
          .filter((e) => e.sourceNode && e.targetNode)
          .map((e) => ({ source: e.sourceNode!, target: e.targetNode! }));
        setSimEdges(resolved);
        setSettled(true);
      }
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSettled(false);
    animRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animRef.current);
  }, [nodes, edges, width, height]);

  // ── Interactions ─────────────────────────────────────────────────────
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setTransform((t) => ({ ...t, scale: Math.max(0.3, Math.min(3, t.scale * delta)) }));
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      isPanning.current = true;
      panStart.current = { x: e.clientX, y: e.clientY, tx: transform.x, ty: transform.y };
    },
    [transform],
  );

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

  function handleNodeClick(e: React.MouseEvent, node: SimNode) {
    e.stopPropagation();
    setSelectedNode((prev) => (prev?.id === node.id ? null : node));
  }

  function handleNodeHover(e: React.MouseEvent, node: SimNode | null) {
    setHoveredNode(node);
    if (node) {
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect) setTooltip({ x: e.clientX - rect.left, y: e.clientY - rect.top - 12, w: rect.width, node });
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
      const resolved = sim.edges
        .filter((e) => e.sourceNode && e.targetNode)
        .map((e) => ({ source: e.sourceNode!, target: e.targetNode! }));
      setSimEdges(resolved);
      if (!sim.settled) animRef.current = requestAnimationFrame(tick);
      else setSettled(true);
    }
    animRef.current = requestAnimationFrame(tick);
  }

  // Edge styling helpers
  function edgeColor(src: SimNode, tgt: SimNode): string {
    if (echoRingSet.has(src.author) && echoRingSet.has(tgt.author)) return "#ef4444";
    if (src.badge === "bot" || tgt.badge === "bot") return "rgba(239,68,68,0.45)";
    if (src.badge === "suspicious" || tgt.badge === "suspicious") return "rgba(251,191,36,0.35)";
    return "rgba(255,255,255,0.14)";
  }

  function edgeWidth(src: SimNode, tgt: SimNode): number {
    if (echoRingSet.has(src.author) && echoRingSet.has(tgt.author)) return 2.5;
    return 1.2;
  }

  if (!nodes.length) return null;

  const ringCount = signalScores?.echo_rings.length ?? 0;
  const botCount = counts.bot;
  const ringAuthors = signalScores?.echo_rings.flat() ?? [];

  return (
    <div
      className="border-t"
      style={{ borderColor: "rgba(255,255,255,0.08)", background: "rgba(7,7,13,0.55)" }}
    >
      {/* ─── HEADER ─────────────────────────────────────────────── */}
      <div
        className="px-6 py-5 border-b"
        style={{
          borderColor: "rgba(255,255,255,0.08)",
          background:
            "linear-gradient(135deg, rgba(239,68,68,0.08) 0%, rgba(168,85,247,0.05) 50%, transparent 100%)",
        }}
      >
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: "linear-gradient(135deg, rgba(239,68,68,0.2), rgba(168,85,247,0.15))",
              border: "1px solid rgba(239,68,68,0.3)",
              boxShadow: "0 0 16px -4px rgba(239,68,68,0.4)",
            }}
          >
            <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4 text-white">
              <circle cx="5" cy="5" r="2" fill="currentColor" />
              <circle cx="19" cy="5" r="2" fill="currentColor" opacity="0.7" />
              <circle cx="12" cy="12" r="2.5" fill="#ef4444" />
              <circle cx="5" cy="19" r="1.5" fill="currentColor" opacity="0.7" />
              <circle cx="19" cy="19" r="1.5" fill="currentColor" opacity="0.5" />
              <path
                d="M6.5 6.5L10.5 10.5M17.5 6.5L13.5 10.5M10.5 13.5L6.5 17.5M13.5 13.5L17.5 17.5"
                stroke="currentColor"
                strokeWidth="1.2"
                strokeLinecap="round"
                opacity="0.5"
              />
            </svg>
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="font-display font-bold text-white text-lg leading-tight">
              Conversation Graph
            </h3>
            <p className="text-[11px] text-white/50 mt-0.5">
              Force-directed topology · interactive · click any node for full details
            </p>
          </div>

          {!settled && (
            <span className="inline-flex items-center gap-1.5 text-[10px] text-cyan-400 font-mono">
              <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
              simulating
            </span>
          )}

          <div className="flex items-center gap-2">
            <ToolbarButton onClick={reheat} title="Restart simulation">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                <path d="M3 12a9 9 0 1 0 3.5-7M3 4v5h5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Reheat
            </ToolbarButton>
            <ToolbarButton onClick={resetView} title="Reset view">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                <path d="M4 4h6M4 4v6M20 4h-6M20 4v6M4 20h6M4 20v-6M20 20h-6M20 20v-6" strokeLinecap="round" />
              </svg>
              Reset
            </ToolbarButton>
          </div>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <StatPill label="Nodes" value={String(nodes.length)} color="white" />
          <StatPill label="Edges" value={String(edges.length)} color="white" />
          <StatPill
            label="Bot accounts"
            value={String(botCount)}
            color={botCount > 0 ? "red" : "emerald"}
          />
          <StatPill
            label="Echo rings"
            value={String(ringCount)}
            color={ringCount > 0 ? "red" : "emerald"}
            highlight={ringCount > 0}
          />
        </div>

        {/* Echo ring callout */}
        {ringCount > 0 && (
          <div
            className="mt-3 rounded-xl px-4 py-2.5 flex items-start gap-3"
            style={{
              background: "rgba(239,68,68,0.08)",
              border: "1px solid rgba(239,68,68,0.25)",
            }}
          >
            <span className="text-base flex-shrink-0">🚩</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-red-300 font-semibold mb-0.5">
                Bot ring detected — {ringAuthors.length} accounts sharing rare phrasing
              </p>
              <p className="text-[10px] text-white/55 font-mono truncate">
                {ringAuthors.slice(0, 6).map((a) => `u/${a}`).join(" · ")}
                {ringAuthors.length > 6 && ` · +${ringAuthors.length - 6} more`}
              </p>
            </div>
          </div>
        )}

        {/* Legend pills */}
        <div className="flex flex-wrap items-center gap-2 mt-3">
          <LegendPill color="#34d399" label="Human" count={counts.human} />
          <LegendPill color="#fbbf24" label="Suspicious" count={counts.suspicious} />
          <LegendPill color="#ef4444" label="Bot" count={counts.bot} />
          <span className="inline-flex items-center gap-1.5 text-[10px] text-white/40 ml-1">
            <span className="w-5 h-px bg-red-500" />
            <span>Echo edge</span>
          </span>
          <span className="text-[10px] text-white/35 ml-auto">
            Scroll · zoom &nbsp;|&nbsp; Drag · pan &nbsp;|&nbsp; Click · details
          </span>
        </div>
      </div>

      {/* ─── CANVAS + SIDEBAR ───────────────────────────────────── */}
      <div className="flex flex-col lg:flex-row">
        {/* SVG canvas */}
        <div className="relative overflow-hidden flex-1" style={{ height }}>
          {/* Dot-grid background for depth */}
          <div
            aria-hidden="true"
            className="absolute inset-0 pointer-events-none"
            style={{
              backgroundColor: "rgba(4, 4, 9, 0.6)",
              backgroundImage:
                "radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
              maskImage:
                "radial-gradient(ellipse at center, black 0%, transparent 80%)",
              WebkitMaskImage:
                "radial-gradient(ellipse at center, black 0%, transparent 80%)",
            }}
          />

          {/* Corner glow accents */}
          <div
            aria-hidden="true"
            className="absolute -top-20 -left-20 w-64 h-64 rounded-full pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, rgba(239,68,68,0.18), transparent 65%)",
              filter: "blur(30px)",
            }}
          />
          <div
            aria-hidden="true"
            className="absolute -bottom-20 -right-20 w-64 h-64 rounded-full pointer-events-none"
            style={{
              background:
                "radial-gradient(circle, rgba(34,211,238,0.15), transparent 65%)",
              filter: "blur(30px)",
            }}
          />

          <svg
            ref={svgRef}
            width="100%"
            height={height}
            role="img"
            aria-label="Conversation graph"
            className="relative cursor-grab active:cursor-grabbing select-none"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onClick={() => setSelectedNode(null)}
          >
            <defs>
              {(["human", "suspicious", "bot"] as const).map((badge) => (
                <filter
                  key={badge}
                  id={`glow-${badge}`}
                  x="-50%"
                  y="-50%"
                  width="200%"
                  height="200%"
                >
                  <feGaussianBlur stdDeviation="5" result="blur" />
                  <feFlood floodColor={NODE_GLOW[badge]} result="color" />
                  <feComposite in="color" in2="blur" operator="in" result="glow" />
                  <feMerge>
                    <feMergeNode in="glow" />
                    <feMergeNode in="SourceGraphic" />
                  </feMerge>
                </filter>
              ))}

              {/* Animated dash for echo edges */}
              <style>{`
                @keyframes dashFlow { to { stroke-dashoffset: -16; } }
                .echo-edge { animation: dashFlow 1.2s linear infinite; }
              `}</style>

              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="5"
                markerHeight="5"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(255,255,255,0.25)" />
              </marker>
              <marker
                id="arrow-bot"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="6"
                markerHeight="6"
                orient="auto-start-reverse"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
              </marker>
            </defs>

            <g transform={`translate(${transform.x},${transform.y}) scale(${transform.scale})`}>
              {/* Edges */}
              {simEdges.map((e, i) => {
                const isEcho = echoRingSet.has(e.source.author) && echoRingSet.has(e.target.author);
                const color = edgeColor(e.source, e.target);
                const sw = edgeWidth(e.source, e.target);
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
                    x1={x1}
                    y1={y1}
                    x2={x2}
                    y2={y2}
                    stroke={color}
                    strokeWidth={sw}
                    strokeLinecap="round"
                    strokeDasharray={isEcho ? "8 4" : undefined}
                    className={isEcho ? "echo-edge" : undefined}
                    markerEnd={isEcho ? "url(#arrow-bot)" : "url(#arrow)"}
                    opacity={settled ? 1 : 0.65}
                  />
                );
              })}

              {/* Nodes */}
              {simNodes.map((node) => {
                const isSelected = selectedNode?.id === node.id;
                const isHovered = hoveredNode?.id === node.id;
                const fill = NODE_FILL[node.badge] ?? NODE_FILL.human;
                const stroke = NODE_STROKE[node.badge] ?? NODE_STROKE.human;
                const inRing = echoRingSet.has(node.author);

                return (
                  <g
                    key={node.id}
                    transform={`translate(${node.x},${node.y})`}
                    onClick={(ev) => handleNodeClick(ev, node)}
                    onMouseEnter={(ev) => handleNodeHover(ev, node)}
                    onMouseLeave={(ev) => handleNodeHover(ev, null)}
                    style={{ cursor: "pointer" }}
                    role="button"
                    aria-label={`${node.author} — ${node.badge}`}
                    tabIndex={0}
                    onKeyDown={(ev) => ev.key === "Enter" && setSelectedNode(node)}
                  >
                    {/* Outer pulse ring for echo-ring nodes */}
                    {inRing && (
                      <>
                        <circle
                          r={node.radius + 10}
                          fill="none"
                          stroke="#ef4444"
                          strokeWidth="1"
                          opacity="0.25"
                        >
                          <animate
                            attributeName="r"
                            values={`${node.radius + 6};${node.radius + 14};${node.radius + 6}`}
                            dur="2s"
                            repeatCount="indefinite"
                          />
                          <animate
                            attributeName="opacity"
                            values="0.4;0.1;0.4"
                            dur="2s"
                            repeatCount="indefinite"
                          />
                        </circle>
                        <circle
                          r={node.radius + 5}
                          fill="none"
                          stroke="#ef4444"
                          strokeWidth="1.5"
                          opacity="0.6"
                          strokeDasharray="3 2"
                        />
                      </>
                    )}

                    {/* Selected indicator */}
                    {isSelected && !inRing && (
                      <circle
                        r={node.radius + 6}
                        fill="none"
                        stroke="#fff"
                        strokeWidth="1.5"
                        opacity="0.6"
                      />
                    )}

                    {/* Main node */}
                    <circle
                      r={node.radius}
                      fill={fill}
                      fillOpacity={node.is_removed ? 0.3 : isHovered ? 1 : 0.9}
                      stroke={isSelected ? "#fff" : stroke}
                      strokeWidth={isSelected ? 2.5 : 1.5}
                      filter={
                        node.badge === "bot" || isSelected || isHovered
                          ? `url(#glow-${node.badge})`
                          : undefined
                      }
                    />

                    {/* Author initial */}
                    <text
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontSize={Math.max(8, node.radius * 0.6)}
                      fontWeight="700"
                      fill={node.badge === "suspicious" ? "#1a1500" : "#fff"}
                      fillOpacity={node.is_removed ? 0.5 : 1}
                      style={{ pointerEvents: "none", userSelect: "none" }}
                    >
                      {node.author === "[deleted]"
                        ? "✕"
                        : node.author.charAt(0).toUpperCase()}
                    </text>

                    {/* Reply count badge for high-influence nodes */}
                    {node.reply_count >= 3 && (
                      <g transform={`translate(${node.radius * 0.7},${-node.radius * 0.7})`}>
                        <circle
                          r="6"
                          fill="#0a0a14"
                          stroke="rgba(255,255,255,0.3)"
                          strokeWidth="1"
                        />
                        <text
                          textAnchor="middle"
                          dominantBaseline="central"
                          fontSize="7"
                          fontWeight="700"
                          fill="#fff"
                          style={{ pointerEvents: "none", userSelect: "none" }}
                        >
                          {node.reply_count}
                        </text>
                      </g>
                    )}

                    {/* Author name below node (only for big nodes) */}
                    {node.radius >= 14 && (
                      <text
                        y={node.radius + 12}
                        textAnchor="middle"
                        fontSize="9"
                        fill="rgba(255,255,255,0.55)"
                        fontWeight="500"
                        style={{ pointerEvents: "none", userSelect: "none" }}
                      >
                        u/{node.author.length > 10 ? node.author.slice(0, 9) + "…" : node.author}
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
              className="absolute pointer-events-none z-10 rounded-xl px-3.5 py-2.5 text-xs max-w-[240px]"
              style={{
                left: Math.min(tooltip.x + 14, (tooltip.w || 700) - 250),
                top: Math.max(8, tooltip.y - 50),
                background: "rgba(10, 10, 20, 0.95)",
                border: "1px solid rgba(255,255,255,0.12)",
                backdropFilter: "blur(20px)",
                boxShadow: "0 12px 40px -8px rgba(0,0,0,0.6)",
              }}
            >
              <div className="flex items-center gap-2 mb-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: NODE_FILL[tooltip.node.badge] }}
                />
                <p className="font-semibold text-white">u/{tooltip.node.author}</p>
              </div>
              <p className="text-white/70 mb-1">
                {tooltip.node.badge === "bot"
                  ? "🚩 Bot · "
                  : tooltip.node.badge === "suspicious"
                  ? "⚠️ Suspicious · "
                  : "✅ Human · "}
                <span className="font-mono text-white">
                  auth {tooltip.node.authenticity}
                </span>
              </p>
              <p className="text-white/40 text-[10px] font-mono">
                {tooltip.node.reply_count} replies · depth {tooltip.node.depth} ·{" "}
                {tooltip.node.subtree_size} subtree
              </p>
            </div>
          )}

          {/* Zoom indicator */}
          <div
            className="absolute bottom-3 right-3 rounded-lg px-2.5 py-1 text-[10px] font-mono"
            style={{
              background: "rgba(10, 10, 20, 0.85)",
              border: "1px solid rgba(255,255,255,0.1)",
              color: "rgba(255,255,255,0.55)",
            }}
          >
            {Math.round(transform.scale * 100)}%
          </div>

          {/* Hint when no node selected */}
          {!selectedNode && settled && (
            <div
              className="absolute top-3 left-3 rounded-lg px-3 py-1.5 text-[10px] font-medium pointer-events-none"
              style={{
                background: "rgba(10, 10, 20, 0.7)",
                border: "1px solid rgba(255,255,255,0.08)",
                color: "rgba(255,255,255,0.55)",
              }}
            >
              👆 Click any node to inspect signals
            </div>
          )}
        </div>

        {/* Sidebar */}
        {selectedNode && (
          <NodeDetailSidebar
            node={selectedNode}
            inEchoRing={echoRingSet.has(selectedNode.author)}
            onClose={() => setSelectedNode(null)}
          />
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Toolbar button
   ──────────────────────────────────────────────────────────────────── */
function ToolbarButton({
  onClick,
  title,
  children,
}: {
  onClick: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-white/70 hover:text-white hover:bg-white/8 transition-all"
      style={{
        border: "1px solid rgba(255,255,255,0.1)",
        background: "rgba(255,255,255,0.04)",
      }}
    >
      {children}
    </button>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Stat pill (header counters)
   ──────────────────────────────────────────────────────────────────── */
function StatPill({
  label,
  value,
  color,
  highlight,
}: {
  label: string;
  value: string;
  color: "white" | "red" | "emerald" | "yellow";
  highlight?: boolean;
}) {
  const colorMap = {
    white: { text: "text-white", border: "rgba(255,255,255,0.1)" },
    red: { text: "text-red-400", border: "rgba(239,68,68,0.4)" },
    emerald: { text: "text-emerald-400", border: "rgba(52,211,153,0.3)" },
    yellow: { text: "text-yellow-400", border: "rgba(251,191,36,0.3)" },
  }[color];

  return (
    <div
      className="rounded-xl px-3 py-2"
      style={{
        background: highlight ? "rgba(239,68,68,0.08)" : "rgba(255,255,255,0.03)",
        border: `1px solid ${colorMap.border}`,
        boxShadow: highlight ? "0 0 16px -8px rgba(239,68,68,0.5)" : undefined,
      }}
    >
      <p className="text-[9px] uppercase tracking-wider text-white/45 mb-0.5">
        {label}
      </p>
      <p className={`font-display font-bold text-lg tabular ${colorMap.text}`}>
        {value}
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Legend pill (with live count)
   ──────────────────────────────────────────────────────────────────── */
function LegendPill({
  color,
  label,
  count,
}: {
  color: string;
  label: string;
  count: number;
}) {
  return (
    <div
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[10px]"
      style={{
        background: "rgba(255,255,255,0.04)",
        border: "1px solid rgba(255,255,255,0.08)",
      }}
    >
      <span className="w-2 h-2 rounded-full" style={{ background: color }} />
      <span className="text-white/70 font-medium">{label}</span>
      <span className="text-white font-mono font-semibold">{count}</span>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────
   Node detail sidebar (premium redesign)
   ──────────────────────────────────────────────────────────────────── */
function NodeDetailSidebar({
  node,
  inEchoRing,
  onClose,
}: {
  node: SimNode;
  inEchoRing: boolean;
  onClose: () => void;
}) {
  const badgeCfg = {
    human: {
      label: "Human",
      icon: "✅",
      color: "#34d399",
      bg: "rgba(52,211,153,0.1)",
      border: "rgba(52,211,153,0.3)",
    },
    suspicious: {
      label: "Suspicious",
      icon: "⚠️",
      color: "#fbbf24",
      bg: "rgba(251,191,36,0.1)",
      border: "rgba(251,191,36,0.3)",
    },
    bot: {
      label: "Bot",
      icon: "🚩",
      color: "#ef4444",
      bg: "rgba(239,68,68,0.12)",
      border: "rgba(239,68,68,0.4)",
    },
  }[node.badge];

  return (
    <aside
      className="lg:w-72 flex-shrink-0 border-t lg:border-t-0 lg:border-l overflow-y-auto"
      style={{
        borderColor: "rgba(255,255,255,0.08)",
        background: "rgba(10, 10, 20, 0.92)",
        backdropFilter: "blur(20px)",
        maxHeight: "560px",
      }}
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-5">
          <div className="flex items-center gap-3 min-w-0">
            {/* Author avatar */}
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center font-display font-bold text-base flex-shrink-0"
              style={{
                background: badgeCfg.bg,
                border: `1px solid ${badgeCfg.border}`,
                color: badgeCfg.color,
                boxShadow: `0 0 16px -6px ${badgeCfg.color}`,
              }}
            >
              {node.author === "[deleted]" ? "✕" : node.author.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-white/40 mb-0.5">
                Selected
              </p>
              <p className="font-display font-bold text-white text-sm truncate">
                u/{node.author}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-white/40 hover:text-white transition rounded-lg w-7 h-7 flex items-center justify-center hover:bg-white/8 flex-shrink-0"
            aria-label="Close detail panel"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Verdict card */}
        <div
          className="rounded-xl p-4 mb-5"
          style={{
            background: badgeCfg.bg,
            border: `1px solid ${badgeCfg.border}`,
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xl">{badgeCfg.icon}</span>
            <p
              className="font-display font-bold text-base"
              style={{ color: badgeCfg.color }}
            >
              {badgeCfg.label}
            </p>
            {inEchoRing && (
              <span className="ml-auto text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">
                Echo ring
              </span>
            )}
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display font-bold text-3xl text-white tabular">
              {node.authenticity}
            </span>
            <span className="text-xs text-white/45">/ 100 authenticity</span>
          </div>
        </div>

        {/* Signal bars */}
        <div className="mb-5">
          <p className="text-[10px] uppercase tracking-wider text-white/45 mb-3 font-semibold">
            Detection Signals
          </p>
          <div className="space-y-3">
            <SignalBar label="Reply Latency" value={node.latency_score} />
            <SignalBar label="Vocabulary Echo" value={node.echo_score} />
            <SignalBar label="Synthetic Consensus" value={node.consensus_score} />
          </div>
        </div>

        {/* Topology */}
        <div className="mb-5">
          <p className="text-[10px] uppercase tracking-wider text-white/45 mb-3 font-semibold">
            Topology
          </p>
          <div className="grid grid-cols-2 gap-2">
            <DetailStat label="Depth" value={String(node.depth)} />
            <DetailStat label="Replies" value={String(node.reply_count)} />
            <DetailStat label="Subtree" value={String(node.subtree_size)} />
            <DetailStat label="Score" value={String(node.score)} />
          </div>
          <div className="mt-2">
            <DetailStat label="Centrality" value={node.centrality.toFixed(4)} wide />
          </div>
        </div>

        {/* Comment text */}
        {node.text && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/45 mb-2 font-semibold">
              Comment
            </p>
            <div
              className="rounded-xl p-3 text-xs leading-relaxed"
              style={{
                background: "rgba(255,255,255,0.03)",
                border: "1px solid rgba(255,255,255,0.06)",
                color: node.is_removed ? "rgba(255,255,255,0.4)" : "rgba(255,255,255,0.75)",
                fontStyle: node.is_removed ? "italic" : "normal",
              }}
            >
              {node.is_removed
                ? "[removed — topology preserved]"
                : node.text.length > 220
                ? node.text.slice(0, 219) + "…"
                : node.text}
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}

function SignalBar({ label, value }: { label: string; value: number }) {
  const pct = Math.round(value * 100);
  const color = pct >= 60 ? "#ef4444" : pct >= 30 ? "#fbbf24" : "#34d399";
  return (
    <div>
      <div className="flex justify-between items-center text-[11px] mb-1">
        <span className="text-white/65">{label}</span>
        <span className="font-mono font-semibold text-white">{pct}%</span>
      </div>
      <div
        className="h-1.5 rounded-full overflow-hidden"
        style={{ background: "rgba(255,255,255,0.06)" }}
      >
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${pct}%`,
            background: color,
            boxShadow: pct > 0 ? `0 0 8px ${color}66` : undefined,
          }}
        />
      </div>
    </div>
  );
}

function DetailStat({
  label,
  value,
  wide = false,
}: {
  label: string;
  value: string;
  wide?: boolean;
}) {
  return (
    <div
      className={`rounded-lg px-3 py-2 ${wide ? "col-span-2" : ""}`}
      style={{
        background: "rgba(255,255,255,0.03)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <p className="text-[9px] text-white/40 uppercase tracking-wider mb-0.5">
        {label}
      </p>
      <p className="text-xs font-mono font-semibold text-white">{value}</p>
    </div>
  );
}
