export const renderOpponentSelect = (root, state, actions) => {
  const friends = getFriends(state);
  const prepared = state.fleet?.every?.(ship => ship.placed);
  const fromSetup = state.phase === 'setup' || state.screen === 'opponents';

  const el = document.createElement('section');
  el.className = 'wh-opponents-page';
  el.innerHTML = `
    <div class="wh-opponent-head">
      <h2>Соперник</h2>
      <p>${prepared ? 'Поле готово. Выбери формат боя.' : 'Сначала расставь все корабли на вкладке «Поле».'}</p>
    </div>

    <div class="wh-opponent-block">
      <h3>Быстрый старт</h3>
      <div class="wh-actions">
        <button class="wh-btn" type="button" data-act="computer">${fromSetup ? 'Начать бой с компьютером' : 'Играть с компьютером'}</button>
        <button class="wh-btn secondary" type="button" data-act="mock">Preview-бой с другом рядом</button>
        <button class="wh-btn secondary" type="button" data-act="invite">Пригласить по ссылке</button>
      </div>
    </div>

    <div class="wh-opponent-block">
      <h3>Друзья</h3>
      <p>${friends.length ? 'Друзья из Game Center.' : 'Список друзей появится здесь после подключения общего friend-модуля.'}</p>
      <div class="wh-friends-list">
        ${friends.length ? friends.map(friend => `
          <button class="wh-friend-row" type="button" data-friend="${escapeHtml(friend.id)}">
            <span>${escapeHtml(friend.avatar || '👤')}</span>
            <b>${escapeHtml(friend.name || 'Друг')}</b>
            <small>${friend.online ? 'онлайн' : 'не в сети'}</small>
          </button>
        `).join('') : `
          <div class="wh-friend-empty">
            <span>👥</span>
            <b>Друзей пока нет</b>
            <small>Позже сюда придёт единый список друзей из Башни и основного приложения.</small>
          </div>
        `}
      </div>
    </div>
  `;

  el.querySelector('[data-act="computer"]')?.addEventListener('click', actions.startComputerGame);
  el.querySelector('[data-act="mock"]')?.addEventListener('click', actions.acceptMockOpponent);
  el.querySelector('[data-act="invite"]')?.addEventListener('click', actions.createInvite);

  root.append(el);
};

const getFriends = state => {
  const data = state.snapshot || {};
  const raw = data.friends || data.social?.friends || data.gameData?.friends || [];
  return Array.isArray(raw) ? raw.slice(0, 30) : [];
};

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
})[ch]);
