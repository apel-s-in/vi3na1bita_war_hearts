export const renderNetworkIndicator = (state, {
  fallbackText = 'Сетевой режим: синхронизация с соперником.'
} = {}) => {
  const net = state.network || {};
  const el = document.createElement('div');
  const status = net.status || 'info';
  const connected = !!net.connected;
  const waiting = ['waiting', 'setup', 'peer-turn'].includes(status);
  const error = status === 'error' || status === 'offline' || !!state.networkWatchdog?.warning;

  el.className = [
    'wh-network-indicator',
    `is-${status}`,
    connected ? 'is-connected' : 'is-not-connected',
    waiting ? 'is-waiting' : '',
    error ? 'is-error-state' : ''
  ].filter(Boolean).join(' ');

  const peer = net.peerName || state.opponent?.name || 'Соперник';
  const text = state.networkWatchdog?.warning && state.networkWatchdog?.note
    ? state.networkWatchdog.note
    : net.text || fallbackText;
  const stage = getStageLabel(state, net);
  const link = getConnectionLabel(net);

  el.innerHTML = `
    <span class="wh-network-dot" aria-hidden="true"></span>
    <div class="wh-network-main">
      <b>${escapeHtml(peer)}</b>
      <em>${escapeHtml(text)}</em>
    </div>
    <small>${escapeHtml(link)} · ${escapeHtml(stage)}</small>
  `;

  return el;
};

const getConnectionLabel = net => {
  if (net.status === 'error') return 'связь потеряна';
  if (net.status === 'offline') return 'не подключено';
  if (net.connected) return 'P2P online';
  if (net.status === 'waiting') return 'ожидание';
  if (net.status === 'setup') return 'подготовка';
  return 'сеть';
};

const getStageLabel = (state, net) => {
  if (net.awaitingShotResult) return 'ждём результат выстрела';
  if (net.awaitingReveal) return 'ждём reveal';
  if (state.phase === 'setup') {
    if (net.myReady && net.peerReady) return 'оба готовы';
    if (net.myReady) return 'вы готовы';
    if (net.peerReady) return 'соперник готов';
    return 'расстановка';
  }
  if (state.phase === 'rps') return 'розыгрыш хода';
  if (state.phase === 'player') return 'ваш ход';
  if (state.phase === 'computer') return 'ход соперника';
  if (state.phase === 'finished') return 'финал';
  return 'ожидание';
};

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
})[ch]);
