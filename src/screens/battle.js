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
      ${renderStats(state)}
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
      <div class="wh-board-title-actions">
        <button class="wh-auto-btn ${state.autoBattle?.player ? 'is-active' : ''}" type="button" data-act="auto" aria-label="Автобой">A</button>
        <b>${state.phase === 'computer' ? 'ходит AI' : state.phase === 'rps' ? 'розыгрыш' : state.phase === 'finished' ? 'итог' : 'атака'}</b>
      </div>
    </div>
  `;

  enemy.querySelector('[data-act="auto"]')?.addEventListener('click', actions.toggleAutoBattle);

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

const renderStats = state => {
  const s = state.matchStats || {};
  const started = s.startedAt || Date.now();
  const finished = s.finishedAt || Date.now();
  const durationSec = Math.max(0, Math.round((finished - started) / 1000));
  const mm = Math.floor(durationSec / 60);
  const ss = String(durationSec % 60).padStart(2, '0');

  const playerSunk = Number(s.playerSunk || 0);
  const opponentSunk = Number(s.opponentSunk || 0);
  const balance = playerSunk - opponentSunk;
  const balanceText = balance > 0
    ? `перевес +${balance} кораб.`
    : balance < 0
      ? `отставание ${balance} кораб.`
      : 'равный бой';

  return `
    <div class="wh-match-stats">
      <div><span>Длительность</span><b>${mm}:${ss}</b></div>
      <div><span>Итог по кораблям</span><b>${playerSunk}: ${opponentSunk}</b></div>
      <div><span>Перевес</span><b>${balanceText}</b></div>
      <div><span>Твои выстрелы</span><b>${Number(s.playerShots || 0)}</b></div>
      <div><span>Попадания</span><b>${Number(s.playerHits || 0)}</b></div>
      <div><span>Промахи</span><b>${Number(s.playerMisses || 0)}</b></div>
      <div><span>Твой лучший страйк</span><b>${Number(s.playerBestHitStreak || 0)}</b></div>
      <div><span>Текущий страйк</span><b>${Number(s.playerHitStreak || 0)}</b></div>
      <div><span>Выстрелы соперника</span><b>${Number(s.opponentShots || 0)}</b></div>
      <div><span>Попадания соперника</span><b>${Number(s.opponentHits || 0)}</b></div>
      <div><span>Промахи соперника</span><b>${Number(s.opponentMisses || 0)}</b></div>
      <div><span>Страйк соперника</span><b>${Number(s.opponentBestHitStreak || 0)}</b></div>
    </div>
  `;
};
