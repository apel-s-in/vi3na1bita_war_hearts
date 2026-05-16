import { renderProfileCard } from '../ui/profile-card.js';

export const renderMenu = (root, state, actions) => {
  root.append(
    hero(),
    renderProfileCard(state.player, {
      wins: 0,
      losses: 0,
      rank: 'Без рейтинга'
    }),
    controls(actions)
  );
};

const hero = () => {
  const el = document.createElement('div');
  el.className = 'wh-intro-text';
  el.innerHTML = `Классическая дуэль 10×10. Расставь сердца, найди сердца соперника и разбей их первым.`;
  return el;
};

const controls = actions => {
  const el = document.createElement('section');
  el.className = 'wh-card';
  el.innerHTML = `
    <h3>Начать</h3>
    <p>Можно сыграть тренировку против компьютера или создать сетевое приглашение другу.</p>
    <div class="wh-actions">
      <button class="wh-btn" type="button" data-act="computer">Играть с компьютером</button>
      <button class="wh-btn secondary" type="button" data-act="opponents">Выбрать соперника</button>
      <button class="wh-btn secondary" type="button" data-act="invite">Пригласить по ссылке</button>
      <button class="wh-btn secondary" type="button" data-act="battle">Открыть поле preview</button>
    </div>
  `;

  el.querySelector('[data-act="computer"]')?.addEventListener('click', actions.startComputerGame);
  el.querySelector('[data-act="opponents"]')?.addEventListener('click', actions.openOpponents);
  el.querySelector('[data-act="invite"]')?.addEventListener('click', actions.createInvite);
  el.querySelector('[data-act="battle"]')?.addEventListener('click', actions.openBattle);

  return el;
};
