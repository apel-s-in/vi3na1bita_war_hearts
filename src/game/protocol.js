export const PROTOCOL_VERSION = 'war-hearts-v0.1';

export const MessageType = Object.freeze({
  HELLO: 'HELLO',
  READY: 'READY',
  BOARD_COMMIT: 'BOARD_COMMIT',
  BOARD_REVEAL: 'BOARD_REVEAL',
  SHOT: 'SHOT',
  SHOT_RESULT: 'SHOT_RESULT',
  TURN_STATE: 'TURN_STATE',
  CHAT_MESSAGE: 'CHAT_MESSAGE',
  VOICE_STATE: 'VOICE_STATE',
  MATCH_FINISHED: 'MATCH_FINISHED',
  MATCH_ABORTED: 'MATCH_ABORTED',
  PING: 'PING',
  PONG: 'PONG'
});

export const createMessage = (type, payload = {}) => ({
  v: PROTOCOL_VERSION,
  type,
  payload,
  at: Date.now()
});
