import { useMemo, useState } from "react";
import { Html } from "@react-three/drei";
import type { TraceResponse, DPStep } from "../../types";
import type { ReplayState } from "../../lib/replay";

/**
 * Recursion-tree archetype (brute force): nodes = calls, edges = recursive
 * branches. Duplicate subtrees render red — the visual motivation for memo.
 */
export function TreeView({
  trace,
  replayState,
  currentStep,
}: {
  trace: TraceResponse;
  replayState: ReplayState;
  currentStep: DPStep | null;
}) {
  const [hovered, setHovered] = useState<{ info: string } | null>(null);
  const playhead = currentStep?.stepIndex ?? -1;

  // ---- layout: in-order leaf slots; parents centered over children ----
  const layout = useMemo(() => {
    const pos = new Map<number, [number, number, number]>();
    let leafCursor = 0;

    const childrenOf = (id: number) => replayState.tree.children.get(id) ?? [];
    const place = (id: number, depth: number): number => {
      const kids = childrenOf(id);
      let x: number;
      if (kids.length === 0) {
        x = leafCursor++;
      } else {
        const xs = kids.map((k) => place(k, depth + 1));
        x = (Math.min(...xs) + Math.max(...xs)) / 2;
      }
      const z = ((id % 7) - 3) * 0.45;
      pos.set(id, [x, -depth * 1.15, z]);
      return x;
    };

    for (const rootId of replayState.tree.order.filter(
      (id) => replayState.tree.nodes.get(id)?.parentCallId === undefined,
    ))
      place(rootId, 0);
    return pos;
  }, [replayState]);

  // nodes revealed so far (call happened at or before the playhead)
  const visibleIds = useMemo(
    () =>
      replayState.tree.order.filter(
        (id) => (replayState.tree.nodes.get(id)?.callAt ?? Infinity) <= playhead,
      ),
    [replayState, playhead],
  );

  const edges = useMemo(() => {
    const dupEdges: [number[], number[]][] = [];
    const normalEdges: [number[], number[]][] = [];
    for (const id of visibleIds) {
      const node = replayState.tree.nodes.get(id)!;
      if (node.parentCallId === undefined) continue;
      const pa = layout.get(node.parentCallId);
      const pb = layout.get(id);
      if (!pa || !pb) continue;
      (node.dup ? dupEdges : normalEdges).push([pa, pb]);
    }
    return { dupEdges, normalEdges };
  }, [visibleIds, layout, replayState]);

  const bounds = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = 0;
    for (const [, [x, y]] of layout) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
    }
    return { width: Math.max(maxX - minX, 6), minY };
  }, [layout]);

  const centerX = bounds.width / 2;

  return (
    <group position={[-centerX, -1.4, 0]}>
      <EdgeSet pairs={edges.normalEdges} color="#334155" opacity={0.8} />
      <EdgeSet pairs={edges.dupEdges} color="#f43f5e" opacity={0.6} />

      {visibleIds.map((id) => {
        const node = replayState.tree.nodes.get(id)!;
        const p = layout.get(id);
        if (!p) return null;
        const hasValue = node.value !== undefined;
        const color = node.dup ? "#f43f5e" : hasValue ? "#818CF8" : "#475569";
        return (
          <mesh
            key={id}
            position={p}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHovered({
                info: `f(${node.coords.join(",")})${hasValue ? ` = ${String(node.value)}` : ""}${
                  node.dup ? " · DUPLICATE subtree" : ""
                }`,
              });
            }}
            onPointerOut={() => setHovered(null)}
          >
            <sphereGeometry args={[node.dup ? 0.18 : 0.14, 16, 16]} />
            <meshLambertMaterial
              color={color}
              emissive={color}
              emissiveIntensity={node.dup ? 0.55 : 0.3}
            />
          </mesh>
        );
      })}

      {hovered && (
        <Html position={[0, 1.7, 0]} center>
          <div className="pointer-events-none whitespace-nowrap rounded-md border border-accent/40 bg-black/85 px-2 py-1 font-mono text-[10px] text-slate-200">
            {hovered.info}
          </div>
        </Html>
      )}
    </group>
  );
}

function EdgeSet({
  pairs,
  color,
  opacity,
}: {
  pairs: [number[], number[]][];
  color: string;
  opacity: number;
}) {
  if (pairs.length === 0) return null;
  const positions = new Float32Array(pairs.flatMap(([a, b]) => [...a, ...b]));
  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <lineBasicMaterial color={color} transparent opacity={opacity} />
    </lineSegments>
  );
}
