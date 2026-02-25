import { create } from 'zustand';
import { atom } from 'jotai';

/**
 * THE ORCHESTRATOR: Handles the heavy Emulator state.
 */
interface FriscyStore {
  isRunning: boolean;
  exitCode: number | null;
  jitStats: any;
  lastChunk: string;
  history: string[];
  setReady: (ready: boolean) => void;
  setExitStatus: (code: number) => void;
  setJitStats: (stats: any) => void;
  appendHistory: (text: string) => void;
}

export const useWasmStore = create<FriscyStore>((set) => ({
  isRunning: false,
  exitCode: null,
  jitStats: null,
  lastChunk: '',
  history: [],
  setReady: (isRunning) => set({ isRunning }),
  setExitStatus: (exitCode) => set({ exitCode, isRunning: false }),
  setJitStats: (jitStats) => set({ jitStats }),
  appendHistory: (lastChunk) => set((state) => ({
    lastChunk,
    history: [...state.history, ...lastChunk.split('\n').filter(Boolean)],
  })),
}));

/**
 * THE FRAGMENTS: For UI-only reactivity.
 */
export const isJitEnabledAtom = atom(true);
export const terminalThemeAtom = atom('dark');
export const terminalSearchAtom = atom('');

export const filteredHistoryAtom = atom((get) => {
  const search = get(terminalSearchAtom);
  const history = useWasmStore.getState().history;
  if (!search) return history;
  return history.filter((line) => line.toLowerCase().includes(search.toLowerCase()));
});

// Derived Atom: Calculate JIT efficiency without touching the heavy store
export const jitEfficiencyAtom = atom((get) => {
  const stats = useWasmStore.getState().jitStats;
  if (!stats) return 0;
  const total = stats.jitHits + stats.jitMisses;
  return total > 0 ? (stats.jitHits / total) * 100 : 0;
});
