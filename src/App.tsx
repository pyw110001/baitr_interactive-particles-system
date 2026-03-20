/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo } from 'react';
import { ParticleCanvas } from './components/ParticleCanvas';
import { Sidebar } from './components/Sidebar';
import { ControllerPad } from './components/session/ControllerPad';
import { StatusBadge } from './components/session/StatusBadge';
import { useSyncSession } from './hooks/useSyncSession';
import { parseRuntimeConfig } from './lib/runtime';
import { useAppStore } from './store';

function DisplayMode() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <StatusBadge />
      <ParticleCanvas enableLocalPointer={false} />
    </div>
  );
}

function StandaloneMode() {
  return (
    <div className="relative h-screen w-screen overflow-hidden bg-black">
      <Sidebar />
      <ParticleCanvas enableLocalPointer />
    </div>
  );
}

function MissingRoomNotice({ role }: { role: 'controller' | 'display' }) {
  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-950 px-6 text-white">
      <div className="max-w-xl rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-md">
        <div className="text-xs uppercase tracking-[0.3em] text-white/40">Missing room</div>
        <h1 className="mt-3 text-3xl font-semibold">{role} 模式需要 room 参数</h1>
        <p className="mt-4 text-base leading-7 text-white/70">
          请使用类似 <code className="rounded bg-black/30 px-2 py-1">?role={role}&amp;room=test001</code> 的 URL 打开页面，以便加入同一个同步房间。
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const config = useMemo(() => parseRuntimeConfig(window.location.search), []);
  const setAppState = useAppStore((state) => state.setAppState);
  const { canSend, sendPointerEvent } = useSyncSession(config);

  useEffect(() => {
    if (config.role !== 'display') {
      return undefined;
    }

    const applyViewportSize = () => {
      setAppState({
        resolution: 'custom',
        width: window.innerWidth,
        height: window.innerHeight,
      });
    };

    applyViewportSize();
    window.addEventListener('resize', applyViewportSize);

    return () => {
      window.removeEventListener('resize', applyViewportSize);
    };
  }, [config.role, setAppState]);

  if ((config.role === 'controller' || config.role === 'display') && !config.roomId) {
    return <MissingRoomNotice role={config.role} />;
  }

  if (config.role === 'controller') {
    return <ControllerPad roomId={config.roomId} canSend={canSend} sendPointerEvent={sendPointerEvent} />;
  }

  if (config.role === 'display') {
    return <DisplayMode />;
  }

  return <StandaloneMode />;
}
