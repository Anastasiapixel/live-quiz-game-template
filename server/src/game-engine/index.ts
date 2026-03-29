import type {
  Game,
  PlayerQuestionResult,
  Question,
  QuestionMessage,
  QuestionResultMessage,
} from '../types.js';

const BASE_POINTS = 1000;

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

export function getQuestionDeadlineAt(game: Game): number | null {
  const question = getCurrentQuestion(game);
  if (!question || typeof game.questionStartedAt !== 'number') {
    return null;
  }

  return game.questionStartedAt + question.timeLimitSec * 1000;
}

export function isAnswerWindowOpen(game: Game, now = Date.now()): boolean {
  const deadline = getQuestionDeadlineAt(game);
  if (deadline === null) {
    return false;
  }

  return now <= deadline;
}

export function resolveCurrentQuestion(game: Game): QuestionResultMessage | null {
  const question = getCurrentQuestion(game);
  if (!question || game.currentQuestion < 0) {
    return null;
  }

  const questionIndex = game.currentQuestion;
  const startedAt = game.questionStartedAt;
  const questionDurationMs = question.timeLimitSec * 1000;
  const answers = game.answersByQuestion.get(questionIndex) ?? [];
  const answersByPlayerId = new Map<string, (typeof answers)[number]>();

  for (const answer of answers) {
    if (!answersByPlayerId.has(answer.playerId)) {
      answersByPlayerId.set(answer.playerId, answer);
    }
  }

  const playerResults: PlayerQuestionResult[] = game.players.map((player) => {
    const answer = answersByPlayerId.get(player.index);
    const answered = Boolean(answer);
    const correct = Boolean(answer && answer.answerIndex === question.correctIndex);

    let pointsEarned = 0;
    if (correct && typeof startedAt === 'number') {
      const elapsedMs = Math.max(0, answer!.answeredAt - startedAt);
      const timeRemainingRatio = Math.max(0, (questionDurationMs - elapsedMs) / questionDurationMs);
      pointsEarned = Math.floor(BASE_POINTS * timeRemainingRatio);
    }

    player.score += pointsEarned;

    return {
      name: player.name,
      answered,
      correct,
      pointsEarned,
      totalScore: player.score,
    };
  });

  return {
    questionIndex,
    correctIndex: question.correctIndex,
    playerResults,
  };
}
