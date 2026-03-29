import type { WebSocket } from 'ws';
import type { Game, Session, User } from '../types.js';
import { createUniqueGameId, createUniqueRoomCode, createUniqueUserId } from './generators.js';

export interface InMemoryStore {
  usersById: Map<string, User>;
  usersByName: Map<string, string>;
  gamesById: Map<string, Game>;
  gameIdsByCode: Map<string, string>;
  sessionsByUserId: Map<string, Session>;
  sessionsBySocket: Map<WebSocket, string>;
  generateUserId(): string;
  generateGameId(): string;
  generateRoomCode(): string;
  getUserById(userId: string): User | undefined;
  getUserByName(name: string): User | undefined;
  saveUser(user: User): void;
  getSessionByUserId(userId: string): Session | undefined;
  getSessionBySocket(socket: WebSocket): Session | undefined;
  saveSession(session: Session): void;
  removeSession(userId: string): void;
  removeSessionBySocket(socket: WebSocket): void;
  getGameById(gameId: string): Game | undefined;
  getGameByCode(code: string): Game | undefined;
  saveGame(game: Game): void;
  removeGame(gameId: string): void;
}

export function createStore(): InMemoryStore {
  const usersById = new Map<string, User>();
  const usersByName = new Map<string, string>();
  const gamesById = new Map<string, Game>();
  const gameIdsByCode = new Map<string, string>();
  const sessionsByUserId = new Map<string, Session>();
  const sessionsBySocket = new Map<WebSocket, string>();

  return {
    usersById,
    usersByName,
    gamesById,
    gameIdsByCode,
    sessionsByUserId,
    sessionsBySocket,
    generateUserId: () => createUniqueUserId((id) => usersById.has(id)),
    generateGameId: () => createUniqueGameId((id) => gamesById.has(id)),
    generateRoomCode: () => createUniqueRoomCode((code) => gameIdsByCode.has(code)),
    getUserById: (userId: string) => usersById.get(userId),
    getUserByName: (name: string) => {
      const userId = usersByName.get(name);
      return userId ? usersById.get(userId) : undefined;
    },
    saveUser: (user: User) => {
      usersById.set(user.index, user);
      usersByName.set(user.name, user.index);
    },
    getSessionByUserId: (userId: string) => sessionsByUserId.get(userId),
    getSessionBySocket: (socket: WebSocket) => {
      const userId = sessionsBySocket.get(socket);
      return userId ? sessionsByUserId.get(userId) : undefined;
    },
    saveSession: (session: Session) => {
      const previousSessionForUser = sessionsByUserId.get(session.userId);
      if (previousSessionForUser) {
        sessionsBySocket.delete(previousSessionForUser.socket);
      }

      const previousUserIdForSocket = sessionsBySocket.get(session.socket);
      if (previousUserIdForSocket && previousUserIdForSocket !== session.userId) {
        sessionsByUserId.delete(previousUserIdForSocket);
      }

      sessionsByUserId.set(session.userId, session);
      sessionsBySocket.set(session.socket, session.userId);
    },
    removeSession: (userId: string) => {
      const session = sessionsByUserId.get(userId);
      if (session) {
        sessionsBySocket.delete(session.socket);
      }

      sessionsByUserId.delete(userId);
    },
    removeSessionBySocket: (socket: WebSocket) => {
      const userId = sessionsBySocket.get(socket);
      if (!userId) {
        return;
      }

      sessionsBySocket.delete(socket);
      sessionsByUserId.delete(userId);
    },
    getGameById: (gameId: string) => gamesById.get(gameId),
    getGameByCode: (code: string) => {
      const gameId = gameIdsByCode.get(code);
      return gameId ? gamesById.get(gameId) : undefined;
    },
    saveGame: (game: Game) => {
      gamesById.set(game.id, game);
      gameIdsByCode.set(game.code, game.id);
    },
    removeGame: (gameId: string) => {
      const game = gamesById.get(gameId);
      if (!game) {
        return;
      }

      gamesById.delete(gameId);
      gameIdsByCode.delete(game.code);
    },
  };
}
