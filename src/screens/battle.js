import { renderBoard } from '../ui/board-view.js';
import { renderChat } from '../ui/chat-view.js';
import { renderVoiceButton } from '../ui/voice-button.js';

export const renderBattle = (root, state, actions) => {
  const wrap = document.createElement('section');
  wrap.className = 'wh-grid-wrap';

  const enemy = document.createElement('div');
  enemy.className = 'wh-card';
  enemy.innerHTML = `<div class="wh-board-title"><span>Поле соперника</span><b>атака</b></div>`;
  enemy.append(renderBoard(state.enemyBoard, {
    mode: 'enemy',
    onCell: actions.shootCell
  }));

  const mine = document.createElement('div');
  mine.className = 'wh-card';
  mine.innerHTML = `<div class="wh-board-title"><span>Твои сердца</span><b>защита</b></div>`;
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
  finish.addEventListener('click', () => actions.finishMock('win'));

  bottom.append(finish, renderVoiceButton(actions.toggleVoice));

  wrap.append(enemy, mine, tools, bottom);
  root.append(wrap);
};
