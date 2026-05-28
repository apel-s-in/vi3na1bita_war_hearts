import { LETTERS } from '../game/board.js';

export const renderBoard = (board, { mode = 'own', target = null, onCell = null } = {}) => {
  const el = document.createElement('div');
  el.className = 'wh-board';

  // ВЕРХНИЙ РЯД: пусто, буквы, пусто
  el.append(label(''));
  LETTERS.forEach(letter => el.append(label(letter)));
  el.append(label(''));

  board.forEach((row, y) => {
    // ЦИФРА СЛЕВА
    el.append(label(String(y + 1)));

    row.forEach((cell, x) => {
      const btn = document.createElement('button');
      // Честно прокидываем ВСЕ статусы (hit, miss, valid-move, active-ship)
      const targeted = target && target.x === x && target.y === y;
      const inTargetRow = target && target.y === y;
      const inTargetCol = target && target.x === x;

      btn.className = [
        'wh-cell',
        mode === 'own' && cell.ship ? 'ship' : '',
        cell.status || '',
        inTargetRow ? 'target-row' : '',
        inTargetCol ? 'target-col' : '',
        targeted ? 'target-cell' : ''
      ].filter(Boolean).join(' ');
      
      btn.type = 'button';
      btn.textContent = cell.status === 'hit' ? '✹' : cell.status === 'miss' ? '•' : '';
      btn.setAttribute('aria-label', `${LETTERS[x]}${y + 1}`);

      if (cell.status === 'blocked') {
        btn.disabled = true;
      }

      // Вешаем клик всегда, если передан onCell и клетка не закрыта правилами.
      if (onCell && cell.status !== 'blocked') {
        btn.addEventListener('click', () => onCell(x, y));
      }

      el.append(btn);
    });

    // ЦИФРА СПРАВА
    el.append(label(String(y + 1)));
  });

  // НИЖНИЙ РЯД: пусто, буквы, пусто
  el.append(label(''));
  LETTERS.forEach(letter => el.append(label(letter)));
  el.append(label(''));

  return el;
};

const label = text => {
  const el = document.createElement('div');
  el.className = 'wh-cell label';
  el.textContent = text;
  return el;
};
