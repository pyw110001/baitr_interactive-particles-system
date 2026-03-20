import React from 'react';
import { useSessionStore } from '../../stores/sessionStore';

const statusTone: Record<string, string> = {
  idle: 'bg-white/10 text-white/80 border-white/10',
  connecting: 'bg-amber-500/15 text-amber-200 border-amber-400/30',
  connected: 'bg-emerald-500/15 text-emerald-200 border-emerald-400/30',
  disconnected: 'bg-orange-500/15 text-orange-200 border-orange-400/30',
  error: 'bg-red-500/15 text-red-200 border-red-400/30',
};

export const StatusBadge: React.FC = () => {
  const connectionStatus = useSessionStore((state) => state.connectionStatus);
  const peers = useSessionStore((state) => state.peers);
  const roomId = useSessionStore((state) => state.roomId);

  return (
    <div className="absolute top-4 left-4 z-30 rounded-2xl border px-4 py-3 backdrop-blur-md shadow-lg bg-black/45 text-white min-w-64">
      <div className="text-xs uppercase tracking-[0.25em] text-white/50 mb-2">Realtime Session</div>
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="text-white/70">Room</span>
        <span className="font-semibold">{roomId ?? '—'}</span>
      </div>
      <div className="mt-2 flex items-center justify-between gap-3 text-sm">
        <span className="text-white/70">Status</span>
        <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold capitalize ${statusTone[connectionStatus] ?? statusTone.idle}`}>
          {connectionStatus}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-white/75">
        <div className="rounded-xl bg-white/5 px-3 py-2">Displays: {peers.display}</div>
        <div className="rounded-xl bg-white/5 px-3 py-2">Controllers: {peers.controller}</div>
      </div>
    </div>
  );
};
