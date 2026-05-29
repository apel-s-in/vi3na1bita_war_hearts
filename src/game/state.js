export const createInitialState = overrides => ({
  screen: 'menu',
  phase: 'idle',
  menuTab: 'stats',
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
    lastEventAt: 0
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
