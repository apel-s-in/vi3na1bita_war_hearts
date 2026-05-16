import { renderBoard } from '../ui/board-view.js';

export const renderField = (root, state, actions) => {
  const el = document.createElement('section');
  el.className = 'wh-card';
  el.innerHTML = `
    <h2>Твоё поле</h2>
    <p>Здесь будут расставляться твои сердца перед началом дуэли.</p>
    <div class="wh-board-wrap" style="margin-top:16px"></div>
  `;
  
  const wrap = el.querySelector('.wh-board-wrap');
  // Рендерим доску в режиме 'own', чтобы показать розовые сердца
  wrap.append(renderBoard(state.myBoard, { mode: 'own' }));

  root.append(el);
};
