export type ClientRole = 'controller' | 'display' | 'standalone';
export type ConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'error';
export type PointerEventType = 'pointerdown' | 'pointermove' | 'pointerup';
export type PointerSource = 'local' | 'remote';

export interface PointerSyncPayload {
  type: PointerEventType;
  roomId: string;
  pointerId: number;
  normalizedX: number;
  normalizedY: number;
  isDown: boolean;
  timestamp: number;
  sourceRole: ClientRole;
}

export interface PeerSummary {
  controller: number;
  display: number;
  standalone: number;
  total: number;
}

export interface JoinRoomMessage {
  kind: 'join';
  roomId: string;
  role: ClientRole;
  clientId?: string;
  timestamp: number;
}

export interface PointerEventMessage {
  kind: 'pointer';
  event: PointerSyncPayload;
}

export interface PingMessage {
  kind: 'ping';
  timestamp: number;
}

export type ClientToServerMessage = JoinRoomMessage | PointerEventMessage | PingMessage;

export interface WelcomeMessage {
  kind: 'welcome';
  clientId: string;
  roomId?: string;
  role?: ClientRole;
}

export interface RoomStateMessage {
  kind: 'room-state';
  roomId: string;
  peers: PeerSummary;
}

export interface ServerErrorMessage {
  kind: 'error';
  message: string;
}

export interface PongMessage {
  kind: 'pong';
  timestamp: number;
}

export type ServerToClientMessage = WelcomeMessage | RoomStateMessage | PointerEventMessage | ServerErrorMessage | PongMessage;
