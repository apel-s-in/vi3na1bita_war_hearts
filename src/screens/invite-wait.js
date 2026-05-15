export const renderInviteWait = (root, state, actions) => {
  const left = Math.max(0, Math.ceil(((state.invite?.expiresAt || Date.now()) - Date.now()) / 1000));
  const url = String(state.invite?.url || '').trim();

  const el = document.createElement('section');
  el.className = 'wh-card';
  el.innerHTML = `
    <h2>Приглашение создано</h2>
    <p>${url ? 'Отправь эту ссылку другу через мессенджер, SMS, почту или QR.' : 'Preview-режим без сетевой ссылки.'}</p>

    <div class="wh-card">
      <p><b>ID:</b> ${escapeHtml(state.invite?.id || 'preview')}</p>
      <p><b>Осталось:</b> ${left} сек.</p>
      ${url ? `<p style="word-break:break-all;margin-top:8px"><b>Ссылка:</b><br>${escapeHtml(url)}</p>` : ''}
    </div>

    <div class="wh-actions">
      ${url ? `<button class="wh-btn" type="button" data-act="share">Поделиться ссылкой</button>` : ''}
      ${url ? `<button class="wh-btn secondary" type="button" data-act="copy">Скопировать</button>` : ''}
      <button class="wh-btn secondary" type="button" data-act="extend">Продлить на 2 минуты</button>
      <button class="wh-btn secondary" type="button" data-act="accepted">Сымитировать принятие</button>
      <button class="wh-btn secondary" type="button" data-act="menu">Назад</button>
    </div>
  `;

  el.querySelector('[data-act="extend"]')?.addEventListener('click', actions.extendInvite);
  el.querySelector('[data-act="accepted"]')?.addEventListener('click', actions.acceptMockOpponent);
  el.querySelector('[data-act="menu"]')?.addEventListener('click', actions.openMenu);
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
