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
