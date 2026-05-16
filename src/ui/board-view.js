import { LETTERS } from '../game/board.js';

export const renderBoard = (board, { mode = 'own', onCell = null } = {}) => {
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
      btn.className = [
        'wh-cell',
        mode === 'own' && cell.ship ? 'ship' : '',
        cell.status || ''
      ].filter(Boolean).join(' ');
      
      btn.type = 'button';
      btn.textContent = cell.status === 'hit' ? '✹' : cell.status === 'miss' ? '•' : '';
      btn.setAttribute('aria-label', `${LETTERS[x]}${y + 1}`);

      // Вешаем клик всегда, если передан onCell (раньше было только для enemy)
      if (onCell) {
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
