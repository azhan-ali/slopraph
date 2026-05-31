/**
 * Pure-TypeScript force-directed graph simulation.
 *
 * No external dependencies. Implements:
 *   • Repulsion  — nodes push each other apart (Coulomb-like)
 *   • Attraction — edges pull connected nodes together (spring)
 *   • Gravity    — weak pull toward centre so graph doesn't drift
 *   • Damping    — velocity decay so simulation converges
 *
 * Usage:
 *   const sim = createSimulation(nodes, edges, width, height);
 *   function tick() {
 *     sim.step();
 *     render(sim.nodes);
 *     if (!sim.settled) requestAnimationFrame(tick);
 *   }
 *   requestAnimationFrame(tick);
 */

export interface SimNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  // Visual properties (set from GraphNode)
  author: string;
  badge: "human" | "suspicious" | "bot";
  authenticity: number;
  depth: number;
  reply_count: number;
  subtree_size: number;
  centrality: number;
  is_removed: boolean;
  score: number;
  text: string;
  // Phase 3 signal scores
  latency_score: number;
  echo_score: number;
  consensus_score: number;
  // Computed radius (based on subtree_size)
  radius: number;
  // Fixed position flag (pinned nodes don't move)
  fixed: boolean;
}

export interface SimEdge {
  source: string;
  target: string;
  // Resolved references (set by simulation)
  sourceNode?: SimNode;
  targetNode?: SimNode;
}

export interface Simulation {
  nodes: SimNode[];
  edges: SimEdge[];
  step: () => void;
  settled: boolean;
  alpha: number;
  reheat: () => void;
}

// ── Physics constants ──────────────────────────────────────────────────
const REPULSION = 2800;       // Coulomb repulsion strength
const SPRING_LENGTH = 90;     // Natural edge length (px)
const SPRING_K = 0.06;        // Spring stiffness
const GRAVITY = 0.012;        // Pull toward centre
const DAMPING = 0.82;         // Velocity decay per step
const ALPHA_DECAY = 0.0165;   // How fast simulation cools
const ALPHA_MIN = 0.001;      // Stop threshold
const MAX_VELOCITY = 18;      // Cap velocity to prevent explosions

// Node radius: root node is bigger, leaves are smaller
function nodeRadius(n: Pick<SimNode, "subtree_size" | "reply_count">): number {
  return Math.max(8, Math.min(22, 8 + Math.sqrt(n.subtree_size) * 2.2));
}

export function createSimulation(
  rawNodes: Array<{
    id: string;
    author: string;
    badge: "human" | "suspicious" | "bot";
    authenticity: number;
    depth: number;
    reply_count: number;
    subtree_size: number;
    centrality: number;
    is_removed: boolean;
    score: number;
    text: string;
    latency_score: number;
    echo_score: number;
    consensus_score: number;
  }>,
  rawEdges: Array<{ source: string; target: string }>,
  width: number,
  height: number,
): Simulation {
  const cx = width / 2;
  const cy = height / 2;

  // Initialise nodes in a circle to avoid initial overlap
  const nodes: SimNode[] = rawNodes.map((n, i) => {
    const angle = (i / rawNodes.length) * 2 * Math.PI;
    const r = Math.min(width, height) * 0.28;
    return {
      ...n,
      x: cx + r * Math.cos(angle) + (Math.random() - 0.5) * 20,
      y: cy + r * Math.sin(angle) + (Math.random() - 0.5) * 20,
      vx: 0,
      vy: 0,
      radius: nodeRadius(n),
      fixed: false,
    };
  });

  const nodeMap = new Map<string, SimNode>(nodes.map((n) => [n.id, n]));

  const edges: SimEdge[] = rawEdges.map((e) => ({
    ...e,
    sourceNode: nodeMap.get(e.source),
    targetNode: nodeMap.get(e.target),
  }));

  let alpha = 1.0;

  function step() {
    if (alpha < ALPHA_MIN) return;

    // ── Repulsion (all pairs) ────────────────────────────────────────
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist2 = dx * dx + dy * dy + 0.01;
        const dist = Math.sqrt(dist2);
        const force = (REPULSION * alpha) / dist2;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;
        if (!a.fixed) { a.vx -= fx; a.vy -= fy; }
        if (!b.fixed) { b.vx += fx; b.vy += fy; }
      }
    }

    // ── Spring attraction (edges) ────────────────────────────────────
    for (const edge of edges) {
      const s = edge.sourceNode;
      const t = edge.targetNode;
      if (!s || !t) continue;
      const dx = t.x - s.x;
      const dy = t.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.01;
      const displacement = dist - SPRING_LENGTH;
      const force = SPRING_K * displacement * alpha;
      const fx = (dx / dist) * force;
      const fy = (dy / dist) * force;
      if (!s.fixed) { s.vx += fx; s.vy += fy; }
      if (!t.fixed) { t.vx -= fx; t.vy -= fy; }
    }

    // ── Gravity toward centre ────────────────────────────────────────
    for (const n of nodes) {
      if (n.fixed) continue;
      n.vx += (cx - n.x) * GRAVITY * alpha;
      n.vy += (cy - n.y) * GRAVITY * alpha;
    }

    // ── Integrate + damp + clamp ─────────────────────────────────────
    for (const n of nodes) {
      if (n.fixed) continue;
      n.vx *= DAMPING;
      n.vy *= DAMPING;
      // Clamp velocity
      const speed = Math.sqrt(n.vx * n.vx + n.vy * n.vy);
      if (speed > MAX_VELOCITY) {
        n.vx = (n.vx / speed) * MAX_VELOCITY;
        n.vy = (n.vy / speed) * MAX_VELOCITY;
      }
      n.x += n.vx;
      n.y += n.vy;
      // Keep within bounds with padding
      const pad = n.radius + 8;
      n.x = Math.max(pad, Math.min(width - pad, n.x));
      n.y = Math.max(pad, Math.min(height - pad, n.y));
    }

    alpha *= 1 - ALPHA_DECAY;
  }

  return {
    nodes,
    edges,
    step,
    get settled() { return alpha < ALPHA_MIN; },
    get alpha() { return alpha; },
    reheat() { alpha = 0.5; },
  };
}
