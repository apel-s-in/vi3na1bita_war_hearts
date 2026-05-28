import { createEmptyBoard, createFleet, autoPlaceFleet, syncFleetToBoard } from './game/board.js';
import { createInitialState } from './game/state.js';
import { createTranscript } from './game/transcript.js';
import { WarHeartsSession } from './net/war-hearts-session.js';
import { renderMenu } from './screens/menu.js';
import { renderOpponentSelect } from './screens/opponent-select.js';
import { renderField } from './screens/field.js';
import { renderInviteWait } from './screens/invite-wait.js';
import { renderBattle } from './screens/battle.js';
import { renderResult } from './screens/result.js';

const $ = id => document.getElementById(id);

const initialFleet = autoPlaceFleet(createFleet());
const state = createInitialState({
  snapshot: null,
  player: {
    id: `wh_${Math.random().toString(36).slice(2, 10)}`,
    name: 'Слушатель',
    title: 'Новичок Сердец'
  },
  fleet: initialFleet,
  myBoard: syncFleetToBoard(initialFleet, createEmptyBoard()),
  enemyBoard: syncFleetToBoard(autoPlaceFleet(createFleet()), createEmptyBoard())
});

window.addEventListener('message', e => {
  const d = e.data || {};
  if (d.kind !== 'vitrina:game-host') return;

  if (d.type === 'GC_SNAPSHOT') {
    state.snapshot = d.payload || state.snapshot;
    if (d.payload?.user?.displayName) state.player.name = d.payload.user.displayName;
    if (d.payload?.user?.gcAccountId) state.player.id = d.payload.user.gcAccountId;
    render();
    return;
  }

  if (d.type === 'GC_RESTORE_GAME') {
    document.body.dataset.screen = state.screen || 'menu';
    $('app')?.removeAttribute('hidden');
    $('screen-root')?.removeAttribute('hidden');
    render();

    // После восстановления просим свежий snapshot, чтобы кнопка сворачивания не теряла play/pause-состояние.
    const requestSnapshot = () => {
      if (window.parent !== window) {
        window.parent.postMessage({
          kind: 'vitrina:game',
          type: 'GC_REQUEST_SNAPSHOT',
          gameId: 'war_hearts',
          payload: { gameId: 'war_hearts', at: Date.now() }
        }, '*');
      }
    };

    requestSnapshot();
    setTimeout(requestSnapshot, 150);
  }
});

if (window.parent !== window) {
  window.parent.postMessage({
    kind: 'vitrina:game',
    type: 'GC_READY',
    gameId: 'war_hearts',
    payload: { gameId: 'war_hearts', at: Date.now() }
  }, '*');
}

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
  // Показываем имя вместо технического статуса
  el.textContent = state.player.name || 'Гость';
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
  // Запрещаем переключать табы, если идет активный бой
  const inBattle = state.phase === 'player' || state.phase === 'computer';
  if (inBattle && screen !== 'battle') {
    toast('Бой активен! Нажмите белый флаг, чтобы сдаться.');
    return;
  }

  // Запрещаем переходить к выбору соперника, если поле не готово
  const isFleetReady = state.fleet.every(s => s.placed);
  if (screen === 'opponents' && !isFleetReady) {
    toast('Сначала подготовьте поле к бою (расставьте все корабли)!');
    if (state.screen !== 'field') setScreen('field');
    return;
  }

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
  toast,

  openField() {
    setScreen('field');
  },

  openMenu() {
    // Если возвращаемся из результатов боя, сбрасываем сессию и очищаем поля
    if (state.phase === 'finished') {
      state.phase = 'idle';
      state.myBoard.forEach(row => row.forEach(c => c.status = ''));
      state.enemyBoard.forEach(row => row.forEach(c => {
        c.status = '';
        c.ship = false;
      }));
    }
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
    // Синхронизируем текущий флот (расставленный юзером) с myBoard для игры
    state.myBoard = syncFleetToBoard(state.fleet, createEmptyBoard());
    state.enemyBoard = syncFleetToBoard(autoPlaceFleet(createFleet()), createEmptyBoard());
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

  const inBattle = state.phase === 'player' || state.phase === 'computer';
  
  // Кнопка сворачивания игры, если загружен трек (играет или на паузе)
  const colBtn = $('collapse-btn');
  if (colBtn) {
    const player = state.snapshot?.player;
    if (player && player.uid) {
      colBtn.hidden = false;
      const playIcon = `<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>`;
      const pauseIcon = `<svg viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
      colBtn.innerHTML = player.playing ? playIcon : pauseIcon;
    } else {
      colBtn.hidden = true;
    }
  }

  // Показываем белый флаг ТОЛЬКО на вкладке "Бой" и ТОЛЬКО во время активного сражения
  const surrenderBtn = $('surrender-btn');
  if (surrenderBtn) surrenderBtn.hidden = !(inBattle && state.screen === 'battle');

  // Во время боя активна только вкладка "Бой". Вне боя вкладка "Бой" заблокирована.
  document.querySelectorAll('.wh-tab').forEach(btn => {
    if (inBattle) {
      btn.disabled = btn.dataset.action !== 'battle';
    } else {
      btn.disabled = btn.dataset.action === 'battle';
    }
  });

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

  if (state.screen === 'field') {
    subtitle.textContent = 'Подготовка поля';
    renderField(root, state, actions);
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
  $('collapse-btn')?.addEventListener('click', () => {
    if (window.parent !== window) {
      window.parent.postMessage({
        kind: 'vitrina:game',
        type: 'GC_COLLAPSE_GAME',
        gameId: 'war_hearts',
        payload: { gameId: 'war_hearts', at: Date.now() }
      }, '*');
    }
  });

  $('back-btn')?.addEventListener('click', () => {
    let msg = '';
    // Проверяем, идет ли активный бой
    if (state.phase === 'player' || state.phase === 'computer') {
      msg = 'Вы находитесь в бою! Если выйдете сейчас, прогресс за текущий бой не будет сохранен. Точно выйти?';
    } else {
      // Имитация будущего подсчета осколков
      const earnedShards = state.result === 'win' ? 100 : (state.result === 'loss' ? 10 : 0);
      msg = `Вы получили ${earnedShards} осколков за бой, они добавятся на ваш счет. Выйти из игры?`;
    }

    // Создаем кастомную красивую модалку вместо системного window.confirm
    const overlay = document.createElement('div');
    overlay.className = 'wh-modal-overlay';
    overlay.innerHTML = `
      <div class="wh-modal-box">
        <h3 class="wh-modal-title">Выход из игры</h3>
        <p class="wh-modal-text">${msg}</p>
        <div class="wh-modal-actions">
          <button class="wh-btn secondary" type="button" id="wh-modal-cancel">Отмена</button>
          <button class="wh-btn" type="button" id="wh-modal-confirm">Выйти</button>
        </div>
      </div>
    `;
    
    document.body.appendChild(overlay);

    overlay.querySelector('#wh-modal-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#wh-modal-confirm').onclick = () => {
      overlay.remove();
      if (window.parent !== window) {
        window.parent.postMessage({ kind: 'vitrina:game', type: 'GC_CLOSE' }, '*');
      } else {
        window.location.href = new URL('../', window.location.href).toString();
      }
    };
  });

  // Логика кнопки Сдаться
  $('surrender-btn')?.addEventListener('click', () => {
    const overlay = document.createElement('div');
    overlay.className = 'wh-modal-overlay';
    overlay.innerHTML = `
      <div class="wh-modal-box">
        <h3 class="wh-modal-title">Сдаться?</h3>
        <p class="wh-modal-text">Бой будет завершён. Соперник получит победу, а вы останетесь без награды. Точно сдаться?</p>
        <div class="wh-modal-actions">
          <button class="wh-btn secondary" type="button" id="wh-surrender-cancel">Отмена</button>
          <button class="wh-btn" type="button" id="wh-surrender-confirm" style="background:var(--wh-red)">Сдаться</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#wh-surrender-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#wh-surrender-confirm').onclick = () => {
      overlay.remove();
      // Выставляем поражение и отправляем на экран результатов
      state.phase = 'finished';
      state.result = 'loss';
      setScreen('result');
    };
  });

  document.querySelectorAll('.wh-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'menu') setScreen('menu');
      if (action === 'opponents') setScreen('opponents');
      if (action === 'field') setScreen('field');
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

session.init()
  .then(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('room') && (params.get('key') || params.get('secret'))) {
      setStatus('invite', false);
    }
  })
  .catch(() => setStatus('mock', false));
