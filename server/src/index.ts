import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { createHandlers, handleSocketDisconnect } from './handlers/index.js';
import { parseIncomingMessageDetailed, sendMessage } from './protocol/index.js';
import { createStore } from './store/index.js';

const HOST = process.env.HOST ?? '0.0.0.0';
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const store = createStore();
const handlers = createHandlers({ store });

const wss = new WebSocketServer({ host: HOST, port: PORT });

wss.on('connection', (socket: WebSocket) => {
  socket.on('message', (raw) => {
    const parsed = parseIncomingMessageDetailed(raw);
    if (!parsed.ok) {
      console.warn(`[ws] invalid-message: ${parsed.error}`);
      sendMessage(socket, 'error', { message: parsed.error }, 0);
      return;
    }

    const { message } = parsed;
    const handler = handlers[message.type];
    if (!handler) {
      const errorText = `Unknown command type: ${message.type}`;
      console.warn(`[ws] unknown-command: ${message.type}`);
      sendMessage(socket, 'error', { message: errorText }, 0);
      return;
    }

    try {
      handler({ socket, message });
    } catch (error) {
      console.error('[ws] handler-failure:', error);
      sendMessage(socket, 'error', { message: 'Internal server error' }, 0);
    }
  });

  socket.on('close', () => {
    handleSocketDisconnect(store, socket);
  });
});

wss.on('listening', () => {
  console.log(`WebSocket server is running on ws://localhost:${PORT}`);
});

wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});
