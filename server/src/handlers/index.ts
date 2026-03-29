import type { WebSocket } from 'ws';
import { sendMessage } from '../protocol/index.js';
import type { InMemoryStore } from '../store/index.js';
import type { IncomingMessage, RegData, RegResponse, User } from '../types.js';

export interface HandlerContext {
  store: InMemoryStore;
}

export interface HandlerPayload {
  socket: WebSocket;
  message: IncomingMessage;
}

export type CommandHandler = (payload: HandlerPayload) => void;

function isRegData(value: unknown): value is RegData {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<RegData>;
  return typeof candidate.name === 'string' && typeof candidate.password === 'string';
}

function sendRegResponse(socket: WebSocket, data: RegResponse): void {
  sendMessage(socket, 'reg', data, 0);
}

function handleReg(store: InMemoryStore, payload: HandlerPayload): void {
  const { socket, message } = payload;
  const { data } = message;

  if (!isRegData(data)) {
    sendRegResponse(socket, {
      name: '',
      index: '',
      error: true,
      errorText: 'Invalid registration payload',
    });
    return;
  }

  const name = data.name.trim();
  const password = data.password.trim();

  if (!name || !password) {
    sendRegResponse(socket, {
      name,
      index: '',
      error: true,
      errorText: 'Name and password are required',
    });
    return;
  }

  const existingUser = store.getUserByName(name);
  let targetUser: User;

  if (existingUser) {
    if (existingUser.password !== password) {
      sendRegResponse(socket, {
        name,
        index: existingUser.index,
        error: true,
        errorText: 'Invalid password',
      });
      return;
    }

    targetUser = existingUser;
  } else {
    targetUser = {
      name,
      password,
      index: store.generateUserId(),
    };

    store.saveUser(targetUser);
  }

  store.saveSession({
    userId: targetUser.index,
    socket,
    connectedAt: Date.now(),
  });

  sendRegResponse(socket, {
    name: targetUser.name,
    index: targetUser.index,
    error: false,
    errorText: '',
  });
}

export function createHandlers(context: HandlerContext): Record<string, CommandHandler> {
  return {
    reg: (payload) => {
      handleReg(context.store, payload);
    },
  };
}
