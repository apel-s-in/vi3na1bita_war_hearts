import { escapeHtml } from './escape.js';

export const renderProfileCard = (player, stats = {}) => {
  const el = document.createElement('section');
  el.className = 'wh-card';
  el.innerHTML = `
    <div class="wh-row">
      <div class="wh-profile">
        <div class="wh-avatar">👤</div>
        <div>
          <h3>${escapeHtml(player.name)}</h3>
          <p>${escapeHtml(player.title || 'Игрок')}</p>
        </div>
      </div>
    </div>

    <div class="wh-row" style="margin-top:12px">
      <p>Победы: <b>${Number(stats.wins || 0)}</b></p>
      <p>Поражения: <b>${Number(stats.losses || 0)}</b></p>
    </div>
    <p>Ранг: <b>${escapeHtml(stats.rank || 'Без рейтинга')}</b></p>
  `;
  return el;
};
