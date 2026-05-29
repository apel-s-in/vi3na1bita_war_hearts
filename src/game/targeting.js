import { getShipCellsAt, isShipSunk } from './board.js';

export const getOpenTargets = board => {
  const cells = [];

  board.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (!cell.status) cells.push({ x, y, cell });
    });
  });

  return cells;
};

export const pickRandom = list => list[Math.floor(Math.random() * list.length)] || null;

export const getAdjacentOpenTargets = (board, x, y) => [
  { x: x + 1, y },
  { x: x - 1, y },
  { x, y: y + 1 },
  { x, y: y - 1 }
].filter(point => {
  const cell = board[point.y]?.[point.x];
  return cell && !cell.status;
}).map(point => ({
  ...point,
  cell: board[point.y][point.x]
}));

export const getKnownWoundedHits = board => {
  const hits = [];

  board.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell.status !== 'hit') return;

      const shipCells = getShipCellsAt(board, x, y);
      if (shipCells.length && isShipSunk(board, shipCells)) return;

      hits.push({ x, y, cell });
    });
  });

  return hits;
};

export const pickSmartTarget = board => {
  const wounded = getKnownWoundedHits(board);

  if (wounded.length) {
    const byRows = new Map();
    const byCols = new Map();

    wounded.forEach(point => {
      byRows.set(point.y, [...(byRows.get(point.y) || []), point]);
      byCols.set(point.x, [...(byCols.get(point.x) || []), point]);
    });

    const lineCandidates = [];

    byRows.forEach(points => {
      if (points.length < 2) return;

      const sorted = points.slice().sort((a, b) => a.x - b.x);
      const left = { x: sorted[0].x - 1, y: sorted[0].y };
      const right = { x: sorted[sorted.length - 1].x + 1, y: sorted[0].y };

      [left, right].forEach(point => {
        const cell = board[point.y]?.[point.x];
        if (cell && !cell.status) lineCandidates.push({ ...point, cell });
      });
    });

    byCols.forEach(points => {
      if (points.length < 2) return;

      const sorted = points.slice().sort((a, b) => a.y - b.y);
      const top = { x: sorted[0].x, y: sorted[0].y - 1 };
      const bottom = { x: sorted[0].x, y: sorted[sorted.length - 1].y + 1 };

      [top, bottom].forEach(point => {
        const cell = board[point.y]?.[point.x];
        if (cell && !cell.status) lineCandidates.push({ ...point, cell });
      });
    });

    if (lineCandidates.length) return pickRandom(lineCandidates);

    const adjacent = wounded.flatMap(point => getAdjacentOpenTargets(board, point.x, point.y));
    if (adjacent.length) return pickRandom(adjacent);
  }

  const open = getOpenTargets(board);
  if (!open.length) return null;

  // Честный базовый приоритет: шахматные клетки, без знания скрытых кораблей.
  const checker = open.filter(point => (point.x + point.y) % 2 === 0);
  return pickRandom(checker.length ? checker : open);
};

export const pickRandomTarget = board => pickSmartTarget(board);
