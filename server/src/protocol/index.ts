import type { RawData } from 'ws';
import type { WebSocket } from 'ws';
import type { IncomingMessage, OutgoingMessage } from '../types.js';

function rawDataToString(raw: RawData): string {
  if (typeof raw === 'string') {
    return raw;
  }

  if (Array.isArray(raw)) {
    return Buffer.concat(raw).toString('utf-8');
  }

  if (Buffer.isBuffer(raw)) {
    return raw.toString('utf-8');
  }

  return Buffer.from(raw).toString('utf-8');
}

export function parseIncomingMessage(raw: RawData): IncomingMessage | null {
  try {
    const parsed = JSON.parse(rawDataToString(raw)) as Partial<IncomingMessage>;

    if (typeof parsed.type !== 'string') {
      return null;
    }

    if (typeof parsed.id !== 'number') {
      return null;
    }

    return {
      type: parsed.type,
      data: parsed.data ?? null,
      id: parsed.id,
    };
  } catch {
    return null;
  }
}

export function createMessage<TData>(
  type: string,
  data: TData,
  id = 0,
): OutgoingMessage<TData> {
  return { type, data, id };
}

export function serializeMessage<TData>(message: OutgoingMessage<TData>): string {
  return JSON.stringify(message);
}

export function sendMessage<TData>(
  socket: WebSocket,
  type: string,
  data: TData,
  id = 0,
): boolean {
  try {
    socket.send(serializeMessage(createMessage(type, data, id)));
    return true;
  } catch {
    return false;
  }
}
