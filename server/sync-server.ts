/**
 * WebSocket 房间中继：同一 roomId 内的客户端互转发 JSON 消息。
 * PAD（controller）发送归一化 pointer；电脑（display）接收后映射到本地画布分辨率。
 *
 * 首条消息应为：{ type: 'sync-join', roomId: string }
 */
import { WebSocketServer, WebSocket } from 'ws';

const PORT = Number(process.env.SYNC_PORT || process.env.PORT || 8081);

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

const wss = new WebSocketServer({ host: '0.0.0.0', port: PORT });

wss.on('connection', (ws) => {
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
      // 未 join 的客户端：不回传，避免误入广播
      return;
    }
    broadcastRoom(meta.roomId, raw, ws);
  });

  ws.on('close', () => {
    removeSocket(ws);
  });
});

console.log(`[particle-sync] WebSocket room relay listening on ws://0.0.0.0:${PORT}`);
console.log(`[particle-sync] Clients must first send: {"type":"sync-join","roomId":"<your-room>"}`);
