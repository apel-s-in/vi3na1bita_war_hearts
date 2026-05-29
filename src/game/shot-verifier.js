import { isInsideBoard } from './rules.js';

const keyOf = (x, y) => `${Number(x)}:${Number(y)}`;

const normalizePoint = point => ({
  x: Number(point?.x),
  y: Number(point?.y)
});

const normalizeShots = shots => Array.isArray(shots)
  ? shots.map(shot => ({
    ...shot,
    x: Number(shot.x),
    y: Number(shot.y),
    result: String(shot.result || ''),
    sunkCells: Array.isArray(shot.sunkCells)
      ? shot.sunkCells.map(normalizePoint).filter(p => isInsideBoard(p.x, p.y))
      : []
  })).filter(shot => isInsideBoard(shot.x, shot.y))
  : [];

const buildShipSet = reveal => {
  const set = new Set();

  (Array.isArray(reveal?.ships) ? reveal.ships : []).forEach(point => {
    const p = normalizePoint(point);
    if (isInsideBoard(p.x, p.y)) set.add(keyOf(p.x, p.y));
  });

  return set;
};

const collectRevealShips = reveal => {
  const shipSet = buildShipSet(reveal);
  const seen = new Set();
  const ships = [];

  for (const key of shipSet) {
    if (seen.has(key)) continue;

    const [sx, sy] = key.split(':').map(Number);
    const stack = [{ x: sx, y: sy }];
    const cells = [];

    while (stack.length) {
      const point = stack.pop();
      const pkey = keyOf(point.x, point.y);

      if (seen.has(pkey) || !shipSet.has(pkey)) continue;

      seen.add(pkey);
      cells.push({ x: point.x, y: point.y });

      [
        { x: point.x + 1, y: point.y },
        { x: point.x - 1, y: point.y },
        { x: point.x, y: point.y + 1 },
        { x: point.x, y: point.y - 1 }
      ].forEach(next => {
        if
