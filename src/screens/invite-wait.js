import { renderNetworkIndicator } from '../ui/network-indicator.js';

export const renderInviteWait = (root, state, actions) => {
  const left = Math.max(0, Math.ceil(((state.invite?.expiresAt || Date.now()) - Date.now()) / 1000));
  const url = String(state.invite?.url || '').trim();
  const isDirect = !!state.invite?.isDirectPush;
  const peerName = state.network?.peerName || 'Друга';

  const el = document.createElement('section');
  el.className = 'wh-card';
  el.innerHTML = `
    <h2>${isDirect ? 'Приглашение отправлено' : 'Приглашение создано'}</h2>
    <p>${isDirect ? `Мы отправили пуш-уведомление для <b>${escapeHtml(peerName)}</b>.` : (url ? 'Отправь эту ссылку другу через мессенджер, SMS, почту или QR.' : 'Preview-режим без сетевой ссылки.')}</p>

    <div class="wh-card">
      <p><b>Осталось:</b> ${left} сек.</p>
      ${isDirect ? '' : (url ? `<p style="word-break:break-all;margin-top:8px"><b>Ссылка:</b><br>${escapeHtml(url)}</p>` : `<p style="margin-top:8px;color:var(--wh-muted)"><b>Ссылка:</b><br>Настоящая P2P-ссылка недоступна. Проверьте network bridge или запустите игру из Game Center.</p>`)}
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
