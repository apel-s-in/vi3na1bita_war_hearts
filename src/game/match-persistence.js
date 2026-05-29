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
    matchStats: state.matchStats,
    fleet: state.fleet,
    myBoard: packBoard(state.myBoard),
    enemyBoard: packBoard(state.enemyBoard),
    chat: state.chat.slice(-500)
  });

  const saveMatchStats = () => {
    if (!state.matchStats?.matchId) return;
    postToHost('GC_SAVE_DATA', {
      key: 'matchStats',
      data: {
        gameId,
        savedAt: Date.now(),
        result: state.result,
        stats: state.matchStats
      }
    });
  };

  const saveMatchDraftNow = () => {
    clearTimeout(saveDraftTimer);

    const active = ['rps', 'player', 'computer', 'finished'].includes(state.phase);
    if (!active || !state.matchStats?.matchId) return;

    const draft = makeMatchDraft();

    try {
      localStorage.setItem('wh_matchDraft', JSON.stringify(draft));
    } catch {}

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

    let draft = getSavedGameData('matchDraft');
    if (!draft) {
      try {
        draft = JSON.parse(localStorage.getItem('wh_matchDraft') || 'null');
      } catch {}
    }

    if (!draft || draft.gameId !== gameId || !draft.matchStats?.matchId) return false;
    if (!['rps', 'player', 'computer', 'finished'].includes(draft.phase)) return false;
    if (Date.now() - Number(draft.savedAt || 0) > 24 * 60 * 60 * 1000) return false;

    draftRestored = true;

    state.screen = draft.screen || 'battle';
    state.phase = draft.phase;
    state.result = draft.result || '';
    state.opponent = draft.opponent || state.opponent;
    state.selectedTarget = draft.selectedTarget || null;
    state.autoBattle = { player: false };
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

    if (state.phase === 'rps' && state.screen === 'battle') {
      setTimeout(openTurnDuel, 120);
    }

    render();
    return true;
  };

  const clearMatchDraft = () => {
    clearTimeout(saveDraftTimer);
    try {
      localStorage.removeItem('wh_matchDraft');
    } catch {}
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
