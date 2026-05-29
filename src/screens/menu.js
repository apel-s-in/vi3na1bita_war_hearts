import { renderProfileCard } from '../ui/profile-card.js';

export const renderMenu = (root, state, actions) => {
  const prepWrap = document.createElement('div');
  prepWrap.style.margin = '0 0 12px';
  prepWrap.innerHTML = `
    <button class="wh-btn" type="button" style="width:100%; font-size:15px; padding:18px 12px; background:linear-gradient(135deg, var(--wh-red), var(--wh-pink)); box-shadow:0 12px 28px rgba(255,49,89,0.25); text-transform:uppercase; letter-spacing:0.5px;">
      Начать подготовку к бою
    </button>
  `;
  prepWrap.querySelector('button').onclick = () => actions.openField();

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

const getSavedStats = state => {
  const data = state.snapshot?.gameData || {};
  return data.war_hearts_matchStats?.stats || data.matchStats?.stats || state.matchStats || {};
};

const getProfileStats = state => {
  const s = getSavedStats(state);
  return {
    wins: state.result === 'win' ? 1 : 0,
    losses: state.result === 'loss' ? 1 : 0,
    rank: Number(s.playerHits || 0) >= 100 ? 'Меткий слушатель' : 'Без рейтинга'
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
  const s = getSavedStats(state);
  const shots = Number(s.playerShots || 0);
  const hits = Number(s.playerHits || 0);
  const misses = Number(s.playerMisses || 0);
  const accuracy = shots ? Math.round((hits / shots) * 100) : 0;

  const el = document.createElement('div');
  el.className = 'wh-stat-grid';
  el.innerHTML = `
    <div><span>Выстрелы</span><b>${shots}</b></div>
    <div><span>Попадания</span><b>${hits}</b></div>
    <div><span>Промахи</span><b>${misses}</b></div>
    <div><span>Точность</span><b>${accuracy}%</b></div>
    <div><span>Убито кораблей</span><b>${Number(s.playerSunk || 0)}</b></div>
    <div><span>Лучший страйк</span><b>${Number(s.playerBestHitStreak || 0)}</b></div>
    <div><span>Страйк соперника</span><b>${Number(s.opponentBestHitStreak || 0)}</b></div>
    <div><span>Матч</span><b>${state.result ? (state.result === 'win' ? 'Победа' : 'Поражение') : 'Нет'}</b></div>
  `;
  return el;
};

const renderAchievements = state => {
  const s = getSavedStats(state);
  const hits = Number(s.playerHits || 0);
  const sunk = Number(s.playerSunk || 0);
  const streak = Number(s.playerBestHitStreak || 0);
  const shots = Number(s.playerShots || 0);

  const items = [
    { icon: '🎯', title: 'Первое попадание', ok: hits >= 1 },
    { icon: '🔥', title: 'Страйк 3', ok: streak >= 3 },
    { icon: '💥', title: '10 попаданий', ok: hits >= 10 },
    { icon: '🚢', title: '5 кораблей', ok: sunk >= 5 },
    { icon: '🏹', title: 'Снайпер', ok: hits >= 100 },
    { icon: '🌊', title: '100 выстрелов', ok: shots >= 100 },
    { icon: '👑', title: 'Победитель', ok: state.result === 'win' },
    { icon: '💔', title: 'Не сдавайся', ok: state.result === 'loss' }
  ];

  const el = document.createElement('div');
  el.className = 'wh-ach-grid';
  el.innerHTML = items.map(item => `
    <div class="wh-ach ${item.ok ? 'is-open' : ''}">
      <span>${item.icon}</span>
      <b>${item.title}</b>
    </div>
  `).join('');
  return el;
};
