import type { WebSocket } from 'ws';
import type { IncomingMessage } from '../types.js';
import type { InMemoryStore } from '../store/index.js';

export interface HandlerContext {
  store: InMemoryStore;
}

export interface HandlerPayload {
  socket: WebSocket;
  message: IncomingMessage;
}

export type CommandHandler = (payload: HandlerPayload) => void;

export function createHandlers(context: HandlerContext): Record<string, CommandHandler> {
  void context;
  return {};
}
