export const createInitialState = overrides => ({
  screen: 'menu',
  phase: 'idle',
  menuTab: 'stats',
  friendIdentity: null,
  player: {
    id: 'local',
    name: 'Слушатель',
    title: 'Новичок'
  },
  opponent: null,
  invite: null,
  selectedTarget: null,
  battleFx: null,
  autoBattle: {
    player: false
  },
  fairPlay: {
    matchId: '',
    mySalt: '',
    myCommitHash: '',
    enemyCommitHash: '',
    myReveal: null,
    enemyReveal: null,
    revealed: false,
    myLayoutOk: null,
    enemyLayoutOk: null,
    enemyCommitOk: null,
    enemyTranscriptOk: null,
    note: ''
  },
  network: {
    active: false,
    connected: false,
    status: 'offline',
    text: '',
    peerName: '',
    myReady: false,
    peerReady: false,
    myCommitSent: false,
    peerCommitReceived: false,
    awaitingShotResult: false,
    awaitingReveal: false,
    myRevealSent: false,
    rpsStarted: false,
    rematchPending: false,
    lastEventAt: 0,
    ice: {
      host: false,
      srflx: false,
      relay: false,
      selected: '',
      usesTurn: false,
      updatedAt: 0
    }
  },
  networkWatchdog: {
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
  },
  networkRps: {
    active: false,
    myChoice: '',
    peerChoice: '',
    round: 0
  },
  networkShots: {
    mine: [],
    peer: [],
    enemyTranscriptOk: null,
    note: ''
  },
  networkTurn: {
    ok: true,
    expectedShotId: '',
    sentShotIds: [],
    receivedShotIds: [],
    resolvedShotIds: [],
    violations: [],
    note: ''
  },
  rematchOffer: {
    active: false,
    from: '',
    matchId: ''
  },
  matchStats: {
    matchId: '',
    startedAt: 0,
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
  },
  rps: {
    active: false,
    playerChoice: '',
    opponentChoice: '',
    message: ''
  },
  fleet: [],
  myBoard: [],
  enemyBoard: [],
  chat: [
    {
      from: 'Система',
      text: 'Добро пожаловать на арену Войны Сердец.',
      at: Date.now()
    }
  ],
  result: '',
  ...overrides
});
