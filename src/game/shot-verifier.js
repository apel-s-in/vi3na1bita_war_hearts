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
        if (isInsideBoard(next.x, next.y) && shipSet.has(keyOf(next.x, next.y))) {
          stack.push(next);
        }
      });
    }

    ships.push(cells);
  }

  return ships;
};

const findShipAt = (ships, x, y) => {
  const key = keyOf(x, y);
  return ships.find(ship => ship.some(point => keyOf(point.x, point.y) === key)) || [];
};

const sameCellSet = (a, b) => {
  const aa = new Set((a || []).map(point => keyOf(point.x, point.y)));
  const bb = new Set((b || []).map(point => keyOf(point.x, point.y)));

  if (aa.size !== bb.size) return false;

  for (const key of aa) {
    if (!bb.has(key)) return false;
  }

  return true;
};

export const verifyShotResultsAgainstReveal = ({ shots = [], reveal = null } = {}) => {
  const normalized = normalizeShots(shots);
  const shipSet = buildShipSet(reveal);
  const revealShips = collectRevealShips(reveal);
  const mismatches = [];

  normalized.forEach((shot, index) => {
    if (!shot.result) return;

    const hasShip = shipSet.has(keyOf(shot.x, shot.y));

    if (shot.result === 'miss' && hasShip) {
      mismatches.push({
        index,
        shotId: shot.shotId || '',
        x: shot.x,
        y: shot.y,
        expected: 'hit',
        actual: 'miss',
        reason: 'miss_on_ship_cell'
      });
      return;
    }

    if ((shot.result === 'hit' || shot.result === 'sunk') && !hasShip) {
      mismatches.push({
        index,
        shotId: shot.shotId || '',
        x: shot.x,
        y: shot.y,
        expected: 'miss',
        actual: shot.result,
        reason: 'hit_on_empty_cell'
      });
      return;
    }

    if (shot.result === 'sunk') {
      const revealShip = findShipAt(revealShips, shot.x, shot.y);

      if (!revealShip.length) {
        mismatches.push({
          index,
          shotId: shot.shotId || '',
          x: shot.x,
          y: shot.y,
          expected: 'ship',
          actual: 'no_ship',
          reason: 'sunk_without_ship'
        });
        return;
      }

      if (shot.sunkCells.length && !sameCellSet(shot.sunkCells, revealShip)) {
        mismatches.push({
          index,
          shotId: shot.shotId || '',
          x: shot.x,
          y: shot.y,
          expected: revealShip,
          actual: shot.sunkCells,
          reason: 'sunk_cells_mismatch'
        });
      }
    }
  });

  return {
    ok: mismatches.length === 0,
    reason: mismatches.length ? 'shot_result_mismatch' : 'ok',
    checked: normalized.filter(shot => shot.result).length,
    mismatches
  };
};
