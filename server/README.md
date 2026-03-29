# Live Quiz Game Server

Backend for a real-time quiz game over WebSocket (`ws`).

## Requirements

- Node.js `24.10.0+`
- npm `10+`

## Run

From repository root:

```bash
npm install
npm run build --workspace=server
npm run start
```

Directly from `server/`:

```bash
npm run build
npm run start
```

On startup, the server prints:

```text
WebSocket server is running on ws://localhost:3000
```

## Message Envelope

All requests and responses are JSON strings in the envelope:

```json
{
  "type": "<string>",
  "data": "<any>",
  "id": 0
}
```

Protocol guards:

- Invalid JSON returns `type: "error"` with an explanation.
- Unknown command type returns `type: "error"`.
- Non-zero `id` returns `type: "error"`.

## Implemented Commands

Client to server:

- `reg`
- `create_game`
- `join_game`
- `start_game`
- `answer`

Server to client:

- `reg`
- `game_created`
- `game_joined`
- `player_joined`
- `update_players`
- `question`
- `answer_accepted`
- `question_result`
- `game_finished`
- `error`

## Game Logic Notes

- In-memory storage for users, sessions, and games.
- Room code is generated as a unique 6-character alphanumeric string.
- Scoring formula:
  - `points = floor(1000 * timeRemaining / timeLimit)` for correct answers.
  - Wrong or missing answer gives `0`.
- Question finishes when timer expires or all current players answered.
- After `question_result`, next question starts after a short server delay (`3000ms`).
- After the last question, server broadcasts `game_finished` with ranked scoreboard.

## Disconnect Behavior

- Player disconnect:
  - removed from game player list,
  - `update_players` is broadcast to remaining participants,
  - if this leaves no players in progress, game is completed.
- Host disconnect:
  - game is completed immediately,
  - remaining players receive `game_finished`.
- Timers are cleared during cleanup, and detached games are removed from memory.

## Verification (Final Smoke)

The following scenarios were verified end-to-end:

- Authentication: register/login success and invalid password flow.
- Game lifecycle: create -> join -> start -> answer -> results -> next question -> finish.
- Scoring: correct/incorrect/no-answer, with speed-based points.
- Question completion by both triggers:
  - all players answered,
  - timer expiry.
- Robust protocol handling:
  - invalid JSON,
  - unknown command,
  - invalid envelope fields.
- Disconnect handling:
  - player disconnect in lobby updates player list,
  - host disconnect during game ends session with `game_finished`,
  - player disconnect mid-game updates roster and game state.

## Limitations

- Data is in-memory only and is lost when the process restarts.
