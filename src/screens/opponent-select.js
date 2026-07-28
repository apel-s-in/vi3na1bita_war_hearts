export const renderOpponentSelect = (root, state, actions) => {
  const el = document.createElement('section');
  el.className = 'wh-opponents-page';

  el.innerHTML = `
    <div class="wh-opponent-head" style="margin-bottom:4px">
      <h2>Выбор соперника</h2>
      <p>
        Любой бой между двумя пользователями является рейтинговым.
        Перед стартом у каждого игрока блокируется ставка 100 ♦.
      </p>
    </div>

    <div class="wh-actions" style="margin-bottom:20px">
      <button class="wh-btn" type="button" data-act="friends">
        👥 Вызвать друга · рейтинг · 100 ♦
      </button>
      <button class="wh-btn" type="button" data-act="lan" style="background:linear-gradient(135deg,#4caf50,#2e7d32)">
        📶 Код Wi‑Fi/LAN · рейтинг · 100 ♦
      </button>
      <button class="wh-btn secondary" type="button" data-act="invite">
        🔗 Пригласить по ссылке · рейтинг · 100 ♦
      </button>
    </div>

    <div class="wh-opponent-block">
      <h3>Тренировка</h3>
      <p>
        Тренировка доступна только с компьютером.
        Она не влияет на рейтинг и не использует Осколки.
      </p>
      <div class="wh-actions">
        <button class="wh-btn secondary" type="button" data-act="computer">
          🤖 Играть с компьютером
        </button>
      </div>
    </div>
  `;

  el.querySelector('[data-act="friends"]')
    ?.addEventListener('click', () => actions.openFriends());

  el.querySelector('[data-act="computer"]')
    ?.addEventListener('click', actions.startComputerGame);

  el.querySelector('[data-act="invite"]')
    ?.addEventListener('click', actions.createInvite);

  el.querySelector('[data-act="lan"]')
    ?.addEventListener('click', actions.startLanGameFlow);

  root.append(el);
};

export default { renderOpponentSelect };
