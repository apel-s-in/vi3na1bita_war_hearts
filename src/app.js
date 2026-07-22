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
import { createMatchPersistence } from './game/match-persistence.js';
import { WarHeartsSession } from './net/war-hearts-session.js';
import { createNetworkCombat } from './game/network-combat.js';
import { createNetworkWatchdog } from './game/network-watchdog.js';
import { renderMenu } from './screens/menu.js';
import { renderOpponentSelect } from './screens/opponent-select.js';
import { renderField } from './screens/field.js';
import { renderInviteWait } from './screens/invite-wait.js';
import { renderBattle } from './screens/battle.js';

const $ = id => document.getElementById(id);
const GAME_ID = 'war_hearts';
let hostBridgeId = '';

const postToHost = (type, payload = {}) => {
  if (window.parent === window) return false;
  try {
    window.parent.postMessage({
      kind: 'vitrina:game',
      bridgeId: hostBridgeId,
      capabilityToken: String(
        window.__GC_CAPABILITY_TOKEN || ''
      ),
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
  if (
    window.parent !== window &&
    e.source !== window.parent
  ) return;

  const d = e.data || {};
  if (d.kind !== 'vitrina:game-host') return;
  if (d.bridgeId) {
    hostBridgeId = d.bridgeId;
    window.__GC_BRIDGE_ID = hostBridgeId;
  }

  if (d.type === 'GC_INIT') {
    window.__GC_CAPABILITY_TOKEN = String(
      d.payload?.capabilityToken || ''
    );

    const snap = d.payload?.snapshot || null;
    if (snap) {
      state.snapshot = snap;
      state.friendIdentity = snap.friend || null;
      if (snap.user?.displayName) state.player.name = snap.user.displayName;
      if (snap.user?.gcAccountId) state.player.id = snap.user.gcAccountId;
    }
    postToHost('GC_REQUEST_SNAPSHOT');
    render();
    return;
  }

  if (d.type === 'GC_SNAPSHOT') {
    state.snapshot = d.payload || state.snapshot;
    state.friendIdentity = d.payload?.friend || d.payload?.snapshot?.friend || null;
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

let launchCancelled = false;

const isLaunchCancelled = () =>
  launchCancelled;

const markLaunchCancelled = () => {
  launchCancelled = true;
};

const stripLaunchParams = () => {
  const u = new URL(window.location.href);
  ['inviteFriend', 'join', 'room', 'key', 'secret']
    .forEach(key => u.searchParams.delete(key));
  window.history.replaceState(null, '', u.toString());
};

const waitForFriendIdentity = async (timeoutMs = 3500) => {
  const started = Date.now();
  while (!state.friendIdentity?.friendId && Date.now() - started < timeoutMs) {
    postToHost('GC_REQUEST_SNAPSHOT');
    await new Promise(resolve => setTimeout(resolve, 120));
  }
  return state.friendIdentity || state.snapshot?.friend || null;
};

const isYandexAuthed = () => !!state.snapshot?.user?.yandexLinked;

const requestYandexLogin = () => {
  postToHost('GC_AUTH_LOGIN', { reason: 'war_hearts_ranked_required' });
  postToHost('GC_REQUEST_SNAPSHOT');
  toast('Откройте вход через Яндекс в основном приложении');
};

const waitForYandexAuth = async (timeoutMs = 18000) => {
  const started = Date.now();

  while (!isYandexAuthed() && Date.now() - started < timeoutMs) {
    postToHost('GC_REQUEST_SNAPSHOT');
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return isYandexAuthed();
};

const openRankedAuthGate = ({
  title = 'Рейтинговый бой',
  text = 'Войдите через Яндекс, чтобы сыграть рейтингово.',
  loginText = 'Войти через Яндекс',
  guestText = 'Сыграть гостевой бой',
  onAuthed,
  onGuest
} = {}) => {
  const overlay = document.createElement('div');
  overlay.className = 'wh-modal-overlay';
  overlay.innerHTML = `
    <div class="wh-modal-box">
      <h3 class="wh-modal-title">${title}</h3>
      <p class="wh-modal-text">${text}</p>
      <div class="wh-modal-actions" style="flex-direction:column;gap:10px">
        <button class="wh-btn" type="button" id="wh-auth-login" style="background:linear-gradient(135deg,#ff9800,#f57c00)">🏆 ${loginText}</button>
        <button class="wh-btn secondary" type="button" id="wh-auth-guest">👤 ${guestText}</button>
        <button class="wh-btn secondary" type="button" id="wh-auth-cancel" style="background:transparent;border:1px solid rgba(255,255,255,.2)">Отмена</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#wh-auth-cancel').onclick = () => overlay.remove();
  overlay.querySelector('#wh-auth-guest').onclick = () => {
    overlay.remove();
    onGuest?.();
  };
  overlay.querySelector('#wh-auth-login').onclick = async () => {
    requestYandexLogin();
    const ok = await waitForYandexAuth();

    if (!ok) {
      toast('Авторизация пока не завершена');
      return;
    }

    overlay.remove();
    onAuthed?.();
  };
};

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

  // Запрещаем переходить в БОЙ, если поле не готово
  const isFleetReady = state.fleet.every(s => s.placed);
  if (screen === 'battle' && !isFleetReady) {
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

async openFriends() {
  const old = document.querySelector(
    '.wh-friends-embed-overlay'
  );

  if (old) {
    old._friendsEmbed?.destroy?.();
    old.remove();
    return;
  }

  const overlay = document.createElement('section');
  overlay.className = 'wh-friends-embed-overlay';
  overlay.innerHTML = `
    <header class="wh-friends-embed-head">
      <b>Друзья</b>
      <button type="button" data-friends-close>✕</button>
    </header>
    <div class="wh-friends-embed-host"></div>
  `;

  document.body.appendChild(overlay);

  const close = () => {
    overlay._friendsEmbed?.destroy?.();
    overlay.remove();
  };

  overlay.querySelector('[data-friends-close]')
    ?.addEventListener('click', close);

  try {
    const module = await import(
      '/Games/common/friends-embed.js?v=9.0.2'
    );

    overlay._friendsEmbed =
      await module.mountCanonicalFriends({
        root: overlay.querySelector(
          '.wh-friends-embed-host'
        ),
        identity:
          state.snapshot?.friend ||
          state.friendIdentity ||
          {},
        build: '9.0.2',
        onGameInvite: async ({
          friendId,
          gameId
        }) => {
          close();

          if (
            !gameId ||
            gameId === GAME_ID
          ) {
            let name = 'Друг';

            try {
              const profile = await session.getProfile(
                friendId
              );
              name =
                profile?.displayName ||
                name;
            } catch {}

            await actions.inviteFriend(
              friendId,
              name
            );
          }
        }
      });
  } catch (error) {
    const host = overlay.querySelector(
      '.wh-friends-embed-host'
    );

    if (host) {
      host.innerHTML = `
        <div class="wh-friends-embed-error">
          Не удалось загрузить Друзья:
          ${String(error?.message || 'unknown_error')}
        </div>
      `;
    }
  }
},

openField() {
setScreen('field');
},

// ═══════════════════════════════════════════════════════════════
// LAN Wi-Fi сценарий: выбор режима (рейтинговый / гостевой)
// ═══════════════════════════════════════════════════════════════
startLanGameFlow() {
  const overlay = document.createElement('div');
  overlay.className = 'wh-modal-overlay';
  overlay.innerHTML = `
    <div class="wh-modal-box">
      <h3 class="wh-modal-title">📶 Друг в одной Wi‑Fi</h3>
      <p class="wh-modal-text" style="margin-bottom:16px">
        Это отдельный LAN-only режим: игра ищет прямое соединение только внутри вашей сети.
        Если устройства не в одной Wi‑Fi или роутер блокирует локальные соединения — код не подключится.
      </p>
      <div class="wh-modal-actions" style="flex-direction:column;gap:10px">
        <button class="wh-btn" type="button" id="lan-host-btn" style="background:linear-gradient(135deg,#4caf50,#2e7d32)">📡 Создать комнату</button>
        <button class="wh-btn secondary" type="button" id="lan-join-btn">🔗 Ввести код друга</button>
        <button class="wh-btn secondary" type="button" id="lan-cancel-btn" style="background:transparent;border:1px solid rgba(255,255,255,.2)">Отмена</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#lan-cancel-btn').onclick = () => overlay.remove();
  overlay.querySelector('#lan-host-btn').onclick = () => {
    overlay.remove();

    if (isYandexAuthed()) {
      createLanRoom(true);
      return;
    }

    openRankedAuthGate({
      title: '📡 Создать Wi‑Fi дуэль',
      text: 'Войдите через Яндекс, чтобы создать рейтинговый бой. Если хотите просто проверить игру с другом — можно создать гостевую комнату без статистики.',
      loginText: 'Войти и создать рейтинговый бой',
      guestText: 'Создать гостевую комнату',
      onAuthed: () => createLanRoom(true),
      onGuest: () => createLanRoom(false)
    });
  };
  overlay.querySelector('#lan-join-btn').onclick = () => {
    overlay.remove();
    showLanJoinCodeInput();
  };
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

  async inviteFriend(friendId, friendName) {
    try {
      toast(`Приглашаем ${friendName}...`);
      
      try {
        await sessionReady;
      } catch {}

      const invite = await session.createInvite();

      await session.sendGameInvite({
        toFriendId: friendId,
        roomId: invite.roomId,
        roomSecret: invite.roomSecret
      });

      state.invite = {
        id: invite.id || invite.roomId || `invite_${Date.now().toString(36)}`,
        roomId: invite.roomId || '',
        roomSecret: invite.roomSecret || '',
        url: invite.url || '',
        expiresAt: Date.now() + INVITE_TTL_MS,
        isDirectPush: true
      };

      state.network.active = true;
      state.network.connected = false;
      state.network.status = 'waiting';
      state.network.peerName = friendName;
      state.network.text = `Пуш-уведомление отправлено. Ожидаем подключение: ${friendName}...`;
      state.network.lastEventAt = Date.now();
      
      toast('Приглашение отправлено');
      setScreen('invite');
    } catch (err) {
      toast(`Ошибка: ${err.message}`);
    }
  },

  async createNearbyGame() {
    try {
      toast('Создаём код для друга рядом...');

      try {
        await sessionReady;
      } catch {}

      const near = await session.createNearbyGameCode();

      state.invite = {
        id: `near_${near.code}`,
        roomId: near.roomId || '',
        roomSecret: near.roomSecret || '',
        url: near.joinUrl || '',
        nearbyCode: near.code,
        expiresAt: near.expiresAt || Date.now() + INVITE_TTL_MS
      };

      state.network.active = true;
      state.network.connected = false;
      state.network.status = 'waiting';
      state.network.peerName = 'Друг рядом';
      state.network.text = `Код для друга рядом: ${near.code}. Ждём подключение...`;
      state.network.lastEventAt = Date.now();

      toast(`Код: ${near.code}`);
      setScreen('invite');
    } catch (err) {
      toast(`Ошибка: ${err.message}`);
    }
  },

  async joinNearbyGame(code) {
    try {
      const clean = String(code || '').replace(/\D/g, '').slice(0, 6);
      if (!clean) return toast('Введите код');

      toast('Подключаемся по коду...');

      try {
        await sessionReady;
      } catch {}

      await session.joinNearbyGameCode(clean);

      state.network.active = true;
      state.network.connected = false;
      state.network.status = 'waiting';
      state.network.peerName = 'Друг рядом';
      state.network.text = 'Код принят. Устанавливаем P2P-соединение...';
      state.network.lastEventAt = Date.now();

      setScreen('invite');
    } catch (err) {
      toast(err.message === 'nearby_game_not_found' ? 'Код не найден или устарел' : `Ошибка: ${err.message}`);
    }
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
    markLaunchCancelled();
    stripLaunchParams();
    session.close?.();

    state.invite = null;
    state.opponent = null;
    state.phase = 'idle';
    state.network.active = false;
    state.network.connected = false;
    state.network.status = 'offline';
    state.network.text = '';
    state.network.peerName = '';
    state.network.lastEventAt = Date.now();

    clearMatchDraft();
    toast('Приглашение отменено');
    setScreen('opponents');
  },

  acceptMockOpponent() {
    state.opponent = { id: 'friend_preview', name: 'Друг рядом', title: 'Гость арены', type: 'computer' };
    state.phase = 'setup';
    setScreen('field');
    toast('Preview-соперник выбран. Расставьте корабли.');
  },

  startComputerGame() {
    state.opponent = { id: 'computer_preview', name: 'Компьютер', title: 'Случайный стрелок', type: 'computer' };
    state.phase = 'setup';
    setScreen('field');
    toast('Игра с компьютером. Расставьте корабли.');
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

const showLanJoinCodeInput = () => {
const overlay = document.createElement('div');
overlay.className = 'wh-modal-overlay';
overlay.innerHTML = `
<div class="wh-modal-box">
<h3 class="wh-modal-title">🔗 Введите код комнаты</h3>
<p class="wh-modal-text">Попросите друга создать комнату и назвать вам 6-значный код.</p>
<input type="text" id="lan-code-input" maxlength="6" placeholder="123456"
style="width:100%;padding:14px;font-size:24px;text-align:center;font-weight:900;letter-spacing:4px;border-radius:12px;border:1px solid rgba(255,255,255,.15);background:rgba(0,0,0,.3);color:#fff;outline:none;margin-bottom:16px"
autocomplete="off" inputmode="numeric" pattern="[0-9]*">
<div class="wh-modal-actions" style="flex-direction:column;gap:10px">
<button class="wh-btn" type="button" id="lan-join-go-btn">Подключиться</button>
<button class="wh-btn secondary" type="button" id="lan-join-back-btn" style="background:transparent;border:1px solid rgba(255,255,255,.2)">Назад</button>
</div>
<div id="lan-join-error" style="margin-top:10px;font-size:12px;color:#ff6b6b;display:none;text-align:center"></div>
</div>
`;
document.body.appendChild(overlay);
const inp = overlay.querySelector('#lan-code-input');
const errEl = overlay.querySelector('#lan-join-error');
inp.focus();
inp.addEventListener('input', e => {
e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
});
inp.addEventListener('keydown', e => {
if (e.key === 'Enter') overlay.querySelector('#lan-join-go-btn').click();
});
overlay.querySelector('#lan-join-back-btn').onclick = () => {
overlay.remove();
actions.startLanGameFlow();
};
overlay.querySelector('#lan-join-go-btn').onclick = async () => {
const code = inp.value.replace(/\D/g, '');
if (code.length < 6) {
errEl.textContent = 'Введите 6 цифр кода';
errEl.style.display = 'block';
return;
}
errEl.style.display = 'none';
state.network.pendingLanCode = code;
overlay.remove();
joinLanByCode(code);
};
};

// Создание LAN-комнаты
const createLanRoom = async ranked => {
  toast('Создаём LAN-only комнату...');

  try {
    await sessionReady;

    const res = await session.createLanRoom({ ranked, forceLocalOnly: false });

    state.lanCode = res.code;
    state.invite = {
      id: res.roomId,
      roomId: res.roomId,
      roomSecret: res.roomSecret,
      code: res.code,
      isLan: true,
      localOnly: false,
      ranked: !!ranked,
      matchMode: ranked ? 'ranked' : 'casual',
      expiresAt: res.expiresAt || Date.now() + 300000
    };

    state.network.active = true;
    state.network.connected = false;
    state.network.status = 'waiting';
    state.network.peerName = 'Гость по Wi‑Fi';
    state.network.text = ranked
      ? 'P2P-комната создана. Назовите код другу.'
      : 'Гостевая P2P-комната создана. Назовите код другу.';
    state.network.ranked = !!ranked;
    state.network.localOnly = false;
    state.network.matchMode = ranked ? 'ranked' : 'casual';
    state.network.lastEventAt = Date.now();

    addSystemMessage(ranked
      ? 'Создана рейтинговая P2P-комната. Результат будет учтён после fair-play проверки.'
      : 'Создана гостевая P2P-комната. Результат не попадёт в статистику.');

    setScreen('invite');
  } catch (e) {
    toast(e.message === 'lan_code_register_failed'
      ? 'Не удалось зарегистрировать LAN-код'
      : `Ошибка: ${e.message}`);
  }
};

// Подключение по LAN-коду
const joinLanByCode = async code => {
  toast('Проверяем LAN-код...');

  try {
    await sessionReady;

    const roomInfo = await session.resolveLanRoom(code);
    const wantsRanked = !!roomInfo.ranked;

    if (wantsRanked && !isYandexAuthed()) {
      openRankedAuthGate({
        title: '🏆 Вас ждёт рейтинговый бой',
        text: 'Друг создал рейтинговую Wi‑Fi дуэль. Войдите через Яндекс, чтобы сразиться рейтингово. Если войдёте гостем, этот бой станет гостевым без статистики.',
        loginText: 'Войти и принять рейтинговый бой',
        guestText: 'Войти гостем',
        onAuthed: () => connectLanRoom(code, true),
        onGuest: () => connectLanRoom(code, false)
      });
      return;
    }

    await connectLanRoom(code, wantsRanked);
  } catch (e) {
    toast(e.message === 'lan_room_not_found' ? 'Комната не найдена или код истёк' : `Ошибка: ${e.message}`);
  }
};

const connectLanRoom = async (code, rankedOverride = null) => {
  toast('Подключаемся по LAN-коду...');

  const res = await session.joinLanRoom(code, {
    forceLocalOnly: false,
    rankedOverride
  });

  const ranked = !!res.ranked;

  state.invite = {
    id: res.roomId,
    roomId: res.roomId,
    roomSecret: res.roomSecret,
    code: res.code || code,
    isLan: true,
    localOnly: false,
    ranked,
    matchMode: ranked ? 'ranked' : 'casual',
    expiresAt: res.expiresAt || Date.now() + 300000
  };

  state.network.active = true;
  state.network.connected = false;
  state.network.status = 'connecting';
  state.network.peerName = 'Хост комнаты';
  state.network.text = ranked
    ? 'Код принят: рейтинговый P2P-бой. Устанавливаем соединение...'
    : 'Код принят: гостевой P2P-бой. Устанавливаем соединение...';
  state.network.ranked = ranked;
  state.network.localOnly = false;
  state.network.matchMode = ranked ? 'ranked' : 'casual';
  state.network.lastEventAt = Date.now();

  addSystemMessage(ranked
    ? 'Подключение к рейтинговому P2P-бою. Результат будет учтён после проверки.'
    : 'Подключение к гостевому P2P-бою. Результат не попадёт в статистику.');

  setScreen('invite');
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
  const canSurrender =
    (
      state.phase === 'player' ||
      state.phase === 'computer'
    ) &&
    state.screen === 'battle';

  if (surrenderBtn) {
    surrenderBtn.hidden = !canSurrender;
  }

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
      msg = state.result
        ? 'Бой завершён. Можно выйти из игры или вернуться позже.'
        : 'Выйти из игры?';
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
    overlay.querySelector('#wh-modal-confirm').onclick = async () => {
      overlay.remove();

      if (
        state.network?.ranked === true &&
        ['rps', 'player', 'computer'].includes(state.phase)
      ) {
        await networkCombat?.abortRanked?.('user_exit');
      }

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
        <p class="wh-modal-text">Бой будет завершён. Соперник получит победу. В рейтинговом бою результат пойдёт на проверку. Точно сдаться?</p>
        <div class="wh-modal-actions">
          <button class="wh-btn secondary" type="button" id="wh-surrender-cancel">Отмена</button>
          <button class="wh-btn" type="button" id="wh-surrender-confirm" style="background:var(--wh-red)">Сдаться</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#wh-surrender-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#wh-surrender-confirm').onclick = async () => {
      overlay.remove();

      if (state.network?.ranked === true) {
        await networkCombat?.abortRanked?.('surrender');
      }

      finishMatch(
        'loss',
        'Игрок сдался. Матч завершён.'
      );
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
    if (state.network?.active) {
      const label = String(info?.label || '');
      state.network.status = info?.online ? 'ready' : (label.includes('err') || label.includes('failed') ? 'error' : state.network.status || 'waiting');
      state.network.text = ({
        'waiting': 'Host ждёт offer от guest...',
        'connecting': 'Guest отправляет offer...',
        'send offer': 'Отправляем offer через signaling...',
        'offer sent': 'Offer отправлен. Ждём answer...',
        'offer received': 'Offer получен. Отправляем answer...',
        'send answer': 'Отправляем answer через signaling...',
        'answer sent': 'Answer отправлен. Ждём ICE...',
        'answer received': 'Answer получен. Собираем ICE...',
        'send ice': 'Отправляем ICE candidate...',
        'ice sent': 'ICE candidate отправлен.',
        'ice received': 'ICE candidate получен.',
        'online': 'P2P-соединение установлено.'
      })[label] || state.network.text || label || 'Синхронизация сети...';
      state.network.lastEventAt = Date.now();
      if (info?.ice) state.network.ice = { ...state.network.ice, ...info.ice };
      render();
    }
  };

  const markNetworkPeerHint = name => {
    state.network.active = true;
    state.network.connected = false;
    state.network.peerName = name || state.network.peerName || 'Соперник';
  };

  session.onIceDiagnostics = info => {
    state.network.ice = {
      ...state.network.ice,
      ...(info || {})
    };
    render();
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
      title: session.room?.localOnly
        ? (session.room?.ranked ? 'LAN-only · рейтинг' : 'LAN-only · гость')
        : 'Сетевая дуэль',
      type: 'network'
    };

    state.network.active = true;
    state.network.connected = true;
    state.network.peerName = state.opponent.name;
    state.network.ranked = !!session.room?.ranked;
    state.network.localOnly = !!session.room?.localOnly;
    state.network.matchMode = state.network.ranked ? 'ranked' : 'casual';

    networkCombat?.onConnected(state.opponent.name);
    networkWatchdog?.touchPeer();

    addSystemMessage('Сетевое соединение установлено.');

    const canStartPreparation = !['setup', 'rps', 'player', 'computer'].includes(state.phase);
    if (canStartPreparation) {
      networkCombat?.startNetworkPreparation({
        initiator: session.room?.role !== 'guest',
        ranked: !!state.network.ranked
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
render();

sessionReady = session.init()
  .then(async () => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('join')) {
      state.network.status = 'connecting';
    }

    const inviteFriendId = params.get('inviteFriend');
    if (inviteFriendId && !isLaunchCancelled()) {
      stripLaunchParams();

      try {
        const identity = await waitForFriendIdentity();
        if (!identity?.friendId) {
          throw new Error('friend_identity_not_ready');
        }

        const profile = await session
          .getProfile(inviteFriendId)
          .catch(() => null);

        actions.inviteFriend(
          inviteFriendId,
          profile?.displayName || 'Друг'
        );
      } catch (e) {
        console.error('[Auto-Invite Error]', e);
      }
    }
    return true;
  })
  .catch(() => {
    setStatus('mock', false);
    return false;
  });
