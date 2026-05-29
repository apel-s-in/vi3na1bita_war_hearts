import { GAME_RULES, isInsideBoard } from './rules.js';

const textEncoder = new TextEncoder();

export const createSalt = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(x => x.toString(16).padStart(2, '0')).join('');
};

const weakHash = text => {
  let h1 = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h1 ^= text.charCodeAt(i);
    h1 = Math.imul(h1, 0x01000193);
  }
  return `weak_${(h1 >>> 0).toString(16).padStart(8, '0')}`;
};

export const sha256Hex = async text => {
  if (!crypto?.subtle) return weakHash(String(text || ''));

  const data = textEncoder.encode(String(text || ''));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map(x => x.toString(16).padStart(2, '0'))
    .join('');
};

export const packBoardReveal = board => {
  const ships = [];

  board.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell.ship) ships.push({ x, y });
    });
  });

  ships.sort((a, b) => a.y === b.y ? a.x - b.x : a.y - b.y);

  return {
    size: GAME_RULES.boardSize,
    ships
  };
};

export const canonicalReveal = reveal => {
  const ships = Array.isArray(reveal?.ships) ? reveal.ships : [];
  const normalized = ships
    .map(p => ({ x: Number(p.x), y: Number(p.y) }))
    .filter(p => Number.isInteger(p.x) && Number.isInteger(p.y))
    .sort((a, b) => a.y === b.y ? a.x - b.x : a.y - b.y);

  return JSON.stringify({
    size: GAME_RULES.boardSize,
    ships: normalized
  });
};

export const createBoardCommit = async (board, salt = createSalt()) => {
  const reveal = packBoardReveal(board);
  const hash = await sha256Hex(`${salt}:${canonicalReveal(reveal)}`);

  return {
    algorithm: 'sha256',
    saltPreview: salt.slice(0, 6),
    hash
  };
};

export const verifyBoardCommit = async ({ reveal, salt, commitHash }) => {
  if (!salt || !commitHash) {
    return {
      ok: false,
      reason: 'commit_data_missing'
    };
  }

  const hash = await sha256Hex(`${salt}:${canonicalReveal(reveal)}`);

  return {
    ok: hash === commitHash,
    reason: hash === commitHash ? 'ok' : 'commit_mismatch',
    hash
  };
};

export const applyRevealToBoard = (board, reveal) => {
  const ships = new Set((reveal?.ships || []).map(p => `${Number(p.x)}:${Number(p.y)}`));

  board.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (ships.has(`${x}:${y}`)) cell.ship = true;
    });
  });

  return board;
};

const collectShips = reveal => {
  const set = new Set((reveal?.ships || []).map(p => `${Number(p.x)}:${Number(p.y)}`));
  const seen = new Set();
  const ships = [];

  for (const key of set) {
    if (seen.has(key)) continue;

    const [sx, sy] = key.split(':').map(Number);
    const stack = [{ x: sx, y: sy }];
    const cells = [];

    while (stack.length) {
      const point = stack.pop();
      const pkey = `${point.x}:${point.y}`;
      if (seen.has(pkey) || !set.has(pkey)) continue;

      seen.add(pkey);
      cells.push(point);

      [
        { x: point.x + 1, y: point.y },
        { x: point.x - 1, y: point.y },
        { x: point.x, y: point.y + 1 },
        { x: point.x, y: point.y - 1 }
      ].forEach(next => {
        if (isInsideBoard(next.x, next.y) && set.has(`${next.x}:${next.y}`)) {
          stack.push(next);
        }
      });
    }

    ships.push(cells);
  }

  return ships;
};

export const validateRevealLayout = reveal => {
  const size = Number(reveal?.size || GAME_RULES.boardSize);
  const points = Array.isArray(reveal?.ships) ? reveal.ships : [];

  if (size !== GAME_RULES.boardSize) {
    return {
      ok: false,
      reason: 'bad_board_size'
    };
  }

  const pointSet = new Set();

  for (const point of points) {
    const x = Number(point.x);
    const y = Number(point.y);

    if (!isInsideBoard(x, y)) {
      return {
        ok: false,
        reason: 'ship_cell_outside_board'
      };
    }

    const key = `${x}:${y}`;
    if (pointSet.has(key)) {
      return {
        ok: false,
        reason: 'duplicate_ship_cell'
      };
    }

    pointSet.add(key);
  }

  const ships = collectShips(reveal);
  const sizes = ships.map(ship => ship.length).sort((a, b) => b - a);
  const expected = GAME_RULES.ships.slice().sort((a, b) => b - a);

  if (sizes.join(',') !== expected.join(',')) {
    return {
      ok: false,
      reason: 'bad_fleet_composition',
      sizes,
      expected
    };
  }

  for (const ship of ships) {
    const xs = [...new Set(ship.map(p => p.x))];
    const ys = [...new Set(ship.map(p => p.y))];

    if (xs.length > 1 && ys.length > 1) {
      return {
        ok: false,
        reason: 'bent_ship'
      };
    }

    const sorted = ship.slice().sort((a, b) => xs.length === 1 ? a.y - b.y : a.x - b.x);
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1];
      const cur = sorted[i];
      const continuous = xs.length === 1
        ? cur.x === prev.x && cur.y === prev.y + 1
        : cur.y === prev.y && cur.x === prev.x + 1;

      if (!continuous) {
        return {
          ok: false,
          reason: 'ship_has_gap'
        };
      }
    }
  }

  const shipByCell = new Map();
  ships.forEach((ship, index) => {
    ship.forEach(point => shipByCell.set(`${point.x}:${point.y}`, index));
  });

  for (const ship of ships) {
    for (const point of ship) {
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;

          const nx = point.x + dx;
          const ny = point.y + dy;
          if (!isInsideBoard(nx, ny)) continue;

          const other = shipByCell.get(`${nx}:${ny}`);
          const self = shipByCell.get(`${point.x}:${point.y}`);

          if (other !== undefined && other !== self) {
            return {
              ok: false,
              reason: 'ships_touch'
            };
          }
        }
      }
    }
  }

  return {
    ok: true,
    reason: 'ok',
    ships: ships.length,
    sizes
  };
};
