import { GAME_RULES, isInsideBoard } from './rules.js';

export const BOARD_SIZE = GAME_RULES.boardSize;
export const LETTERS = ['А', 'Б', 'В', 'Г', 'Д', 'Е', 'Ж', 'З', 'И', 'К'];

export const createEmptyBoard = () => Array.from({ length: BOARD_SIZE }, () =>
  Array.from({ length: BOARD_SIZE }, () => ({ ship: false, status: '' }))
);

export const cloneBoard = board => board.map(row => row.map(cell => ({ ...cell })));

export const createFleet = () => GAME_RULES.ships.map((size, index) => ({
  id: index,
  size,
  x: null,
  y: null,
  isVert: false,
  placed: false
}));

// Проверка: можно ли поставить корабль в данные координаты с учетом правил (зазор 1 клетка)
export const canPlaceShip = (fleet, targetShipId, size, x, y, isVert) => {
  if (!isInsideBoard(x, y)) return false;
  if (isVert && y + size > BOARD_SIZE) return false;
  if (!isVert && x + size > BOARD_SIZE) return false;

  // Проверяем все расставленные корабли
  for (const ship of fleet) {
    if (!ship.placed || ship.id === targetShipId) continue;

    // Зона вокруг проверяемого корабля (включая диагонали)
    const minX = x - 1;
    const maxX = (isVert ? x : x + size - 1) + 1;
    const minY = y - 1;
    const maxY = (isVert ? y + size - 1 : y) + 1;

    // Координаты уже стоящего корабля
    const sMinX = ship.x;
    const sMaxX = ship.isVert ? ship.x : ship.x + ship.size - 1;
    const sMinY = ship.y;
    const sMaxY = ship.isVert ? ship.y + ship.size - 1 : ship.y;

    // Проверка пересечения зон (AABB collision)
    if (minX <= sMaxX && maxX >= sMinX && minY <= sMaxY && maxY >= sMinY) {
      return false; // Слишком близко!
    }
  }
  return true;
};

// Расставляет один корабль на случайное валидное место
export const placeShipRandomly = (fleet, shipId) => {
  const ship = fleet.find(s => s.id === shipId);
  if (!ship) return false;

  const attempts = 100;
  for (let i = 0; i < attempts; i++) {
    const isVert = Math.random() > 0.5;
    const x = Math.floor(Math.random() * BOARD_SIZE);
    const y = Math.floor(Math.random() * BOARD_SIZE);

    if (canPlaceShip(fleet, ship.id, ship.size, x, y, isVert)) {
      ship.x = x;
      ship.y = y;
      ship.isVert = isVert;
      ship.placed = true;
      return true;
    }
  }
  return false;
};

export const autoPlaceFleet = (fleet) => {
  fleet.forEach(s => s.placed = false);
  let success = false;
  while (!success) {
    fleet.forEach(s => s.placed = false);
    success = fleet.every(ship => placeShipRandomly(fleet, ship.id));
  }
  return fleet;
};

export const syncFleetToBoard = (fleet, board) => {
  // Очищаем корабли, оставляем статусы выстрелов
  board.forEach(row => row.forEach(cell => cell.ship = false));
  
  fleet.forEach(ship => {
    if (!ship.placed) return;
    for (let i = 0; i < ship.size; i++) {
      const cy = ship.isVert ? ship.y + i : ship.y;
      const cx = ship.isVert ? ship.x : ship.x + i;
      if (isInsideBoard(cx, cy)) board[cy][cx].ship = true;
    }
  });
  return board;
};

export const formatCellName = (x, y) => `${LETTERS[x] || '?'}${Number(y) + 1}`;

export const getShipCellsAt = (board, x, y) => {
  if (!board[y]?.[x]?.ship) return [];

  const seen = new Set();
  const out = [];
  const stack = [{ x, y }];

  while (stack.length) {
    const point = stack.pop();
    const key = `${point.x}:${point.y}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const cell = board[point.y]?.[point.x];
    if (!cell?.ship) continue;

    out.push(point);

    [
      { x: point.x + 1, y: point.y },
      { x: point.x - 1, y: point.y },
      { x: point.x, y: point.y + 1 },
      { x: point.x, y: point.y - 1 }
    ].forEach(next => {
      if (isInsideBoard(next.x, next.y) && board[next.y]?.[next.x]?.ship) {
        stack.push(next);
      }
    });
  }

  return out;
};

export const isShipSunk = (board, shipCells) =>
  shipCells.length > 0 && shipCells.every(({ x, y }) => board[y]?.[x]?.status === 'hit');

export const markSunkPerimeter = (board, shipCells) => {
  let marked = 0;

  shipCells.forEach(({ x, y }) => {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if (!isInsideBoard(nx, ny)) continue;

        const cell = board[ny]?.[nx];
        if (!cell || cell.ship || cell.status) continue;

        cell.status = 'blocked';
        marked++;
      }
    }
  });

  return marked;
};
