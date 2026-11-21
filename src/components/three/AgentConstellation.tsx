"use client";
/* eslint-disable react-hooks/immutability, react-hooks/purity, react-hooks/set-state-in-effect --
   Three.js scene objects are intentionally mutated inside useFrame; seeded randomness lives in useMemo. */

import {
  Component,
  useEffect,
  useMemo,
  useRef,
  useState,
  type JSX,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import * as THREE from "three";

/* ------------------------------------------------------------------ */
/* Public contract                                                     */
/* ------------------------------------------------------------------ */

export type AgentKey = "EXPLORER" | "INVESTIGATOR" | "ENGINEER" | "VERIFIER" | "PUBLISHER";
export type AgentNodeState = "idle" | "running" | "completed" | "failed" | "waiting";
export interface AgentConstellationProps {
  states: Partial<Record<AgentKey, AgentNodeState>>;
  activeEdge?: [AgentKey, AgentKey] | null; // animate a pulse along this connection
  onSelect?: (agent: AgentKey) => void;
  selected?: AgentKey | null;
  className?: string;
  height?: number; // px, default 320
}

export const AGENT_KEYS: AgentKey[] = ["EXPLORER", "INVESTIGATOR", "ENGINEER", "VERIFIER", "PUBLISHER"];

export const AGENT_LABELS: Record<AgentKey, string> = {
  EXPLORER: "Explorer",
  INVESTIGATOR: "Investigator",
  ENGINEER: "Engineer",
  VERIFIER: "Verifier",
  PUBLISHER: "GitHub Publisher",
};

/** Edges of the agent graph. The last one is the repair loop (Verifier sends work back to Engineer). */
export const AGENT_EDGES: [AgentKey, AgentKey][] = [
  ["EXPLORER", "INVESTIGATOR"],
  ["INVESTIGATOR", "ENGINEER"],
  ["ENGINEER", "VERIFIER"],
  ["VERIFIER", "PUBLISHER"],
  ["VERIFIER", "ENGINEER"],
];

const STATE_LABEL: Record<AgentNodeState, string> = {
  idle: "Idle",
  running: "Running",
  completed: "Completed",
  failed: "Failed",
  waiting: "Waiting",
};

const STATE_COLOR: Record<AgentNodeState, string> = {
  idle: "#565b7a",
  running: "#c4b5fd",
  completed: "#34d399",
  failed: "#fb7185",
  waiting: "#fbbf24",
};

const HALO_COLOR: Record<AgentNodeState, string> = {
  idle: "#3b3f5c",
  running: "#8b5cf6",
  completed: "#34d399",
  failed: "#fb7185",
  waiting: "#fbbf24",
};

const POSITIONS: Record<AgentKey, [number, number, number]> = {
  EXPLORER: [-3.3, 0.35, -0.7],
  INVESTIGATOR: [-1.65, -0.3, 0.35],
  ENGINEER: [0, 0.3, 0.8],
  VERIFIER: [1.65, -0.3, 0.35],
  PUBLISHER: [3.3, 0.35, -0.7],
};

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

function isRepairLoop(a: AgentKey, b: AgentKey) {
  return a === "VERIFIER" && b === "ENGINEER";
}

function edgeCurve(a: AgentKey, b: AgentKey): THREE.QuadraticBezierCurve3 {
  const pa = new THREE.Vector3(...POSITIONS[a]);
  const pb = new THREE.Vector3(...POSITIONS[b]);
  const mid = pa.clone().add(pb).multiplyScalar(0.5);
  if (isRepairLoop(a, b)) mid.add(new THREE.Vector3(0, -1.35, 0.4));
  else mid.add(new THREE.Vector3(0, 0.18, 0.15));
  return new THREE.QuadraticBezierCurve3(pa, mid, pb);
}

/* ------------------------------------------------------------------ */
/* 3D pieces                                                           */
/* ------------------------------------------------------------------ */

function Edge({ from, to, active, animate }: { from: AgentKey; to: AgentKey; active: boolean; animate: boolean }) {
  const curve = useMemo(() => edgeCurve(from, to), [from, to]);
  const line = useMemo(() => {
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
    const loop = isRepairLoop(from, to);
    const mat = loop
      ? new THREE.LineDashedMaterial({
          color: "#fbbf24",
          dashSize: 0.12,
          gapSize: 0.09,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
        })
      : new THREE.LineBasicMaterial({
          color: "#8b5cf6",
          transparent: true,
          opacity: 0.4,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        });
    const l = new THREE.Line(geo, mat);
    if (loop) l.computeLineDistances();
    return l;
  }, [curve, from, to]);

  useEffect(
    () => () => {
      line.geometry.dispose();
      (line.material as THREE.Material).dispose();
    },
    [line],
  );

  useEffect(() => {
    const mat = line.material as THREE.LineBasicMaterial;
    mat.opacity = active ? 0.95 : 0.32;
    if (!isRepairLoop(from, to)) mat.color.set(active ? "#22d3ee" : "#8b5cf6");
  }, [active, line, from, to]);

  const pulse = useRef<THREE.Group>(null);
  useFrame((state) => {
    if (!pulse.current) return;
    if (!active) {
      pulse.current.visible = false;
      return;
    }
    pulse.current.visible = true;
    const t = animate ? (state.clock.elapsedTime * 0.6) % 1 : 0.5;
    pulse.current.position.copy(curve.getPoint(t));
  });

  return (
    <>
      <primitive object={line} />
      <group ref={pulse} visible={false}>
        <mesh>
          <sphereGeometry args={[0.06, 12, 12]} />
          <meshBasicMaterial color="#e0fbff" />
        </mesh>
        <mesh>
          <sphereGeometry args={[0.18, 12, 12]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.3} blending={THREE.AdditiveBlending} depthWrite={false} />
        </mesh>
      </group>
    </>
  );
}

function Node({
  agent,
  state,
  selected,
  hovered,
  onHover,
  onSelect,
  animate,
  register,
}: {
  agent: AgentKey;
  state: AgentNodeState;
  selected: boolean;
  hovered: boolean;
  onHover: (a: AgentKey | null) => void;
  onSelect?: (a: AgentKey) => void;
  animate: boolean;
  register: (a: AgentKey, o: THREE.Object3D | null) => void;
}) {
  const halo = useRef<THREE.Mesh>(null);
  const ring = useRef<THREE.Mesh>(null);
  const core = useRef<THREE.Mesh>(null);

  useFrame((s) => {
    const t = animate ? s.clock.elapsedTime : 0;
    if (halo.current) {
      const m = halo.current.material as THREE.MeshBasicMaterial;
      let scale = 1;
      let opacity = 0.12;
      if (state === "running") {
        scale = 1 + Math.sin(t * 3.2) * 0.18;
        opacity = 0.32 + Math.sin(t * 3.2) * 0.1;
      } else if (state === "completed") opacity = 0.22;
      else if (state === "failed") opacity = 0.26;
      else if (state === "waiting") opacity = 0.12 + (Math.sin(t * 1.2) + 1) * 0.03;
      if (hovered || selected) opacity += 0.08;
      halo.current.scale.setScalar(scale);
      m.opacity = opacity;
    }
    if (ring.current) {
      ring.current.rotation.z = t * (state === "running" ? 1.6 : 0.3);
      ring.current.rotation.x = Math.PI / 2.4 + Math.sin(t * 0.7) * 0.15;
    }
    if (core.current) {
      const target = hovered ? 1.18 : 1;
      core.current.scale.lerp(new THREE.Vector3(target, target, target), animate ? 0.15 : 1);
    }
  });

  const dim = state === "idle";
  const handleOver = (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    onHover(agent);
    document.body.style.cursor = onSelect ? "pointer" : "default";
  };
  const handleOut = () => {
    onHover(null);
    document.body.style.cursor = "";
  };

  return (
    <group position={POSITIONS[agent]} ref={(o) => register(agent, o)}>
      <mesh
        ref={core}
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(agent);
        }}
      >
        <sphereGeometry args={[0.2, 24, 24]} />
        <meshBasicMaterial color={STATE_COLOR[state]} transparent opacity={dim ? 0.7 : state === "waiting" ? 0.75 : 1} />
      </mesh>
      {/* invisible larger hit target */}
      <mesh
        onPointerOver={handleOver}
        onPointerOut={handleOut}
        onClick={(e) => {
          e.stopPropagation();
          onSelect?.(agent);
        }}
      >
        <sphereGeometry args={[0.42, 12, 12]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
      <mesh ref={halo} raycast={() => null}>
        <sphereGeometry args={[0.42, 20, 20]} />
        <meshBasicMaterial
          color={HALO_COLOR[state]}
          transparent
          opacity={0.15}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      <mesh ref={ring} raycast={() => null}>
        <torusGeometry args={[0.34, 0.008, 6, 64]} />
        <meshBasicMaterial
          color={state === "running" ? "#22d3ee" : STATE_COLOR[state]}
          transparent
          opacity={dim ? 0.25 : 0.7}
          blending={THREE.AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
      {selected && (
        <mesh raycast={() => null}>
          <torusGeometry args={[0.5, 0.012, 6, 64]} />
          <meshBasicMaterial color="#22d3ee" transparent opacity={0.9} />
        </mesh>
      )}
    </group>
  );
}

/** Projects node positions to screen space each frame and moves the DOM labels (cheaper and sturdier than drei Html). */
function LabelProjector({
  nodes,
  labels,
}: {
  nodes: React.RefObject<Map<AgentKey, THREE.Object3D>>;
  labels: React.RefObject<Map<AgentKey, HTMLDivElement>>;
}) {
  const { camera, size } = useThree();
  const v = useMemo(() => new THREE.Vector3(), []);
  useFrame(() => {
    nodes.current?.forEach((obj, key) => {
      const el = labels.current?.get(key);
      if (!el) return;
      obj.getWorldPosition(v);
      v.y -= 0.5;
      v.project(camera);
      const x = (v.x * 0.5 + 0.5) * size.width;
      const y = (-v.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, 0)`;
      el.style.opacity = "1";
    });
  });
  return null;
}

/** Zooms out on narrow canvases so the whole arc (and its labels) stays in frame. */
function FitCamera() {
  const { camera, size } = useThree();
  useEffect(() => {
    const aspect = size.width / Math.max(1, size.height);
    const cam = camera as THREE.PerspectiveCamera;
    cam.zoom = Math.min(1, (aspect * 6.4) / 8.6);
    cam.updateProjectionMatrix();
  }, [camera, size.width, size.height]);
  return null;
}

function Swayer({ animate, children }: { animate: boolean; children: ReactNode }) {
  const ref = useRef<THREE.Group>(null);
  useFrame((s) => {
    if (!ref.current) return;
    const t = animate ? s.clock.elapsedTime : 0;
    ref.current.rotation.y = Math.sin(t * 0.18) * 0.2;
    ref.current.position.y = Math.sin(t * 0.5) * 0.05;
  });
  return <group ref={ref}>{children}</group>;
}

function Starfield() {
  const geo = useMemo(() => {
    const n = 160;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 14;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 6;
      arr[i * 3 + 2] = -2 - Math.random() * 6;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(arr, 3));
    return g;
  }, []);
  useEffect(() => () => geo.dispose(), [geo]);
  return (
    <points geometry={geo}>
      <pointsMaterial size={0.03} color="#c4b5fd" transparent opacity={0.5} depthWrite={false} />
    </points>
  );
}

/* ------------------------------------------------------------------ */
/* 2D fallback                                                         */
/* ------------------------------------------------------------------ */

const SVG_POS: Record<AgentKey, [number, number]> = {
  EXPLORER: [70, 100],
  INVESTIGATOR: [195, 135],
  ENGINEER: [320, 110],
  VERIFIER: [445, 135],
  PUBLISHER: [570, 100],
};

function svgPath(a: AgentKey, b: AgentKey) {
  const [x1, y1] = SVG_POS[a];
  const [x2, y2] = SVG_POS[b];
  const mx = (x1 + x2) / 2;
  const my = isRepairLoop(a, b) ? Math.max(y1, y2) + 80 : (y1 + y2) / 2 - 12;
  return `M ${x1} ${y1} Q ${mx} ${my} ${x2} ${y2}`;
}

export function AgentConstellationFallback({
  states,
  activeEdge,
  onSelect,
  selected,
  className,
  height = 320,
}: AgentConstellationProps) {
  const isActive = (a: AgentKey, b: AgentKey) => !!activeEdge && activeEdge[0] === a && activeEdge[1] === b;
  return (
    <div className={className} style={{ height, position: "relative" }}>
      <svg viewBox="0 0 640 240" width="100%" height="100%" role="group" aria-label="Agent network">
        {AGENT_EDGES.map(([a, b]) => {
          const loop = isRepairLoop(a, b);
          const active = isActive(a, b);
          return (
            <path
              key={`${a}-${b}`}
              d={svgPath(a, b)}
              fill="none"
              stroke={active ? "#22d3ee" : loop ? "#fbbf24" : "#8b5cf6"}
              strokeOpacity={active ? 0.95 : 0.4}
              strokeWidth={active ? 2 : 1.25}
              strokeDasharray={loop ? "5 4" : undefined}
            />
          );
        })}
        {AGENT_KEYS.map((k) => {
          const s = states[k] ?? "idle";
          const [x, y] = SVG_POS[k];
          const isSel = selected === k;
          const onKey = (e: KeyboardEvent<SVGGElement>) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onSelect?.(k);
            }
          };
          return (
            <g
              key={k}
              role={onSelect ? "button" : undefined}
              tabIndex={onSelect ? 0 : undefined}
              aria-label={`${AGENT_LABELS[k]}: ${STATE_LABEL[s]}`}
              aria-pressed={onSelect ? isSel : undefined}
              onClick={() => onSelect?.(k)}
              onKeyDown={onKey}
              style={{ cursor: onSelect ? "pointer" : "default", outline: "none" }}
            >
              <circle cx={x} cy={y} r={22} fill={HALO_COLOR[s]} fillOpacity={s === "running" ? 0.3 : 0.14} />
              {isSel && <circle cx={x} cy={y} r={27} fill="none" stroke="#22d3ee" strokeWidth={1.5} />}
              <circle cx={x} cy={y} r={9} fill={STATE_COLOR[s]} fillOpacity={s === "idle" ? 0.7 : 1} />
              <text
                x={x}
                y={y + 44}
                textAnchor="middle"
                fontSize={10}
                fill={s === "idle" ? "#94a3b8" : "#f8fafc"}
                style={{ fontFamily: "var(--font-geist-mono), monospace", letterSpacing: "0.04em" }}
              >
                {AGENT_LABELS[k].toUpperCase()}
              </text>
              <text x={x} y={y + 58} textAnchor="middle" fontSize={9} fill={STATE_COLOR[s]}>
                {STATE_LABEL[s]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Component                                                           */
/* ------------------------------------------------------------------ */

export default function AgentConstellation(props: AgentConstellationProps): JSX.Element {
  const { states, activeEdge = null, onSelect, selected = null, className, height = 320 } = props;
  const [webgl, setWebgl] = useState<boolean | null>(null);
  const [visible, setVisible] = useState(true);
  const [hovered, setHovered] = useState<AgentKey | null>(null);
  const reduced = useReducedMotion();
  const container = useRef<HTMLDivElement>(null);
  const nodeObjs = useRef(new Map<AgentKey, THREE.Object3D>());
  const labelEls = useRef(new Map<AgentKey, HTMLDivElement>());
  const register = useMemo(
    () => (a: AgentKey, o: THREE.Object3D | null) => {
      if (o) nodeObjs.current.set(a, o);
      else nodeObjs.current.delete(a);
    },
    [],
  );

  useEffect(() => setWebgl(detectWebGL()), []);

  useEffect(() => {
    const el = container.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, [webgl]);

  useEffect(() => () => {
    document.body.style.cursor = "";
  }, []);

  if (webgl === false) return <AgentConstellationFallback {...props} />;

  const animate = !reduced;
  const summary = AGENT_KEYS.map((k) => `${AGENT_LABELS[k]} ${STATE_LABEL[states[k] ?? "idle"]}`).join(", ");

  return (
    <div
      ref={container}
      className={className}
      style={{ height, position: "relative", touchAction: "pan-y" }}
      role="img"
      aria-label={`Agent network: ${summary}`}
    >
      {webgl && (
        <GLErrorBoundary fallback={<AgentConstellationFallback {...props} className={undefined} />}>
          <Canvas
            dpr={[1, 1.75]}
            frameloop={!visible ? "never" : animate ? "always" : "demand"}
            camera={{ position: [0, 0.5, 6.4], fov: 50 }}
            gl={{ antialias: true, alpha: true }}
            style={{ position: "absolute", inset: 0 }}
            onPointerMissed={() => setHovered(null)}
          >
            <Swayer animate={animate}>
              <Starfield />
              {AGENT_EDGES.map(([a, b]) => (
                <Edge
                  key={`${a}-${b}`}
                  from={a}
                  to={b}
                  animate={animate}
                  active={!!activeEdge && activeEdge[0] === a && activeEdge[1] === b}
                />
              ))}
              {AGENT_KEYS.map((k) => (
                <Node
                  key={k}
                  agent={k}
                  state={states[k] ?? "idle"}
                  selected={selected === k}
                  hovered={hovered === k}
                  onHover={setHovered}
                  onSelect={onSelect}
                  animate={animate}
                  register={register}
                />
              ))}
            </Swayer>
            <OrbitControls
              enableZoom={false}
              enablePan={false}
              enableDamping
              rotateSpeed={0.5}
              minAzimuthAngle={-0.9}
              maxAzimuthAngle={0.9}
              minPolarAngle={Math.PI / 2 - 0.5}
              maxPolarAngle={Math.PI / 2 + 0.35}
            />
            <FitCamera />
            <LabelProjector nodes={nodeObjs} labels={labelEls} />
          </Canvas>
          <div aria-hidden style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "hidden" }}>
            {AGENT_KEYS.map((k) => {
              const st = states[k] ?? "idle";
              const isHover = hovered === k;
              const dim = st === "idle";
              return (
                <div
                  key={k}
                  ref={(el) => {
                    if (el) labelEls.current.set(k, el);
                    else labelEls.current.delete(k);
                  }}
                  style={{
                    position: "absolute",
                    left: 0,
                    top: 0,
                    opacity: 0,
                    whiteSpace: "nowrap",
                    fontFamily: "var(--font-geist-mono), ui-monospace, monospace",
                    fontSize: isHover ? 11 : 10,
                    letterSpacing: "0.04em",
                    textTransform: "uppercase",
                    color: dim ? "#94a3b8" : "#f8fafc",
                    padding: isHover ? "4px 8px" : "2px 6px",
                    borderRadius: 6,
                    background: isHover ? "rgba(17,19,33,0.94)" : "rgba(8,9,17,0.55)",
                    border: `1px solid ${isHover || selected === k ? "rgba(196,181,253,0.35)" : "rgba(196,181,253,0.1)"}`,
                    textAlign: "center",
                    zIndex: isHover ? 2 : 1,
                    willChange: "transform",
                  }}
                >
                  {AGENT_LABELS[k]}
                  {isHover && (
                    <span style={{ display: "block", color: STATE_COLOR[st], fontSize: 10, marginTop: 2 }}>
                      ● {STATE_LABEL[st]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </GLErrorBoundary>
      )}
    </div>
  );
}
