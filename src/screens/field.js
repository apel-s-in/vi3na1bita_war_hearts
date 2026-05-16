import { renderBoard } from '../ui/board-view.js';
import { cloneBoard } from '../game/board.js';

export const renderField = (root, state, actions) => {
  const el = document.createElement('section');
  el.className = 'wh-card';
  el.innerHTML = `
    <h2>Твоё поле</h2>
    <p>Здесь будут расставляться твои сердца перед началом дуэли.</p>
    <div class="wh-board-wrap" style="margin-top:16px"></div>
  `;
  
  const wrap = el.querySelector('.wh-board-wrap');
  
  // Создаем чистую копию поля, чтобы на вкладке не отображались следы выстрелов из текущего боя
  const cleanBoard = cloneBoard(state.myBoard);
  cleanBoard.forEach(row => row.forEach(cell => cell.status = ''));
  
  wrap.append(renderBoard(cleanBoard, { mode: 'own' }));

  root.append(el);
};
