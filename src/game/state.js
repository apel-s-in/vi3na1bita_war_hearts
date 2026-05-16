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
