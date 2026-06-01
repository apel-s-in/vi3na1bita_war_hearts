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
      <button class="wh-btn secondary" type="button" data-act="nearby">Друг рядом · код</button>
      <button class="wh-btn secondary" type="button" data-act="mock">Preview-бой без сети</button>
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
  el.querySelector('[data-act="nearby"]')?.addEventListener('click', () => openNearbyModal(actions));

  root.append(el);

  // Запускаем асинхронную загрузку друзей, чтобы не блочить отрисовку интерфейса
  const listContainer = el.querySelector('#wh-friends-list-container');
  if (listContainer) {
    loadRealFriends(listContainer, state, actions);
  }
};

const openNearbyModal = actions => {
  const ov = document.createElement('div');
  ov.className = 'wh-modal-overlay';
  ov.innerHTML = `
    <div class="wh-modal-box">
      <h3 class="wh-modal-title">Друг рядом</h3>
      <p class="wh-modal-text">Создайте 6-значный код или введите код друга. Работает на iPhone, Android и компьютере.</p>
      <div class="wh-actions">
        <button class="wh-btn" type="button" data-nearby-create>Создать код</button>
        <div style="display:flex;gap:8px">
          <input type="text" inputmode="numeric" maxlength="6" placeholder="Код друга" data-nearby-code style="flex:1;min-width:0;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#fff;border-radius:14px;padding:0 12px;outline:none">
          <button class="wh-btn" type="button" data-nearby-join style="min-height:44px;padding:0 12px">ОК</button>
        </div>
        <button class="wh-btn secondary" type="button" data-nearby-close>Отмена</button>
      </div>
    </div>
  `;
  document.body.appendChild(ov);

  ov.querySelector('[data-nearby-close]')?.addEventListener('click', () => ov.remove());
  ov.querySelector('[data-nearby-create]')?.addEventListener('click', () => {
    ov.remove();
    actions.createNearbyGame?.();
  });
  ov.querySelector('[data-nearby-join]')?.addEventListener('click', () => {
    const code = ov.querySelector('[data-nearby-code]')?.value || '';
    ov.remove();
    actions.joinNearbyGame?.(code);
  });
};

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
})[ch]);
