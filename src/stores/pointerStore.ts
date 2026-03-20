import { create } from 'zustand';
import type { ClientRole, PointerSource } from '../types/sync';

export interface InputPointer {
  key: string;
  pointerId: number;
  normalizedX: number;
  normalizedY: number;
  isDown: boolean;
  timestamp: number;
  source: PointerSource;
  sourceRole: ClientRole;
  roomId?: string;
}

interface PointerStoreState {
  pointers: Record<string, InputPointer>;
  upsertPointer: (pointer: InputPointer) => void;
  removePointer: (key: string) => void;
  clearPointersBySource: (source: PointerSource) => void;
  clearAllPointers: () => void;
}

export const createPointerKey = (source: PointerSource, pointerId: number): string => `${source}:${pointerId}`;

export const usePointerStore = create<PointerStoreState>((set) => ({
  pointers: {},
  upsertPointer: (pointer) =>
    set((state) => ({
      pointers: {
        ...state.pointers,
        [pointer.key]: pointer,
      },
    })),
  removePointer: (key) =>
    set((state) => {
      const nextPointers = { ...state.pointers };
      delete nextPointers[key];
      return { pointers: nextPointers };
    }),
  clearPointersBySource: (source) =>
    set((state) => ({
      pointers: Object.fromEntries(Object.entries(state.pointers).filter(([, pointer]) => pointer.source !== source)),
    })),
  clearAllPointers: () => set({ pointers: {} }),
}));
