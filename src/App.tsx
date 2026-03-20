/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ParticleCanvas } from './components/ParticleCanvas';
import { useAppStore } from './store';

export default function App() {
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const m = q.get('mirror');
    if (m === 'publish' || m === 'view') {
      useAppStore.getState().setMirrorMode(m);
    }

    const role = q.get('role');
    if (role === 'controller' || role === 'display') {
      useAppStore.getState().setSyncRole(role);
    }
    const room = q.get('room');
    if (room) {
      useAppStore.getState().setRoomId(room);
    }
    const ws = q.get('ws');
    if (ws) {
      useAppStore.getState().setSyncWsBaseUrl(ws);
    }
    if (q.get('compact') === '1') {
      useAppStore.getState().setUiCompact(true);
    }
  }, []);

  const uiCompact = useAppStore((s) => s.uiCompact);

  return (
    <div className="w-screen h-screen overflow-hidden bg-black relative">
      {!uiCompact && <Sidebar />}
      {uiCompact ? (
        <button
          type="button"
          className="absolute top-4 left-4 z-[60] bg-black/80 text-white px-3 py-2 rounded-md border border-white/20 text-xs hover:bg-white/10"
          onClick={() => useAppStore.getState().setUiCompact(false)}
        >
          打开设置
        </button>
      ) : null}
      <ParticleCanvas />
    </div>
  );
}
