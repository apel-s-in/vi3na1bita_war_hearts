// Список друзей и его стили принадлежат только каноническому
// модулю /Friends/. Игра лишь просит Game Center открыть его.

export const renderOpponentSelect = (root, state, actions) => {
  const el = document.createElement('section');
  el.className = 'wh-opponents-page';

  el.innerHTML = `
    <div class="wh-opponent-head" style="margin-bottom:4px">
      <h2>Выбор соперника</h2>
      <p>Рейтинговые бои доступны только с реальными игроками.</p>
    </div>

    <div class="wh-actions" style="margin-bottom:20px">
      <button class="wh-btn" type="button" data-act="friends">
        👥 Открыть Друзья
      </button>
      <button class="wh-btn" type="button" data-act="lan" style="background:linear-gradient(135deg,#4caf50,#2e7d32)">
        📶 Друг в одной Wi-Fi
      </button>
      <button class="wh-btn secondary" type="button" data-act="nearby">
        Друг рядом · код
      </button>
      <button class="wh-btn secondary" type="button" data-act="invite">
        Пригласить по ссылке
      </button>
    </div>

    <div class="wh-opponent-block">
      <h3>Тренировка</h3>
      <p>
        Эти режимы не влияют на рейтинг и не используют Осколки.
      </p>
      <div class="wh-actions">
        <button class="wh-btn secondary" type="button" data-act="computer">
          Играть с компьютером
        </button>
        <button class="wh-btn secondary" type="button" data-act="mock">
          Preview-бой без сети
        </button>
      </div>
    </div>
  `;

  el.querySelector('[data-act="friends"]')
    ?.addEventListener('click', () => actions.openFriends());

  el.querySelector('[data-act="computer"]')
    ?.addEventListener('click', actions.startComputerGame);

  el.querySelector('[data-act="mock"]')
    ?.addEventListener('click', actions.acceptMockOpponent);

  el.querySelector('[data-act="invite"]')
    ?.addEventListener('click', actions.createInvite);

  el.querySelector('[data-act="nearby"]')
    ?.addEventListener('click', () => openNearbyModal(actions));

  el.querySelector('[data-act="lan"]')
    ?.addEventListener('click', () => actions.startLanGameFlow());

  root.append(el);
};

const openNearbyModal = actions => {
  const overlay = document.createElement('div');
  overlay.className = 'wh-modal-overlay';

  overlay.innerHTML = `
    <div class="wh-modal-box">
      <h3 class="wh-modal-title">Друг рядом</h3>
      <p class="wh-modal-text">
        Создайте 6-значный код или введите код друга.
      </p>
      <div class="wh-actions">
        <button class="wh-btn" type="button" data-nearby-create>
          Создать код
        </button>
        <div style="display:flex;gap:8px">
          <input type="text" inputmode="numeric" maxlength="6"
            placeholder="Код друга" data-nearby-code
            style="flex:1;min-width:0;background:rgba(255,255,255,.06);border:1px solid rgba(255,255,255,.12);color:#fff;border-radius:14px;padding:0 12px;outline:none">
          <button class="wh-btn" type="button" data-nearby-join
            style="min-height:44px;padding:0 12px">
            ОК
          </button>
        </div>
        <button class="wh-btn secondary" type="button" data-nearby-close>
          Отмена
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('[data-nearby-close]')
    ?.addEventListener('click', () => overlay.remove());

  overlay.querySelector('[data-nearby-create]')
    ?.addEventListener('click', () => {
      overlay.remove();
      actions.createNearbyGame?.();
    });

  overlay.querySelector('[data-nearby-join]')
    ?.addEventListener('click', () => {
      const code =
        overlay.querySelector('[data-nearby-code]')?.value || '';
      overlay.remove();
      actions.joinNearbyGame?.(code);
    });
};

export default { renderOpponentSelect };
