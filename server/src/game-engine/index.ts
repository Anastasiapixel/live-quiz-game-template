import type { Game, Question, QuestionMessage } from '../types.js';

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

export function beginGame(game: Game): Question | null {
  if (game.questions.length === 0) {
    return null;
  }

  game.status = 'in_progress';
  game.currentQuestion = 0;
  return getCurrentQuestion(game);
}

export function toQuestionMessage(game: Game): QuestionMessage | null {
  const question = getCurrentQuestion(game);
  if (!question) {
    return null;
  }

  return {
    questionNumber: game.currentQuestion + 1,
    totalQuestions: game.questions.length,
    text: question.text,
    options: question.options,
    timeLimitSec: question.timeLimitSec,
  };
}

export function scheduleQuestionTimer(game: Game, onTimeout: () => void): void {
  if (game.questionTimer) {
    clearTimeout(game.questionTimer);
  }

  const question = getCurrentQuestion(game);
  if (!question) {
    game.questionStartedAt = undefined;
    game.questionTimer = undefined;
    return;
  }

  game.questionStartedAt = Date.now();
  game.questionTimer = setTimeout(onTimeout, question.timeLimitSec * 1000);
}
