import { renderProfileCard } from '../ui/profile-card.js';
import { evaluateAchievements, summarizeProgress } from '../game/achievements.js';

export const renderMenu = (root, state, actions) => {
  const prepWrap = document.createElement('div');
  prepWrap.style.margin = '0 0 12px';
  prepWrap.innerHTML = `
    <button class="wh-btn" type="button" style="width:100%; font-size:15px; padding:18px 12px; background:linear-gradient(135deg, var(--wh-red), var(--wh-pink)); box-shadow:0 12px 28px rgba(255,49,89,0.25); text-transform:uppercase; letter-spacing:0.5px;">
      Выбрать соперника и начать
    </button>
  `;
  prepWrap.querySelector('button').onclick = () => actions.openOpponents();

  root.append(
    hero(),
    renderProfileCard(state.player, getProfileStats(state)),
    prepWrap,
    renderMenuTabs(state, actions)
  );
};

const hero = () => {
  const el = document.createElement('div');
  el.className = 'wh-intro-text';
  el.innerHTML = `Классическая дуэль 10×10. Расставь сердца, найди сердца соперника и разбей их первым.`;
  return el;
};

const getSavedStats = state =>
  state.matchStats || {};

const getSavedHistory = state => {
  const data = state.snapshot?.gameData || {};
  const saved =
    data.war_hearts_matchHistory ||
    data.matchHistory;

  return Array.isArray(saved) ? saved : [];
};

const getProfileStats = state => {
  const stats = getSavedStats(state);
  const history = getSavedHistory(state);
  const p = summarizeProgress({ stats, history });

  return {
    wins: p.wins,
    losses: p.losses,
    rank: p.wins >= 10
      ? 'Адмирал Сердец'
      : p.hits >= 100
        ? 'Меткий слушатель'
        : p.matches >= 10
          ? 'Игрок арены'
          : 'Без рейтинга'
  };
};

const renderMenuTabs = (state, actions) => {
  const tab = state.menuTab || 'stats';
  const el = document.createElement('section');
  el.className = 'wh-menu-flat';

  el.innerHTML = `
    <div class="wh-menu-tabs">
      <button class="${tab === 'stats' ? 'is-active' : ''}" type="button" data-tab="stats">Статистика</button>
      <button class="${tab === 'achievements' ? 'is-active' : ''}" type="button" data-tab="achievements">Достижения</button>
    </div>
    <div class="wh-menu-tab-body"></div>
  `;

  el.querySelector('[data-tab="stats"]')?.addEventListener('click', () => actions.setMenuTab('stats'));
  el.querySelector('[data-tab="achievements"]')?.addEventListener('click', () => actions.setMenuTab('achievements'));

  const body = el.querySelector('.wh-menu-tab-body');
  if (body) body.append(tab === 'achievements' ? renderAchievements(state) : renderStats(state));

  return el;
};

const renderStats = state => {
  const stats = getSavedStats(state);
  const history = getSavedHistory(state);
  const p = summarizeProgress({ stats, history });
  const accuracy = p.shots ? Math.round((p.hits / p.shots) * 100) : 0;

  const el = document.createElement('div');
  el.className = 'wh-stats-wrap';
  el.innerHTML = `
    <div class="wh-stat-grid">
      <div><span>Бои</span><b>${p.matches}</b></div>
      <div><span>Победы</span><b>${p.wins}</b></div>
      <div><span>Поражения</span><b>${p.losses}</b></div>
      <div><span>Точность</span><b>${accuracy}%</b></div>
      <div><span>Выстрелы</span><b>${p.shots}</b></div>
      <div><span>Попадания</span><b>${p.hits}</b></div>
      <div><span>Убито кораблей</span><b>${p.sunk}</b></div>
      <div><span>Лучший страйк</span><b>${p.bestStreak}</b></div>
    </div>
  `;

  el.append(renderHistory(history));
  return el;
};

const renderHistory = history => {
  const el = document.createElement('details');
  el.className = 'wh-history';
  el.innerHTML = `
    <summary>
      <span>История боёв</span>
      <b>${history.length}</b>
    </summary>
    <div class="wh-history-list">
      ${history.length ? history.slice(0, 50).map(renderHistoryRow).join('') : `
        <div class="wh-history-empty">История появится после завершения первого боя.</div>
      `}
    </div>
  `;
  return el;
};

const renderHistoryRow = row => {
  const dt = formatDateTime(row.finishedAt);
  const resultClass = row.result === 'win' ? 'is-win' : 'is-loss';
  const resultText = row.result === 'win' ? 'ПБ' : 'ПР';
  const balance = Number(row.balance || 0);
  const balanceText = balance > 0 ? `+${balance}` : String(balance);
  const opponent = row.opponentName || (row.opponentType === 'computer' ? 'Компьютер' : 'Соперник');

  return `
    <div class="wh-history-row ${resultClass}">
      <span class="wh-history-date">${escapeHtml(dt)}</span>
      <span class="wh-history-vs">${escapeHtml(row.opponentIcon || '🎮')} ${escapeHtml(opponent)}</span>
      <span class="wh-history-score">${Number(row.playerSunk || 0)}:${Number(row.opponentSunk || 0)}</span>
      <span class="wh-history-acc">${Number(row.accuracy || 0)}%</span>
      <span class="wh-history-bal">${escapeHtml(balanceText)}</span>
      <b>${resultText}</b>
    </div>
  `;
};

const renderAchievements = state => {
  const stats = getSavedStats(state);
  const history = getSavedHistory(state);
  const items = evaluateAchievements({ stats, history });

  const el = document.createElement('div');
  el.className = 'wh-ach-grid';
  el.innerHTML = items.map(item => `
    <div class="wh-ach ${item.ok ? 'is-open' : ''}" title="${escapeHtml(item.desc)}">
      <span>${escapeHtml(item.icon)}</span>
      <b>${escapeHtml(item.title)}</b>
    </div>
  `).join('');

  return el;
};

const formatDateTime = value => {
  const date = value ? new Date(value) : new Date();
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}.${mm} ${hh}:${min}`;
};

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
})[ch]);
