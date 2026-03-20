/**
 * 粒子多终端同步：房间中继逻辑（可被 sync-server 与 desktop 复用）
 */
import { WebSocket } from 'ws';

type SocketMeta = { roomId: string };

const socketMeta = new WeakMap<WebSocket, SocketMeta>();
const rooms = new Map<string, Set<WebSocket>>();

function addToRoom(ws: WebSocket, roomId: string) {
  const prev = socketMeta.get(ws);
  if (prev) {
    rooms.get(prev.roomId)?.delete(ws);
    if (rooms.get(prev.roomId)?.size === 0) {
      rooms.delete(prev.roomId);
    }
  }
  const id = roomId.trim();
  if (!id) return;
  socketMeta.set(ws, { roomId: id });
  if (!rooms.has(id)) rooms.set(id, new Set());
  rooms.get(id)!.add(ws);
}

function removeSocket(ws: WebSocket) {
  const meta = socketMeta.get(ws);
  if (!meta) return;
  rooms.get(meta.roomId)?.delete(ws);
  if (rooms.get(meta.roomId)?.size === 0) {
    rooms.delete(meta.roomId);
  }
  socketMeta.delete(ws);
}

function broadcastRoom(roomId: string, payload: string, except?: WebSocket) {
  const peers = rooms.get(roomId);
  if (!peers) return;
  for (const peer of peers) {
    if (peer === except) continue;
    if (peer.readyState === WebSocket.OPEN) {
      try {
        peer.send(payload);
      } catch {
        // ignore
      }
    }
  }
}

/** 绑定到 WebSocketServer 的 connection 事件 */
export function attachParticleSyncRelay(ws: WebSocket) {
  ws.on('message', (buf) => {
    const raw = buf.toString();
    let msg: unknown;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    const m = msg as Record<string, unknown>;

    if (m.type === 'sync-join' && typeof m.roomId === 'string') {
      addToRoom(ws, m.roomId);
      return;
    }

    const meta = socketMeta.get(ws);
    if (!meta) {
      return;
    }
    broadcastRoom(meta.roomId, raw, ws);
  });

  ws.on('close', () => {
    removeSocket(ws);
  });
}
