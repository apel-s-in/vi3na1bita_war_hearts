import { LETTERS } from '../game/board.js';

export const renderBoard = (board, { mode = 'own', onCell = null } = {}) => {
  const el = document.createElement('div');
  el.className = 'wh-board';

  el.append(label(''));

  LETTERS.forEach(letter => {
    el.append(label(letter));
  });

  board.forEach((row, y) => {
    el.append(label(String(y + 1)));

    row.forEach((cell, x) => {
      const btn = document.createElement('button');
      btn.className = [
        'wh-cell',
        mode === 'own' && cell.ship ? 'ship' : '',
        cell.status === 'miss' ? 'miss' : '',
        cell.status === 'hit' ? 'hit' : ''
      ].filter(Boolean).join(' ');
      btn.type = 'button';
      btn.textContent = cell.status === 'hit' ? '✹' : cell.status === 'miss' ? '•' : '';
      btn.setAttribute('aria-label', `${LETTERS[x]}${y + 1}`);

      if (mode === 'enemy' && onCell) {
        btn.addEventListener('click', () => onCell(x, y));
      }

      el.append(btn);
    });
  });

  return el;
};

const label = text => {
  const el = document.createElement('div');
  el.className = 'wh-cell label';
  el.textContent = text;
  return el;
};
