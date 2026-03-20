import type { ClientRole, PointerSyncPayload, ServerToClientMessage } from '../types/sync';

interface RealtimeClientOptions {
  url: string;
  role: ClientRole;
  roomId: string;
  clientId?: string;
  onOpen?: () => void;
  onMessage?: (message: ServerToClientMessage) => void;
  onClose?: () => void;
  onError?: () => void;
}

export class RealtimeClient {
  private readonly options: RealtimeClientOptions;
  private socket?: WebSocket;

  constructor(options: RealtimeClientOptions) {
    this.options = options;
  }

  connect(): void {
    this.socket = new WebSocket(this.options.url);

    this.socket.addEventListener('open', () => {
      this.options.onOpen?.();
      this.send({
        kind: 'join',
        roomId: this.options.roomId,
        role: this.options.role,
        clientId: this.options.clientId,
        timestamp: Date.now(),
      });
    });

    this.socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data)) as ServerToClientMessage;
        this.options.onMessage?.(message);
      } catch (error) {
        console.error('Failed to parse WebSocket message.', error);
      }
    });

    this.socket.addEventListener('close', () => {
      this.options.onClose?.();
    });

    this.socket.addEventListener('error', () => {
      this.options.onError?.();
    });
  }

  sendPointerEvent(payload: PointerSyncPayload): void {
    this.send({
      kind: 'pointer',
      event: payload,
    });
  }

  close(): void {
    this.socket?.close();
  }

  private send(message: unknown): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    this.socket.send(JSON.stringify(message));
  }
}
