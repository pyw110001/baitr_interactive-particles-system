import { create } from 'zustand';
import type { ClientRole, ConnectionStatus, PeerSummary } from '../types/sync';

const emptyPeers: PeerSummary = {
  controller: 0,
  display: 0,
  standalone: 0,
  total: 0,
};

interface SessionState {
  role: ClientRole;
  roomId?: string;
  clientId?: string;
  connectionStatus: ConnectionStatus;
  peers: PeerSummary;
  setSession: (session: { role: ClientRole; roomId?: string; clientId?: string }) => void;
  setConnectionStatus: (status: ConnectionStatus) => void;
  setPeers: (peers: PeerSummary) => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  role: 'standalone',
  roomId: undefined,
  clientId: undefined,
  connectionStatus: 'idle',
  peers: emptyPeers,
  setSession: ({ role, roomId, clientId }) => set({ role, roomId, clientId }),
  setConnectionStatus: (connectionStatus) => set({ connectionStatus }),
  setPeers: (peers) => set({ peers }),
}));
