import { randomInt, randomUUID } from 'node:crypto';

const ROOM_CODE_LENGTH = 6;
const ROOM_CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
const MAX_GENERATION_ATTEMPTS = 10_000;

function createUniqueId(prefix: string, exists: (value: string) => boolean): string {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const candidate = `${prefix}_${randomUUID().replaceAll('-', '').slice(0, 12)}`;
    if (!exists(candidate)) {
      return candidate;
    }
  }

  throw new Error(`Unable to generate unique ${prefix} id after ${MAX_GENERATION_ATTEMPTS} attempts`);
}

function createRoomCodeCandidate(): string {
  let code = '';

  for (let i = 0; i < ROOM_CODE_LENGTH; i += 1) {
    const index = randomInt(0, ROOM_CODE_ALPHABET.length);
    code += ROOM_CODE_ALPHABET[index];
  }

  return code;
}

export function createUniqueUserId(exists: (value: string) => boolean): string {
  return createUniqueId('usr', exists);
}

export function createUniqueGameId(exists: (value: string) => boolean): string {
  return createUniqueId('game', exists);
}

export function createUniqueRoomCode(exists: (value: string) => boolean): string {
  for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
    const code = createRoomCodeCandidate();
    if (!exists(code)) {
      return code;
    }
  }

  throw new Error(`Unable to generate unique room code after ${MAX_GENERATION_ATTEMPTS} attempts`);
}
