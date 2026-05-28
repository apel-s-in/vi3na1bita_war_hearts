import {
  createEmptyBoard,
  createFleet,
  autoPlaceFleet,
  syncFleetToBoard,
  formatCellName,
  getShipCellsAt,
  isShipSunk,
  markSunkPerimeter
} from './game/board.js';
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
const GAME_ID = 'war_hearts';

const postToHost = (type, payload = {}) => {
  if (window.parent === window) return false;
  try {
    window.parent.postMessage({
      kind: 'vitrina:game',
      type,
      gameId: GAME_ID,
      payload: {
        gameId: GAME_ID,
        ...payload,
        at: payload.at || Date.now()
      }
    }, '*');
    return true;
  } catch {
    return false;
  }
};

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
    const requestSnapshot = () => postToHost('GC_REQUEST_SNAPSHOT');

    requestSnapshot();
    setTimeout(requestSnapshot, 150);
  }
});

postToHost('GC_READY');

const transcript = createTranscript();
const session = new WarHeartsSession({
  gameId: 'war_hearts',
  player: state.player
});

let computerTimer = 0;
let playerAutoTimer = 0;
let inviteTimer = 0;

const INVITE_TTL_MS = 120000;

const boardShipCells = board => board.flat().filter(cell => cell.ship);
const isBoardDefeated = board => {
  const ships = boardShipCells(board);
  return ships.length > 0 && ships.every(cell => cell.status === 'hit');
};

const createMatchStats = () => ({
  startedAt: Date.now(),
  finishedAt: 0,
  playerShots: 0,
  opponentShots: 0,
  playerHits: 0,
  opponentHits: 0,
  playerMisses: 0,
  opponentMisses: 0,
  playerSunk: 0,
  opponentSunk: 0
});

const resetMatchStats = () => {
  state.matchStats = createMatchStats();
};

const finishMatch = (result, message) => {
  state.result = result;
  state.phase = 'finished';
  state.autoBattle.player = false;
  clearTimeout(playerAutoTimer);
  clearTimeout(computerTimer);
  state.matchStats.finishedAt = Date.now();
  addSystemMessage(message);
  render();
};

const registerShotStats = (side, result) => {
  const stats = state.matchStats;
  if (!stats.startedAt) stats.startedAt = Date.now();

  if (side === 'player') {
    stats.playerShots++;
    if (result === 'miss') stats.playerMisses++;
    if (result === 'hit' || result === 'sunk') stats.playerHits++;
    if (result === 'sunk') stats.playerSunk++;
    return;
  }

  stats.opponentShots++;
  if (result === 'miss') stats.opponentMisses++;
  if (result === 'hit' || result === 'sunk') stats.opponentHits++;
  if (result === 'sunk') stats.opponentSunk++;
};

const getOpenTargets = board => {
  const cells = [];
  board.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (!cell.status) cells.push({ x, y, cell });
    });
  });
  return cells;
};

const pickRandom = list => list[Math.floor(Math.random() * list.length)] || null;

const getAdjacentOpenTargets = (board, x, y) => [
  { x: x + 1, y },
  { x: x - 1, y },
  { x, y: y + 1 },
  { x, y: y - 1 }
].filter(point => {
  const cell = board[point.y]?.[point.x];
  return cell && !cell.status;
}).map(point => ({
  ...point,
  cell: board[point.y][point.x]
}));

const getKnownWoundedHits = board => {
  const hits = [];

  board.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (cell.status !== 'hit') return;

      const shipCells = getShipCellsAt(board, x, y);
      if (shipCells.length && isShipSunk(board, shipCells)) return;

      hits.push({ x, y, cell });
    });
  });

  return hits;
};

const pickSmartTarget = board => {
  const wounded = getKnownWoundedHits(board);

  if (wounded.length) {
    const byRows = new Map();
    const byCols = new Map();

    wounded.forEach(point => {
      byRows.set(point.y, [...(byRows.get(point.y) || []), point]);
      byCols.set(point.x, [...(byCols.get(point.x) || []), point]);
    });

    const lineCandidates = [];

    byRows.forEach(points => {
      if (points.length < 2) return;
      const sorted = points.slice().sort((a, b) => a.x - b.x);
      const left = { x: sorted[0].x - 1, y: sorted[0].y };
      const right = { x: sorted[sorted.length - 1].x + 1, y: sorted[0].y };
      [left, right].forEach(point => {
        const cell = board[point.y]?.[point.x];
        if (cell && !cell.status) lineCandidates.push({ ...point, cell });
      });
    });

    byCols.forEach(points => {
      if (points.length < 2) return;
      const sorted = points.slice().sort((a, b) => a.y - b.y);
      const top = { x: sorted[0].x, y: sorted[0].y - 1 };
      const bottom = { x: sorted[0].x, y: sorted[sorted.length - 1].y + 1 };
      [top, bottom].forEach(point => {
        const cell = board[point.y]?.[point.x];
        if (cell && !cell.status) lineCandidates.push({ ...point, cell });
      });
    });

    if (lineCandidates.length) return pickRandom(lineCandidates);

    const adjacent = wounded.flatMap(point => getAdjacentOpenTargets(board, point.x, point.y));
    if (adjacent.length) return pickRandom(adjacent);
  }

  const open = getOpenTargets(board);
  if (!open.length) return null;

  // Честный базовый приоритет: шахматные клетки, без знания скрытых кораблей.
  const checker = open.filter(point => (point.x + point.y) % 2 === 0);
  return pickRandom(checker.length ? checker : open);
};

const pickRandomTarget = board => pickSmartTarget(board);

const addSystemMessage = text => {
  state.chat.push({
    from: 'Система',
    text,
    at: Date.now()
  });
};

const showBattleFx = (lane, kind) => {
  const labels = {
    miss: 'ПРОМАХ',
    hit: 'РАНИЛ',
    sunk: 'УБИЛ'
  };

  state.battleFx = {
    lane,
    kind,
    text: labels[kind] || String(kind || '').toUpperCase(),
    id: Date.now()
  };

  render();

  const fxId = state.battleFx.id;
  setTimeout(() => {
    if (state.battleFx?.id === fxId) {
      state.battleFx = null;
      render();
    }
  }, 920);
};

const computerShoot = () => {
  if (state.screen !== 'battle' || state.phase !== 'computer') return;

  const target = pickSmartTarget(state.myBoard);
  if (!target) {
    state.phase = 'player';
    render();
    schedulePlayerAutoShot();
    return;
  }

  const coord = formatCellName(target.x, target.y);
  const hit = !!target.cell.ship;

  target.cell.status = hit ? 'hit' : 'miss';

  const shipCells = hit ? getShipCellsAt(state.myBoard, target.x, target.y) : [];
  const sunk = hit && isShipSunk(state.myBoard, shipCells);
  if (sunk) markSunkPerimeter(state.myBoard, shipCells);

  const fxKind = sunk ? 'sunk' : hit ? 'hit' : 'miss';
  const resultText = sunk ? 'убил корабль' : hit ? 'ранил корабль' : 'промахнулся';

  registerShotStats('opponent', fxKind);
  showBattleFx('mine', fxKind);

  transcript.add({
    type: 'COMPUTER_SHOT',
    x: target.x,
    y: target.y,
    result: fxKind,
    at: Date.now()
  });

  addSystemMessage(`Компьютер стреляет ${coord}: ${resultText}.`);

  if (isBoardDefeated(state.myBoard)) {
    finishMatch('loss', 'Матч завершён: поражение.');
    return;
  }

  if (!hit) {
    state.phase = 'player';
    render();
    schedulePlayerAutoShot();
    return;
  }

  render();
  clearTimeout(computerTimer);
  computerTimer = setTimeout(computerShoot, 720);
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

const openTurnDuel = () => {
  const old = document.querySelector('.wh-rps-modal-overlay');
  if (old) old.remove();

  state.rps = {
    active: true,
    playerChoice: '',
    opponentChoice: '',
    message: 'Выбери знак. Победитель делает первый выстрел.'
  };

  const choices = [
    { id: 'rock', icon: '✊', label: 'Камень' },
    { id: 'scissors', icon: '✌️', label: 'Ножницы' },
    { id: 'paper', icon: '✋', label: 'Бумага' }
  ];

  const overlay = document.createElement('div');
  overlay.className = 'wh-rps-modal-overlay';
  overlay.innerHTML = `
    <div class="wh-rps-modal-box">
      <div class="wh-rps-kicker">Розыгрыш первого хода</div>
      <h2 class="wh-rps-title">Камень · Ножницы · Бумага</h2>
      <p class="wh-rps-text" id="wh-rps-text">${state.rps.message}</p>
      <div class="wh-rps-choices" id="wh-rps-choices">
        ${choices.map(choice => `
          <button class="wh-rps-choice" type="button" data-choice="${choice.id}">
            <span>${choice.icon}</span>
            <b>${choice.label}</b>
          </button>
        `).join('')}
      </div>
      <div class="wh-rps-result" id="wh-rps-result" hidden></div>
    </div>
  `;

  document.body.appendChild(overlay);

  const getOpponentChoice = () => choices[Math.floor(Math.random() * choices.length)].id;
  const getChoiceLabel = id => choices.find(choice => choice.id === id)?.label || id;

  const compare = (player, opponent) => {
    if (player === opponent) return 'draw';
    if (
      (player === 'rock' && opponent === 'scissors') ||
      (player === 'scissors' && opponent === 'paper') ||
      (player === 'paper' && opponent === 'rock')
    ) {
      return 'player';
    }
    return 'opponent';
  };

  const confirmLeave = () => {
    const confirm = document.createElement('div');
    confirm.className = 'wh-modal-overlay';
    confirm.innerHTML = `
      <div class="wh-modal-box">
        <h3 class="wh-modal-title">Покинуть бой?</h3>
        <p class="wh-modal-text">Если покинуть сейчас, это будет засчитано как поражение. Вернуться в главное меню?</p>
        <div class="wh-modal-actions">
          <button class="wh-btn secondary" type="button" id="wh-rps-leave-cancel">Остаться</button>
          <button class="wh-btn" type="button" id="wh-rps-leave-confirm" style="background:var(--wh-red)">Покинуть</button>
        </div>
      </div>
    `;

    document.body.appendChild(confirm);

    confirm.querySelector('#wh-rps-leave-cancel').onclick = () => confirm.remove();
    confirm.querySelector('#wh-rps-leave-confirm').onclick = () => {
      confirm.remove();
      overlay.remove();
      state.rps.active = false;
      state.result = 'loss';
      state.phase = 'finished';
      state.matchStats.finishedAt = Date.now();
      addSystemMessage('Игрок покинул бой до первого выстрела. Засчитано поражение.');
      actions.openMenu();
    };
  };

  const showResult = result => {
    const choicesEl = overlay.querySelector('#wh-rps-choices');
    const resultEl = overlay.querySelector('#wh-rps-result');
    const text = overlay.querySelector('#wh-rps-text');

    if (choicesEl) choicesEl.hidden = true;
    if (text) {
      text.textContent = result === 'player'
        ? 'Поздравляем, ваш ход первый.'
        : 'Ваш соперник получил право первого выстрела.';
    }

    resultEl.hidden = false;
    resultEl.innerHTML = `
      <div class="wh-rps-result-card ${result === 'player' ? 'is-player' : 'is-opponent'}">
        <b>${result === 'player' ? 'Первый ход твой' : 'Первым ходит соперник'}</b>
        <span>${result === 'player' ? 'Начни бой и выбери цель.' : 'После старта соперник сделает первый выстрел.'}</span>
      </div>
      <div class="wh-rps-actions">
        <button class="wh-btn" type="button" id="wh-rps-start">Начать бой</button>
        <button class="wh-btn secondary" type="button" id="wh-rps-leave">Покинуть</button>
      </div>
    `;

    resultEl.querySelector('#wh-rps-start').onclick = () => {
      state.rps.active = false;
      overlay.remove();

      if (result === 'player') {
        state.phase = 'player';
        addSystemMessage('Розыгрыш завершён. Первый ход твой.');
        render();
        schedulePlayerAutoShot();
        return;
      }

      state.phase = 'computer';
      addSystemMessage('Розыгрыш завершён. Первым ходит соперник.');
      render();
      clearTimeout(computerTimer);
      computerTimer = setTimeout(computerShoot, 720);
    };

    resultEl.querySelector('#wh-rps-leave').onclick = confirmLeave;
  };

  overlay.querySelectorAll('[data-choice]').forEach(btn => {
    btn.addEventListener('click', () => {
      const playerChoice = btn.dataset.choice;
      const opponentChoice = getOpponentChoice();
      const result = compare(playerChoice, opponentChoice);
      const text = overlay.querySelector('#wh-rps-text');

      state.rps.playerChoice = playerChoice;
      state.rps.opponentChoice = opponentChoice;

      if (result === 'draw') {
        state.rps.message = `Ничья: ${getChoiceLabel(playerChoice)} против ${getChoiceLabel(opponentChoice)}. Ещё раз!`;
        if (text) text.textContent = state.rps.message;
        overlay.classList.remove('is-shake');
        void overlay.offsetWidth;
        overlay.classList.add('is-shake');
        return;
      }

      state.rps.message = `${getChoiceLabel(playerChoice)} против ${getChoiceLabel(opponentChoice)}.`;
      showResult(result);
    });
  });
};

const openShotConfirm = (x, y) => {
  const coord = formatCellName(x, y);

  const old = document.querySelector('.wh-shot-modal-overlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.className = 'wh-shot-modal-overlay';
  overlay.innerHTML = `
    <div class="wh-shot-modal-box">
      <div class="wh-shot-modal-kicker">Подтвердить выстрел</div>
      <div class="wh-shot-modal-coord">${coord}</div>
      <div class="wh-shot-modal-text">Выстрел будет произведён по выбранной клетке.</div>
      <div class="wh-modal-actions">
        <button class="wh-btn secondary" type="button" id="wh-shot-cancel">Отмена</button>
        <button class="wh-btn" type="button" id="wh-shot-confirm">Выстрел</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#wh-shot-cancel').onclick = () => {
    overlay.remove();
    state.selectedTarget = null;
    render();
  };

  overlay.querySelector('#wh-shot-confirm').onclick = () => {
    overlay.remove();
    actions.confirmShot(x, y);
  };
};

const setScreen = screen => {
  // Запрещаем переключать табы, если идет активный бой или розыгрыш первого хода.
  const inBattle = state.phase === 'player' || state.phase === 'computer' || state.phase === 'rps';
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
    // Если возвращаемся из завершённого боя, сбрасываем визуальное состояние матча.
    if (state.phase === 'finished') {
      state.phase = 'idle';
      state.result = '';
      state.selectedTarget = null;
      state.battleFx = null;
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
    clearTimeout(computerTimer);
    state.opponent = {
      id: 'friend_preview',
      name: 'Друг рядом',
      title: 'Гость арены',
      type: 'computer'
    };

    state.myBoard = syncFleetToBoard(state.fleet, createEmptyBoard());
    state.enemyBoard = syncFleetToBoard(autoPlaceFleet(createFleet()), createEmptyBoard());
    state.selectedTarget = null;
    state.battleFx = null;
    state.phase = 'rps';
    state.result = '';
    state.chat = [
      {
        from: 'Система',
        text: 'Preview-соперник выбран. Сейчас разыграем первый ход.',
        at: Date.now()
      }
    ];

    toast('Соперник выбран');
    setScreen('battle');
    openTurnDuel();
  },

  startComputerGame() {
    clearTimeout(computerTimer);
    state.opponent = {
      id: 'computer_preview',
      name: 'Компьютер',
      title: 'Случайный стрелок',
      type: 'computer'
    };

    state.myBoard = syncFleetToBoard(state.fleet, createEmptyBoard());
    state.enemyBoard = syncFleetToBoard(autoPlaceFleet(createFleet()), createEmptyBoard());
    state.selectedTarget = null;
    state.battleFx = null;
    state.phase = 'rps';
    state.result = '';
    state.chat = [
      {
        from: 'Система',
        text: 'Новая тренировка началась. Сейчас разыграем первый ход.',
        at: Date.now()
      }
    ];

    toast('Игра с компьютером');
    setScreen('battle');
    openTurnDuel();
  },

  shootCell(x, y) {
    if (state.phase !== 'player' || state.phase === 'finished') return;

    const cell = state.enemyBoard[y]?.[x];
    if (!cell || cell.status) return;

    state.selectedTarget = { x, y };
    render();
    openShotConfirm(x, y);
  },

  confirmShot(x, y) {
    if (state.phase !== 'player' || state.phase === 'finished') return;

    const cell = state.enemyBoard[y]?.[x];
    if (!cell || cell.status) {
      state.selectedTarget = null;
      render();
      return;
    }

    const coord = formatCellName(x, y);
    const hit = !!cell.ship;

    cell.status = hit ? 'hit' : 'miss';

    const shipCells = hit ? getShipCellsAt(state.enemyBoard, x, y) : [];
    const sunk = hit && isShipSunk(state.enemyBoard, shipCells);
    if (sunk) markSunkPerimeter(state.enemyBoard, shipCells);

    const fxKind = sunk ? 'sunk' : hit ? 'hit' : 'miss';
    const resultText = sunk ? 'убил корабль' : hit ? 'ранил корабль' : 'промах';

    showBattleFx('enemy', fxKind);

    transcript.add({
      type: 'SHOT',
      x,
      y,
      result: sunk ? 'sunk' : cell.status,
      at: Date.now()
    });

    addSystemMessage(`${state.player.name} стреляет ${coord}: ${resultText}.`);
    toast(sunk ? 'Корабль уничтожен!' : hit ? 'Попадание!' : 'Мимо');

    state.selectedTarget = null;

    if (isBoardDefeated(state.enemyBoard)) {
      state.result = 'win';
      state.phase = 'finished';
      addSystemMessage('Матч завершён: победа!');
      render();
      return;
    }

    // Классическое правило: ход переходит только при промахе.
    if (!hit && state.opponent?.type === 'computer') {
      state.phase = 'computer';
      addSystemMessage('Компьютер думает...');
      render();
      clearTimeout(computerTimer);
      computerTimer = setTimeout(computerShoot, 650);
      return;
    }

    if (!hit && state.opponent?.type !== 'computer') {
      state.phase = 'computer';
      addSystemMessage('Ход переходит сопернику.');
      render();
      return;
    }

    // Попал/ранил/убил — игрок продолжает стрелять.
    state.phase = 'player';
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
    state.phase = 'finished';
    addSystemMessage(result === 'win' ? 'Preview завершён: победа.' : 'Preview завершён: поражение.');
    render();
  },

  rematch() {
    clearTimeout(computerTimer);

    state.myBoard = syncFleetToBoard(state.fleet, createEmptyBoard());
    state.enemyBoard = syncFleetToBoard(autoPlaceFleet(createFleet()), createEmptyBoard());
    state.selectedTarget = null;
    state.battleFx = null;
    state.result = '';
    state.phase = 'rps';
    state.chat = [
      {
        from: 'Система',
        text: 'Реванш начался. Голосовой канал не прерывается. Разыгрываем первый ход.',
        at: Date.now()
      }
    ];

    setScreen('battle');
    openTurnDuel();
  }
};

const render = () => {
  const root = $('screen-root');
  const subtitle = $('screen-subtitle');
  if (!root || !subtitle) return;

  const inBattle = state.phase === 'player' || state.phase === 'computer' || state.phase === 'rps';
  
  // Кнопка сворачивания всегда доступна внутри Game Center:
  // play = трек загружен на паузе, pause = играет, stop = трека нет.
  const colBtn = $('collapse-btn');
  if (colBtn) {
    const player = state.snapshot?.player || {};
    const embedded = window.parent !== window;
    const playIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>`;
    const pauseIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>`;
    const stopIcon = `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>`;

    colBtn.hidden = !embedded;
    colBtn.classList.toggle('is-player-stopped', embedded && !player.uid);
    colBtn.innerHTML = player.uid ? (player.playing ? pauseIcon : playIcon) : stopIcon;
    colBtn.title = player.uid
      ? (player.playing ? 'Свернуть игру · музыка играет' : 'Свернуть игру · музыка на паузе')
      : 'Свернуть игру · плеер остановлен';
    colBtn.setAttribute('aria-label', colBtn.title);
  }

  // Показываем белый флаг ТОЛЬКО на вкладке "Бой" и ТОЛЬКО во время активной стрельбы.
  const surrenderBtn = $('surrender-btn');
  const canSurrender = (state.phase === 'player' || state.phase === 'computer') && state.screen === 'battle';
  if (surrenderBtn) surrenderBtn.hidden = !canSurrender;

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
    postToHost('GC_COLLAPSE_GAME');
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
      if (!postToHost('GC_CLOSE', { reason: 'war_hearts_exit' })) {
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
      // Выставляем поражение, но оставляем поле, чат и голосовую кнопку на экране боя.
      state.phase = 'finished';
      state.result = 'loss';
      addSystemMessage('Игрок сдался. Матч завершён.');
      render();
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
