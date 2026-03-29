import type { Game, Session, User } from '../types.js';
import { createUniqueGameId, createUniqueRoomCode, createUniqueUserId } from './generators.js';

export interface InMemoryStore {
  usersById: Map<string, User>;
  usersByName: Map<string, string>;
  gamesById: Map<string, Game>;
  gameIdsByCode: Map<string, string>;
  sessionsByUserId: Map<string, Session>;
  generateUserId(): string;
  generateGameId(): string;
  generateRoomCode(): string;
  getUserById(userId: string): User | undefined;
  getUserByName(name: string): User | undefined;
  saveUser(user: User): void;
  getSessionByUserId(userId: string): Session | undefined;
  saveSession(session: Session): void;
  removeSession(userId: string): void;
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

  return {
    usersById,
    usersByName,
    gamesById,
    gameIdsByCode,
    sessionsByUserId,
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
    saveSession: (session: Session) => {
      sessionsByUserId.set(session.userId, session);
    },
    removeSession: (userId: string) => {
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
