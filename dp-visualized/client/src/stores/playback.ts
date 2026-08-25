import { create } from "zustand";
import type { DPStep, TraceResponse } from "../types";

interface PlaybackState {
  traceId: string;
  steps: DPStep[];
  meta: TraceResponse["meta"] | null;
  index: number;
  playing: boolean;
  /** multiplier: 0.25 .. 4 */
  speed: number;
  loadTrace: (t: TraceResponse) => void;
  clear: () => void;
  play: () => void;
  pause: () => void;
  toggle: () => void;
  forward: () => void;
  back: () => void;
  reset: () => void;
  setIndex: (i: number) => void;
  setSpeed: (s: number) => void;
}

export const usePlayback = create<PlaybackState>((set, get) => ({
  traceId: "",
  steps: [],
  meta: null,
  index: -1,
  playing: false,
  speed: 1,
  loadTrace: (t) =>
    set({
      traceId: `${t.slug}:${t.meta.mode}:${t.meta.stats.steps}`,
      steps: t.steps,
      meta: t.meta,
      index: -1,
      playing: false,
    }),
  clear: () => set({ traceId: "", steps: [], meta: null, index: -1, playing: false }),
  play: () => set((s) => (s.steps.length ? { playing: true } : {})),
  pause: () => set({ playing: false }),
  toggle: () =>
    set((s) => {
      if (!s.steps.length) return {};
      if (!s.playing && s.index >= s.steps.length - 1) return { playing: true, index: -1 };
      return { playing: !s.playing };
    }),
  forward: () => {
    const { index, steps } = get();
    if (index < steps.length - 1) set({ index: index + 1 });
    else set({ playing: false });
  },
  back: () => set((s) => ({ index: Math.max(-1, s.index - 1), playing: false })),
  reset: () => set({ index: -1, playing: false }),
  setIndex: (i) => set({ index: i, playing: false }),
  setSpeed: (speed) => set({ speed }),
}));
