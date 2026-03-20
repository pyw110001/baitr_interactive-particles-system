import type { ClientRole } from '../types/sync';

export interface RuntimeConfig {
  role: ClientRole;
  roomId?: string;
  wsUrl?: string;
}

const VALID_ROLES: ClientRole[] = ['controller', 'display', 'standalone'];

export function parseRuntimeConfig(search: string): RuntimeConfig {
  const params = new URLSearchParams(search);
  const roleParam = params.get('role');
  const roomParam = params.get('room')?.trim();
  const wsParam = params.get('ws')?.trim();
  const role = VALID_ROLES.includes(roleParam as ClientRole)
    ? (roleParam as ClientRole)
    : 'standalone';

  return {
    role,
    roomId: roomParam || undefined,
    wsUrl: wsParam || undefined,
  };
}

export function getSocketUrl(explicitUrl?: string): string {
  if (explicitUrl) {
    return explicitUrl;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

export function clampNormalized(value: number): number {
  return Math.max(0, Math.min(1, value));
}
