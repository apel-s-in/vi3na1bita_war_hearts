export const GAME_RULES = {
  id: 'war_hearts_classic_10x10',
  boardSize: 10,
  ships: [4, 3, 3, 2, 2, 2, 1, 1, 1, 1],
  turnMode: 'classic',
  chat: true,
  voice: true
};

export const isInsideBoard = (x, y) =>
  Number.isInteger(x) && Number.isInteger(y) && x >= 0 && y >= 0 && x < GAME_RULES.boardSize && y < GAME_RULES.boardSize;
