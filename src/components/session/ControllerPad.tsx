import React, { useRef, useState } from 'react';
import { clampNormalized } from '../../lib/runtime';
import { useSessionStore } from '../../stores/sessionStore';
import type { PointerSyncPayload } from '../../types/sync';

interface ControllerPadProps {
  roomId?: string;
  canSend: boolean;
  sendPointerEvent: (payload: PointerSyncPayload) => void;
}

interface TouchDot {
  pointerId: number;
  normalizedX: number;
  normalizedY: number;
  isDown: boolean;
}

export const ControllerPad: React.FC<ControllerPadProps> = ({ roomId, canSend, sendPointerEvent }) => {
  const connectionStatus = useSessionStore((state) => state.connectionStatus);
  const peers = useSessionStore((state) => state.peers);
  const padRef = useRef<HTMLDivElement>(null);
  const [touchDots, setTouchDots] = useState<Record<number, TouchDot>>({});

  const emitPointer = (event: React.PointerEvent<HTMLDivElement>, type: PointerSyncPayload['type'], isDown: boolean) => {
    if (!roomId || !padRef.current) {
      return;
    }

    const rect = padRef.current.getBoundingClientRect();
    const normalizedX = clampNormalized((event.clientX - rect.left) / rect.width);
    const normalizedY = clampNormalized((event.clientY - rect.top) / rect.height);

    setTouchDots((prev) => {
      if (!isDown) {
        const next = { ...prev };
        delete next[event.pointerId];
        return next;
      }

      return {
        ...prev,
        [event.pointerId]: {
          pointerId: event.pointerId,
          normalizedX,
          normalizedY,
          isDown,
        },
      };
    });

    if (!canSend) {
      return;
    }

    sendPointerEvent({
      type,
      roomId,
      pointerId: event.pointerId,
      normalizedX,
      normalizedY,
      isDown,
      timestamp: Date.now(),
      sourceRole: 'controller',
    });
  };

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    emitPointer(event, 'pointerdown', true);
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!event.buttons && !(event.pointerType === 'touch')) {
      return;
    }

    emitPointer(event, 'pointermove', true);
  };

  const handlePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    emitPointer(event, 'pointerup', false);
  };

  return (
    <div className="relative flex h-screen w-screen items-center justify-center overflow-hidden bg-[#050816] text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(67,97,238,0.18),transparent_45%),linear-gradient(135deg,rgba(15,23,42,0.95),rgba(2,6,23,1))]" />
      <div className="absolute top-6 left-6 right-6 z-20 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 backdrop-blur-md">
        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-white/45">Controller</div>
          <div className="mt-1 text-lg font-semibold">Room {roomId ?? '未提供'}</div>
        </div>
        <div className="flex flex-wrap gap-2 text-sm text-white/75">
          <span className="rounded-full bg-white/10 px-3 py-1">Status: {connectionStatus}</span>
          <span className="rounded-full bg-white/10 px-3 py-1">Displays: {peers.display}</span>
          <span className="rounded-full bg-white/10 px-3 py-1">Controllers: {peers.controller}</span>
        </div>
      </div>

      <div
        ref={padRef}
        className="relative z-10 h-[78vh] w-[92vw] max-w-5xl touch-none rounded-[32px] border border-white/15 bg-white/5 shadow-[0_0_60px_rgba(59,130,246,0.18)] backdrop-blur-sm"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
        <div className="pointer-events-none absolute inset-0 rounded-[32px] border border-white/10" />
        <div className="pointer-events-none absolute inset-6 rounded-[28px] border border-dashed border-white/10" />
        <div className="pointer-events-none absolute bottom-8 left-8 max-w-md text-sm leading-6 text-white/65">
          在 PAD 上按下、滑动、抬起即可把归一化 Pointer Events 实时同步到 display 端，驱动远程粒子 vortex 效果。
        </div>

        {(Object.values(touchDots) as TouchDot[]).map((dot) => (
          <div
            key={dot.pointerId}
            className="pointer-events-none absolute h-8 w-8 -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-200/80 bg-cyan-300/20 shadow-[0_0_24px_rgba(103,232,249,0.8)]"
            style={{
              left: `${dot.normalizedX * 100}%`,
              top: `${dot.normalizedY * 100}%`,
            }}
          />
        ))}
      </div>
    </div>
  );
};
