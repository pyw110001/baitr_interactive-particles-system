import { useEffect, useMemo, useRef } from 'react';
import { RealtimeClient } from '../lib/socketClient';
import { getSocketUrl } from '../lib/runtime';
import { createPointerKey, usePointerStore } from '../stores/pointerStore';
import { useSessionStore } from '../stores/sessionStore';
import type { PointerSyncPayload } from '../types/sync';
import type { RuntimeConfig } from '../lib/runtime';

export function useSyncSession(config: RuntimeConfig) {
  const clientRef = useRef<RealtimeClient | null>(null);
  const setSession = useSessionStore((state) => state.setSession);
  const setConnectionStatus = useSessionStore((state) => state.setConnectionStatus);
  const setPeers = useSessionStore((state) => state.setPeers);
  const upsertPointer = usePointerStore((state) => state.upsertPointer);
  const removePointer = usePointerStore((state) => state.removePointer);
  const clearRemotePointers = usePointerStore((state) => state.clearPointersBySource);

  const shouldConnect = Boolean(config.roomId && config.role !== 'standalone');
  const socketUrl = useMemo(() => getSocketUrl(config.wsUrl), [config.wsUrl]);

  useEffect(() => {
    setSession({ role: config.role, roomId: config.roomId });

    if (!shouldConnect || !config.roomId) {
      setConnectionStatus('idle');
      setPeers({ controller: 0, display: 0, standalone: 0, total: 0 });
      clearRemotePointers('remote');
      return undefined;
    }

    setConnectionStatus('connecting');

    const client = new RealtimeClient({
      url: socketUrl,
      role: config.role,
      roomId: config.roomId,
      onOpen: () => setConnectionStatus('connected'),
      onClose: () => {
        setConnectionStatus('disconnected');
        clearRemotePointers('remote');
      },
      onError: () => setConnectionStatus('error'),
      onMessage: (message) => {
        if (message.kind === 'welcome') {
          setSession({ role: config.role, roomId: config.roomId, clientId: message.clientId });
          return;
        }

        if (message.kind === 'room-state') {
          setPeers(message.peers);
          return;
        }

        if (message.kind === 'pointer' && config.role === 'display') {
          const pointerKey = createPointerKey('remote', message.event.pointerId);
          upsertPointer({
            key: pointerKey,
            pointerId: message.event.pointerId,
            normalizedX: message.event.normalizedX,
            normalizedY: message.event.normalizedY,
            isDown: message.event.isDown,
            timestamp: message.event.timestamp,
            source: 'remote',
            sourceRole: message.event.sourceRole,
            roomId: message.event.roomId,
          });

          if (!message.event.isDown || message.event.type === 'pointerup') {
            removePointer(pointerKey);
          }
        }
      },
    });

    client.connect();
    clientRef.current = client;

    return () => {
      client.close();
      clientRef.current = null;
      clearRemotePointers('remote');
    };
  }, [clearRemotePointers, config.role, config.roomId, removePointer, setConnectionStatus, setPeers, setSession, shouldConnect, socketUrl, upsertPointer]);

  return {
    canSend: shouldConnect && config.role === 'controller',
    sendPointerEvent: (payload: PointerSyncPayload) => {
      clientRef.current?.sendPointerEvent(payload);
    },
  };
}
