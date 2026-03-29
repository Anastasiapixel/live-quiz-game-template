import type { WebSocket } from 'ws';

export type Identifier = string;
export type GameStatus = 'waiting' | 'in_progress' | 'finished';

export interface Player {
  name: string;
  index: Identifier;
  score: number;
}

export interface Question {
  text: string;
  options: [string, string, string, string];
  correctIndex: number;
  timeLimitSec: number;
}

export interface AnswerRecord {
  playerId: Identifier;
  questionIndex: number;
  answerIndex: number;
  answeredAt: number;
}

export interface Game {
  id: string;
  code: string;
  hostId: Identifier;
  questions: Question[];
  players: Player[];
  currentQuestion: number;
  status: GameStatus;
  answersByQuestion: Map<number, AnswerRecord[]>;
}

export interface Session {
  userId: Identifier;
  socket: WebSocket;
  connectedAt: number;
  gameId?: string;
}

export interface User {
  name: string;
  password: string;
  index: Identifier;
}

export interface IncomingMessage<TData = unknown> {
  type: string;
  data: TData;
  id: number;
}

export interface OutgoingMessage<TData = unknown> {
  type: string;
  data: TData;
  id: number;
}

export interface RegData {
  name: string;
  password: string;
}

export interface RegResponse {
  name: string;
  index: Identifier | '';
  error: boolean;
  errorText: string;
}

export interface CreateGameData {
  questions: Question[];
}

export interface GameCreatedResponse {
  gameId: string;
  code: string;
}

export interface ErrorResponse {
  message: string;
}

export interface JoinGameData {
  code: string;
}

export interface GameJoinedResponse {
  gameId: string;
}

export interface PlayerJoinedMessage {
  playerName: string;
  playerCount: number;
}
