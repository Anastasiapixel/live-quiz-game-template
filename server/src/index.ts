import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { createHandlers } from './handlers/index.js';
import { parseIncomingMessage } from './protocol/index.js';
import { createStore } from './store/index.js';

const HOST = process.env.HOST ?? '0.0.0.0';
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

const store = createStore();
const handlers = createHandlers({ store });

const wss = new WebSocketServer({ host: HOST, port: PORT });

wss.on('connection', (socket: WebSocket) => {
  socket.on('message', (raw) => {
    const message = parseIncomingMessage(raw);
    if (!message) {
      return;
    }

    const handler = handlers[message.type];
    if (!handler) {
      return;
    }

    handler({ socket, message });
  });

  socket.on('close', () => {
    store.removeSessionBySocket(socket);
  });
});

wss.on('listening', () => {
  console.log(`WebSocket server is running on ws://localhost:${PORT}`);
});

wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});
