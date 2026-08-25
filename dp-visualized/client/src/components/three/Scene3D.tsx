import { Suspense } from "react";
import { Canvas } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { GridView } from "./GridView";
import { TreeView } from "./TreeView";
import type { TraceResponse, DPStep } from "../../types";
import type { ReplayState } from "../../lib/replay";

/**
 * The 3D renderer consumes the exact same DPStep[] trace as the Table View.
 * Mode mapping:
 *   bruteforce            -> recursion-tree scene
 *   memo/tabulation/space -> DP-table scene (instanced cubes)
 */
export default function Scene3D({
  trace,
  replayState,
  currentStep,
}: {
  trace: TraceResponse;
  replayState: ReplayState;
  currentStep: DPStep | null;
}) {
  const isTree = trace.meta.tableShape === null;

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-line bg-[#0b0d13]">
      <Canvas dpr={[1, 1.75]} camera={{ position: [10, 10, 14], fov: 42 }} shadows={false}>
        <color attach="background" args={["#0b0d13"]} />
        <ambientLight intensity={0.75} />
        <directionalLight position={[8, 14, 6]} intensity={0.9} />
        <directionalLight position={[-6, 8, -8]} intensity={0.25} />
        <Suspense fallback={null}>
          {isTree ? (
            <TreeView trace={trace} replayState={replayState} currentStep={currentStep} />
          ) : (
            <GridView trace={trace} replayState={replayState} />
          )}
        </Suspense>
        <gridHelper args={[40, 40, "#1c2231", "#141926"]} position={[0, -0.02, 0]} />
        <OrbitControls makeDefault enableDamping dampingFactor={0.12} maxDistance={80} minDistance={3} />
      </Canvas>
      {!isTree && trace.meta.tableShape && trace.meta.tableShape.rows > 12 && (
        <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/50 px-2 py-1 font-mono text-[10px] text-slate-400">
          large grid — drag to orbit, scroll to zoom
        </div>
      )}
    </div>
  );
}
