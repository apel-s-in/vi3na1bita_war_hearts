// src/screens/opponent-select.js
let friendsCore = null;

const loadRealFriends = async (container, state, actions) => {
  if (!state.friendIdentity?.friendId) {
    container.innerHTML = `
      <div class="wh-friend-empty">
        <span>🔒</span>
        <b>Войдите через Яндекс</b>
        <small>Список друзей доступен после входа в основном приложении.</small>
      </div>`;
    return;
  }

  container.innerHTML = `
    <div class="wh-friend-empty">
      <span>⏳</span>
      <b>Загружаем друзей...</b>
    </div>`;

  try {
    if (!friendsCore) {
      const { FriendsCore } = await import('/Friends/friends-core.js');
      friendsCore = new FriendsCore();
    }

    friendsCore.setIdentity(state.friendIdentity);
    const list = await friendsCore.getFriendList();

    if (!list.length) {
      container.innerHTML = `
        <div class="wh-friend-empty">
          <span>👥</span>
          <b>Друзей пока нет</b>
          <small>Добавьте друга по ссылке, коду или QR в Зале Витрины.</small>
        </div>`;
      return;
    }

    const presence = await friendsCore.getPresence(list.map(f => f.friendId));

    container.innerHTML = list.map(friend => {
      const fid = escapeHtml(friend.friendId);
      const name = escapeHtml(friend.profile?.displayName || 'Друг');
      const avatar = friend.profile?.avatarUrl 
        ? `<img src="${escapeHtml(friend.profile.avatarUrl)}" style="width:100%;height:100%;object-fit:cover;border-radius:12px;display:block">` 
        : '👤';
      const online = !!presence[friend.friendId]?.online;

      return `
        <button class="wh-friend-row" type="button" data-invite-friend="${fid}" data-fname="${name}">
          <span style="display:flex;align-items:center;justify-content:center;overflow:hidden">${avatar}</span>
          <b>${name}</b>
          <small class="${online ? 'is-online' : ''}" style="${online ? 'color:#adffdf' : ''}">${online ? 'онлайн' : 'не в сети'}</small>
        </button>
      `;
    }).join('');

    container.querySelectorAll('[data-invite-friend]').forEach(btn => {
      btn.addEventListener('click', () => {
        actions.inviteFriend(btn.dataset.inviteFriend, btn.dataset.fname);
      });
    });

  } catch (err) {
    container.innerHTML = `
      <div class="wh-friend-empty">
        <span>⚠️</span>
        <b>Ошибка загрузки</b>
        <small>${escapeHtml(err.message)}</small>
      </div>`;
  }
};

export const renderOpponentSelect = (root, state, actions) => {
  const prepared = state.fleet?.every?.(ship => ship.placed);
  const fromSetup = state.phase === 'setup' || state.screen === 'opponents';

  const el = document.createElement('section');
  el.className = 'wh-opponents-page';
  el.innerHTML = `
    <div class="wh-opponent-head" style="margin-bottom: 4px;">
      <h2>Выбор соперника</h2>
      <p>Кого вызовем на дуэль сегодня?</p>
    </div>

    <div class="wh-actions" style="margin-bottom: 20px;">
      <button class="wh-btn" type="button" data-act="computer">${fromSetup ? 'Начать бой с компьютером' : 'Играть с компьютером'}</button>
      <button class="wh-btn secondary" type="button" data-act="mock">Preview-бой с другом рядом</button>
      <button class="wh-btn secondary" type="button" data-act="invite">Пригласить по ссылке</button>
    </div>

    <div class="wh-opponent-block">
      <h3>Друзья</h3>
      <p>Ваши друзья из Зала Витрины.</p>
      <div class="wh-friends-list" id="wh-friends-list-container">
        <!-- Загружается асинхронно -->
      </div>
    </div>
  `;

  el.querySelector('[data-act="computer"]')?.addEventListener('click', actions.startComputerGame);
  el.querySelector('[data-act="mock"]')?.addEventListener('click', actions.acceptMockOpponent);
  el.querySelector('[data-act="invite"]')?.addEventListener('click', actions.createInvite);

  root.append(el);

  // Запускаем асинхронную загрузку друзей, чтобы не блочить отрисовку интерфейса
  const listContainer = el.querySelector('#wh-friends-list-container');
  if (listContainer) {
    loadRealFriends(listContainer, state, actions);
  }
};

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
})[ch]);
