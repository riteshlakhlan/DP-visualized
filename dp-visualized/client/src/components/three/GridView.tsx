import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { ThreeEvent } from "@react-three/fiber";
import type { TraceResponse, DPStep } from "../../types";
import type { ReplayState } from "../../lib/replay";

const COLORS = {
  unvisited: new THREE.Color("#1c2130"),
  knownTrue: new THREE.Color("#22C55E"),
  knownFalse: new THREE.Color("#3b4256"),
  active: new THREE.Color("#818CF8"),
  dep: new THREE.Color("#a5b4fc"),
  stale: new THREE.Color("#12151d"),
};

/**
 * DP-table archetype: instanced cubes on the XZ plane.
 * Height (Y) eases toward the cell's value; color = unvisited / being-computed /
 * dependency / known. Rolling-window traces dim rows outside the window.
 */
export function GridView({
  trace,
  replayState,
}: {
  trace: TraceResponse;
  replayState: ReplayState;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const [hovered, setHovered] = useState<{ coord: number[]; info: string } | null>(null);

  const targets = useRef<Float32Array>(new Float32Array(0));
  const current = useRef<Float32Array>(new Float32Array(0));
  const colorTargets = useRef<Float32Array>(new Float32Array(0));
  const dirty = useRef(true);

  const { rows, cols } = trace.meta.tableShape!;
  const count = rows * cols;

  // write-step lookup for tooltips
  const writeSteps = useMemo(() => {
    const m = new Map<string, DPStep>();
    for (const s of trace.steps) if (s.type === "table-write") m.set(s.coordinates.join(","), s);
    return m;
  }, [trace]);

  const maxAbs = useMemo(() => {
    let mx = 1;
    for (const [, c] of replayState.cells) {
      if (typeof c.value === "number" && Math.abs(c.value) < 90000) mx = Math.max(mx, Math.abs(c.value));
    }
    return mx;
  }, [replayState]);

  // center the grid under the camera
  const offsetX = ((cols - 1) / -2) * 1.05;
  const offsetZ = ((rows - 1) / -2) * 1.05;

  const rollingRows = useMemo(() => {
    const s = new Set<number>();
    if (trace.meta.rollingWindow && replayState.activeCoord) {
      const ar = Number(replayState.activeCoord.split(",")[0]);
      s.add(ar);
      s.add(ar - 1);
    }
    return s;
  }, [trace.meta.rollingWindow, replayState.activeCoord]);

  function targetHeight(v: number | boolean | undefined): number {
    if (v === undefined) return 0.06;
    if (typeof v === "boolean") return v ? 0.85 : 0.12;
    if (!Number.isFinite(v) || Math.abs(v) > 90000) return 0.08;
    return 0.12 + (Math.abs(v) / maxAbs) * 1.15;
  }

  // Recompute per-cell targets whenever the playhead moves (cheap: <= ~500 cells).
  useLayoutEffect(() => {
    if (targets.current.length !== count) {
      targets.current = new Float32Array(count).fill(0.06);
      current.current = new Float32Array(count).fill(0.001);
      colorTargets.current = new Float32Array(count * 3);
    }
    const color = new THREE.Color();
    let i = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++, i++) {
        const key = `${r},${c}`;
        const cell = replayState.cells.get(key);
        const isActive = replayState.activeCoord === key;
        const isDep = !isActive && replayState.deps.includes(key);
        const known = cell !== undefined && cell.value !== undefined;

        targets.current[i] = targetHeight(cell?.value);

        if (isActive) color.copy(COLORS.active);
        else if (isDep) color.copy(COLORS.dep).multiplyScalar(0.85);
        else if (known && typeof cell?.value === "boolean")
          color.copy(cell.value ? COLORS.knownTrue : COLORS.knownFalse);
        else if (known) color.copy(COLORS.knownTrue).multiplyScalar(0.9);
        else color.copy(COLORS.unvisited);

        if (trace.meta.rollingWindow && rollingRows.size > 0 && !rollingRows.has(r))
          color.lerp(COLORS.stale, 0.78);

        colorTargets.current[i * 3] = color.r;
        colorTargets.current[i * 3 + 1] = color.g;
        colorTargets.current[i * 3 + 2] = color.b;
      }
    }
    dirty.current = true;
  });

  // Continuous easing: heights/colors glide instead of snapping.
  const mat = useMemo(() => new THREE.Matrix4(), []);
  const col = useMemo(() => new THREE.Color(), []);
  useFrame((_, delta) => {
    const mesh = meshRef.current;
    if (!mesh || !dirty.current) return;
    const k = Math.min(1, delta * 9);
    let settled = true;
    for (let i = 0; i < count; i++) {
      const t = targets.current[i];
      const cur = (current.current[i] += (t - current.current[i]) * k);
      if (Math.abs(t - cur) > 0.004) settled = false;
      else current.current[i] = t;

      const r = Math.floor(i / cols);
      const c = i % cols;
      mat.makeScale(0.92, Math.max(cur, 0.02), 0.92);
      mat.setPosition(c * 1.05 + offsetX, Math.max(cur, 0.02) / 2, r * 1.05 + offsetZ);
      mesh.setMatrixAt(i, mat);

      const j = i * 3;
      col.setRGB(colorTargets.current[j], colorTargets.current[j + 1], colorTargets.current[j + 2]);
      mesh.setColorAt(i, col);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    if (settled) dirty.current = false;
  });

  return (
    <group>
      {/* axis labels */}
      <Html position={[offsetX - 0.9, 0.2, offsetZ + rows * 1.05]} center>
        <div className="pointer-events-none whitespace-nowrap rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
          cols → {trace.meta.axisLabels?.colsTitle}
        </div>
      </Html>
      <Html position={[offsetX + cols * 1.05, 0.2, offsetZ - 0.7]} center>
        <div className="pointer-events-none whitespace-nowrap rounded bg-black/60 px-1.5 py-0.5 font-mono text-[10px] text-slate-400">
          rows ↓ {trace.meta.axisLabels?.rowsTitle}
        </div>
      </Html>

      <instancedMesh
        ref={meshRef}
        args={[undefined, undefined, count]}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          e.stopPropagation();
          const id = e.instanceId;
          if (id === undefined || id === null) {
            setHovered(null);
            return;
          }
          const r = Math.floor(id / cols);
          const c = id % cols;
          const step = writeSteps.get(`${r},${c}`);
          setHovered({ coord: [r, c], info: step ? step.explanation : "unvisited" });
        }}
        onPointerOut={() => setHovered(null)}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshLambertMaterial />
      </instancedMesh>

      {hovered && (
        <Html position={[0, 2.2, 0]} center>
          <div className="max-w-xs pointer-events-none rounded-md border border-accent/40 bg-black/85 p-2 font-mono text-[10px] leading-relaxed text-slate-200">
            <span className="text-accent">dp[{hovered.coord.join(",")}]</span> — {hovered.info}
          </div>
        </Html>
      )}
    </group>
  );
}
