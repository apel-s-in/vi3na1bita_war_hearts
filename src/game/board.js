export const BOARD_SIZE = 10;
export const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К'];

export const createEmptyBoard = () => Array.from({ length: BOARD_SIZE }, () =>
  Array.from({ length: BOARD_SIZE }, () => ({
    ship: false,
    status: ''
  }))
);

export const cloneBoard = board => board.map(row => row.map(cell => ({ ...cell })));

export const autoPlaceMockShips = board => {
  const next = cloneBoard(board);
  const points = [
    [1, 1], [2, 1], [3, 1], [4, 1],
    [7, 2], [7, 3], [7, 4],
    [2, 6], [3, 6],
    [8, 8]
  ];

  points.forEach(([x, y]) => {
    if (next[y]?.[x]) next[y][x].ship = true;
  });

  return next;
};
