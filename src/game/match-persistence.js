export const createMatchPersistence = ({
  state,
  gameId,
  postToHost,
  createMatchStats,
  render,
  openTurnDuel,
  scheduleComputerTurn
}) => {
  let saveDraftTimer = 0;
  let draftRestored = false;

  const packBoard = board => board.map(row => row.map(cell => ({
    h: !!cell.ship,
    s: cell.status || ''
  })));

  const unpackBoard = packed => Array.isArray(packed)
    ? packed.map(row => Array.isArray(row)
      ? row.map(cell => ({ ship: !!cell?.h, status: String(cell?.s || '') }))
      : [])
    : [];

  const getSavedGameData = key => {
    const data = state.snapshot?.gameData || {};
    return data[`${gameId}_${key}`] || data[key] || null;
  };

  const makeMatchDraft = () => ({
    v: 1,
    gameId,
    savedAt: Date.now(),
    screen: state.screen,
    phase: state.phase,
    result: state.result,
    opponent: state.opponent,
    selectedTarget: state.selectedTarget,
    autoBattle: { player: false },
    fairPlay: state.fairPlay,
    network: state.network,
    networkRps: state.networkRps,
    networkShots: state.networkShots,
    networkTurn: state.networkTurn,
    networkWatchdog: state.networkWatchdog,
    matchStats: state.matchStats,
    fleet: state.fleet,
    myBoard: packBoard(state.myBoard),
    enemyBoard: packBoard(state.enemyBoard),
    chat: state.chat.slice(-500)
  });

  const readMatchHistory = () => {
    const saved = getSavedGameData('matchHistory');
    return Array.isArray(saved) ? saved : [];
  };

  const makeHistoryItem = () => {
    const s = state.matchStats || {};
    const playerSunk = Number(s.playerSunk || 0);
    const opponentSunk = Number(s.opponentSunk || 0);
    const playerShots = Number(s.playerShots || 0);
    const playerHits = Number(s.playerHits || 0);
    const accuracy = playerShots ? Math.round((playerHits / playerShots) * 100) : 0;
    const opponentType = state.opponent?.type || 'computer';

    return {
      matchId: String(s.matchId || ''),
      gameId,
      finishedAt: Number(s.finishedAt || Date.now()),
      startedAt: Number(s.startedAt || 0),
      opponentId: String(state.opponent?.id || ''),
      opponentName: String(state.opponent?.name || (opponentType === 'computer' ? 'Компьютер' : 'Соперник')),
      opponentType,
      opponentIcon: opponentType === 'computer' ? '🤖' : opponentType === 'network' ? '🌐' : '👤',
      result: state.result || 'unknown',
      resultIcon: state.result === 'win' ? '🏆' : '💔',
      playerSunk,
      opponentSunk,
      balance: playerSunk - opponentSunk,
      accuracy,
      playerShots,
      playerHits,
      playerMisses: Number(s.playerMisses || 0),
      opponentShots: Number(s.opponentShots || 0),
      opponentHits: Number(s.opponentHits || 0),
      opponentMisses: Number(s.opponentMisses || 0),
      playerBestHitStreak: Number(s.playerBestHitStreak || 0),
      opponentBestHitStreak: Number(s.opponentBestHitStreak || 0),
      fairPlay: {
        myLayoutOk: state.fairPlay?.myLayoutOk,
        enemyLayoutOk: state.fairPlay?.enemyLayoutOk,
        enemyCommitOk: state.fairPlay?.enemyCommitOk,
        enemyTranscriptOk: state.fairPlay?.enemyTranscriptOk,
        revealed: !!state.fairPlay?.revealed,
        note: String(state.fairPlay?.note || '')
      }
    };
  };

  const saveMatchStats = () => {
    if (!state.matchStats?.matchId) return;

    const isCasualNetwork = state.opponent?.type === 'network' && state.network?.ranked !== true;
    if (isCasualNetwork) return;

    const item = makeHistoryItem();
    const history = readMatchHistory()
      .filter(row => row?.matchId && row.matchId !== item.matchId);

    const nextHistory = [item, ...history]
      .sort((a, b) => Number(b.finishedAt || 0) - Number(a.finishedAt || 0))
      .slice(0, 50);

    postToHost('GC_SAVE_DATA', {
      key: 'matchHistory',
      data: nextHistory
    });
  };

  const saveMatchDraftNow = () => {
    clearTimeout(saveDraftTimer);

    const active = ['setup', 'rps', 'player', 'computer', 'finished'].includes(state.phase);
    if (!active || !state.matchStats?.matchId) return;

    const draft = makeMatchDraft();

    postToHost('GC_SAVE_DATA', {
      key: 'matchDraft',
      data: draft
    });

    if (state.phase === 'finished') saveMatchStats();
  };

  const scheduleSaveMatchDraft = () => {
    clearTimeout(saveDraftTimer);
    saveDraftTimer = setTimeout(saveMatchDraftNow, 350);
  };

  const restoreMatchDraft = () => {
    if (draftRestored) return false;

    const draft = getSavedGameData('matchDraft');

    if (!draft || draft.gameId !== gameId || !draft.matchStats?.matchId) return false;
    if (!['setup', 'rps', 'player', 'computer', 'finished'].includes(draft.phase)) return false;
    if (Date.now() - Number(draft.savedAt || 0) > 24 * 60 * 60 * 1000) return false;

    draftRestored = true;

    state.screen = draft.screen || 'battle';
    state.phase = draft.phase;
    state.result = draft.result || '';
    state.opponent = draft.opponent || state.opponent;
    state.selectedTarget = draft.selectedTarget || null;
    state.autoBattle = { player: false };
    state.fairPlay = {
      ...state.fairPlay,
      ...(draft.fairPlay || {}),
      revealed: !!draft.fairPlay?.revealed
    };
    state.network = {
      ...state.network,
      ...(draft.network || {}),
      active: draft.opponent?.type === 'network' || !!draft.network?.active
    };
    state.networkRps = {
      ...state.networkRps,
      ...(draft.networkRps || {})
    };
    state.networkShots = {
      ...state.networkShots,
      ...(draft.networkShots || {}),
      mine: Array.isArray(draft.networkShots?.mine) ? draft.networkShots.mine : [],
      peer: Array.isArray(draft.networkShots?.peer) ? draft.networkShots.peer : []
    };
    state.networkTurn = {
      ...state.networkTurn,
      ...(draft.networkTurn || {}),
      sentShotIds: Array.isArray(draft.networkTurn?.sentShotIds) ? draft.networkTurn.sentShotIds : [],
      receivedShotIds: Array.isArray(draft.networkTurn?.receivedShotIds) ? draft.networkTurn.receivedShotIds : [],
      resolvedShotIds: Array.isArray(draft.networkTurn?.resolvedShotIds) ? draft.networkTurn.resolvedShotIds : [],
      violations: Array.isArray(draft.networkTurn?.violations) ? draft.networkTurn.violations : []
    };
    state.networkWatchdog = {
      ...state.networkWatchdog,
      ...(draft.networkWatchdog || {}),
      warning: false,
      note: ''
    };
    state.matchStats = {
      ...createMatchStats(),
      ...(draft.matchStats || {})
    };
    state.fleet = Array.isArray(draft.fleet) ? draft.fleet : state.fleet;
    state.myBoard = unpackBoard(draft.myBoard);
    state.enemyBoard = unpackBoard(draft.enemyBoard);
    state.chat = Array.isArray(draft.chat) && draft.chat.length ? draft.chat : state.chat;

    document.body.dataset.screen = state.screen;

    if (state.phase === 'computer' && state.screen === 'battle' && !document.hidden) {
      scheduleComputerTurn();
    }

    if (state.phase === 'rps' && state.screen === 'battle' && state.opponent?.type !== 'network') {
      setTimeout(openTurnDuel, 120);
    }

    render();
    return true;
  };

  const clearMatchDraft = () => {
    clearTimeout(saveDraftTimer);

    postToHost('GC_SAVE_DATA', {
      key: 'matchDraft',
      data: null
    });
  };

  return {
    makeMatchDraft,
    saveMatchStats,
    saveMatchDraftNow,
    scheduleSaveMatchDraft,
    restoreMatchDraft,
    clearMatchDraft
  };
};
