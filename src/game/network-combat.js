import { MessageType } from './protocol.js';
import { verifyShotResultsAgainstReveal } from './shot-verifier.js';
import {
  canSendNetworkShot,
  clearOutgoingShotExpectation,
  createNetworkTurnState,
  recordIncomingShot,
  recordIncomingShotResult,
  recordOutgoingShot,
  recordTurnViolation,
  verifyIncomingShot,
  verifyIncomingShotResult
} from './turn-guard.js';
import {
  applyRevealToBoard,
  createBoardCommit,
  createSalt,
  packBoardReveal,
  validateRevealLayout,
  verifyBoardCommit
} from './fair-play.js';
import {
  abortRankedMatch,
  playRankedRps,
  prepareRankedMatch,
  recordRankedShot,
  resetRankedState,
  setRankedFirstPlayer,
  submitRankedMatch
} from './ranked-v2.js';

const RPS_CHOICES = [
  { id: 'rock', icon: '✊', label: 'Камень' },
  { id: 'scissors', icon: '✌️', label: 'Ножницы' },
  { id: 'paper', icon: '✋', label: 'Бумага' }
];

const getChoiceLabel = id => RPS_CHOICES.find(item => item.id === id)?.label || id;

const clearModal = selector => {
  document.querySelectorAll(selector).forEach(el => el.remove());
};

export const createNetworkCombat = ({
  state,
  session,
  setScreen,
  render,
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
  clearTimers,
  makeEmptyBoard
}) => {
  let shotSeq = 0;

  const setNetworkStatus = (text, status = 'info') => {
    state.network.active = state.opponent?.type === 'network' || !!state.network.active;
    state.network.status = status;
    state.network.text = text;
    state.network.peerName = state.opponent?.name || state.network.peerName || 'Соперник';
    state.network.lastEventAt = Date.now();

    if (status === 'offline' || status === 'error') {
      state.network.connected = false;
    }

    render();
  };

  const ensureNetworkOpponent = () => {
    if (!state.opponent || state.opponent.type !== 'network') {
      state.opponent = {
        id: 'network-peer',
        name: state.network.peerName || 'Соперник',
        type: 'network'
      };
    }

    state.network.active = true;
  };

  const resetNetworkRound = () => {
    shotSeq = 0;
    state.network.myReady = false;
    state.network.peerReady = false;
    state.network.myCommitSent = false;
    state.network.peerCommitReceived = false;
    state.network.awaitingShotResult = false;
    state.network.awaitingReveal = false;
    state.network.myRevealSent = false;
    state.network.rpsStarted = false;
    state.network.rematchPending = false;

    state.networkRps = {
      active: false,
      myChoice: '',
      peerChoice: '',
      round: 0
    };
  };

  const startNetworkPreparation = ({ initiator = false, ranked = state.network?.ranked } = {}) => {
    ensureNetworkOpponent();

    if (!state.network.connected) {
      setNetworkStatus('Ожидаем P2P-соединение с соперником...', 'waiting');
      return;
    }

    clearTimers?.();
    resetNetworkRound();
    state.network.ranked = !!ranked;
    state.network.matchMode = state.network.ranked ? 'ranked' : 'casual';
    resetMatchStats();
    resetFairPlayForMatch();

    state.networkShots = {
      mine: [],
      peer: [],
      enemyTranscriptOk: null,
      note: ''
    };

    state.networkTurn = createNetworkTurnState();
    resetRankedState(state);

    state.myBoard.forEach(row => row.forEach(cell => {
      cell.status = '';
    }));

    state.enemyBoard = makeEmptyBoard();
    state.selectedTarget = null;
    state.result = '';
    state.phase = 'setup';

    setNetworkStatus(
      initiator
        ? 'Сетевой бой: расставьте корабли и нажмите «Готов к бою».'
        : 'Соперник готовит бой. Расставьте корабли и подтвердите готовность.',
      'setup'
    );

    setScreen('field');
    scheduleSaveMatchDraft();
  };

  const markReady = async () => {
    ensureNetworkOpponent();

    if (state.network.myReady) {
      setNetworkStatus('Готовность уже отправлена. Ожидаем соперника...', 'waiting');
      return false;
    }

    if (state.network.ranked === true) {
      try {
        await prepareRankedMatch({
          state,
          session
        });
      } catch (error) {
        setNetworkStatus(
          `Не удалось подготовить Ranked V2: ${error.message}`,
          'error'
        );
        addSystemMessage(
          'Сервер не выдал matchId. Рейтинговый бой не начат.'
        );
        return false;
      }
    }

    const myReveal = packBoardReveal(state.myBoard);
    const layoutCheck = validateRevealLayout(myReveal);

    state.fairPlay.matchId = state.matchStats.matchId;
    state.fairPlay.myLayoutOk = layoutCheck.ok;

    if (!layoutCheck.ok) {
      toast?.('Расстановка нарушает правила');
      setNetworkStatus('Расстановка кораблей некорректна. Исправьте поле.', 'error');
      addSystemMessage(`Проверка расстановки: ${layoutCheck.reason}.`);
      render();
      return false;
    }

    state.fairPlay.mySalt = state.fairPlay.mySalt || createSalt();

    const commit = await createBoardCommit(state.myBoard, state.fairPlay.mySalt);
    state.fairPlay.myCommitHash = commit.hash;
    state.fairPlay.myReveal = myReveal;

    const commitSent = session.sendBoardCommit({
      matchId: state.matchStats.matchId,
      commitHash: commit.hash,
      algorithm: commit.algorithm
    });

    const readySent = session.sendReady({
      matchId: state.matchStats.matchId,
      ready: true
    });

    if (!commitSent || !readySent) {
      setNetworkStatus('Не удалось отправить готовность. Проверьте соединение.', 'error');
      addSystemMessage('READY/BOARD_COMMIT не отправлены: нет связи с соперником.');
      render();
      scheduleSaveMatchDraft();
      return false;
    }

    state.network.myReady = true;
    state.network.myCommitSent = true;

    addSystemMessage('Вы готовы к сетевому бою. Commit доски отправлен.');
    setNetworkStatus('Вы готовы. Ожидаем готовность соперника...', 'waiting');

    maybeStartRps();
    scheduleSaveMatchDraft();

    return true;
  };

  const maybeStartRps = () => {
    if (state.network.rpsStarted || state.networkRps.active || state.phase === 'rps') return;
    if (!state.network.myReady || !state.network.peerReady) return;
    if (!state.network.myCommitSent || !state.network.peerCommitReceived) return;

    state.network.rpsStarted = true;
    state.phase = 'rps';
    setScreen('battle');

    setNetworkStatus(
      state.network.ranked
        ? 'Оба игрока готовы. Рейтинговый бой зафиксирован. Розыгрыш первого хода.'
        : 'Оба игрока готовы. Гостевой бой зафиксирован. Розыгрыш первого хода.',
      'ready'
    );
    addSystemMessage(state.network.ranked
      ? 'Оба игрока готовы. Рейтинговый статус боя зафиксирован для этого сражения.'
      : 'Оба игрока готовы. Гостевой статус боя зафиксирован для этого сражения.');

    if (state.network.ranked) {
      openNetworkRpsModal();
    } else {
      resolveCasualCommitLottery();
    }

    scheduleSaveMatchDraft();
  };

  const applyFirstTurn = firstPlayerId => {
    if (state.network.ranked === true) {
      setRankedFirstPlayer(
        state,
        firstPlayerId
      );
    }

    const mine =
      firstPlayerId === state.ranked?.playerId ||
      (
        state.network.ranked !== true &&
        firstPlayerId === 'mine'
      );

    state.networkRps.active = false;
    clearModal('.wh-rps-modal-overlay');

    if (mine) {
      state.phase = 'player';
      addSystemMessage(
        'Розыгрыш завершён. Первый ход ваш.'
      );
      setNetworkStatus(
        'Ваш ход. Выберите клетку для выстрела.',
        'your-turn'
      );
    } else {
      state.phase = 'computer';
      addSystemMessage(
        'Розыгрыш завершён. Первым ходит соперник.'
      );
      setNetworkStatus(
        'Ход соперника. Ожидаем выстрел...',
        'peer-turn'
      );
    }

    render();
    scheduleSaveMatchDraft();
  };

  const resolveCasualCommitLottery = () => {
    const mine = String(
      state.fairPlay?.myCommitHash || ''
    );
    const peer = String(
      state.fairPlay?.enemyCommitHash || ''
    );

    if (!mine || !peer) {
      setNetworkStatus(
        'Не удалось провести жеребьёвку по commit.',
        'error'
      );
      return;
    }

    const mineFirst = mine.localeCompare(peer) < 0;

    addSystemMessage(
      'Гостевой первый ход определён по двум скрытым board commits.'
    );

    applyFirstTurn(
      mineFirst ? 'mine' : 'peer'
    );
  };

  const openNetworkRpsModal = () => {
    clearModal('.wh-rps-modal-overlay');

    state.networkRps.active = true;
    state.networkRps.myChoice = '';
    state.networkRps.peerChoice = '';
    state.networkRps.round = Math.max(
      1,
      Number(state.ranked?.rps?.round || 1)
    );

    const overlay = document.createElement('div');
    overlay.className = 'wh-rps-modal-overlay';
    overlay.innerHTML = `
      <div class="wh-rps-modal-box">
        <div class="wh-rps-kicker">
          Серверный розыгрыш первого хода
        </div>
        <h2 class="wh-rps-title">
          Камень · Ножницы · Бумага
        </h2>
        <p class="wh-rps-text" id="wh-net-rps-text">
          Выбор будет скрыт commit до выбора соперника.
        </p>
        <div class="wh-rps-choices">
          ${RPS_CHOICES.map(choice => `
            <button
              class="wh-rps-choice"
              type="button"
              data-choice="${choice.id}"
            >
              <span>${choice.icon}</span>
              <b>${choice.label}</b>
            </button>
          `).join('')}
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    overlay.querySelectorAll('[data-choice]')
      .forEach(button => {
        button.addEventListener('click', async () => {
          const choice = button.dataset.choice;
          const text = overlay.querySelector(
            '#wh-net-rps-text'
          );

          state.networkRps.myChoice = choice;

          overlay.querySelectorAll('[data-choice]')
            .forEach(item => {
              item.disabled = true;
            });

          if (text) {
            text.textContent =
              `Вы выбрали: ${getChoiceLabel(choice)}. ` +
              'Commit отправляется серверу...';
          }

          setNetworkStatus(
            'Отправляем скрытый RPS commit серверу...',
            'waiting'
          );

          try {
            const ranked = await playRankedRps({
              state,
              session,
              choice
            });

            if (ranked.firstPlayerId) {
              if (text) {
                text.textContent =
                  'Сервер проверил оба reveal.';
              }

              applyFirstTurn(
                ranked.firstPlayerId
              );
              return;
            }

            if (ranked.rps?.roundStatus === 'draw') {
              if (text) {
                text.textContent =
                  'Ничья. Сервер открыл следующий раунд.';
              }

              setNetworkStatus(
                'Ничья в серверном RPS. Повторяем.',
                'waiting'
              );

              setTimeout(
                openNetworkRpsModal,
                900
              );
              return;
            }

            throw new Error(
              'ranked_rps_result_timeout'
            );
          } catch (error) {
            if (text) {
              text.textContent =
                `Ошибка серверного RPS: ${error.message}`;
            }

            setNetworkStatus(
              'Серверный розыгрыш не завершён.',
              'error'
            );

            overlay.querySelectorAll('[data-choice]')
              .forEach(item => {
                item.disabled = false;
              });
          }

          scheduleSaveMatchDraft();
        });
      });
  };

  const shoot = (x, y) => {
    if (state.opponent?.type !== 'network') return false;

    const guard = canSendNetworkShot({
      state,
      x,
      y
    });

    if (!guard.ok) {
      setNetworkStatus(`Выстрел отклонён: ${guard.reason}.`, 'error');
      addSystemMessage(`Turn guard: выстрел ${formatCellName(x, y)} отклонён (${guard.reason}).`);
      render();
      scheduleSaveMatchDraft();
      return true;
    }

    const shooterId = String(
      state.ranked?.playerId ||
      state.player?.id ||
      'player'
    ).replace(/[^A-Za-z0-9._:-]/g, '');

    const randomPart = crypto.randomUUID()
      .replace(/-/g, '')
      .slice(0, 12);

    const shotId = [
      state.matchStats.matchId,
      shooterId,
      ++shotSeq,
      randomPart
    ].join('_');

    state.selectedTarget = { x, y };
    state.network.awaitingShotResult = true;

    const sent = session.sendShot({
      matchId: state.matchStats.matchId,
      shotId,
      x,
      y,
      seq: shotSeq
    });

    if (!sent) {
      state.network.awaitingShotResult = false;
      clearOutgoingShotExpectation(state);
      setNetworkStatus('Не удалось отправить выстрел. Проверьте соединение.', 'error');
      addSystemMessage(`Выстрел ${formatCellName(x, y)} не отправлен: нет связи.`);
      render();
      scheduleSaveMatchDraft();
      return true;
    }

    recordOutgoingShot({
      state,
      shotId,
      x,
      y,
      seq: shotSeq
    });

    state.networkShots.mine.push({
      shotId,
      x,
      y,
      seq: shotSeq,
      result: '',
      sunkCells: [],
      at: Date.now()
    });

    addSystemMessage(`Выстрел ${formatCellName(x, y)} отправлен сопернику.`);
    setNetworkStatus(`Выстрел ${formatCellName(x, y)} отправлен. Ожидаем результат...`, 'waiting');

    render();
    scheduleSaveMatchDraft();

    return true;
  };

  const receiveShot = msg => {
    const payload = msg.payload || {};
    const x = Number(payload.x);
    const y = Number(payload.y);
    const shotId = String(payload.shotId || '');

    if (state.phase === 'finished') return;

    const guard = verifyIncomingShot({
      state,
      shotId,
      x,
      y
    });

    if (!guard.ok) {
      setNetworkStatus(`SHOT соперника отклонён: ${guard.reason}.`, 'error');
      addSystemMessage(`Turn guard: SHOT соперника отклонён (${guard.reason}).`);
      render();
      scheduleSaveMatchDraft();
      return;
    }

    recordIncomingShot({
      state,
      shotId
    });

    const cell = state.myBoard[y]?.[x];

    const coord = formatCellName(x, y);
    const hit = !!cell.ship;

    cell.status = hit ? 'hit' : 'miss';

    const shipCells = hit ? getShipCellsAt(state.myBoard, x, y) : [];
    const sunk = hit && isShipSunk(state.myBoard, shipCells);

    if (sunk) markSunkPerimeter(state.myBoard, shipCells);

    const result = sunk ? 'sunk' : hit ? 'hit' : 'miss';

    state.networkShots.peer.push({
      shotId: payload.shotId || '',
      x,
      y,
      result,
      sunkCells: sunk ? shipCells.map(p => ({ x: p.x, y: p.y })) : [],
      at: Date.now()
    });

    registerShotStats('opponent', result);
    showBattleFx('mine', result);

    if (state.network.ranked === true) {
      recordRankedShot(state, {
        shotId,
        shooterId: state.ranked?.peerPlayerId,
        x,
        y,
        result,
        sunkCells: sunk
          ? shipCells.map(point => ({
            x: point.x,
            y: point.y
          }))
          : []
      });
    }

    session.sendShotResult({
      matchId: state.matchStats.matchId,
      shotId: payload.shotId,
      x,
      y,
      result,
      sunkCells: sunk ? shipCells.map(p => ({ x: p.x, y: p.y })) : []
    });

    addSystemMessage(`Соперник стреляет ${coord}: ${result === 'sunk' ? 'убил корабль' : result === 'hit' ? 'ранил корабль' : 'промахнулся'}.`);

    if (isBoardDefeated(state.myBoard)) {
      finishMatch('loss', 'Матч завершён: поражение.');
      return;
    }

    if (!hit) {
      state.phase = 'player';
      setNetworkStatus('Соперник промахнулся. Ваш ход.', 'your-turn');
    } else {
      state.phase = 'computer';
      setNetworkStatus('Соперник попал и продолжает ход.', 'peer-turn');
    }

    render();
    scheduleSaveMatchDraft();
  };

  const receiveShotResult = msg => {
    const payload = msg.payload || {};
    const x = Number(payload.x);
    const y = Number(payload.y);
    const result = payload.result || 'miss';
    const shotId = String(payload.shotId || '');

    const guard = verifyIncomingShotResult({
      state,
      shotId
    });

    if (!guard.ok) {
      setNetworkStatus(`SHOT_RESULT отклонён: ${guard.reason}.`, 'error');
      addSystemMessage(`Turn guard: SHOT_RESULT отклонён (${guard.reason}).`);
      render();
      scheduleSaveMatchDraft();
      return;
    }

    const cell = state.enemyBoard[y]?.[x];
    if (!cell) {
      recordTurnViolation(state, 'shot_result_outside_enemy_board', {
        shotId,
        x,
        y
      });
      setNetworkStatus('SHOT_RESULT указывает на клетку вне поля.', 'error');
      render();
      scheduleSaveMatchDraft();
      return;
    }

    cell.status = result === 'miss' ? 'miss' : 'hit';
    if (result === 'sunk') {
      cell.status = 'hit';

      if (Array.isArray(payload.sunkCells)) {
        payload.sunkCells.forEach(point => {
          const target = state.enemyBoard[point.y]?.[point.x];
          if (target) target.status = 'hit';
        });
      }
    }

    const shipCells = result === 'sunk' && Array.isArray(payload.sunkCells)
      ? payload.sunkCells.map(point => ({
        x: Number(point.x),
        y: Number(point.y),
        cell: state.enemyBoard[point.y]?.[point.x]
      })).filter(point => point.cell)
      : [];

    if (shipCells.length) markSunkPerimeter(state.enemyBoard, shipCells);

    state.network.awaitingShotResult = false;
    state.selectedTarget = null;

    const shotLog = state.networkShots.mine.find(shot => shot.shotId === payload.shotId)
      || state.networkShots.mine.find(shot => shot.x === x && shot.y === y && !shot.result);

    if (shotLog) {
      shotLog.result = result;
      shotLog.sunkCells = Array.isArray(payload.sunkCells)
        ? payload.sunkCells.map(point => ({ x: Number(point.x), y: Number(point.y) }))
        : [];
      shotLog.resultAt = Date.now();
    } else {
      state.networkShots.mine.push({
        shotId: payload.shotId || '',
        x,
        y,
        result,
        sunkCells: Array.isArray(payload.sunkCells)
          ? payload.sunkCells.map(point => ({ x: Number(point.x), y: Number(point.y) }))
          : [],
        at: Date.now()
      });
    }

    recordIncomingShotResult({
      state,
      shotId
    });

    if (state.network.ranked === true) {
      recordRankedShot(state, {
        shotId,
        shooterId: state.ranked?.playerId,
        x,
        y,
        result,
        sunkCells: Array.isArray(payload.sunkCells)
          ? payload.sunkCells
          : []
      });
    }

    registerShotStats('player', result);
    showBattleFx('enemy', result);

    addSystemMessage(`Ответ соперника: ${formatCellName(x, y)} — ${result === 'sunk' ? 'корабль уничтожен' : result === 'hit' ? 'попадание' : 'мимо'}.`);

    if (result === 'miss') {
      state.phase = 'computer';
      setNetworkStatus('Вы промахнулись. Ход соперника.', 'peer-turn');
    } else {
      state.phase = 'player';
      setNetworkStatus(result === 'sunk' ? 'Корабль уничтожен. Ваш ход продолжается.' : 'Попадание. Ваш ход продолжается.', 'your-turn');
    }

    render();
    scheduleSaveMatchDraft();
  };

  const abortRanked = async (
    reason = 'disconnect'
  ) => {
    if (
      state.network?.ranked !== true ||
      !state.ranked?.matchId
    ) {
      return null;
    }

    try {
      const ranked = await abortRankedMatch({
        state,
        session,
        reason
      });

      setNetworkStatus(
        ranked.serverStatus === 'forfeited'
          ? 'Сервер зафиксировал техническое поражение.'
          : 'Запрос завершения рейтингового матча отправлен.',
        ranked.serverStatus === 'forfeited'
          ? 'error'
          : 'waiting'
      );

      scheduleSaveMatchDraft();
      return ranked;
    } catch (error) {
      addSystemMessage(
        `Не удалось зафиксировать выход: ${error.message}`
      );
      setNetworkStatus(
        'Сервер не подтвердил завершение матча.',
        'error'
      );
      return null;
    }
  };
  
  const sendBoardReveal = () => {
    if (state.network.myRevealSent) return false;

    const reveal = packBoardReveal(state.myBoard);
    const layoutCheck = validateRevealLayout(reveal);

    state.fairPlay.myReveal = reveal;
    state.fairPlay.myLayoutOk = layoutCheck.ok;

    const sent = session.sendBoardReveal({
      matchId: state.matchStats.matchId,
      salt: state.fairPlay.mySalt,
      reveal
    });

    if (!sent) {
      setNetworkStatus('Не удалось отправить BOARD_REVEAL. Проверьте соединение.', 'error');
      addSystemMessage('BOARD_REVEAL не отправлен: нет связи с соперником.');
      render();
      scheduleSaveMatchDraft();
      return false;
    }

    state.network.myRevealSent = true;
    state.network.awaitingReveal = true;
    setNetworkStatus('Финал. Ваша доска раскрыта. Ожидаем reveal соперника...', 'waiting');
    scheduleSaveMatchDraft();

    return true;
  };

  const receiveBoardReveal = async msg => {
    const payload = msg.payload || {};
    const reveal = payload.reveal;

    state.fairPlay.enemyReveal = reveal;

    const layoutCheck = validateRevealLayout(reveal);
    state.fairPlay.enemyLayoutOk = layoutCheck.ok;

    const commitCheck = await verifyBoardCommit({
      reveal,
      salt: payload.salt,
      commitHash: state.fairPlay.enemyCommitHash
    });

    state.fairPlay.enemyCommitOk = commitCheck.ok;

    const transcriptCheck = verifyShotResultsAgainstReveal({
      shots: state.networkShots?.mine || [],
      reveal
    });

    state.networkShots.enemyTranscriptOk = transcriptCheck.ok;
    state.networkShots.note = transcriptCheck.ok
      ? `Проверено выстрелов: ${transcriptCheck.checked}.`
      : `Расхождения выстрелов: ${transcriptCheck.mismatches.length}.`;
    state.fairPlay.enemyTranscriptOk = transcriptCheck.ok;

    if (layoutCheck.ok && commitCheck.ok && transcriptCheck.ok) {
      applyRevealToBoard(state.enemyBoard, reveal);
      state.fairPlay.note = 'BOARD_REVEAL соперника проверен: commit совпал, расстановка корректна, ответы на выстрелы подтверждены.';
      addSystemMessage('Проверка соперника: честность OK, история выстрелов совпала.');
      setNetworkStatus('Reveal соперника проверен. Commit, поле и выстрелы OK.', 'ready');

      if (state.network?.ranked === true) {
        addSystemMessage(
          'Рейтинговый результат локально подтверждён, но начисление временно заморожено до запуска серверной проверки V2.'
        );
      }
    } else {
      state.fairPlay.note = `Проблема проверки: ${layoutCheck.reason || commitCheck.reason || transcriptCheck.reason}.`;
      addSystemMessage(`Проверка соперника не пройдена: ${state.fairPlay.note}`);
      setNetworkStatus('Reveal соперника не прошёл fair-play проверку.', 'error');
    }

    state.fairPlay.revealed = true;
    state.network.awaitingReveal = false;

    if (state.network.ranked === true) {
      try {
        const ranked = await submitRankedMatch({
          state,
          session
        });

        if (ranked?.serverStatus === 'settled') {
          addSystemMessage(
            `Ranked V2 подтверждён сервером. Изменение рейтинга: ${ranked.settlement?.winnerDelta || 0}.`
          );
          setNetworkStatus(
            'Результат подтверждён сервером и записан в рейтинг.',
            'ready'
          );
        } else if (ranked?.serverStatus === 'disputed') {
          addSystemMessage(
            'Ranked V2 отклонён сервером: transcript или board validation не пройдены.'
          );
          setNetworkStatus(
            'Сервер отклонил рейтинговый результат.',
            'error'
          );
        } else {
          addSystemMessage(
            'Ваш результат отправлен. Ожидаем submit соперника.'
          );
          setNetworkStatus(
            'Результат отправлен. Ожидаем соперника.',
            'waiting'
          );
        }
      } catch (error) {
        addSystemMessage(
          `Не удалось отправить Ranked V2: ${error.message}`
        );
        setNetworkStatus(
          'Ошибка отправки рейтингового результата.',
          'error'
        );
      }
    }

    render();
    saveMatchDraftNow();
  };

  const sendMatchFinished = result => {
    const sent = session.sendMatchFinished({
      matchId: state.matchStats.matchId,
      result,
      stats: state.matchStats
    });

    if (!sent) {
      addSystemMessage('MATCH_FINISHED не отправлен: нет связи с соперником.');
      setNetworkStatus('Не удалось отправить финал матча. Проверьте соединение.', 'error');
      return false;
    }

    return true;
  };

  const receiveMatchFinished = msg => {
    const payload = msg.payload || {};
    const peerResult = payload.result || 'unknown';

    addSystemMessage(`Соперник сообщил финал матча: ${peerResult}.`);

    if (state.phase !== 'finished') {
      state.result = peerResult === 'loss' ? 'win' : 'loss';
      state.phase = 'finished';
      state.autoBattle.player = false;
      state.matchStats.finishedAt = Date.now();

      const myReveal = packBoardReveal(state.myBoard);
      const myCheck = validateRevealLayout(myReveal);

      state.fairPlay = {
        ...state.fairPlay,
        myReveal,
        myLayoutOk: myCheck.ok,
        revealed: !!state.fairPlay.enemyReveal,
        note: state.fairPlay.enemyReveal
          ? state.fairPlay.note
          : 'матч завершён, ожидается BOARD_REVEAL соперника'
      };

      sendBoardReveal();
      render();
      saveMatchDraftNow();
    }
  };

const sendRematchRequest = ranked => {
if (state.opponent?.type !== 'network') return false;
if (state.network.rematchPending) {
setNetworkStatus('Предложение реванша уже отправлено. Ждём ответ соперника...', 'waiting');
toast?.('Уже ждём ответ на реванш');
return true;
}
const sent = session.sendGame(MessageType.REMATCH_REQUEST, {
matchId: state.matchStats.matchId,
ranked: !!ranked,
at: Date.now()
});

    if (!sent) {
      setNetworkStatus('Не удалось отправить предложение реванша. Проверьте соединение.', 'error');
      toast?.('Реванш не отправлен');
      return false;
    }

    state.network.rematchPending = true;
    state.network.ranked = !!ranked;
    state.network.matchMode = ranked ? 'ranked' : 'casual';

    setNetworkStatus(ranked
      ? 'Предложение рейтингового реванша отправлено. Ждём ответ соперника...'
      : 'Предложение гостевого реванша отправлено. Ждём ответ соперника...', 'waiting');
    addSystemMessage(ranked
      ? 'Вы предложили сопернику рейтинговый реванш.'
      : 'Вы предложили сопернику гостевой реванш.');
    toast?.('Предложение реванша отправлено');
    scheduleSaveMatchDraft();

    return true;
  };

const requestRematch = () => {
if (state.opponent?.type !== 'network') return false;

const isAuthed = !!state.snapshot?.user?.yandexLinked;

if (state.network?.ranked) {
return sendRematchRequest(true);
}

const overlay = document.createElement('div');
overlay.className = 'wh-modal-overlay';
overlay.innerHTML = `
<div class="wh-modal-box">
<h3 class="wh-modal-title">Реванш?</h3>
<p class="wh-modal-text">
Можно сыграть снова гостевой бой или предложить рейтинговый реванш.
${isAuthed ? 'Рейтинговый реванш потребует авторизацию соперника.' : 'Для рейтингового реванша нужно войти через Яндекс.'}
</p>
<div class="wh-modal-actions" style="flex-direction:column;gap:10px">
<button class="wh-btn" type="button" id="wh-rematch-ranked" style="background:linear-gradient(135deg,#ff9800,#f57c00)">🏆 ${isAuthed ? 'Предложить рейтинговый реванш' : 'Войти и предложить рейтинговый реванш'}</button>
<button class="wh-btn secondary" type="button" id="wh-rematch-casual">👤 Сыграть гостевой реванш</button>
<button class="wh-btn secondary" type="button" id="wh-rematch-cancel" style="background:transparent;border:1px solid rgba(255,255,255,.2)">Отмена</button>
</div>
</div>
`;

document.body.appendChild(overlay);

overlay.querySelector('#wh-rematch-cancel')?.addEventListener('click', () => overlay.remove());
overlay.querySelector('#wh-rematch-casual')?.addEventListener('click', () => {
overlay.remove();
sendRematchRequest(false);
});
overlay.querySelector('#wh-rematch-ranked')?.addEventListener('click', () => {
overlay.remove();
if (!isAuthed) {
window.parent?.postMessage?.({ kind: 'vitrina:game', type: 'GC_AUTH_LOGIN', gameId: 'war_hearts', payload: { reason: 'ranked_rematch' } }, '*');
toast?.('Войдите через Яндекс и нажмите реванш ещё раз');
return;
}
sendRematchRequest(true);
});

return true;
};

const receiveRematchRequest = msg => {
state.network.rematchPending = false;
state.rematchOffer = {
active: true,
from: msg.payload?.from?.name || state.opponent?.name || 'Соперник',
matchId: msg.payload?.matchId || '',
ranked: msg.payload?.ranked ?? state.network?.ranked ?? false
};
openRematchModal();
setNetworkStatus('Соперник предлагает реванш.', 'waiting');
scheduleSaveMatchDraft();
};

const openRematchModal = () => {
clearModal('.wh-rematch-offer-overlay');
const isRanked = !!state.rematchOffer?.ranked;
const isAuthed = !!state.snapshot?.user?.yandexLinked;
const rankBadge = isRanked
? '<div style="padding:4px 12px;border-radius:999px;background:rgba(255,152,0,.2);border:1px solid rgba(255,152,0,.4);color:#ffb74d;font-size:11px;font-weight:900;display:inline-block;margin-bottom:10px">🏆 Рейтинговый</div>'
: '<div style="padding:4px 12px;border-radius:999px;background:rgba(124,77,255,.2);border:1px solid rgba(124,77,255,.4);color:#b388ff;font-size:11px;font-weight:900;display:inline-block;margin-bottom:10px">👤 Гостевой</div>';
const authWarning = !isAuthed && isRanked
? '<div style="padding:10px;border-radius:10px;background:rgba(255,152,0,.1);border:1px solid rgba(255,152,0,.3);margin-bottom:10px;font-size:11px;color:#ffb74d">🏆 Соперник зовёт в рейтинговый реванш. Войдите через Яндекс, чтобы принять его рейтингово, или предложите гостевой реванш.</div>'
: '';
const overlay = document.createElement('div');
overlay.className = 'wh-modal-overlay wh-rematch-offer-overlay';
overlay.innerHTML = `
<div class="wh-modal-box">
<h3 class="wh-modal-title">Реванш?</h3>
${rankBadge}
${authWarning}
<p class="wh-modal-text">
${state.rematchOffer.from || 'Соперник'} предлагает сыграть ещё раз.
Если принять, вы перейдёте к новой расстановке кораблей.
</p>
<div class="wh-modal-actions" style="flex-direction:${isRanked && !isAuthed ? 'column' : 'row'};gap:10px">
<button class="wh-btn secondary" type="button" id="wh-rematch-reject">Отклонить</button>
${isRanked && !isAuthed ? '<button class="wh-btn" type="button" id="wh-rematch-login" style="background:linear-gradient(135deg,#ff9800,#f57c00)">🏆 Войти и принять рейтингово</button><button class="wh-btn secondary" type="button" id="wh-rematch-casual">👤 Предложить гостевой реванш</button>' : '<button class="wh-btn" type="button" id="wh-rematch-accept">Принять</button>'}
</div>
</div>
`;

    document.body.appendChild(overlay);

    overlay.querySelector('#wh-rematch-reject')?.addEventListener('click', () => {
      overlay.remove();

      session.sendGame(MessageType.REMATCH_REJECT, {
        matchId: state.rematchOffer.matchId,
        at: Date.now()
      });

      state.rematchOffer.active = false;
      state.network.rematchPending = false;
      setNetworkStatus('Вы отклонили реванш.', 'ready');
      addSystemMessage('Реванш отклонён.');
      scheduleSaveMatchDraft();
    });

    overlay.querySelector('#wh-rematch-login')?.addEventListener('click', () => {
      window.parent?.postMessage?.({ kind: 'vitrina:game', type: 'GC_AUTH_LOGIN', gameId: 'war_hearts', payload: { reason: 'ranked_rematch_accept' } }, '*');
      toast?.('Войдите через Яндекс и примите реванш снова');
    });

    overlay.querySelector('#wh-rematch-casual')?.addEventListener('click', () => {
      overlay.remove();

      state.rematchOffer.ranked = false;
      session.sendGame(MessageType.REMATCH_ACCEPT, {
        matchId: state.rematchOffer.matchId,
        ranked: false,
        at: Date.now()
      });

      session.sendGame(MessageType.MATCH_MODE, {
        matchId: state.rematchOffer.matchId,
        ranked: false,
        matchMode: 'casual',
        at: Date.now()
      });

      state.rematchOffer.active = false;
      state.network.rematchPending = false;
      state.network.ranked = false;
      state.network.matchMode = 'casual';
      addSystemMessage('Вы предложили продолжить реванш как гостевой.');
      startNetworkPreparation({ initiator: false, ranked: false });
    });

    overlay.querySelector('#wh-rematch-accept')?.addEventListener('click', () => {
      overlay.remove();

      const ranked = !!state.rematchOffer.ranked;

      session.sendGame(MessageType.REMATCH_ACCEPT, {
        matchId: state.rematchOffer.matchId,
        ranked,
        at: Date.now()
      });

      session.sendGame(MessageType.MATCH_MODE, {
        matchId: state.rematchOffer.matchId,
        ranked,
        matchMode: ranked ? 'ranked' : 'casual',
        at: Date.now()
      });

      state.rematchOffer.active = false;
      state.network.rematchPending = false;
      state.network.ranked = ranked;
      state.network.matchMode = ranked ? 'ranked' : 'casual';
      addSystemMessage(ranked
        ? 'Рейтинговый реванш принят. Переходим к расстановке.'
        : 'Гостевой реванш принят. Переходим к расстановке.');
      startNetworkPreparation({ initiator: false, ranked });
    });
  };

  const receiveRematchAccept = msg => {
    const ranked = msg?.payload?.ranked === true;
    state.network.rematchPending = false;
    state.network.ranked = ranked;
    state.network.matchMode = ranked ? 'ranked' : 'casual';
    addSystemMessage(ranked
      ? 'Соперник принял рейтинговый реванш. Переходим к расстановке.'
      : 'Соперник принял гостевой реванш. Переходим к расстановке.');
    setNetworkStatus(ranked
      ? 'Рейтинговый реванш принят. Расставьте корабли.'
      : 'Гостевой реванш принят. Расставьте корабли.', 'setup');
    startNetworkPreparation({ initiator: true, ranked });
  };

  const receiveRematchReject = () => {
    state.network.rematchPending = false;
    addSystemMessage('Соперник отклонил реванш.');
    setNetworkStatus('Соперник отклонил реванш.', 'ready');
    toast?.('Реванш отклонён');
    scheduleSaveMatchDraft();
  };

  const handleGameData = msg => {
    if (!msg?.type) return;

    if (!state.network.connected) {
      state.network.connected = true;
    }

    ensureNetworkOpponent();

    switch (msg.type) {
      case MessageType.BOARD_COMMIT:
        state.fairPlay.enemyCommitHash = msg.payload?.commitHash || '';
        state.network.peerCommitReceived = !!state.fairPlay.enemyCommitHash;
        addSystemMessage('Получен commit доски соперника.');
        setNetworkStatus('Commit соперника получен. Ожидаем готовность...', 'waiting');
        maybeStartRps();
        scheduleSaveMatchDraft();
        break;

      case MessageType.READY:
        state.network.peerReady = true;
        addSystemMessage('Соперник готов к бою.');
        setNetworkStatus('Соперник готов. Синхронизация боя...', 'waiting');
        maybeStartRps();
        scheduleSaveMatchDraft();
        break;

      case MessageType.SHOT:
        receiveShot(msg);
        break;

      case MessageType.SHOT_RESULT:
        receiveShotResult(msg);
        break;

      case MessageType.MATCH_FINISHED:
        receiveMatchFinished(msg);
        break;

      case MessageType.BOARD_REVEAL:
        receiveBoardReveal(msg);
        break;

      case MessageType.REMATCH_REQUEST:
        receiveRematchRequest(msg);
        break;

      case MessageType.REMATCH_ACCEPT:
        receiveRematchAccept(msg);
        break;

      case MessageType.REMATCH_REJECT:
        receiveRematchReject(msg);
        break;

      case MessageType.PING:
        state.networkWatchdog.lastPeerAt = Date.now();
        session.sendGame(MessageType.PONG, {
          matchId: state.matchStats.matchId,
          phase: state.phase,
          hidden: !!document.hidden
        });
        break;

      case MessageType.PONG:
        state.networkWatchdog.lastPongAt = Date.now();
        state.networkWatchdog.lastPeerAt = Date.now();
        state.networkWatchdog.warning = false;
        state.networkWatchdog.note = '';
        break;

      case MessageType.MATCH_ABORTED:
        addSystemMessage('Соперник прервал матч.');
        setNetworkStatus('Соперник прервал матч или отключился.', 'error');
        break;

      case MessageType.MATCH_MODE:
        state.network.ranked = msg.payload?.ranked === true;
        state.network.matchMode = state.network.ranked ? 'ranked' : 'casual';
        addSystemMessage(state.network.ranked
          ? 'Режим боя обновлён: рейтинговый.'
          : 'Режим боя обновлён: гостевой без статистики.');
        setNetworkStatus(state.network.ranked
          ? 'Режим боя: рейтинговый.'
          : 'Режим боя: гостевой без статистики.', 'setup');
        scheduleSaveMatchDraft();
        break;

      default:
        addSystemMessage(`Сетевое событие: ${msg.type}`);
        break;
    }

    render();
  };

  const onConnected = peerName => {
    ensureNetworkOpponent();
    state.network.connected = true;
    state.network.peerName = peerName || state.opponent?.name || 'Соперник';
    setNetworkStatus('Соединение установлено. Можно готовиться к бою.', 'ready');
  };

  const onDisconnected = () => {
    state.network.connected = false;
    setNetworkStatus('Связь с соперником потеряна. Проверьте интернет.', 'error');
  };

  return {
    setNetworkStatus,
    startNetworkPreparation,
    markReady,
    shoot,
    requestRematch,
    abortRanked,
    sendBoardReveal,
    sendMatchFinished,
    handleGameData,
    onConnected,
    onDisconnected
  };
};
