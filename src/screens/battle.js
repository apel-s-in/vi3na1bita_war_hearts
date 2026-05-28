import { renderBoard } from '../ui/board-view.js';
import { renderChat } from '../ui/chat-view.js';
import { renderVoiceButton } from '../ui/voice-button.js';

export const renderBattle = (root, state, actions) => {
  const wrap = document.createElement('section');
  wrap.className = 'wh-grid-wrap';

  if (state.phase === 'finished') {
    const resultBar = document.createElement('div');
    resultBar.className = `wh-match-result ${state.result === 'win' ? 'is-win' : 'is-loss'}`;
    resultBar.innerHTML = `
      <div>
        <b>${state.result === 'win' ? 'Победа!' : 'Поражение'}</b>
        <span>${state.result === 'win' ? 'Поле сохранено. Можно взять реванш.' : 'Поле сохранено. Можно сыграть ещё раз.'}</span>
      </div>
      <div class="wh-match-result-actions">
        <button class="wh-btn" type="button" data-act="rematch">РЕВАНШ</button>
        <button class="wh-btn secondary" type="button" data-act="menu">В главное меню</button>
      </div>
    `;

    resultBar.querySelector('[data-act="rematch"]')?.addEventListener('click', actions.rematch);
    resultBar.querySelector('[data-act="menu"]')?.addEventListener('click', actions.openMenu);
    wrap.append(resultBar);
  }

  const enemy = document.createElement('div');
  enemy.className = 'wh-card wh-board-card';
  enemy.innerHTML = `
    <div class="wh-board-title">
      <span>Поле соперника${state.opponent?.name ? ` · ${state.opponent.name}` : ''}</span>
      <b>${state.phase === 'computer' ? 'ходит AI' : state.phase === 'rps' ? 'розыгрыш' : state.phase === 'finished' ? 'итог' : 'атака'}</b>
    </div>
  `;
  enemy.append(renderFx(state, 'enemy'));
  enemy.append(renderBoard(state.enemyBoard, {
    mode: 'enemy',
    target: state.selectedTarget,
    onCell: state.phase === 'player' ? actions.shootCell : null
  }));

  const mine = document.createElement('div');
  mine.className = 'wh-card wh-board-card';
  mine.innerHTML = `
    <div class="wh-board-title">
      <span>Твои сердца</span>
      <b>${state.phase === 'computer' ? 'оборона' : state.phase === 'rps' ? 'ожидание' : state.phase === 'finished' ? 'итог' : 'защита'}</b>
    </div>
  `;
  mine.append(renderFx(state, 'mine'));
  mine.append(renderBoard(state.myBoard, {
    mode: 'own'
  }));

  const tools = document.createElement('div');
  tools.className = 'wh-card';
  tools.append(renderChat(state.chat, actions.sendChat));

  const bottom = document.createElement('div');
  bottom.className = 'wh-battle-tools';

  const finish = document.createElement('button');
  finish.className = 'wh-btn secondary';
  finish.type = 'button';
  finish.textContent = 'Завершить preview';
  finish.hidden = state.phase === 'finished';
  finish.addEventListener('click', () => actions.finishMock('win'));

  bottom.append(finish, renderVoiceButton(actions.toggleVoice));

  wrap.append(enemy, mine, tools, bottom);
  root.append(wrap);
};

const renderFx = (state, lane) => {
  const fx = state.battleFx?.lane === lane ? state.battleFx : null;
  const el = document.createElement('div');
  el.className = `wh-board-fx ${fx ? `is-visible is-${fx.kind}` : ''}`;
  el.textContent = fx?.text || '';
  return el;
};
