import { create } from 'zustand';

const STORAGE_KEY = 'baitr_particle_settings_v1';

export type SyncRole = 'standalone' | 'controller' | 'display';

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

  /**
   * 多终端同步：standalone 不连 WebSocket；controller 发送 pointer；display 只接收远端 pointer。
   * 与电脑 display 使用相同 roomId + 同步服务地址即可同房间。
   */
  syncRole: SyncRole;
  setSyncRole: (r: SyncRole) => void;
  /** 房间 ID（任意字符串，两端一致即可） */
  roomId: string;
  setRoomId: (id: string) => void;
  /**
   * 同步服务完整 WS 地址，如 ws://192.168.1.8:8081
   * 为空则使用：当前页面 host + :8081（wss/https 时仍用 ws，本地开发一般为 ws）
   */
  syncWsBaseUrl: string;
  setSyncWsBaseUrl: (url: string) => void;
  /** PAD 控制端可开启简洁模式（隐藏侧边栏） */
  uiCompact: boolean;
  setUiCompact: (v: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  // 默认参数（会在下方尝试与 localStorage 进行合并）
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

  syncRole: 'standalone',
  setSyncRole: (r) => set({ syncRole: r }),
  roomId: '',
  setRoomId: (id) => set({ roomId: id }),
  syncWsBaseUrl: '',
  setSyncWsBaseUrl: (url) => set({ syncWsBaseUrl: url }),
  uiCompact: false,
  setUiCompact: (v) => set({ uiCompact: v }),
}));

// 初始化：尝试从 localStorage 恢复上次参数
// 说明：这段放在 create 之后是为了避免 Zustand 的 set 初始化时序问题。
if (typeof window !== 'undefined') {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<AppState>;
      // 只合并你关心的字段，避免把无效数据写入 store。
      const restored: Partial<AppState> = {};
      const keys: (keyof AppState)[] = [
        'resolution',
        'width',
        'height',
        'seed',
        'particleCount',
        'flowSpeed',
        'noiseScale',
        'trailPersistence',
        'vortexStrength',
        'vortexRange',
        'clickRepulsion',
        'particleSize',
        'useImageColors',
        'imageUrl',
        'imageOpacity',
        'colors',
        'isPaused',
      ];

      for (const k of keys) {
        // @ts-expect-error runtime merge
        if (parsed[k] !== undefined) restored[k] = parsed[k];
      }

      useAppStore.getState().setAppState(restored);
    }
  } catch {
    // ignore localStorage errors
  }
}
