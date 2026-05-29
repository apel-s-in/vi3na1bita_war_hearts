const MAX_TURN_LOG = 80;

const trimList = list => Array.isArray(list) ? list.slice(-MAX_TURN_LOG) : [];

const makeViolation = (reason, details = {}) => ({
  reason,
  details,
  at: Date.now()
});

export const createNetworkTurnState = () => ({
  ok: true,
  expectedShotId: '',
  sentShotIds: [],
  receivedShotIds: [],
  resolvedShotIds: [],
  violations: [],
  note: ''
});

export const ensureNetworkTurnState = state => {
  if (!state.networkTurn) state.networkTurn = createNetworkTurnState();

  state.networkTurn.sentShotIds = trimList(state.networkTurn.sentShotIds);
  state.networkTurn.receivedShotIds = trimList(state.networkTurn.receivedShotIds);
  state.networkTurn.resolvedShotIds = trimList(state.networkTurn.resolvedShotIds);
  state.networkTurn.violations = trimList(state.networkTurn.violations);

  return state.networkTurn;
};

export const recordTurnViolation = (state, reason, details = {}) => {
  const turn = ensureNetworkTurnState(state);

  turn.ok = false;
  turn.note = reason;
  turn.violations = trimList([
    ...turn.violations,
    makeViolation(reason, details)
  ]);

  return {
    ok: false,
    reason,
    details
  };
};

export const canSendNetworkShot = ({ state, x, y }) => {
  const turn = ensureNetworkTurnState(state);
  const cell = state.enemyBoard?.[y]?.[x];

  if (state.phase !== 'player') {
    return recordTurnViolation(state, 'shot_not_your_turn', {
      phase: state.phase,
      x,
      y
    });
  }

  if (state.network?.awaitingShotResult || turn.expectedShotId) {
    return recordTurnViolation(state, 'shot_result_still_pending', {
      expectedShotId: turn.expectedShotId,
      x,
      y
    });
  }

  if (!cell) {
    return recordTurnViolation(state, 'shot_outside_enemy_board', {
      x,
      y
    });
  }

  if (cell.status) {
    return recordTurnViolation(state, 'shot_to_open_cell', {
      x,
      y,
      status: cell.status
    });
  }

  return {
    ok: true,
    reason: 'ok'
  };
};

export const recordOutgoingShot = ({ state, shotId, x, y, seq }) => {
  const turn = ensureNetworkTurnState(state);

  turn.expectedShotId = String(shotId || '');
  turn.sentShotIds = trimList([
    ...turn.sentShotIds,
    String(shotId || '')
  ]);
  turn.note = `ожидается SHOT_RESULT ${shotId}`;

  return {
    ok: true,
    shotId,
    x,
    y,
    seq
  };
};

export const clearOutgoingShotExpectation = state => {
  const turn = ensureNetworkTurnState(state);
  turn.expectedShotId = '';
  turn.note = '';
};

export const verifyIncomingShot = ({ state, shotId, x, y }) => {
  const turn = ensureNetworkTurnState(state);
  const id = String(shotId || '');
  const cell = state.myBoard?.[y]?.[x];

  if (state.phase !== 'computer') {
    return recordTurnViolation(state, 'incoming_shot_not_peer_turn', {
      phase: state.phase,
      shotId: id,
      x,
      y
    });
  }

  if (!id) {
    return recordTurnViolation(state, 'incoming_shot_without_id', {
      x,
      y
    });
  }

  if (turn.receivedShotIds.includes(id)) {
    return recordTurnViolation(state, 'duplicate_incoming_shot', {
      shotId: id,
      x,
      y
    });
  }

  if (!cell) {
    return recordTurnViolation(state, 'incoming_shot_outside_board', {
      shotId: id,
      x,
      y
    });
  }

  if (cell.status) {
    return recordTurnViolation(state, 'incoming_shot_to_open_cell', {
      shotId: id,
      x,
      y,
      status: cell.status
    });
  }

  return {
    ok: true,
    reason: 'ok'
  };
};

export const recordIncomingShot = ({ state, shotId }) => {
  const turn = ensureNetworkTurnState(state);

  turn.receivedShotIds = trimList([
    ...turn.receivedShotIds,
    String(shotId || '')
  ]);
  turn.note = '';

  return {
    ok: true
  };
};

export const verifyIncomingShotResult = ({ state, shotId }) => {
  const turn = ensureNetworkTurnState(state);
  const id = String(shotId || '');

  if (!state.network?.awaitingShotResult && !turn.expectedShotId) {
    return recordTurnViolation(state, 'unexpected_shot_result', {
      shotId: id
    });
  }

  if (!id) {
    return recordTurnViolation(state, 'shot_result_without_id', {});
  }

  if (turn.expectedShotId && id !== turn.expectedShotId) {
    return recordTurnViolation(state, 'shot_result_id_mismatch', {
      expectedShotId: turn.expectedShotId,
      actualShotId: id
    });
  }

  if (turn.resolvedShotIds.includes(id)) {
    return recordTurnViolation(state, 'duplicate_shot_result', {
      shotId: id
    });
  }

  return {
    ok: true,
    reason: 'ok'
  };
};

export const recordIncomingShotResult = ({ state, shotId }) => {
  const turn = ensureNetworkTurnState(state);
  const id = String(shotId || '');

  turn.expectedShotId = '';
  turn.resolvedShotIds = trimList([
    ...turn.resolvedShotIds,
    id
  ]);
  turn.note = '';

  return {
    ok: true
  };
};
