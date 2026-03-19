import { create } from 'zustand';

export interface AppState {
  resolution: string;
  width: number;
  height: number;
  seed: number;
  particleCount: number;
  flowSpeed: number;
  noiseScale: number;
  trailPersistence: number;
  vortexStrength: number;
  vortexRange: number;
  clickRepulsion: number;
  particleSize: number;
  useImageColors: boolean;
  imageUrl: string | null;
  imageOpacity: number;
  colors: string[];
  isPaused: boolean;
  setAppState: (state: Partial<AppState>) => void;
  triggerDownload: boolean;
  setTriggerDownload: (val: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  resolution: 'custom',
  width: 1920,
  height: 1080,
  seed: 12345,
  particleCount: 5000,
  flowSpeed: 1.4,
  noiseScale: 0.002,
  trailPersistence: 0.9,
  vortexStrength: 0.3,
  vortexRange: 300,
  clickRepulsion: 2.0,
  particleSize: 2.5,
  useImageColors: false,
  imageUrl: null,
  imageOpacity: 0,
  colors: ['#00ffff', '#008080', '#004040'],
  isPaused: false,
  setAppState: (newState) => set((state) => ({ ...state, ...newState })),
  triggerDownload: false,
  setTriggerDownload: (val) => set({ triggerDownload: val }),
}));
