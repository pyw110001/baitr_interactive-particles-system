import crypto from 'node:crypto';
import fs from 'node:fs';
import http, { type IncomingMessage } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import type { AddressInfo } from 'node:net';
import type { Duplex } from 'node:stream';
import type { ClientRole, ClientToServerMessage, PeerSummary, PointerEventMessage, ServerToClientMessage } from '../src/types/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const distPath = path.join(projectRoot, 'dist');
const isProduction = process.env.NODE_ENV === 'production';
const port = Number(process.env.PORT ?? 3000);

interface RoomClient {
  id: string;
  role: ClientRole;
  roomId: string;
  socket: Duplex;
}

const rooms = new Map<string, Map<string, RoomClient>>();
const socketToClient = new Map<Duplex, RoomClient>();

function createPeerSummary(roomId: string): PeerSummary {
  const peers = rooms.get(roomId);
  const summary: PeerSummary = {
    controller: 0,
    display: 0,
    standalone: 0,
    total: 0,
  };

  if (!peers) {
    return summary;
  }

  for (const peer of peers.values()) {
    summary[peer.role] += 1;
    summary.total += 1;
  }

  return summary;
}

function sendMessage(socket: Duplex, message: ServerToClientMessage): void {
  const payload = Buffer.from(JSON.stringify(message));
  const frame = createFrame(payload);
  socket.write(frame);
}

function createFrame(payload: Buffer): Buffer {
  const length = payload.length;

  if (length < 126) {
    return Buffer.concat([Buffer.from([0x81, length]), payload]);
  }

  if (length < 65536) {
    const header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
    return Buffer.concat([header, payload]);
  }

  const header = Buffer.alloc(10);
  header[0] = 0x81;
  header[1] = 127;
  header.writeBigUInt64BE(BigInt(length), 2);
  return Buffer.concat([header, payload]);
}

function removeClient(socket: Duplex): void {
  const client = socketToClient.get(socket);
  if (!client) {
    return;
  }

  const room = rooms.get(client.roomId);
  room?.delete(client.id);
  socketToClient.delete(socket);

  if (room && room.size === 0) {
    rooms.delete(client.roomId);
  }

  broadcastRoomState(client.roomId);
}

function broadcastRoomState(roomId: string): void {
  const room = rooms.get(roomId);
  if (!room) {
    return;
  }

  const message: ServerToClientMessage = {
    kind: 'room-state',
    roomId,
    peers: createPeerSummary(roomId),
  };

  for (const peer of room.values()) {
    sendMessage(peer.socket, message);
  }
}

function joinRoom(socket: Duplex, message: Extract<ClientToServerMessage, { kind: 'join' }>): void {
  const clientId = message.clientId ?? crypto.randomUUID();
  const room = rooms.get(message.roomId) ?? new Map<string, RoomClient>();
  const client: RoomClient = {
    id: clientId,
    role: message.role,
    roomId: message.roomId,
    socket,
  };

  room.set(clientId, client);
  rooms.set(message.roomId, room);
  socketToClient.set(socket, client);

  sendMessage(socket, {
    kind: 'welcome',
    clientId,
    roomId: message.roomId,
    role: message.role,
  });
  broadcastRoomState(message.roomId);
}

function broadcastPointer(socket: Duplex, message: PointerEventMessage): void {
  const client = socketToClient.get(socket);
  if (!client || client.role !== 'controller') {
    sendMessage(socket, {
      kind: 'error',
      message: 'Only controller clients can publish pointer events.',
    });
    return;
  }

  const room = rooms.get(client.roomId);
  if (!room) {
    return;
  }

  for (const peer of room.values()) {
    if (peer.role === 'display') {
      sendMessage(peer.socket, message);
    }
  }
}

function handleClientMessage(socket: Duplex, rawMessage: string): void {
  try {
    const message = JSON.parse(rawMessage) as ClientToServerMessage;

    if (message.kind === 'join') {
      joinRoom(socket, message);
      return;
    }

    if (message.kind === 'pointer') {
      broadcastPointer(socket, message);
      return;
    }

    if (message.kind === 'ping') {
      sendMessage(socket, {
        kind: 'pong',
        timestamp: message.timestamp,
      });
    }
  } catch (error) {
    console.error('Failed to handle websocket message.', error);
    sendMessage(socket, {
      kind: 'error',
      message: 'Invalid websocket payload.',
    });
  }
}

function parseFrames(buffer: Buffer, onText: (text: string) => void): Buffer {
  let offset = 0;

  while (offset + 2 <= buffer.length) {
    const firstByte = buffer[offset];
    const secondByte = buffer[offset + 1];
    const opcode = firstByte & 0x0f;
    const masked = (secondByte & 0x80) !== 0;
    let payloadLength = secondByte & 0x7f;
    let headerLength = 2;

    if (payloadLength === 126) {
      if (offset + 4 > buffer.length) {
        break;
      }
      payloadLength = buffer.readUInt16BE(offset + 2);
      headerLength = 4;
    } else if (payloadLength === 127) {
      if (offset + 10 > buffer.length) {
        break;
      }
      const extendedLength = Number(buffer.readBigUInt64BE(offset + 2));
      payloadLength = extendedLength;
      headerLength = 10;
    }

    const maskLength = masked ? 4 : 0;
    const frameLength = headerLength + maskLength + payloadLength;
    if (offset + frameLength > buffer.length) {
      break;
    }

    const maskingKeyOffset = offset + headerLength;
    const payloadOffset = maskingKeyOffset + maskLength;
    let payload = buffer.subarray(payloadOffset, payloadOffset + payloadLength);

    if (masked) {
      const unmasked = Buffer.alloc(payloadLength);
      const maskingKey = buffer.subarray(maskingKeyOffset, maskingKeyOffset + 4);
      for (let i = 0; i < payloadLength; i += 1) {
        unmasked[i] = payload[i] ^ maskingKey[i % 4];
      }
      payload = unmasked;
    }

    if (opcode === 0x8) {
      onText('__CLOSE__');
    } else if (opcode === 0x1) {
      onText(payload.toString('utf8'));
    } else if (opcode === 0x9) {
      socketWritePong(onText, payload);
    }

    offset += frameLength;
  }

  return buffer.subarray(offset);
}

function socketWritePong(onText: (text: string) => void, payload: Buffer): void {
  onText(`__PING__${payload.toString('base64')}`);
}

function acceptWebSocket(request: IncomingMessage, socket: Duplex): void {
  const key = request.headers['sec-websocket-key'];
  if (!key) {
    socket.destroy();
    return;
  }

  const acceptKey = crypto
    .createHash('sha1')
    .update(`${key}258EAFA5-E914-47DA-95CA-C5AB0DC85B11`)
    .digest('base64');

  socket.write(
    [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`,
      '',
      '',
    ].join('\r\n'),
  );

  let buffer = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);
    buffer = parseFrames(buffer, (text) => {
      if (text === '__CLOSE__') {
        socket.end();
        return;
      }

      if (text.startsWith('__PING__')) {
        const payload = Buffer.from(text.replace('__PING__', ''), 'base64');
        const pongFrame = Buffer.concat([Buffer.from([0x8a, payload.length]), payload]);
        socket.write(pongFrame);
        return;
      }

      handleClientMessage(socket, text);
    });
  });

  socket.on('close', () => removeClient(socket));
  socket.on('end', () => removeClient(socket));
  socket.on('error', () => removeClient(socket));
}

async function createAppServer() {
  const app = express();
  const server = http.createServer(app);

  if (!isProduction) {
    const vite = await createViteServer({
      root: projectRoot,
      server: { middlewareMode: true },
      appType: 'custom',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(distPath));
    app.get('*', (_request, response) => {
      response.sendFile(path.join(distPath, 'index.html'));
    });
  }

  server.on('upgrade', (request, socket) => {
    if (request.url !== '/ws') {
      socket.destroy();
      return;
    }

    acceptWebSocket(request, socket);
  });

  server.listen(port, '0.0.0.0', () => {
    const address = server.address() as AddressInfo;
    const modeLabel = isProduction ? 'prod' : 'dev';
    console.log(`interactive-particles ${modeLabel} server listening on http://0.0.0.0:${address.port}`);
  });
}

if (isProduction && !fs.existsSync(path.join(distPath, 'index.html'))) {
  console.warn('dist/index.html not found. Run `npm run build` before production start.');
}

void createAppServer();
