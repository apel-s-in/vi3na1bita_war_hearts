export const PROTOCOL_VERSION = 'war-hearts-v0.1';

export const MessageType = Object.freeze({
  HELLO: 'HELLO',
  READY: 'READY',
  BOARD_COMMIT: 'BOARD_COMMIT',
  SHOT: 'SHOT',
  SHOT_RESULT: 'SHOT_RESULT',
  CHAT_MESSAGE: 'CHAT_MESSAGE',
  VOICE_STATE: 'VOICE_STATE',
  MATCH_FINISHED: 'MATCH_FINISHED',
  PING: 'PING',
  PONG: 'PONG'
});

export const createMessage = (type, payload = {}) => ({
  v: PROTOCOL_VERSION,
  type,
  payload,
  at: Date.now()
});
