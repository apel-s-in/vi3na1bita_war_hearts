import { packBoardReveal } from './fair-play.js';

export const RANKED_TERMINAL_STATUSES = new Set([
  'settled',
  'forfeited',
  'disputed',
  'aborted',
  'refunded'
]);

export const RANKED_ECONOMY_FINAL_STATUSES = new Set([
  'paid',
  'refunded',
  'not_required'
]);

export const isRankedTerminal = status =>
  RANKED_TERMINAL_STATUSES.has(String(status || ''));

export const isRankedEconomyFinal = status =>
  RANKED_ECONOMY_FINAL_STATUSES.has(String(status || ''));

const sortObject = value => {
  if (Array.isArray(value)) return value.map(sortObject);
  if (!value || typeof value !== 'object') return value;

  return Object.keys(value)
    .sort()
    .reduce((out, key) => {
      out[key] = sortObject(value[key]);
      return out;
    }, {});
};

const stableStringify = value =>
  JSON.stringify(sortObject(value));

const wait = ms =>
  new Promise(resolve => setTimeout(resolve, ms));

const randomHex = (bytes = 24) => {
  const data = crypto.getRandomValues(
    new Uint8Array(bytes)
  );

  return [...data]
    .map(value => value.toString(16).padStart(2, '0'))
    .join('');
};

const applyRankedMatch = (state, match = {}) => {
  const ranked = ensureRankedState(state);

  ranked.serverStatus = String(
    match.status ||
    ranked.serverStatus ||
    ''
  );
  ranked.settlement =
    match.settlement ||
    ranked.settlement ||
    null;
  ranked.rps =
    match.rps && typeof match.rps === 'object'
      ? { ...match.rps }
      : ranked.rps || null;
  ranked.economy =
    match.economy && typeof match.economy === 'object'
      ? { ...match.economy }
      : ranked.economy || null;

  if (ranked.rps?.firstPlayerId) {
    ranked.firstPlayerId = String(
      ranked.rps.firstPlayerId
    );
  }

  return ranked;
};

const sha256Hex = async value => {
  const data = new TextEncoder().encode(String(value || ''));
  const digest = await crypto.subtle.digest('SHA-256', data);

  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
};

const normalizePoint = point => ({
  x: Number(point?.x),
  y: Number(point?.y)
});

const normalizeEvent = (event, turn) => ({
  turn: Number(event?.turn || turn),
  shotId: String(event?.shotId || ''),
  shooterId: String(event?.shooterId || ''),
  x: Number(event?.x),
  y: Number(event?.y),
  result: String(event?.result || ''),
  sunkCells: (Array.isArray(event?.sunkCells)
    ? event.sunkCells
    : [])
    .map(normalizePoint)
    .sort((a, b) => a.y - b.y || a.x - b.x)
});

export const resetRankedState = state => {
  state.ranked = {
    version: 2,
    matchId: '',
    playerId: '',
    peerPlayerId: '',
    firstPlayerId: '',
    rps: null,
    economy: null,
    transcript: [],
    submitStatus: '',
    serverStatus: '',
    settlement: null,
    error: ''
  };

  return state.ranked;
};

export const ensureRankedState = state =>
  state.ranked || resetRankedState(state);

export const prepareRankedMatch = async ({
  state,
  session
} = {}) => {
  const ranked = ensureRankedState(state);

  if (ranked.matchId) return ranked;

  const response = await session.prepareRankedMatch();
  const match = response?.match || {};

  if (!match.matchId || !response.playerId) {
    throw new Error('ranked_match_prepare_failed');
  }

  ranked.matchId = String(match.matchId);
  ranked.playerId = String(response.playerId);
  ranked.peerPlayerId = String(response.peerPlayerId || '');
  ranked.serverStatus = String(match.status || 'pending');
  ranked.economy = match.economy || null;
  ranked.error = '';

  state.matchStats.matchId = ranked.matchId;

  const stakeResponse = await session.prepareRankedStake(
    ranked.matchId
  );

  applyRankedMatch(
    state,
    stakeResponse?.match || {}
  );

  if (
    !['locking', 'funded'].includes(
      ranked.economy?.status
    )
  ) {
    throw new Error('ranked_stake_prepare_failed');
  }

  return ranked;
};

export const playRankedRps = async ({
  state,
  session,
  choice,
  attempts = 40,
  intervalMs = 650
} = {}) => {
  const ranked = ensureRankedState(state);
  const selected = String(choice || '');

  if (
    !['rock', 'scissors', 'paper'].includes(selected)
  ) {
    throw new Error('ranked_rps_choice_invalid');
  }

  if (!ranked.matchId || !ranked.playerId) {
    throw new Error('ranked_match_not_prepared');
  }

  let current = await refreshRankedMatchStatus({
    state,
    session
  });

  if (current.firstPlayerId) return current;

  const round = Math.max(
    1,
    Number(current.rps?.round || 1)
  );
  const salt = randomHex(24);
  const commit = await sha256Hex([
    ranked.matchId,
    round,
    ranked.playerId,
    selected,
    salt
  ].join(':'));

  let response = await session.commitRankedRps({
    matchId: ranked.matchId,
    round,
    commit
  });

  applyRankedMatch(state, response?.match || {});

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (
      ranked.firstPlayerId ||
      ranked.rps?.canReveal
    ) break;

    if (document.hidden) {
      await wait(Math.max(intervalMs, 1800));
      continue;
    }

    await wait(intervalMs);
    await refreshRankedMatchStatus({
      state,
      session
    });
  }

  if (ranked.firstPlayerId) return ranked;

  if (!ranked.rps?.canReveal) {
    throw new Error('ranked_rps_peer_commit_timeout');
  }

  response = await session.revealRankedRps({
    matchId: ranked.matchId,
    round,
    choice: selected,
    salt
  });

  applyRankedMatch(state, response?.match || {});

  for (let attempt = 0; attempt < attempts; attempt++) {
    if (
      ranked.firstPlayerId ||
      ranked.rps?.roundStatus === 'draw' ||
      Number(ranked.rps?.round || 1) > round
    ) break;

    if (document.hidden) {
      await wait(Math.max(intervalMs, 1800));
      continue;
    }

    await wait(intervalMs);
    await refreshRankedMatchStatus({
      state,
      session
    });
  }

  return ranked;
};

export const recordRankedShot = (state, event) => {
  const ranked = ensureRankedState(state);
  const shotId = String(event?.shotId || '');

  if (!shotId) return false;
  if (ranked.transcript.some(item => item.shotId === shotId)) {
    return false;
  }

  ranked.transcript.push(
    normalizeEvent(event, ranked.transcript.length + 1)
  );

  return true;
};

export const setRankedFirstPlayer = (
  state,
  playerId
) => {
  const ranked = ensureRankedState(state);
  ranked.firstPlayerId = String(playerId || '');
  return ranked.firstPlayerId;
};

export const abortRankedMatch = async ({
  state,
  session,
  reason = 'disconnect'
} = {}) => {
  const ranked = ensureRankedState(state);

  if (
    state.network?.ranked !== true ||
    !ranked.matchId ||
    isRankedTerminal(ranked.serverStatus)
  ) {
    return ranked;
  }

  const response = await session.abortRankedMatch({
    matchId: ranked.matchId,
    reason
  });

  const match = response?.match || {};
  ranked.serverStatus = String(match.status || '');
  ranked.settlement = match.settlement || null;
  ranked.error = '';

  if (match.terminal) {
    ranked.submitStatus = match.status;
  }

  return ranked;
};

export const refreshRankedMatchStatus = async ({
  state,
  session
} = {}) => {
  const ranked = ensureRankedState(state);
  if (!ranked.matchId) return ranked;

  const response = await session.getRankedMatchStatus(
    ranked.matchId
  );

  const match = response?.match || {};
  applyRankedMatch(state, match);

  if (isRankedTerminal(match.status)) {
    ranked.submitStatus = match.status;
  } else if (ranked.submitStatus !== 'submitting') {
    ranked.submitStatus = 'submitted';
  }

  return ranked;
};

export const waitForRankedSettlement = async ({
  state,
  session,
  attempts = 12,
  intervalMs = 1250
} = {}) => {
  const ranked = ensureRankedState(state);

  for (let attempt = 0; attempt < attempts; attempt++) {
    const terminal = isRankedTerminal(
      ranked.serverStatus
    );
    const economyDone = isRankedEconomyFinal(
      ranked.economy?.status
    );

    if (terminal && economyDone) break;

    if (document.hidden) {
      await wait(Math.max(intervalMs, 2500));
      continue;
    }

    await wait(intervalMs);
    await refreshRankedMatchStatus({
      state,
      session
    });
  }

  return ranked;
};

export const buildRankedSubmission = async state => {
  const ranked = ensureRankedState(state);
  const transcript = ranked.transcript
    .map((event, index) => normalizeEvent(event, index + 1));

  return {
    result: state.result,
    firstPlayerId: ranked.firstPlayerId,
    boardReveal: packBoardReveal(state.myBoard),
    boardSalt: state.fairPlay?.mySalt || '',
    boardCommit: state.fairPlay?.myCommitHash || '',
    transcript,
    transcriptHash: await sha256Hex(
      stableStringify(transcript)
    )
  };
};

export const submitRankedMatch = async ({
  state,
  session
} = {}) => {
  const ranked = ensureRankedState(state);

  if (
    state.network?.ranked !== true ||
    state.phase !== 'finished' ||
    !state.fairPlay?.enemyReveal ||
    !ranked.matchId ||
    !ranked.firstPlayerId
  ) {
    return null;
  }

  if (
    ranked.submitStatus === 'submitting' ||
    ranked.submitStatus === 'settled'
  ) {
    return ranked;
  }

  ranked.submitStatus = 'submitting';
  ranked.error = '';

  try {
    const response = await session.submitRankedMatch({
      matchId: ranked.matchId,
      submission: await buildRankedSubmission(state)
    });

    const match = response?.match || {};
    ranked.serverStatus = String(match.status || '');
    ranked.settlement = match.settlement || null;
    ranked.submitStatus =
      match.status === 'settled'
        ? 'settled'
        : match.status === 'disputed'
          ? 'disputed'
          : 'submitted';

    if (ranked.submitStatus === 'submitted') {
      await waitForRankedSettlement({
        state,
        session
      });
    }

    return ranked;
  } catch (error) {
    ranked.submitStatus = 'failed';
    ranked.error = String(
      error?.message || 'ranked_submit_failed'
    );
    throw error;
  }
};

export default {
  RANKED_TERMINAL_STATUSES,
  RANKED_ECONOMY_FINAL_STATUSES,
  isRankedTerminal,
  isRankedEconomyFinal,
  resetRankedState,
  ensureRankedState,
  prepareRankedMatch,
  playRankedRps,
  abortRankedMatch,
  recordRankedShot,
  setRankedFirstPlayer,
  refreshRankedMatchStatus,
  waitForRankedSettlement,
  buildRankedSubmission,
  submitRankedMatch
};
