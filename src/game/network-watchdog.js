import { MessageType } from './protocol.js';

const TICK_MS = 5000;
const PING_EVERY_MS = 12000;

const now = () => Date.now();

export const createNetworkWatchdogState = () => ({
  active: false,
  lastPeerAt: 0,
  lastPingAt: 0,
  lastPongAt: 0,
  lastWarningAt: 0,
  softTimeoutMs: 20000,
  hardTimeoutMs: 45000,
  pendingTimeoutMs: 16000,
  warning: false,
  note: ''
});

export const ensureNetworkWatchdogState = state => {
  if (!state.networkWatchdog) state.networkWatchdog = createNetworkWatchdogState();

  state.networkWatchdog.softTimeoutMs = Number(state.networkWatchdog.softTimeoutMs || 20000);
  state.networkWatchdog.hardTimeoutMs = Number(state.networkWatchdog.hardTimeoutMs || 45000);
  state.networkWatchdog.pendingTimeoutMs = Number(state.networkWatchdog.pendingTimeoutMs || 16000);

  return state.networkWatchdog;
};

export const createNetworkWatchdog = ({
  state,
  session,
  render,
  addSystemMessage,
  scheduleSaveMatchDraft
}) => {
  let timer = 0;
  let paused = false;

  const touchPeer = () => {
    const wd = ensureNetworkWatchdogState(state);
    wd.active = !!state.network?.active;
    wd.lastPeerAt = now();
    wd.warning = false;
    wd.note = '';
  };

  const markPong = () => {
    const wd = ensureNetworkWatchdogState(state);
    wd.lastPongAt = now();
    touchPeer();
  };

  const warn = (text, { hard = false } = {}) => {
    const wd = ensureNetworkWatchdogState(state);
    const stamp = now();

    if (stamp - Number(wd.lastWarningAt || 0) < 9000 && wd.note === text) return;

    wd.warning = true;
    wd.note = text;
    wd.lastWarningAt = stamp;

    if (state.network) {
      state.network.status = hard ? 'error' : 'waiting';
      state.network.text = text;
      if (hard) state.network.connected = false;
    }

    addSystemMessage(text);
    scheduleSaveMatchDraft();
    render();
  };

  const clearWarning = () => {
    const wd = ensureNetworkWatchdogState(state);
    if (!wd.warning && !wd.note) return;

    wd.warning = false;
    wd.note = '';

    if (state.network?.active && state.network?.connected && state.network.status === 'waiting') {
      state.network.text = state.network.text || 'P2P-соединение активно.';
    }

    render();
  };

  const sendPingIfNeeded = () => {
    if (!state.network?.active || !state.network?.connected) return;
    if (state.phase === 'finished' && !state.network?.awaitingReveal) return;

    const wd = ensureNetworkWatchdogState(state);
    const stamp = now();

    if (stamp - Number(wd.lastPingAt || 0) < PING_EVERY_MS) return;

    wd.lastPingAt = stamp;

    session.sendGame(MessageType.PING, {
      matchId: state.matchStats?.matchId || '',
      phase: state.phase,
      awaitingShotResult: !!state.network?.awaitingShotResult,
      awaitingReveal: !!state.network?.awaitingReveal,
      hidden: !!document.hidden
    });
  };

  const checkPending = () => {
    if (!state.network?.active || !state.network?.connected) return;

    const wd = ensureNetworkWatchdogState(state);
    const stamp = now();
    const lastPeerAt = Number(wd.lastPeerAt || state.network.lastEventAt || 0);
    const silence = lastPeerAt ? stamp - lastPeerAt : 0;

    if (state.network.awaitingShotResult && silence > wd.pendingTimeoutMs) {
      warn('Соперник долго не отвечает на выстрел. Проверьте соединение.');
      return;
    }

    if (state.network.awaitingReveal && silence > wd.pendingTimeoutMs) {
      warn('Соперник долго не отправляет BOARD_REVEAL. Проверьте соединение.');
      return;
    }

    if (state.phase === 'setup' && state.network.myReady && !state.network.peerReady && silence > wd.pendingTimeoutMs) {
      warn('Вы готовы, но соперник долго не подтверждает готовность.');
      return;
    }

    if (state.phase === 'rps' && state.networkRps?.myChoice && !state.networkRps?.peerChoice && silence > wd.pendingTimeoutMs) {
      warn('Ждём выбор соперника в розыгрыше. Соединение может быть нестабильным.');
      return;
    }
  };

  const checkSilence = () => {
    if (!state.network?.active || !state.network?.connected) return;

    const wd = ensureNetworkWatchdogState(state);
    const stamp = now();
    const lastPeerAt = Number(wd.lastPeerAt || state.network.lastEventAt || 0);
    if (!lastPeerAt) return;

    const silence = stamp - lastPeerAt;

    if (silence > wd.hardTimeoutMs) {
      warn('Соперник не отвечает. Связь, возможно, потеряна.', { hard: true });
      return;
    }

    if (silence > wd.softTimeoutMs) {
      warn('Соперник долго не отвечает. Проверьте соединение.');
      return;
    }

    if (wd.warning && silence < wd.softTimeoutMs) clearWarning();
  };

  const tick = () => {
    if (paused || document.hidden) return;
    if (!state.network?.active) return;

    sendPingIfNeeded();
    checkPending();
    checkSilence();
  };

  const start = () => {
    if (timer) return;

    const wd = ensureNetworkWatchdogState(state);
    wd.active = true;
    timer = setInterval(tick, TICK_MS);
  };

  const stop = () => {
    clearInterval(timer);
    timer = 0;
    paused = false;

    const wd = ensureNetworkWatchdogState(state);
    wd.active = false;
  };

  const pause = () => {
    paused = true;
  };

  const resume = () => {
    paused = false;
    touchPeer();
    tick();
  };

  return {
    start,
    stop,
    pause,
    resume,
    tick,
    touchPeer,
    markPong,
    warn,
    clearWarning
  };
};
