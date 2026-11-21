"use client";
/* eslint-disable react-hooks/immutability, react-hooks/purity, react-hooks/set-state-in-effect --
   Three.js scene objects are intentionally mutated inside useFrame; seeded randomness lives in useMemo. */

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { twMerge } from "tailwind-merge";

/* ------------------------------------------------------------------ */
/* Environment helpers                                                 */
/* ------------------------------------------------------------------ */

function detectWebGL(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") || canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}

class GLErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

const RING_COUNT = 30;
const SPACING = 0.9;
const TUNNEL_LENGTH = RING_COUNT * SPACING;
const PARTICLE_COUNT = 520;
const VIOLET = new THREE.Color("#8b5cf6");
const LAVENDER = new THREE.Color("#c4b5fd");
const CYAN = new THREE.Color("#22d3ee");

function smoothstep(a: number, b: number, x: number) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

/** Curved tunnel centre-line: makes the hole feel like it bends away from you. */
function bend(z: number, t: number): [number, number] {
  return [Math.sin(z * 0.12 + t * 0.15) * 0.7, Math.cos(z * 0.09 + t * 0.12) * 0.45];
}

function Tunnel({ animate, progressRef }: { animate: boolean; progressRef: React.RefObject<number> }) {
  const group = useMemo(() => {
    const g = new THREE.Group();
    for (let i = 0; i < RING_COUNT; i++) {
      const pts: THREE.Vector3[] = [];
      const segs = 96;
      const wobble = 0.06 + (i % 3) * 0.02;
      for (let s = 0; s < segs; s++) {
        const a = (s / segs) * Math.PI * 2;
        const r = 2.4 * (1 + Math.sin(a * 3 + i) * wobble * 0.5);
        pts.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r * 0.92, 0));
      }
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      const color = VIOLET.clone().lerp(i % 4 === 0 ? CYAN : LAVENDER, i % 4 === 0 ? 0.75 : 0.15).multiplyScalar(1.15);
      const mat = new THREE.LineBasicMaterial({
        color,
        transparent: true,
        opacity: 0.6,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const ring = new THREE.LineLoop(geo, mat);
      ring.userData.base = i * SPACING;
      // soft outer echo for a cheap "glow"
      const echoMat = mat.clone();
      const echo = new THREE.LineLoop(geo, echoMat);
      echo.scale.setScalar(1.025);
      echo.userData.echo = true;
      ring.add(echo);
      g.add(ring);
    }
    return g;
  }, []);

  useEffect(
    () => () => {
      group.traverse((c) => {
        if (c instanceof THREE.LineLoop) {
          c.geometry.dispose();
          (c.material as THREE.Material).dispose();
        }
      });
    },
    [group],
  );

  const travel = useRef(0);
  useFrame((state, delta) => {
    const t = animate ? state.clock.elapsedTime : 0;
    if (animate) travel.current += Math.min(delta, 0.05) * 0.9;
    const offset = travel.current + (progressRef.current ?? 0) * SPACING * 10;
    group.children.forEach((child, i) => {
      const base = child.userData.base as number;
      const z = -TUNNEL_LENGTH + (((base + offset) % TUNNEL_LENGTH) + TUNNEL_LENGTH) % TUNNEL_LENGTH + 3;
      const [x, y] = bend(z, t);
      child.position.set(x, y, z);
      child.rotation.z = i * 0.21 + t * 0.05 * (i % 2 ? 1 : -1);
      const fadeFar = smoothstep(-TUNNEL_LENGTH + 3, -TUNNEL_LENGTH + 9, z);
      const fadeNear = 1 - smoothstep(0.5, 3, z);
      const o = fadeFar * fadeNear * (i % 4 === 0 ? 1 : 0.75);
      ((child as THREE.LineLoop).material as THREE.LineBasicMaterial).opacity = 0.95 * o;
      const echo = child.children[0] as THREE.LineLoop | undefined;
      if (echo) (echo.material as THREE.LineBasicMaterial).opacity = 0.35 * o;
    });
  });

  return <primitive object={group} />;
}

function Particles({ animate, progressRef }: { animate: boolean; progressRef: React.RefObject<number> }) {
  const { geometry, seeds } = useMemo(() => {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const seeds = new Float32Array(PARTICLE_COUNT * 3); // angle, radius, z-base
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      seeds[i * 3] = Math.random() * Math.PI * 2;
      seeds[i * 3 + 1] = 0.3 + Math.pow(Math.random(), 0.6) * 2.1;
      seeds[i * 3 + 2] = Math.random() * TUNNEL_LENGTH;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    return { geometry, seeds };
  }, []);

  const material = useMemo(
    () =>
      new THREE.PointsMaterial({
        size: 0.028,
        color: LAVENDER,
        transparent: true,
        opacity: 0.85,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true,
      }),
    [],
  );

  useEffect(() => () => {
    geometry.dispose();
    material.dispose();
  }, [geometry, material]);

  const travel = useRef(0);
  useFrame((state, delta) => {
    const t = animate ? state.clock.elapsedTime : 0;
    if (animate) travel.current += Math.min(delta, 0.05) * 1.6;
    const offset = travel.current + (progressRef.current ?? 0) * SPACING * 10;
    const pos = geometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      const z = -TUNNEL_LENGTH + (((seeds[i * 3 + 2] + offset) % TUNNEL_LENGTH) + TUNNEL_LENGTH) % TUNNEL_LENGTH + 3;
      // spiral inward as they travel: radius tightens with depth
      const depthT = (z + TUNNEL_LENGTH) / (TUNNEL_LENGTH + 3);
      const a = seeds[i * 3] + t * 0.12 + z * 0.08;
      const r = seeds[i * 3 + 1] * (0.55 + depthT * 0.45);
      const [bx, by] = bend(z, t);
      arr[i * 3] = Math.cos(a) * r + bx;
      arr[i * 3 + 1] = Math.sin(a) * r + by;
      arr[i * 3 + 2] = z;
    }
    pos.needsUpdate = true;
  });

  return <points geometry={geometry} material={material} />;
}

/** A small constellation of nodes far down the hole: the "wonderland" waiting at the end. */
function Nodes({ animate }: { animate: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const { nodes, lineGeo } = useMemo(() => {
    const nodes: [number, number, number][] = [
      [0, 0.9, 0],
      [-1.1, 0.1, 0.4],
      [1.2, 0.3, -0.3],
      [-0.5, -0.9, -0.2],
      [0.8, -0.8, 0.3],
      [0, 0, 0.8],
    ];
    const pairs = [
      [0, 1], [0, 2], [1, 3], [2, 4], [3, 4], [5, 0], [5, 3], [5, 4], [1, 5], [2, 5],
    ];
    const verts: number[] = [];
    pairs.forEach(([a, b]) => verts.push(...nodes[a], ...nodes[b]));
    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(verts, 3));
    return { nodes, lineGeo };
  }, []);

  useEffect(() => () => lineGeo.dispose(), [lineGeo]);

  useFrame((state) => {
    if (!ref.current) return;
    const t = animate ? state.clock.elapsedTime : 0;
    ref.current.rotation.y = t * 0.18;
    ref.current.rotation.x = Math.sin(t * 0.2) * 0.2;
    const s = 1 + Math.sin(t * 1.3) * 0.04;
    ref.current.scale.setScalar(s);
  });

  return (
    <group ref={ref} position={[0.3, 0.1, -11]}>
      <lineSegments geometry={lineGeo}>
        <lineBasicMaterial color={CYAN} transparent opacity={0.35} blending={THREE.AdditiveBlending} depthWrite={false} />
      </lineSegments>
      {nodes.map((p, i) => (
        <group key={i} position={p}>
          <mesh>
            <sphereGeometry args={[0.07, 12, 12]} />
            <meshBasicMaterial color={i === 5 ? CYAN : LAVENDER} />
          </mesh>
          <mesh>
            <sphereGeometry args={[0.22, 12, 12]} />
            <meshBasicMaterial
              color={i === 5 ? CYAN : VIOLET}
              transparent
              opacity={0.18}
              blending={THREE.AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function CameraRig({
  animate,
  progressRef,
  pointerRef,
}: {
  animate: boolean;
  progressRef: React.RefObject<number>;
  pointerRef: React.RefObject<{ x: number; y: number }>;
}) {
  const { camera } = useThree();
  const look = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    const p = progressRef.current ?? 0;
    const ptr = pointerRef.current ?? { x: 0, y: 0 };
    const k = animate ? 0.04 : 1;
    camera.position.x += (ptr.x * 0.7 - camera.position.x) * k;
    camera.position.y += (ptr.y * 0.45 - camera.position.y) * k;
    camera.position.z += (4.5 - p * 4 - camera.position.z) * k;
    look.set(ptr.x * -0.4, ptr.y * -0.25, -12);
    camera.lookAt(look);
  });
  return null;
}

/* ------------------------------------------------------------------ */
/* Fallback                                                            */
/* ------------------------------------------------------------------ */

export function RabbitHoleFallback({ className }: { className?: string }) {
  const rings = Array.from({ length: 9 }, (_, i) => i);
  return (
    <div
      aria-hidden
      className={twMerge("relative", className)}
      style={{
        overflow: "hidden",
        background:
          "radial-gradient(circle at 50% 50%, rgba(34,211,238,0.18) 0%, rgba(139,92,246,0.16) 18%, rgba(8,9,17,0) 60%)",
      }}
    >
      {rings.map((i) => {
        const size = 92 - i * 9.5;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              left: "50%",
              top: "50%",
              width: `${size}%`,
              aspectRatio: "1 / 1",
              transform: "translate(-50%, -50%)",
              borderRadius: "9999px",
              border: `1px solid ${i % 3 === 0 ? "rgba(34,211,238,0.28)" : "rgba(196,181,253,0.22)"}`,
              boxShadow: i % 3 === 0 ? "0 0 24px rgba(34,211,238,0.12)" : "0 0 24px rgba(139,92,246,0.10)",
              opacity: 0.35 + i * 0.07,
            }}
          />
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export interface RabbitHoleProps {
  className?: string;
  /** 0..1 depth into the hole. If omitted, derived from window scroll (first viewport). */
  progress?: number;
}

export default function RabbitHole({ className, progress }: RabbitHoleProps) {
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [visible, setVisible] = useState(true);
  const reduced = useReducedMotion();
  const container = useRef<HTMLDivElement>(null);
  const progressRef = useRef<number>(progress ?? 0);
  const pointerRef = useRef({ x: 0, y: 0 });

  useEffect(() => setWebgl(detectWebGL()), []);

  // Progress: explicit prop wins, else window scroll over first viewport.
  useEffect(() => {
    if (progress !== undefined) {
      progressRef.current = Math.min(1, Math.max(0, progress));
      return;
    }
    const onScroll = () => {
      progressRef.current = Math.min(1, Math.max(0, window.scrollY / Math.max(1, window.innerHeight)));
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [progress]);

  // Pointer: listen on window so overlaid text does not block it.
  useEffect(() => {
    if (reduced) return;
    const onMove = (e: PointerEvent) => {
      pointerRef.current = {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: -((e.clientY / window.innerHeight) * 2 - 1),
      };
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduced]);

  // Pause rendering when off-screen.
  useEffect(() => {
    const el = container.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [webgl]);

  if (webgl === false) return <RabbitHoleFallback className={className} />;

  const animate = !reduced;
  const frameloop = !visible ? "never" : animate ? "always" : "demand";

  return (
    <div ref={container} className={twMerge("relative", className)} aria-hidden>
      {webgl && (
        <GLErrorBoundary fallback={<RabbitHoleFallback className="absolute inset-0" />}>
          <Canvas
            dpr={[1, 1.75]}
            frameloop={frameloop}
            camera={{ position: [0, 0, 4.5], fov: 62, near: 0.1, far: 60 }}
            gl={{ antialias: true, alpha: true, powerPreference: "high-performance" }}
            style={{ position: "absolute", inset: 0 }}
          >
            <fog attach="fog" args={["#080911", 12, 30]} />
            <Tunnel animate={animate} progressRef={progressRef} />
            <Particles animate={animate} progressRef={progressRef} />
            <Nodes animate={animate} />
            <CameraRig animate={animate} progressRef={progressRef} pointerRef={pointerRef} />
          </Canvas>
        </GLErrorBoundary>
      )}
    </div>
  );
}
