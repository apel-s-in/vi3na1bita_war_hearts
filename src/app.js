import { createEmptyBoard, autoPlaceMockShips } from './game/board.js';
import { createInitialState } from './game/state.js';
import { createTranscript } from './game/transcript.js';
import { WarHeartsSession } from './net/war-hearts-session.js';
import { renderMenu } from './screens/menu.js';
import { renderOpponentSelect } from './screens/opponent-select.js';
import { renderInviteWait } from './screens/invite-wait.js';
import { renderBattle } from './screens/battle.js';
import { renderResult } from './screens/result.js';

const $ = id => document.getElementById(id);

const state = createInitialState({
  player: {
    id: `wh_${Math.random().toString(36).slice(2, 10)}`,
    name: 'Слушатель',
    title: 'Новичок Сердец'
  },
  myBoard: autoPlaceMockShips(createEmptyBoard()),
  enemyBoard: createEmptyBoard()
});

const transcript = createTranscript();
const session = new WarHeartsSession({
  gameId: 'war_hearts',
  player: state.player
});

const setStatus = (text, online = false) => {
  const el = $('net-status');
  if (!el) return;
  el.textContent = text;
  el.classList.toggle('is-online', !!online);
};

const toast = text => {
  const el = $('toast');
  if (!el) return;
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => {
    el.hidden = true;
  }, 1500);
};

const setScreen = screen => {
  state.screen = screen;
  document.body.dataset.screen = screen;

  document.querySelectorAll('.wh-tab').forEach(btn => {
    btn.classList.toggle('is-active', btn.dataset.action === screen || (screen === 'menu' && btn.dataset.action === 'menu'));
  });

  render();
};

const actions = {
  openMenu() {
    setScreen('menu');
  },

  openOpponents() {
    setScreen('opponents');
  },

  openBattle() {
    setScreen('battle');
  },

  async createInvite() {
    try {
      const invite = await session.createInvite();
      state.invite = {
        id: invite.id || invite.roomId || `invite_${Date.now().toString(36)}`,
        roomId: invite.roomId || '',
        roomSecret: invite.roomSecret || '',
        url: invite.url || '',
        expiresAt: invite.expiresAt || Date.now() + 30000
      };
      toast(invite.url ? 'Ссылка создана' : 'Preview-приглашение создано');
    } catch {
      state.invite = {
        id: `invite_${Date.now().toString(36)}`,
        url: '',
        expiresAt: Date.now() + 30000
      };
      toast('Сеть недоступна, создан preview');
    }
    setScreen('invite');
  },

  acceptMockOpponent() {
    state.opponent = {
      id: 'friend_preview',
      name: 'Друг рядом',
      title: 'Гость арены'
    };
    toast('Соперник выбран');
    setScreen('battle');
  },

  shootCell(x, y) {
    const cell = state.enemyBoard[y]?.[x];
    if (!cell || cell.status) return;

    cell.status = Math.random() > 0.72 ? 'hit' : 'miss';
    transcript.add({
      type: 'SHOT',
      x,
      y,
      result: cell.status,
      at: Date.now()
    });

    toast(cell.status === 'hit' ? 'Попадание!' : 'Мимо');
    render();
  },

  sendChat(text) {
    const message = String(text || '').trim().slice(0, 300);
    if (!message) return;

    state.chat.push({
      from: state.player.name,
      text: message,
      at: Date.now()
    });

    session.sendChat(message);
    render();
  },

  async toggleVoice(active) {
    try {
      await session.toggleVoice(active);
      toast(active ? 'Голос включён' : 'Голос выключен');
    } catch {
      toast('Микрофон недоступен');
    }
  },

  finishMock(result = 'win') {
    state.result = result;
    setScreen('result');
  }
};

const render = () => {
  const root = $('screen-root');
  const subtitle = $('screen-subtitle');
  if (!root || !subtitle) return;

  root.innerHTML = '';

  if (state.screen === 'menu') {
    subtitle.textContent = 'Главное меню';
    renderMenu(root, state, actions);
    return;
  }

  if (state.screen === 'opponents') {
    subtitle.textContent = 'Выбор соперника';
    renderOpponentSelect(root, state, actions);
    return;
  }

  if (state.screen === 'invite') {
    subtitle.textContent = 'Ожидание ответа';
    renderInviteWait(root, state, actions);
    return;
  }

  if (state.screen === 'battle') {
    subtitle.textContent = 'Боевая сессия';
    renderBattle(root, state, actions);
    return;
  }

  if (state.screen === 'result') {
    subtitle.textContent = 'Итог матча';
    renderResult(root, state, actions);
  }
};

const bind = () => {
  $('back-btn')?.addEventListener('click', () => {
    if (state.screen === 'menu') {
      window.location.href = '../';
      return;
    }
    setScreen('menu');
  });

  document.querySelectorAll('.wh-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'menu') setScreen('menu');
      if (action === 'opponents') setScreen('opponents');
      if (action === 'battle') setScreen('battle');
    });
  });

  session.onStatus = info => {
    setStatus(info.label, info.online);
  };

  session.onChat = msg => {
    state.chat.push(msg);
    render();
  };
};

bind();
setStatus('preview', false);
render();
session.init().catch(() => setStatus('mock', false));
