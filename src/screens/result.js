export const renderResult = (root, state, actions) => {
  const el = document.createElement('section');
  el.className = 'wh-card wh-hero';
  el.innerHTML = `
    <div class="wh-hero-mark">${state.result === 'win' ? '🏆' : '💔'}</div>
    <h2>${state.result === 'win' ? 'Победа!' : state.result === 'loss' ? 'Поражение' : 'Матч завершён'}</h2>
    <p>${state.opponent?.type === 'computer' ? 'Тренировка завершена. Позже компьютер станет умнее и появятся уровни сложности.' : 'Позже здесь будет подтверждение результата, hash партии и отправка статистики в Game Center.'}</p>
    <div class="wh-actions">
      <button class="wh-btn" type="button" data-act="menu">В главное меню</button>
    </div>
  `;

  el.querySelector('[data-act="menu"]')?.addEventListener('click', actions.openMenu);
  root.append(el);
};
