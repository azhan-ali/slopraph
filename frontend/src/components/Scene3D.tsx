"use client";

/**
 * Scene3D — real WebGL 3D background (react-three-fiber + drei).
 *
 * Renders the "live glass" layer behind the whole page:
 *   • Premium refractive glass shapes (MeshTransmissionMaterial)
 *   • A floating 3D conversation-graph: human nodes (cool) wired together,
 *     plus a tight red "bot-ring" cluster — the exact thing SLOPGRAPH hunts.
 *   • Subtle mouse parallax + autonomous drift.
 *
 * Fully self-contained: lighting comes from in-scene Lightformers, so there
 * is no network/HDR dependency. Mounted client-only (see Background.tsx).
 */

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  Environment,
  Float,
  Lightformer,
  MeshTransmissionMaterial,
  Sparkles,
} from "@react-three/drei";
import { useMemo, useRef } from "react";
import * as THREE from "three";

// ── Brand palette (matches CSS design tokens) ───────────────────────────
const RED = "#ef4444";
const PURPLE = "#a855f7";
const CYAN = "#22d3ee";

// ════════════════════════════════════════════════════════════════════════
// Parallax rig — gently turns the whole scene toward the pointer.
// ════════════════════════════════════════════════════════════════════════
function ParallaxRig({ children }: { children: React.ReactNode }) {
  const group = useRef<THREE.Group>(null);
  const { pointer } = useThree();

  useFrame((_, delta) => {
    if (!group.current) return;
    // Ease group rotation toward pointer for a soft parallax feel.
    const targetY = pointer.x * 0.35;
    const targetX = -pointer.y * 0.2;
    group.current.rotation.y += (targetY - group.current.rotation.y) * Math.min(1, delta * 2.5);
    group.current.rotation.x += (targetX - group.current.rotation.x) * Math.min(1, delta * 2.5);
  });

  return <group ref={group}>{children}</group>;
}

// ════════════════════════════════════════════════════════════════════════
// Premium glass shapes — refraction, chromatic aberration, soft tint.
// ════════════════════════════════════════════════════════════════════════
function GlassShape({
  position,
  scale = 1,
  color,
  geometry,
  speed = 1,
  rotationIntensity = 1,
}: {
  position: [number, number, number];
  scale?: number;
  color: string;
  geometry: "ico" | "torus" | "sphere" | "knot";
  speed?: number;
  rotationIntensity?: number;
}) {
  const geo = useMemo(() => {
    switch (geometry) {
      case "torus":
        return <torusGeometry args={[0.7, 0.28, 32, 96]} />;
      case "sphere":
        return <sphereGeometry args={[1, 64, 64]} />;
      case "knot":
        return <torusKnotGeometry args={[0.65, 0.22, 160, 32]} />;
      case "ico":
      default:
        return <icosahedronGeometry args={[1, 0]} />;
    }
  }, [geometry]);

  return (
    <Float speed={speed} rotationIntensity={rotationIntensity} floatIntensity={1.4}>
      <mesh position={position} scale={scale}>
        {geo}
        <MeshTransmissionMaterial
          samples={6}
          resolution={256}
          transmission={1}
          thickness={1.2}
          roughness={0.08}
          ior={1.42}
          chromaticAberration={0.32}
          anisotropy={0.3}
          distortion={0.35}
          distortionScale={0.4}
          temporalDistortion={0.15}
          attenuationColor={color}
          attenuationDistance={2.4}
          color={color}
          clearcoat={1}
          clearcoatRoughness={0.1}
        />
      </mesh>
    </Float>
  );
}

// ════════════════════════════════════════════════════════════════════════
// 3D conversation graph — human nodes + a red bot-ring.
// ════════════════════════════════════════════════════════════════════════
type NodeDef = { pos: THREE.Vector3; bot: boolean; size: number };

function NodeNetwork() {
  const group = useRef<THREE.Group>(null);

  const { nodes, edges } = useMemo(() => {
    const rng = mulberry32(42);
    const nodes: NodeDef[] = [];

    // Human nodes scattered on a loose sphere shell.
    const HUMANS = 14;
    for (let i = 0; i < HUMANS; i++) {
      const phi = Math.acos(1 - (2 * (i + 0.5)) / HUMANS);
      const theta = Math.PI * (1 + Math.sqrt(5)) * i;
      const r = 2.6 + rng() * 0.5;
      nodes.push({
        pos: new THREE.Vector3(
          r * Math.sin(phi) * Math.cos(theta),
          r * Math.cos(phi),
          r * Math.sin(phi) * Math.sin(theta),
        ),
        bot: false,
        size: 0.05 + rng() * 0.05,
      });
    }

    // Bot-ring: a tight cluster wired densely together (synthetic consensus).
    const BOTS = 5;
    const center = new THREE.Vector3(1.6, -1.2, 0.6);
    const botStart = nodes.length;
    for (let i = 0; i < BOTS; i++) {
      const a = (i / BOTS) * Math.PI * 2;
      nodes.push({
        pos: center
          .clone()
          .add(new THREE.Vector3(Math.cos(a) * 0.55, Math.sin(a) * 0.55, (rng() - 0.5) * 0.4)),
        bot: true,
        size: 0.07,
      });
    }

    // Edges: human tree-ish links + dense bot-ring links.
    const edges: [number, number][] = [];
    for (let i = 1; i < HUMANS; i++) {
      edges.push([i, Math.floor(rng() * i)]); // each human links back to an earlier one
    }
    // Bots fully interconnected → the unnatural "ring" topology.
    for (let i = 0; i < BOTS; i++) {
      for (let j = i + 1; j < BOTS; j++) {
        edges.push([botStart + i, botStart + j]);
      }
    }
    // One bridge edge from the ring into the human graph (the infiltration point).
    edges.push([botStart, 3]);

    return { nodes, edges };
  }, []);

  const linePositions = useMemo(() => {
    const arr: number[] = [];
    for (const [a, b] of edges) {
      arr.push(nodes[a].pos.x, nodes[a].pos.y, nodes[a].pos.z);
      arr.push(nodes[b].pos.x, nodes[b].pos.y, nodes[b].pos.z);
    }
    return new Float32Array(arr);
  }, [nodes, edges]);

  useFrame((_, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.06;
  });

  return (
    <group ref={group} position={[0, 0, -1]}>
      {/* edges */}
      <lineSegments>
        <bufferGeometry>
          <bufferAttribute
            attach="attributes-position"
            args={[linePositions, 3]}
          />
        </bufferGeometry>
        <lineBasicMaterial color={CYAN} transparent opacity={0.18} />
      </lineSegments>

      {/* nodes */}
      {nodes.map((n, i) => (
        <mesh key={i} position={n.pos}>
          <sphereGeometry args={[n.size, 16, 16]} />
          <meshStandardMaterial
            color={n.bot ? RED : CYAN}
            emissive={n.bot ? RED : CYAN}
            emissiveIntensity={n.bot ? 2.2 : 0.9}
            toneMapped={false}
          />
        </mesh>
      ))}
    </group>
  );
}

// ════════════════════════════════════════════════════════════════════════
// In-scene studio lighting (no external HDR needed).
// ════════════════════════════════════════════════════════════════════════
function StudioEnvironment() {
  return (
    <Environment resolution={256}>
      <Lightformer
        form="rect"
        intensity={3}
        color="#ffffff"
        position={[0, 4, -6]}
        scale={[12, 8, 1]}
      />
      <Lightformer
        form="circle"
        intensity={4}
        color={RED}
        position={[-5, -2, 2]}
        scale={[6, 6, 1]}
      />
      <Lightformer
        form="circle"
        intensity={3}
        color={PURPLE}
        position={[5, 2, 1]}
        scale={[6, 6, 1]}
      />
      <Lightformer
        form="circle"
        intensity={2.5}
        color={CYAN}
        position={[0, -4, 3]}
        scale={[8, 4, 1]}
      />
    </Environment>
  );
}

// ════════════════════════════════════════════════════════════════════════
// Top-level canvas.
// ════════════════════════════════════════════════════════════════════════
export default function Scene3D() {
  return (
    <Canvas
      gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
      dpr={[1, 1.6]}
      camera={{ position: [0, 0, 7], fov: 42 }}
      style={{ position: "fixed", inset: 0, zIndex: -1, pointerEvents: "none" }}
    >
      <ambientLight intensity={0.35} />
      <directionalLight position={[5, 5, 5]} intensity={1.2} />
      <directionalLight position={[-5, -3, -5]} intensity={0.6} color={PURPLE} />

      <StudioEnvironment />

      {/* Floating dust/particles for depth + premium feel */}
      <Sparkles
        count={70}
        scale={[14, 9, 6]}
        size={2.4}
        speed={0.35}
        opacity={0.5}
        color={CYAN}
      />
      <Sparkles
        count={40}
        scale={[12, 8, 5]}
        size={3}
        speed={0.25}
        opacity={0.4}
        color={RED}
      />

      <ParallaxRig>
        <NodeNetwork />

        <GlassShape
          geometry="ico"
          position={[-3.1, 1.4, 0.5]}
          scale={1.05}
          color={RED}
          speed={1.1}
          rotationIntensity={1.4}
        />
        <GlassShape
          geometry="knot"
          position={[3.2, 1.1, -0.5]}
          scale={0.95}
          color={PURPLE}
          speed={0.9}
          rotationIntensity={1.1}
        />
        <GlassShape
          geometry="torus"
          position={[2.7, -1.9, 1]}
          scale={0.85}
          color={CYAN}
          speed={1.3}
          rotationIntensity={1.6}
        />
        <GlassShape
          geometry="sphere"
          position={[-2.6, -1.7, -0.6]}
          scale={0.7}
          color={CYAN}
          speed={1.5}
          rotationIntensity={0.6}
        />
      </ParallaxRig>
    </Canvas>
  );
}

// ── Deterministic PRNG so the scene layout is stable across renders. ──────
function mulberry32(seed: number) {
  let a = seed;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
