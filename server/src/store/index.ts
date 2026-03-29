import type { Game, Session, User } from '../types.js';

export interface InMemoryStore {
  usersById: Map<string, User>;
  usersByName: Map<string, string>;
  gamesById: Map<string, Game>;
  gameIdsByCode: Map<string, string>;
  sessionsByUserId: Map<string, Session>;
}

export function createStore(): InMemoryStore {
  return {
    usersById: new Map<string, User>(),
    usersByName: new Map<string, string>(),
    gamesById: new Map<string, Game>(),
    gameIdsByCode: new Map<string, string>(),
    sessionsByUserId: new Map<string, Session>(),
  };
}
