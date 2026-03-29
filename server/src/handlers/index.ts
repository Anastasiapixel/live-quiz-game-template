import type { WebSocket } from 'ws';
import { sendMessage } from '../protocol/index.js';
import {
  advanceToNextQuestion,
  beginGame,
  createGame,
  getCurrentQuestion,
  hasNextQuestion,
  isAnswerWindowOpen,
  resolveCurrentQuestion,
  scheduleQuestionTimer,
  toGameFinishedMessage,
  toQuestionMessage,
} from '../game-engine/index.js';
import type { InMemoryStore } from '../store/index.js';
import type {
  AnswerAcceptedMessage,
  AnswerData,
  CreateGameData,
  ErrorResponse,
  GameFinishedMessage,
  GameCreatedResponse,
  GameJoinedResponse,
  IncomingMessage,
  JoinGameData,
  Player,
  PlayerJoinedMessage,
  QuestionMessage,
  QuestionResultMessage,
  Question,
  RegData,
  RegResponse,
  StartGameData,
  User,
} from '../types.js';

export interface HandlerContext {
  store: InMemoryStore;
}

export interface HandlerPayload {
  socket: WebSocket;
  message: IncomingMessage;
}

export type CommandHandler = (payload: HandlerPayload) => void;
const RESULT_DISPLAY_MS = 3000;

function logInfo(event: string, details?: Record<string, unknown>): void {
  if (details) {
    console.info(`[game] ${event}`, details);
    return;
  }

  console.info(`[game] ${event}`);
}

function logWarn(event: string, details?: Record<string, unknown>): void {
  if (details) {
    console.warn(`[game] ${event}`, details);
    return;
  }

  console.warn(`[game] ${event}`);
}

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

function sendErrorResponse(socket: WebSocket, message: string): void {
  const payload: ErrorResponse = { message };
  sendMessage(socket, 'error', payload, 0);
  logWarn('error_response', { message });
}

function sendGameCreatedResponse(socket: WebSocket, data: GameCreatedResponse): void {
  sendMessage(socket, 'game_created', data, 0);
}

function sendGameJoinedResponse(socket: WebSocket, data: GameJoinedResponse): void {
  sendMessage(socket, 'game_joined', data, 0);
}

function sendPlayerJoined(socket: WebSocket, data: PlayerJoinedMessage): void {
  sendMessage(socket, 'player_joined', data, 0);
}

function sendUpdatePlayers(socket: WebSocket, players: Player[]): void {
  sendMessage(socket, 'update_players', players, 0);
}

function sendQuestion(socket: WebSocket, data: QuestionMessage): void {
  sendMessage(socket, 'question', data, 0);
}

function sendQuestionResult(socket: WebSocket, data: QuestionResultMessage): void {
  sendMessage(socket, 'question_result', data, 0);
}

function sendAnswerAccepted(socket: WebSocket, data: AnswerAcceptedMessage): void {
  sendMessage(socket, 'answer_accepted', data, 0);
}

function sendGameFinished(socket: WebSocket, data: GameFinishedMessage): void {
  sendMessage(socket, 'game_finished', data, 0);
}

function getSocketsForGame(store: InMemoryStore, gameId: string, hostId: string, players: Player[]): WebSocket[] {
  const sockets = new Set<WebSocket>();
  const hostSession = store.getSessionByUserId(hostId);
  if (hostSession) {
    sockets.add(hostSession.socket);
  }

  for (const player of players) {
    const session = store.getSessionByUserId(player.index);
    if (session && session.gameId === gameId) {
      sockets.add(session.socket);
    }
  }

  return [...sockets];
}

function broadcastQuestion(store: InMemoryStore, gameId: string, hostId: string, players: Player[], question: QuestionMessage): void {
  const sockets = getSocketsForGame(store, gameId, hostId, players);
  for (const targetSocket of sockets) {
    sendQuestion(targetSocket, question);
  }
}

function broadcastQuestionResult(
  store: InMemoryStore,
  gameId: string,
  hostId: string,
  players: Player[],
  questionResult: QuestionResultMessage,
): void {
  const sockets = getSocketsForGame(store, gameId, hostId, players);
  for (const targetSocket of sockets) {
    sendQuestionResult(targetSocket, questionResult);
  }
}

function broadcastGameFinished(
  store: InMemoryStore,
  gameId: string,
  hostId: string,
  players: Player[],
  payload: GameFinishedMessage,
): void {
  const sockets = getSocketsForGame(store, gameId, hostId, players);
  for (const targetSocket of sockets) {
    sendGameFinished(targetSocket, payload);
  }
}

function clearGameBindingForUser(store: InMemoryStore, userId: string, gameId: string): void {
  const session = store.getSessionByUserId(userId);
  if (!session || session.gameId !== gameId) {
    return;
  }

  store.saveSession({
    ...session,
    gameId: undefined,
  });
}

function clearGameBindings(store: InMemoryStore, gameId: string, hostId: string, players: Player[]): void {
  clearGameBindingForUser(store, hostId, gameId);
  for (const player of players) {
    clearGameBindingForUser(store, player.index, gameId);
  }
}

function removeGameIfNoActiveParticipants(store: InMemoryStore, gameId: string): void {
  const game = store.getGameById(gameId);
  if (!game) {
    return;
  }

  const hostSession = store.getSessionByUserId(game.hostId);
  if (hostSession && hostSession.gameId === gameId) {
    return;
  }

  for (const player of game.players) {
    const playerSession = store.getSessionByUserId(player.index);
    if (playerSession && playerSession.gameId === gameId) {
      return;
    }
  }

  if (game.questionTimer) {
    clearTimeout(game.questionTimer);
  }

  if (game.postQuestionTimer) {
    clearTimeout(game.postQuestionTimer);
  }

  store.removeGame(gameId);
}

function completeGame(store: InMemoryStore, gameId: string, reason = 'completed'): void {
  const game = store.getGameById(gameId);
  if (!game) {
    return;
  }

  if (game.questionTimer) {
    clearTimeout(game.questionTimer);
  }

  if (game.postQuestionTimer) {
    clearTimeout(game.postQuestionTimer);
  }

  game.questionTimer = undefined;
  game.postQuestionTimer = undefined;
  game.questionStartedAt = undefined;
  game.status = 'finished';

  const payload = toGameFinishedMessage(game);
  store.saveGame(game);
  broadcastGameFinished(store, game.id, game.hostId, game.players, payload);
  logInfo('game_finished', {
    gameId: game.id,
    reason,
    players: game.players.length,
    scoreboard: payload.scoreboard,
  });
  clearGameBindings(store, game.id, game.hostId, game.players);
  removeGameIfNoActiveParticipants(store, game.id);
}

function schedulePostQuestionStep(store: InMemoryStore, gameId: string): void {
  const game = store.getGameById(gameId);
  if (!game || game.status !== 'in_progress') {
    return;
  }

  if (game.postQuestionTimer) {
    clearTimeout(game.postQuestionTimer);
  }

  game.postQuestionTimer = setTimeout(() => {
    const nextGame = store.getGameById(gameId);
    if (!nextGame || nextGame.status !== 'in_progress') {
      return;
    }

    nextGame.postQuestionTimer = undefined;

    if (!hasNextQuestion(nextGame)) {
      completeGame(store, gameId, 'last_question_completed');
      return;
    }

    const nextQuestion = advanceToNextQuestion(nextGame);
    if (!nextQuestion) {
      completeGame(store, gameId, 'next_question_missing');
      return;
    }

    nextGame.answersByQuestion.set(nextGame.currentQuestion, []);
    scheduleQuestionTimer(nextGame, () => {
      finalizeCurrentQuestion(store, nextGame.id);
    });

    store.saveGame(nextGame);

    const nextPayload = toQuestionMessage(nextGame);
    if (!nextPayload) {
      completeGame(store, gameId, 'next_question_payload_failed');
      return;
    }

    broadcastQuestion(store, nextGame.id, nextGame.hostId, nextGame.players, nextPayload);
  }, RESULT_DISPLAY_MS);

  store.saveGame(game);
}

function finalizeCurrentQuestion(store: InMemoryStore, gameId: string): void {
  const game = store.getGameById(gameId);
  if (!game || game.status !== 'in_progress') {
    return;
  }

  if (typeof game.questionStartedAt !== 'number') {
    return;
  }

  const resultPayload = resolveCurrentQuestion(game);
  if (!resultPayload) {
    return;
  }

  if (game.questionTimer) {
    clearTimeout(game.questionTimer);
  }

  game.questionTimer = undefined;
  game.questionStartedAt = undefined;

  store.saveGame(game);
  broadcastQuestionResult(store, game.id, game.hostId, game.players, resultPayload);
  schedulePostQuestionStep(store, game.id);
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
  logInfo('user_authenticated', { userId: targetUser.index, name: targetUser.name });
}

function isQuestion(value: unknown): value is Question {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Question> & { options?: unknown };

  if (typeof candidate.text !== 'string') {
    return false;
  }

  if (!Array.isArray(candidate.options) || candidate.options.length !== 4) {
    return false;
  }

  if (!candidate.options.every((option) => typeof option === 'string')) {
    return false;
  }

  const correctIndex = candidate.correctIndex;
  if (
    typeof correctIndex !== 'number' ||
    !Number.isInteger(correctIndex) ||
    correctIndex < 0 ||
    correctIndex > 3
  ) {
    return false;
  }

  if (
    typeof candidate.timeLimitSec !== 'number' ||
    !Number.isFinite(candidate.timeLimitSec) ||
    candidate.timeLimitSec <= 0
  ) {
    return false;
  }

  return true;
}

function isCreateGameData(value: unknown): value is CreateGameData {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<CreateGameData>;
  if (!Array.isArray(candidate.questions)) {
    return false;
  }

  return candidate.questions.every((question) => isQuestion(question));
}

function handleCreateGame(store: InMemoryStore, payload: HandlerPayload): void {
  const { socket, message } = payload;
  const session = store.getSessionBySocket(socket);

  if (!session) {
    sendErrorResponse(socket, 'Authentication required');
    return;
  }

  if (!isCreateGameData(message.data)) {
    sendErrorResponse(socket, 'Invalid create_game payload');
    return;
  }

  if (message.data.questions.length === 0) {
    sendErrorResponse(socket, 'At least one question is required');
    return;
  }

  const questions: Question[] = message.data.questions.map((question) => ({
    text: question.text.trim(),
    options: question.options.map((option) => option.trim()) as [string, string, string, string],
    correctIndex: question.correctIndex,
    timeLimitSec: question.timeLimitSec,
  }));

  const hasInvalidQuestionContent = questions.some((question) => {
    if (!question.text) {
      return true;
    }

    if (question.options.some((option) => !option)) {
      return true;
    }

    return false;
  });

  if (hasInvalidQuestionContent) {
    sendErrorResponse(socket, 'Question text and options must be non-empty');
    return;
  }

  const gameId = store.generateGameId();
  const roomCode = store.generateRoomCode();
  const game = createGame({
    id: gameId,
    code: roomCode,
    hostId: session.userId,
    questions,
  });

  store.saveGame(game);
  store.saveSession({ ...session, gameId: game.id });

  sendGameCreatedResponse(socket, {
    gameId: game.id,
    code: game.code,
  });
  logInfo('game_created', {
    gameId: game.id,
    hostId: game.hostId,
    code: game.code,
    questions: game.questions.length,
  });
}

function isJoinGameData(value: unknown): value is JoinGameData {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<JoinGameData>;
  return typeof candidate.code === 'string';
}

function handleJoinGame(store: InMemoryStore, payload: HandlerPayload): void {
  const { socket, message } = payload;
  const session = store.getSessionBySocket(socket);

  if (!session) {
    sendErrorResponse(socket, 'Authentication required');
    return;
  }

  if (!isJoinGameData(message.data)) {
    sendErrorResponse(socket, 'Invalid join_game payload');
    return;
  }

  const roomCode = message.data.code.trim().toUpperCase();
  if (!roomCode) {
    sendErrorResponse(socket, 'Room code is required');
    return;
  }

  const game = store.getGameByCode(roomCode);
  if (!game) {
    sendErrorResponse(socket, 'Game not found');
    return;
  }

  if (game.status !== 'waiting') {
    sendErrorResponse(socket, 'Game already started or finished');
    return;
  }

  const user = store.getUserById(session.userId);
  if (!user) {
    sendErrorResponse(socket, 'User not found');
    return;
  }

  const existingPlayer = game.players.find((player) => player.index === user.index);
  let didAddPlayer = false;

  if (!existingPlayer) {
    game.players.push({
      name: user.name,
      index: user.index,
      score: 0,
    });
    didAddPlayer = true;
  }

  store.saveGame(game);
  store.saveSession({ ...session, gameId: game.id });

  sendGameJoinedResponse(socket, {
    gameId: game.id,
  });
  logInfo('game_joined', {
    gameId: game.id,
    userId: session.userId,
    playerCount: game.players.length,
    added: didAddPlayer,
  });

  if (didAddPlayer) {
    const sockets = getSocketsForGame(store, game.id, game.hostId, game.players);
    const joinedPayload: PlayerJoinedMessage = {
      playerName: user.name,
      playerCount: game.players.length,
    };

    for (const targetSocket of sockets) {
      sendPlayerJoined(targetSocket, joinedPayload);
      sendUpdatePlayers(targetSocket, game.players);
    }
    return;
  }

  const sockets = getSocketsForGame(store, game.id, game.hostId, game.players);
  for (const targetSocket of sockets) {
    sendUpdatePlayers(targetSocket, game.players);
  }
}

function isStartGameData(value: unknown): value is StartGameData {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<StartGameData>;
  return typeof candidate.gameId === 'string';
}

function handleStartGame(store: InMemoryStore, payload: HandlerPayload): void {
  const { socket, message } = payload;
  const session = store.getSessionBySocket(socket);

  if (!session) {
    sendErrorResponse(socket, 'Authentication required');
    return;
  }

  if (!isStartGameData(message.data)) {
    sendErrorResponse(socket, 'Invalid start_game payload');
    return;
  }

  const gameId = message.data.gameId.trim();
  if (!gameId) {
    sendErrorResponse(socket, 'gameId is required');
    return;
  }

  const game = store.getGameById(gameId);
  if (!game) {
    sendErrorResponse(socket, 'Game not found');
    return;
  }

  if (session.userId !== game.hostId) {
    sendErrorResponse(socket, 'Only the host can start the game');
    return;
  }

  if (game.status !== 'waiting') {
    sendErrorResponse(socket, 'Game is already started or finished');
    return;
  }

  if (game.players.length === 0) {
    sendErrorResponse(socket, 'At least one player must join before start');
    return;
  }

  const firstQuestion = beginGame(game);
  if (!firstQuestion) {
    sendErrorResponse(socket, 'Game has no questions');
    return;
  }

  game.answersByQuestion.set(game.currentQuestion, []);
  scheduleQuestionTimer(game, () => {
    finalizeCurrentQuestion(store, game.id);
  });

  store.saveGame(game);
  store.saveSession({ ...session, gameId: game.id });

  const questionPayload = toQuestionMessage(game);
  if (!questionPayload) {
    sendErrorResponse(socket, 'Failed to prepare question');
    return;
  }

  broadcastQuestion(store, game.id, game.hostId, game.players, questionPayload);
  logInfo('game_started', {
    gameId: game.id,
    hostId: game.hostId,
    players: game.players.length,
    questionIndex: game.currentQuestion,
  });
}

function isAnswerData(value: unknown): value is AnswerData {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<AnswerData>;
  return (
    typeof candidate.gameId === 'string' &&
    typeof candidate.questionIndex === 'number' &&
    Number.isInteger(candidate.questionIndex) &&
    typeof candidate.answerIndex === 'number' &&
    Number.isInteger(candidate.answerIndex)
  );
}

function handleAnswer(store: InMemoryStore, payload: HandlerPayload): void {
  const { socket, message } = payload;
  const session = store.getSessionBySocket(socket);

  if (!session) {
    sendErrorResponse(socket, 'Authentication required');
    return;
  }

  if (!isAnswerData(message.data)) {
    sendErrorResponse(socket, 'Invalid answer payload');
    return;
  }

  const gameId = message.data.gameId.trim();
  if (!gameId) {
    sendErrorResponse(socket, 'gameId is required');
    return;
  }

  if (message.data.answerIndex < 0 || message.data.answerIndex > 3) {
    sendErrorResponse(socket, 'answerIndex must be between 0 and 3');
    return;
  }

  const game = store.getGameById(gameId);
  if (!game) {
    sendErrorResponse(socket, 'Game not found');
    return;
  }

  if (game.status !== 'in_progress') {
    sendErrorResponse(socket, 'Game is not in progress');
    return;
  }

  const player = game.players.find((candidatePlayer) => candidatePlayer.index === session.userId);
  if (!player) {
    sendErrorResponse(socket, 'Only joined players can answer');
    return;
  }

  if (message.data.questionIndex !== game.currentQuestion) {
    sendErrorResponse(socket, 'Question index mismatch');
    return;
  }

  const currentQuestion = getCurrentQuestion(game);
  if (!currentQuestion) {
    sendErrorResponse(socket, 'Current question is unavailable');
    return;
  }

  if (!isAnswerWindowOpen(game)) {
    sendErrorResponse(socket, 'Answer window closed');
    return;
  }

  const answersForCurrentQuestion = game.answersByQuestion.get(game.currentQuestion) ?? [];
  const hasAnswered = answersForCurrentQuestion.some((record) => record.playerId === player.index);
  if (hasAnswered) {
    sendErrorResponse(socket, 'Answer already submitted');
    return;
  }

  answersForCurrentQuestion.push({
    playerId: player.index,
    questionIndex: game.currentQuestion,
    answerIndex: message.data.answerIndex,
    answeredAt: Date.now(),
  });

  game.answersByQuestion.set(game.currentQuestion, answersForCurrentQuestion);
  store.saveGame(game);

  sendAnswerAccepted(socket, {
    questionIndex: game.currentQuestion,
  });

  const allPlayersAnswered = answersForCurrentQuestion.length >= game.players.length;
  if (allPlayersAnswered) {
    finalizeCurrentQuestion(store, game.id);
  }
}

export function handleSocketDisconnect(store: InMemoryStore, socket: WebSocket): void {
  const session = store.getSessionBySocket(socket);
  if (!session) {
    return;
  }

  store.removeSessionBySocket(socket);

  if (!session.gameId) {
    return;
  }

  const game = store.getGameById(session.gameId);
  if (!game) {
    return;
  }

  if (session.userId === game.hostId) {
    completeGame(store, game.id, 'host_disconnected');
    return;
  }

  const playerBeforeRemoval = game.players.some((player) => player.index === session.userId);
  if (!playerBeforeRemoval) {
    removeGameIfNoActiveParticipants(store, game.id);
    return;
  }

  game.players = game.players.filter((player) => player.index !== session.userId);

  if (game.currentQuestion >= 0) {
    const answers = game.answersByQuestion.get(game.currentQuestion) ?? [];
    const filteredAnswers = answers.filter((answer) => answer.playerId !== session.userId);
    game.answersByQuestion.set(game.currentQuestion, filteredAnswers);
  }

  store.saveGame(game);

  if (game.status === 'in_progress' && game.players.length === 0) {
    completeGame(store, game.id, 'all_players_disconnected');
    return;
  }

  const sockets = getSocketsForGame(store, game.id, game.hostId, game.players);
  for (const targetSocket of sockets) {
    sendUpdatePlayers(targetSocket, game.players);
  }

  if (game.status === 'in_progress') {
    const currentAnswers = game.answersByQuestion.get(game.currentQuestion) ?? [];
    if (currentAnswers.length >= game.players.length && game.players.length > 0) {
      finalizeCurrentQuestion(store, game.id);
      return;
    }
  }

  removeGameIfNoActiveParticipants(store, game.id);
}

export function createHandlers(context: HandlerContext): Record<string, CommandHandler> {
  return {
    reg: (payload) => {
      handleReg(context.store, payload);
    },
    create_game: (payload) => {
      handleCreateGame(context.store, payload);
    },
    join_game: (payload) => {
      handleJoinGame(context.store, payload);
    },
    start_game: (payload) => {
      handleStartGame(context.store, payload);
    },
    answer: (payload) => {
      handleAnswer(context.store, payload);
    },
  };
}
