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
import { pickSmartTarget } from './game/targeting.js';
import {
  applyRevealToBoard,
  createSalt,
  packBoardReveal,
  validateRevealLayout
} from './game/fair-play.js';
import { createTranscript } from './game/transcript.js';
import { createMatchPersistence } from './game/match-persistence.js';
import { WarHeartsSession } from './net/war-hearts-session.js';
import { createNetworkCombat } from './game/network-combat.js';
import { createNetworkWatchdog } from './game/network-watchdog.js';
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

    if (!restoreMatchDraft()) render();
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
let matchPersistence = null;
let networkCombat = null;
let networkWatchdog = null;
let sessionReady = Promise.resolve(false);

const saveMatchDraftNow = () => matchPersistence?.saveMatchDraftNow();
const scheduleSaveMatchDraft = () => matchPersistence?.scheduleSaveMatchDraft();
const restoreMatchDraft = () => matchPersistence?.restoreMatchDraft() || false;
const clearMatchDraft = () => matchPersistence?.clearMatchDraft();

const makeEmptyBoard = () => Array.from({ length: 10 }, () =>
  Array.from({ length: 10 }, () => ({
    ship: false,
    status: ''
  }))
);

const clearBattleTimers = () => {
  clearTimeout(computerTimer);
  clearTimeout(playerAutoTimer);
};

const INVITE_TTL_MS = 120000;

const boardShipCells = board => board.flat().filter(cell => cell.ship);
const isBoardDefeated = board => {
  const ships = boardShipCells(board);
  return ships.length > 0 && ships.every(cell => cell.status === 'hit');
};

const createMatchStats = () => ({
  matchId: `whm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
  startedAt: Date.now(),
  finishedAt: 0,
  playerShots: 0,
  opponentShots: 0,
  playerHits: 0,
  opponentHits: 0,
  playerMisses: 0,
  opponentMisses: 0,
  playerSunk: 0,
  opponentSunk: 0,
  playerHitStreak: 0,
  opponentHitStreak: 0,
  playerBestHitStreak: 0,
  opponentBestHitStreak: 0
});

const resetMatchStats = () => {
  state.matchStats = createMatchStats();
};

const resetFairPlayForMatch = () => {
  state.fairPlay = {
    matchId: state.matchStats.matchId,
    mySalt: createSalt(),
    myCommitHash: '',
    enemyCommitHash: '',
    myReveal: null,
    enemyReveal: null,
    revealed: false,
    myLayoutOk: null,
    enemyLayoutOk: null,
    enemyCommitOk: null,
    enemyTranscriptOk: null,
    note: 'commit будет рассчитан перед сетевым матчем'
  };
};

const revealFinalBoards = () => {
  const myReveal = packBoardReveal(state.myBoard);
  const myCheck = validateRevealLayout(myReveal);

  applyRevealToBoard(state.myBoard, myReveal);

  if (state.opponent?.type === 'network') {
    state.fairPlay = {
      ...state.fairPlay,
      matchId: state.matchStats.matchId,
      myReveal,
      revealed: !!state.fairPlay.enemyReveal,
      myLayoutOk: myCheck.ok,
      enemyLayoutOk: state.fairPlay.enemyLayoutOk,
      enemyCommitOk: state.fairPlay.enemyCommitOk,
      note: state.fairPlay.enemyReveal
        ? state.fairPlay.note
        : 'ожидается BOARD_REVEAL соперника'
    };
    return;
  }

  const enemyReveal = packBoardReveal(state.enemyBoard);
  const enemyCheck = validateRevealLayout(enemyReveal);

  applyRevealToBoard(state.enemyBoard, enemyReveal);

  state.fairPlay = {
    ...state.fairPlay,
    matchId: state.matchStats.matchId,
    myReveal,
    enemyReveal,
    revealed: true,
    myLayoutOk: myCheck.ok,
    enemyLayoutOk: enemyCheck.ok,
    enemyCommitOk: true,
    note: 'локальный бой: расстановка раскрыта и проверена по правилам'
  };
};

const finishMatch = (result, message) => {
  if (state.phase === 'finished') return;

  state.result = result;
  state.phase = 'finished';
  state.autoBattle.player = false;
  clearTimeout(playerAutoTimer);
  clearTimeout(computerTimer);
  state.matchStats.finishedAt = Date.now();
  revealFinalBoards();
  addSystemMessage(message);
  addSystemMessage('Расстановки раскрыты. Проверка правил завершена.');
  if (state.opponent?.type === 'network') {
    networkCombat?.sendMatchFinished(result);
    networkCombat?.sendBoardReveal();
  }

  render();
  saveMatchDraftNow();
};

const registerShotStats = (side, result) => {
  const stats = state.matchStats;
  if (!stats.matchId) stats.matchId = `whm_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  if (!stats.startedAt) stats.startedAt = Date.now();

  const hit = result === 'hit' || result === 'sunk';

  if (side === 'player') {
    stats.playerShots++;
    if (hit) {
      stats.playerHits++;
      stats.playerHitStreak++;
      stats.playerBestHitStreak = Math.max(stats.playerBestHitStreak || 0, stats.playerHitStreak);
    } else {
      stats.playerMisses++;
      stats.playerHitStreak = 0;
    }
    if (result === 'sunk') stats.playerSunk++;
    return;
  }

  stats.opponentShots++;
  if (hit) {
    stats.opponentHits++;
    stats.opponentHitStreak++;
    stats.opponentBestHitStreak = Math.max(stats.opponentBestHitStreak || 0, stats.opponentHitStreak);
  } else {
    stats.opponentMisses++;
    stats.opponentHitStreak = 0;
  }
  if (result === 'sunk') stats.opponentSunk++;
};

const addSystemMessage = text => {
  state.chat.push({
    from: 'Система',
    text,
    at: Date.now()
  });
  scheduleSaveMatchDraft();
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
    scheduleSaveMatchDraft();
    schedulePlayerAutoShot();
    return;
  }

  render();
  scheduleSaveMatchDraft();
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
        scheduleSaveMatchDraft();
        schedulePlayerAutoShot();
        return;
      }

      state.phase = 'computer';
      addSystemMessage('Розыгрыш завершён. Первым ходит соперник.');
      render();
      scheduleSaveMatchDraft();
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

matchPersistence = createMatchPersistence({
  state,
  gameId: GAME_ID,
  postToHost,
  createMatchStats,
  render: () => render(),
  openTurnDuel: () => openTurnDuel(),
  scheduleComputerTurn: () => {
    clearTimeout(computerTimer);
    computerTimer = setTimeout(computerShoot, 720);
  }
});

networkCombat = createNetworkCombat({
  state,
  session,
  setScreen: screen => setScreen(screen),
  render: () => render(),
  toast,
  addSystemMessage,
  formatCellName,
  getShipCellsAt,
  isShipSunk,
  markSunkPerimeter,
  isBoardDefeated,
  registerShotStats,
  showBattleFx,
  finishMatch,
  resetMatchStats,
  resetFairPlayForMatch,
  scheduleSaveMatchDraft,
  saveMatchDraftNow,
  clearTimers: clearBattleTimers,
  makeEmptyBoard
});

networkWatchdog = createNetworkWatchdog({
  state,
  session,
  render: () => render(),
  addSystemMessage,
  scheduleSaveMatchDraft
});

networkWatchdog.start();
const startLocalPreparedBattle = ({
  opponent = state.opponent,
  message = 'Расстановка подтверждена. Разыгрываем первый ход.',
  toastText = ''
} = {}) => {
  if (!opponent) {
    setScreen('opponents');
    return;
  }

  clearTimeout(computerTimer);
  clearTimeout(playerAutoTimer);

  state.opponent = opponent;
  state.myBoard = syncFleetToBoard(state.fleet, createEmptyBoard());
  state.enemyBoard = syncFleetToBoard(autoPlaceFleet(createFleet()), createEmptyBoard());
  state.selectedTarget = null;
  state.battleFx = null;
  state.autoBattle.player = false;

  resetMatchStats();
  resetFairPlayForMatch();

  state.result = '';
  state.phase = 'rps';
  state.chat = [
    {
      from: 'Система',
      text: message,
      at: Date.now()
    }
  ];

  scheduleSaveMatchDraft();
  if (toastText) toast(toastText);
  setScreen('battle');
  openTurnDuel();
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
    schedulePlayerAutoShot();
  };

  overlay.querySelector('#wh-shot-confirm').onclick = () => {
    overlay.remove();
    performPlayerShot(x, y);
  };
};

const schedulePlayerAutoShot = () => {
  clearTimeout(playerAutoTimer);

  if (!state.autoBattle.player) return;
  if (state.screen !== 'battle') return;
  if (state.phase !== 'player') return;

  playerAutoTimer = setTimeout(() => {
    if (!state.autoBattle.player || state.phase !== 'player') return;

    const target = pickSmartTarget(state.enemyBoard);
    if (!target) return;

    state.selectedTarget = { x: target.x, y: target.y };
    render();

    playerAutoTimer = setTimeout(() => {
      performPlayerShot(target.x, target.y, { auto: true });
    }, 260);
  }, 720);
};

const performPlayerShot = (x, y, { auto = false } = {}) => {
  if (state.opponent?.type === 'network') {
    networkCombat?.shoot(x, y);
    return;
  }

  if (state.phase !== 'player' || state.phase === 'finished') return;

  const cell = state.enemyBoard[y]?.[x];
  if (!cell || cell.status) {
    state.selectedTarget = null;
    render();
    schedulePlayerAutoShot();
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

  registerShotStats('player', fxKind);
  showBattleFx('enemy', fxKind);

  transcript.add({
    type: auto ? 'AUTO_SHOT' : 'SHOT',
    x,
    y,
    result: fxKind,
    at: Date.now()
  });

  addSystemMessage(`${auto ? 'Автобой' : state.player.name} стреляет ${coord}: ${resultText}.`);
  toast(sunk ? 'Корабль уничтожен!' : hit ? 'Попадание!' : 'Мимо');

  state.selectedTarget = null;

  if (isBoardDefeated(state.enemyBoard)) {
    finishMatch('win', 'Матч завершён: победа!');
    return;
  }

  if (!hit && state.opponent?.type === 'computer') {
    state.phase = 'computer';
    addSystemMessage('Компьютер думает...');
    render();
    clearTimeout(computerTimer);
    computerTimer = setTimeout(computerShoot, 720);
    return;
  }

  if (!hit && state.opponent?.type !== 'computer') {
    state.phase = 'computer';
    addSystemMessage('Ход переходит сопернику.');
    render();
    return;
  }

  state.phase = 'player';
  render();
  scheduleSaveMatchDraft();
  schedulePlayerAutoShot();
};

const setScreen = screen => {
  if (screen === 'battle' && !state.opponent && state.phase !== 'finished') {
    toast('Сначала выберите соперника.');
    screen = 'opponents';
  }

  if (screen === 'invite' && !state.invite) {
    screen = 'opponents';
  }

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

  if (screen === 'invite' && !document.hidden) {
    inviteTimer = setInterval(() => {
      if (state.screen === 'invite' && !document.hidden) render();
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
    clearTimeout(computerTimer);
    clearTimeout(playerAutoTimer);
    state.autoBattle.player = false;

    // Если возвращаемся из завершённого боя, сбрасываем визуальное состояние матча.
    if (state.phase === 'finished') {
      clearMatchDraft();
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

  setMenuTab(tab) {
    state.menuTab = tab === 'achievements' ? 'achievements' : 'stats';
    render();
  },

  networkReady() {
    networkCombat?.markReady();
  },

  startPreparedBattle() {
    if (!state.fleet.every(s => s.placed)) {
      toast('Сначала расставьте все корабли!');
      return;
    }

    if (!state.opponent) {
      setScreen('opponents');
      return;
    }

    if (state.opponent.type === 'network') {
      networkCombat?.markReady();
      return;
    }

    startLocalPreparedBattle({
      message: 'Расстановка подтверждена. Разыгрываем первый ход.'
    });
  },

  async createInvite() {
    try {
      toast('Проверяем сетевой bridge...');

      try {
        await sessionReady;
      } catch {
        // session.createInvite ниже сам уйдёт в preview, если bridge недоступен
      }

      const invite = await session.createInvite();
      state.invite = {
        id: invite.id || invite.roomId || `invite_${Date.now().toString(36)}`,
        roomId: invite.roomId || '',
        roomSecret: invite.roomSecret || '',
        url: invite.url || '',
        expiresAt: Date.now() + INVITE_TTL_MS
      };
      state.network.active = true;
      state.network.connected = false;
      state.network.status = invite.url ? 'waiting' : 'error';
      state.network.peerName = 'Соперник';
      state.network.text = invite.url
        ? 'Ссылка создана. Ожидаем подключение второго устройства...'
        : `Network bridge недоступен. Preview без P2P${session.lastError ? `: ${session.lastError}` : '.'}`;
      state.network.lastEventAt = Date.now();
      toast(invite.url ? 'Ссылка создана' : 'Preview-приглашение создано');
    } catch {
      state.invite = {
        id: `invite_${Date.now().toString(36)}`,
        url: '',
        expiresAt: Date.now() + INVITE_TTL_MS
      };
      state.network.active = true;
      state.network.connected = false;
      state.network.status = 'error';
      state.network.peerName = 'Соперник';
      state.network.text = `Сеть недоступна. Preview без P2P${session.lastError ? `: ${session.lastError}` : '.'}`;
      state.network.lastEventAt = Date.now();
      toast('Сеть недоступна, создан preview');
    }
    setScreen('invite');
  },

  extendInvite() {
    if (!state.invite) return;

    if (!state.invite.url || !state.invite.roomSecret) {
      state.invite.expiresAt = Date.now() + INVITE_TTL_MS;
      state.network.status = 'error';
      state.network.text = 'Preview-приглашение продлено локально, но P2P-соединение недоступно.';
      state.network.lastEventAt = Date.now();
      toast('Preview продлён локально');
      render();
      return;
    }

    state.invite.expiresAt = Math.max(Date.now(), state.invite.expiresAt || 0) + INVITE_TTL_MS;
    toast('Приглашение продлено');
    render();
  },

  cancelInvite() {
    if (!state.network?.connected) session.close?.();
    state.invite = null;

    if (state.opponent?.type !== 'network' || !state.network?.connected) {
      state.network.active = false;
      state.network.connected = false;
      state.network.status = 'offline';
      state.network.text = '';
      state.network.peerName = '';
      state.network.lastEventAt = Date.now();
    }

    toast('Приглашение отменено');
    setScreen('opponents');
  },

  acceptMockOpponent() {
    startLocalPreparedBattle({
      opponent: {
        id: 'friend_preview',
        name: 'Друг рядом',
        title: 'Гость арены',
        type: 'computer'
      },
      message: 'Preview-соперник выбран. Сейчас разыграем первый ход.',
      toastText: 'Соперник выбран'
    });
  },

  startComputerGame() {
    startLocalPreparedBattle({
      opponent: {
        id: 'computer_preview',
        name: 'Компьютер',
        title: 'Случайный стрелок',
        type: 'computer'
      },
      message: 'Новая тренировка началась. Сейчас разыграем первый ход.',
      toastText: 'Игра с компьютером'
    });
  },

  shootCell(x, y) {
    if (state.phase !== 'player' || state.phase === 'finished') return;

    const cell = state.enemyBoard[y]?.[x];
    if (!cell || cell.status) return;

    state.selectedTarget = { x, y };
    render();

    if (state.autoBattle.player && state.opponent?.type !== 'network') {
      performPlayerShot(x, y, { auto: true });
      return;
    }

    openShotConfirm(x, y);
  },

  confirmShot(x, y) {
    performPlayerShot(x, y);
  },

  toggleAutoBattle() {
    state.autoBattle.player = !state.autoBattle.player;
    toast(state.autoBattle.player ? 'Автобой включён' : 'Автобой выключен');
    render();
    schedulePlayerAutoShot();
  },

  sendChat(text) {
    const message = String(text || '').trim().slice(0, 300);
    if (!message) return;

    const sent = session.sendChat(message);

    state.chat.push({
      from: state.player.name,
      text: sent || state.opponent?.type !== 'network'
        ? message
        : `${message} · не отправлено`,
      at: Date.now()
    });

    if (!sent && state.opponent?.type === 'network') {
      networkWatchdog?.warn('Сообщение не отправлено. Проверьте соединение.');
    }

    render();
    scheduleSaveMatchDraft();
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
    finishMatch(result, result === 'win' ? 'Preview завершён: победа.' : 'Preview завершён: поражение.');
  },

  rematch() {
    if (state.opponent?.type === 'network') {
      networkCombat?.requestRematch();
      return;
    }

    clearTimeout(computerTimer);
    clearTimeout(playerAutoTimer);

    state.selectedTarget = null;
    state.battleFx = null;
    state.autoBattle.player = false;
    state.result = '';
    state.phase = 'setup';

    state.myBoard.forEach(row => row.forEach(cell => {
      cell.status = '';
    }));

    state.enemyBoard = createEmptyBoard();

    state.chat = [
      {
        from: 'Система',
        text: 'Реванш: можно изменить расстановку. После подтверждения будет новый розыгрыш первого хода.',
        at: Date.now()
      }
    ];

    scheduleSaveMatchDraft();
    toast('Реванш: подготовьте поле');
    setScreen('field');
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
      finishMatch('loss', 'Игрок сдался. Матч завершён.');
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

  const markNetworkPeerHint = name => {
    state.network.active = true;
    state.network.connected = false;
    state.network.peerName = name || state.network.peerName || 'Соперник';
  };

  session.onRoom = info => {
    if (info?.role === 'guest') {
      markNetworkPeerHint('Хост комнаты');
      state.network.text = 'Комната найдена. Устанавливаем P2P-соединение...';
      state.network.status = 'waiting';
      state.network.lastEventAt = Date.now();
      toast('Подключаемся к комнате');
      render();
    }
  };

  session.onConnect = peer => {
    state.opponent = {
      id: peer?.id || 'network-peer',
      name: peer?.name || 'Соперник',
      title: 'Сетевая дуэль',
      type: 'network'
    };

    state.network.active = true;
    state.network.connected = true;
    state.network.peerName = state.opponent.name;

    networkCombat?.onConnected(state.opponent.name);
    networkWatchdog?.touchPeer();

    addSystemMessage('Сетевое соединение установлено.');

    const canStartPreparation = !['setup', 'rps', 'player', 'computer'].includes(state.phase);
    if (canStartPreparation) {
      networkCombat?.startNetworkPreparation({
        initiator: session.room?.role !== 'guest'
      });
      return;
    }

    render();
  };

  session.onDisconnect = () => {
    networkCombat?.onDisconnected();
    networkWatchdog?.warn('Соединение с соперником потеряно.', { hard: true });
    addSystemMessage('Соединение с соперником потеряно.');
    render();
  };

  session.onChat = msg => {
    networkWatchdog?.touchPeer();
    state.chat.push(msg);
    render();
    scheduleSaveMatchDraft();
  };

  session.onGameData = msg => {
    networkWatchdog?.touchPeer();
    networkCombat?.handleGameData(msg);
  };
};

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    networkWatchdog?.resume();

    if (state.screen === 'invite' && !inviteTimer) {
      inviteTimer = setInterval(() => {
        if (state.screen === 'invite' && !document.hidden) render();
      }, 1000);
    }

    schedulePlayerAutoShot();
    return;
  }

  networkWatchdog?.pause();
  saveMatchDraftNow();
  clearTimeout(playerAutoTimer);
  clearTimeout(computerTimer);
  clearInterval(inviteTimer);
  inviteTimer = 0;
});

bind();
setStatus('preview', false);
render();

sessionReady = session.init()
  .then(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('room') && (params.get('key') || params.get('secret'))) {
      setStatus('invite', false);
    }
    return true;
  })
  .catch(() => {
    setStatus('mock', false);
    return false;
  });
