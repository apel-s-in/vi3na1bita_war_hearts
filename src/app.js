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
  enemyBoard: autoPlaceMockShips(createEmptyBoard())
});

const transcript = createTranscript();
const session = new WarHeartsSession({
  gameId: 'war_hearts',
  player: state.player
});

let computerTimer = 0;
let inviteTimer = 0;

const INVITE_TTL_MS = 120000;

const boardShipCells = board => board.flat().filter(cell => cell.ship);
const isBoardDefeated = board => {
  const ships = boardShipCells(board);
  return ships.length > 0 && ships.every(cell => cell.status === 'hit');
};

const pickRandomTarget = board => {
  const cells = [];
  board.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (!cell.status) cells.push({ x, y, cell });
    });
  });
  return cells[Math.floor(Math.random() * cells.length)] || null;
};

const addSystemMessage = text => {
  state.chat.push({
    from: 'Система',
    text,
    at: Date.now()
  });
};

const computerShoot = () => {
  if (state.screen !== 'battle' || state.phase !== 'computer') return;

  const target = pickRandomTarget(state.myBoard);
  if (!target) return;

  target.cell.status = target.cell.ship ? 'hit' : 'miss';

  transcript.add({
    type: 'COMPUTER_SHOT',
    x: target.x,
    y: target.y,
    result: target.cell.status,
    at: Date.now()
  });

  addSystemMessage(target.cell.status === 'hit'
    ? `Компьютер попал: ${target.x + 1}:${target.y + 1}`
    : 'Компьютер промахнулся');

  if (isBoardDefeated(state.myBoard)) {
    state.result = 'loss';
    state.phase = 'finished';
    setScreen('result');
    return;
  }

  state.phase = 'player';
  render();
};

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

  clearInterval(inviteTimer);
  inviteTimer = 0;

  if (screen === 'invite') {
    inviteTimer = setInterval(() => {
      if (state.screen === 'invite') render();
    }, 1000);
  }

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
        expiresAt: Date.now() + INVITE_TTL_MS
      };
      toast(invite.url ? 'Ссылка создана' : 'Preview-приглашение создано');
    } catch {
      state.invite = {
        id: `invite_${Date.now().toString(36)}`,
        url: '',
        expiresAt: Date.now() + INVITE_TTL_MS
      };
      toast('Сеть недоступна, создан preview');
    }
    setScreen('invite');
  },

  extendInvite() {
    if (!state.invite) return;
    state.invite.expiresAt = Math.max(Date.now(), state.invite.expiresAt || 0) + INVITE_TTL_MS;
    toast('Приглашение продлено');
    render();
  },

  acceptMockOpponent() {
    state.opponent = {
      id: 'friend_preview',
      name: 'Друг рядом',
      title: 'Гость арены',
      type: 'friend'
    };
    state.phase = 'player';
    toast('Соперник выбран');
    setScreen('battle');
  },

  startComputerGame() {
    clearTimeout(computerTimer);
    state.opponent = {
      id: 'computer_preview',
      name: 'Компьютер',
      title: 'Случайный стрелок',
      type: 'computer'
    };
    state.myBoard = autoPlaceMockShips(createEmptyBoard());
    state.enemyBoard = autoPlaceMockShips(createEmptyBoard());
    state.phase = 'player';
    state.result = '';
    state.chat = [
      {
        from: 'Система',
        text: 'Тренировка против компьютера началась. Компьютер стреляет случайно.',
        at: Date.now()
      }
    ];
    toast('Игра с компьютером');
    setScreen('battle');
  },

  shootCell(x, y) {
    if (state.phase === 'computer' || state.phase === 'finished') return;

    const cell = state.enemyBoard[y]?.[x];
    if (!cell || cell.status) return;

    cell.status = cell.ship ? 'hit' : 'miss';

    transcript.add({
      type: 'SHOT',
      x,
      y,
      result: cell.status,
      at: Date.now()
    });

    toast(cell.status === 'hit' ? 'Попадание!' : 'Мимо');

    if (isBoardDefeated(state.enemyBoard)) {
      state.result = 'win';
      state.phase = 'finished';
      setScreen('result');
      return;
    }

    if (state.opponent?.type === 'computer') {
      state.phase = 'computer';
      addSystemMessage('Компьютер думает...');
      render();
      clearTimeout(computerTimer);
      computerTimer = setTimeout(computerShoot, 650);
      return;
    }

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

  const ensureNetworkOpponent = name => {
    if (state.opponent?.type !== 'network') {
      state.opponent = {
        id: 'network_peer',
        name: name || 'Соперник',
        title: 'Сетевая дуэль',
        type: 'network'
      };
    }

    if (state.phase === 'idle') state.phase = 'player';
  };

  session.onRoom = info => {
    if (info?.role === 'guest') {
      ensureNetworkOpponent('Хост комнаты');
      toast('Подключаемся к комнате');
      setScreen('battle');
    }
  };

  session.onConnect = () => {
    ensureNetworkOpponent('Соперник онлайн');
    toast('Соперник подключён');
    setScreen('battle');
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
