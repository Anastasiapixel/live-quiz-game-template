import type { Game, Question } from '../types.js';

export interface CreateGameInput {
  id: string;
  code: string;
  hostId: string;
  questions: Question[];
}

export function createGame(input: CreateGameInput): Game {
  return {
    id: input.id,
    code: input.code,
    hostId: input.hostId,
    questions: input.questions,
    players: [],
    currentQuestion: -1,
    status: 'waiting',
    answersByQuestion: new Map(),
  };
}

export function getCurrentQuestion(game: Game): Question | null {
  if (game.currentQuestion < 0 || game.currentQuestion >= game.questions.length) {
    return null;
  }

  return game.questions[game.currentQuestion];
}
