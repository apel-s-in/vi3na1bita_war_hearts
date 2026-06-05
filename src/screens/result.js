export const renderResult = (root, state, actions) => {
const isNetwork = state.opponent?.type === 'network';
const isRanked = !!state.network?.ranked;
const isWin = state.result === 'win';
const rankBadge = isRanked
? '<div style="padding:6px 16px;border-radius:999px;background:rgba(255,152,0,.15);border:1px solid rgba(255,152,0,.3);color:#ffb74d;font-size:13px;font-weight:900;display:inline-block;margin-bottom:10px">🏆 Рейтинговый бой · результат будет проверен</div>'
: (isNetwork
? '<div style="padding:6px 16px;border-radius:999px;background:rgba(124,77,255,.2);border:1px solid rgba(124,77,255,.4);color:#b388ff;font-size:13px;font-weight:900;display:inline-block;margin-bottom:10px">👤 Гостевой бой · без статистики</div>'
: '');
const el = document.createElement('section');
el.className = 'wh-card wh-hero';
el.innerHTML = `
<div class="wh-hero-mark">${state.result === 'win' ? '🏆' : '💔'}</div>
<h2>${state.result === 'win' ? 'Победа!' : state.result === 'loss' ? 'Поражение' : 'Матч завершён'}</h2>
${rankBadge}
<p>${state.opponent?.type === 'computer'
? 'Тренировка завершена. Позже компьютер станет умнее и появятся уровни сложности.'
: (isNetwork
? (isRanked
? 'Результат будет учтён в таблице лидеров после верификации.'
: 'Результат не влияет на рейтинг. Сыграем ещё?')
: 'Позже здесь будет подтверждение результата, hash партии и отправка статистики в Game Center.')}</p>
<div class="wh-actions">
${isNetwork ? '<button class="wh-btn" type="button" data-act="rematch" style="background:linear-gradient(135deg,#4caf50,#2e7d32)">🔄 Реванш</button>' : ''}
<button class="wh-btn ${isNetwork ? 'secondary' : ''}" type="button" data-act="menu">В главное меню</button>
</div>
`;

  el.querySelector('[data-act="menu"]')?.addEventListener('click', actions.openMenu);
  root.append(el);
};
