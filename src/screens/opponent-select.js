export const renderOpponentSelect = (root, state, actions) => {
  const el = document.createElement('section');
  el.className = 'wh-card';
  el.innerHTML = `
    <h2>Соперник</h2>
    <p>Позже здесь будет список друзей из Game Center. Сейчас — preview-карточки.</p>

    <div class="wh-actions">
      <button class="wh-btn" type="button" data-act="computer">
        Играть с компьютером
      </button>
      <button class="wh-btn secondary" type="button" data-act="mock">
        Друг рядом · принять preview
      </button>
      <button class="wh-btn secondary" type="button" data-act="invite">
        Создать приглашение на 30 секунд
      </button>
    </div>
  `;

  el.querySelector('[data-act="computer"]')?.addEventListener('click', actions.startComputerGame);
  el.querySelector('[data-act="mock"]')?.addEventListener('click', actions.acceptMockOpponent);
  el.querySelector('[data-act="invite"]')?.addEventListener('click', actions.createInvite);

  root.append(el);
};
