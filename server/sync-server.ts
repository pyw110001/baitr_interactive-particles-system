/**
 * WebSocket 房间中继：同一 roomId 内的客户端互转发 JSON 消息。
 * 首条消息应为：{ type: 'sync-join', roomId: string }
 */
import { WebSocketServer } from 'ws';
import { attachParticleSyncRelay } from './particle-sync-relay.ts';

const PORT = Number(process.env.SYNC_PORT || process.env.PORT || 8081);

const wss = new WebSocketServer({ host: '0.0.0.0', port: PORT });

wss.on('connection', (ws) => {
  attachParticleSyncRelay(ws);
});

console.log(`[particle-sync] WebSocket room relay listening on ws://0.0.0.0:${PORT}`);
console.log(`[particle-sync] Clients must first send: {"type":"sync-join","roomId":"<your-room>"}`);
