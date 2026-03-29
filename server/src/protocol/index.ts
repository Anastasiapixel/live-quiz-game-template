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
  const parsed = parseIncomingMessageDetailed(raw);
  return parsed.ok ? parsed.message : null;
}

export type IncomingParseResult =
  | { ok: true; message: IncomingMessage }
  | { ok: false; error: string };

export function parseIncomingMessageDetailed(raw: RawData): IncomingParseResult {
  let decodedRaw: unknown;

  try {
    decodedRaw = JSON.parse(rawDataToString(raw));
  } catch {
    return { ok: false, error: 'Invalid JSON payload' };
  }

  if (!decodedRaw || typeof decodedRaw !== 'object') {
    return { ok: false, error: 'Message must be a JSON object' };
  }

  const parsed = decodedRaw as Partial<IncomingMessage>;

  if (typeof parsed.type !== 'string' || !parsed.type.trim()) {
    return { ok: false, error: 'Message type must be a non-empty string' };
  }

  if (typeof parsed.id !== 'number' || !Number.isInteger(parsed.id)) {
    return { ok: false, error: 'Message id must be an integer' };
  }

  if (parsed.id !== 0) {
    return { ok: false, error: 'Message id must be 0' };
  }

  return {
    ok: true,
    message: {
      type: parsed.type,
      data: parsed.data ?? null,
      id: parsed.id,
    },
  };
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
