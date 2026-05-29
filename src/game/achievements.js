const num = value => Number(value || 0);

const calcAccuracy = (hits, shots) => shots ? Math.round((hits / shots) * 100) : 0;

export const summarizeProgress = ({ stats = {}, history = [] } = {}) => {
  const rows = Array.isArray(history) ? history : [];

  if (!rows.length) {
    const shots = num(stats.playerShots);
    const hits = num(stats.playerHits);

    return {
      matches: stats.matchId ? 1 : 0,
      wins: stats.result === 'win' ? 1 : 0,
      losses: stats.result === 'loss' ? 1 : 0,
      shots,
      hits,
      misses: num(stats.playerMisses),
      sunk: num(stats.playerSunk),
      opponentSunk: num(stats.opponentSunk),
      bestStreak: num(stats.playerBestHitStreak),
      bestOpponentStreak: num(stats.opponentBestHitStreak),
      bestAccuracy: calcAccuracy(hits, shots),
      bestBalance: num(stats.playerSunk) - num(stats.opponentSunk),
      comebackWins: 0,
      cleanWins: 0,
      perfectPressure: 0
    };
  }

  const wins = rows.filter(row => row.result === 'win').length;
  const losses = rows.filter(row => row.result === 'loss').length;
  const shots = rows.reduce((sum, row) => sum + num(row.playerShots), 0);
  const hits = rows.reduce((sum, row) => sum + num(row.playerHits), 0);
  const misses = rows.reduce((sum, row) => sum + num(row.playerMisses), 0);
  const sunk = rows.reduce((sum, row) => sum + num(row.playerSunk), 0);
  const opponentSunk = rows.reduce((sum, row) => sum + num(row.opponentSunk), 0);

  return {
    matches: rows.length,
    wins,
    losses,
    shots,
    hits,
    misses,
    sunk,
    opponentSunk,
    bestStreak: Math.max(0, ...rows.map(row => num(row.playerBestHitStreak))),
    bestOpponentStreak: Math.max(0, ...rows.map(row => num(row.opponentBestHitStreak))),
    bestAccuracy: Math.max(0, ...rows.map(row => num(row.accuracy))),
    bestBalance: Math.max(-10, ...rows.map(row => num(row.balance))),
    comebackWins: rows.filter(row => row.result === 'win' && num(row.balance) <= 0).length,
    cleanWins: rows.filter(row => row.result === 'win' && num(row.opponentSunk) <= 3).length,
    perfectPressure: rows.filter(row => row.result === 'win' && num(row.playerSunk) >= 10).length
  };
};

export const ACHIEVEMENTS = [
  { id: 'first_blood', icon: '🎯', title: 'Первое сердце', desc: 'Сделай первое попадание', check: p => p.hits >= 1 },
  { id: 'first_sink', icon: '💥', title: 'Первый разлом', desc: 'Уничтожь первый корабль', check: p => p.sunk >= 1 },
  { id: 'first_win', icon: '🏆', title: 'Первая победа', desc: 'Победи в первом бою', check: p => p.wins >= 1 },
  { id: 'not_today', icon: '🛡️', title: 'Не сегодня', desc: 'Переживи поражение и продолжай', check: p => p.losses >= 1 },

  { id: 'streak_3', icon: '🔥', title: 'Горячая рука', desc: 'Серия из 3 попаданий', check: p => p.bestStreak >= 3 },
  { id: 'streak_5', icon: '⚡', title: 'Молния', desc: 'Серия из 5 попаданий', check: p => p.bestStreak >= 5 },
  { id: 'streak_7', icon: '🌋', title: 'Вулкан', desc: 'Серия из 7 попаданий', check: p => p.bestStreak >= 7 },
  { id: 'streak_10', icon: '☄️', title: 'Комета', desc: 'Серия из 10 попаданий', check: p => p.bestStreak >= 10 },

  { id: 'hits_10', icon: '💘', title: '10 попаданий', desc: 'Набери 10 попаданий', check: p => p.hits >= 10 },
  { id: 'hits_25', icon: '🏹', title: '25 попаданий', desc: 'Набери 25 попаданий', check: p => p.hits >= 25 },
  { id: 'hits_50', icon: '🎯', title: '50 попаданий', desc: 'Набери 50 попаданий', check: p => p.hits >= 50 },
  { id: 'hits_100', icon: '👁️', title: 'Снайпер', desc: 'Набери 100 попаданий', check: p => p.hits >= 100 },

  { id: 'shots_50', icon: '🌊', title: 'Шквал', desc: 'Сделай 50 выстрелов', check: p => p.shots >= 50 },
  { id: 'shots_100', icon: '🚀', title: 'Батарея', desc: 'Сделай 100 выстрелов', check: p => p.shots >= 100 },
  { id: 'shots_250', icon: '🛰️', title: 'Орбитальный залп', desc: 'Сделай 250 выстрелов', check: p => p.shots >= 250 },
  { id: 'shots_500', icon: '🌌', title: 'Звёздный обстрел', desc: 'Сделай 500 выстрелов', check: p => p.shots >= 500 },

  { id: 'sunk_5', icon: '🚢', title: 'Охотник', desc: 'Уничтожь 5 кораблей', check: p => p.sunk >= 5 },
  { id: 'sunk_10', icon: '🦈', title: 'Акула арены', desc: 'Уничтожь 10 кораблей', check: p => p.sunk >= 10 },
  { id: 'sunk_25', icon: '🐙', title: 'Кракен', desc: 'Уничтожь 25 кораблей', check: p => p.sunk >= 25 },
  { id: 'sunk_50', icon: '👑', title: 'Адмирал Сердец', desc: 'Уничтожь 50 кораблей', check: p => p.sunk >= 50 },

  { id: 'accuracy_40', icon: '🔎', title: 'Верный глаз', desc: 'Лучший бой с точностью 40%+', check: p => p.bestAccuracy >= 40 },
  { id: 'accuracy_55', icon: '🎖️', title: 'Меткий слух', desc: 'Лучший бой с точностью 55%+', check: p => p.bestAccuracy >= 55 },
  { id: 'accuracy_70', icon: '🏅', title: 'Золотой прицел', desc: 'Лучший бой с точностью 70%+', check: p => p.bestAccuracy >= 70 },
  { id: 'accuracy_85', icon: '💎', title: 'Алмазный выстрел', desc: 'Лучший бой с точностью 85%+', check: p => p.bestAccuracy >= 85 },

  { id: 'matches_3', icon: '🎮', title: 'Разогрев', desc: 'Сыграй 3 боя', check: p => p.matches >= 3 },
  { id: 'matches_10', icon: '🕹️', title: 'Игрок арены', desc: 'Сыграй 10 боёв', check: p => p.matches >= 10 },
  { id: 'matches_25', icon: '📜', title: 'Ветеран', desc: 'Сыграй 25 боёв', check: p => p.matches >= 25 },
  { id: 'matches_50', icon: '🏛️', title: 'Легенда Башни', desc: 'Сыграй 50 боёв', check: p => p.matches >= 50 },

  { id: 'wins_3', icon: '🥉', title: 'Триумф x3', desc: 'Победи 3 раза', check: p => p.wins >= 3 },
  { id: 'wins_10', icon: '🥈', title: 'Десятник побед', desc: 'Победи 10 раз', check: p => p.wins >= 10 },
  { id: 'comeback', icon: '🧨', title: 'Камбэк', desc: 'Победи без перевеса по кораблям', check: p => p.comebackWins >= 1 },
  { id: 'clean_win', icon: '🪽', title: 'Чистая дуэль', desc: 'Победи, потеряв не больше 3 кораблей', check: p => p.cleanWins >= 1 }
];

export const evaluateAchievements = ({ stats = {}, history = [] } = {}) => {
  const progress = summarizeProgress({ stats, history });

  return ACHIEVEMENTS.map(item => ({
    ...item,
    ok: !!item.check(progress),
    progress
  }));
};
