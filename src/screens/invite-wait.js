import { renderNetworkIndicator } from '../ui/network-indicator.js';

export const renderInviteWait = (root, state, actions) => {
const left = Math.max(0, Math.ceil(((state.invite?.expiresAt || Date.now()) - Date.now()) / 1000));
const url = String(state.invite?.url || '').trim();
const isDirect = !!state.invite?.isDirectPush;
const nearbyCode = String(state.invite?.nearbyCode || '');
const lanCode = String(state.invite?.code || state.lanCode || '');
const isLan = !!state.invite?.isLan;
const isRanked = !!state.invite?.ranked;
const peerName = state.network?.peerName || 'Друга';
const el = document.createElement('section');
el.className = 'wh-card';

// LAN Wi-Fi режим — показываем код и бейдж рейтинга
if (isLan && lanCode) {
const rankBadge = isRanked
? '<div style="display:inline-block;padding:5px 14px;border-radius:999px;background:rgba(255,152,0,.2);border:1px solid rgba(255,152,0,.4);color:#ffb74d;font-size:12px;font-weight:900;margin-bottom:12px">🏆 РЕЙТИНГОВЫЙ БОЙ · +осколки</div>'
: '<div style="display:inline-block;padding:5px 14px;border-radius:999px;background:rgba(124,77,255,.2);border:1px solid rgba(124,77,255,.4);color:#b388ff;font-size:12px;font-weight:900;margin-bottom:12px">👤 ГОСТЕВОЙ БОЙ · без рейтинга</div>';
el.innerHTML = `
<h2>📶 Игра по Wi-Fi</h2>
${rankBadge}
<div style="text-align:center;margin:16px 0">
<div style="font-size:12px;color:#9db7dd;margin-bottom:8px">Код комнаты:</div>
<div style="font-size:48px;font-weight:900;color:#4caf50;letter-spacing:6px;font-family:monospace;text-shadow:0 0 20px rgba(76,175,80,.3)">${lanCode}</div>
<div style="font-size:11px;color:#888;margin-top:8px">Назовите этот код другу</div>
</div>
<div style="padding:12px;border-radius:12px;background:rgba(0,0,0,.2);border:1px solid rgba(255,255,255,.08);margin-bottom:12px">
<div style="font-size:11px;color:#9db7dd;text-align:center">
⏳ Ожидание подключения... <span style="color:#ffb74d">${left}с</span>
</div>
</div>
<div class="wh-actions">
<button class="wh-btn secondary" type="button" data-act="menu">Отменить</button>
</div>
`;
el.querySelector('[data-act="menu"]')?.addEventListener('click', actions.cancelInvite || actions.openMenu);
if (state.network?.active) {
el.prepend(renderNetworkIndicator(state, {
fallbackText: `Ожидание подключения по Wi-Fi${isRanked ? ' (рейтинг)' : ' (гость)'}`
}));
}
root.append(el);
return;
}

el.innerHTML = `
<h2>${isDirect ? 'Приглашение отправлено' : 'Приглашение создано'}</h2>
    <p>${nearbyCode ? 'Покажи этот код другу рядом.' : isDirect ? `Мы отправили пуш-уведомление для <b>${escapeHtml(peerName)}</b>.` : (url ? 'Отправь эту ссылку другу через мессенджер, SMS, почту или QR.' : 'Preview-режим без сетевой ссылки.')}</p>

    <div class="wh-card">
      <p><b>Осталось:</b> ${left} сек.</p>
      ${nearbyCode ? `<p style="margin-top:10px;text-align:center"><b style="font-size:34px;letter-spacing:.14em;color:var(--wh-cyan)">${escapeHtml(nearbyCode)}</b><br><span style="font-size:12px;color:var(--wh-muted)">Друг вводит этот код в «Друг рядом · код»</span></p>` : ''}
      ${nearbyCode || isDirect ? '' : (url ? `<p style="word-break:break-all;margin-top:8px"><b>Ссылка:</b><br>${escapeHtml(url)}</p>` : `<p style="margin-top:8px;color:var(--wh-muted)"><b>Ссылка:</b><br>Настоящая P2P-ссылка недоступна. Проверьте network bridge или запустите игру из Game Center.</p>`)}
    </div>

    <div class="wh-actions">
      ${url && !isDirect ? `<button class="wh-btn" type="button" data-act="share">Поделиться ссылкой</button>` : ''}
      ${url && !isDirect ? `<button class="wh-btn secondary" type="button" data-act="copy">Скопировать</button>` : ''}
      <button class="wh-btn secondary" type="button" data-act="extend">Продлить на 2 минуты</button>
      ${url ? '' : '<button class="wh-btn secondary" type="button" data-act="accepted">Preview-бой без сети</button>'}
      <button class="wh-btn secondary" type="button" data-act="menu">Отменить</button>
    </div>
  `;

  if (state.network?.active) {
    el.prepend(renderNetworkIndicator(state, {
      fallbackText: 'Приглашение создано. Ожидаем подключение второго устройства.'
    }));
  }

  el.querySelector('[data-act="extend"]')?.addEventListener('click', actions.extendInvite);
  el.querySelector('[data-act="accepted"]')?.addEventListener('click', actions.acceptMockOpponent);
  el.querySelector('[data-act="menu"]')?.addEventListener('click', actions.cancelInvite || actions.openMenu);
  el.querySelector('[data-act="copy"]')?.addEventListener('click', () => navigator.clipboard?.writeText?.(url));
  el.querySelector('[data-act="share"]')?.addEventListener('click', () => {
    if (navigator.share) navigator.share({ title: 'Война Сердец', text: 'Присоединяйся к игре', url }).catch(() => {});
    else navigator.clipboard?.writeText?.(url);
  });

  root.append(el);
};

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
})[ch]);
