export const createInitialState = overrides => ({
  screen: 'menu',
  phase: 'idle',
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
  matchStats: {
    startedAt: 0,
    finishedAt: 0,
    playerShots: 0,
    opponentShots: 0,
    playerHits: 0,
    opponentHits: 0,
    playerMisses: 0,
    opponentMisses: 0,
    playerSunk: 0,
    opponentSunk: 0
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
