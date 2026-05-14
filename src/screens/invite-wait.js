export const renderInviteWait = (root, state, actions) => {
  const left = Math.max(0, Math.ceil(((state.invite?.expiresAt || Date.now()) - Date.now()) / 1000));

  const el = document.createElement('section');
  el.className = 'wh-card';
  el.innerHTML = `
    <h2>Приглашение создано</h2>
    <p>Отправь ссылку другу. В следующем этапе здесь будет QR, Web Share и подтверждение через signaling.</p>

    <div class="wh-card">
      <p><b>ID:</b> ${state.invite?.id || 'preview'}</p>
      <p><b>Осталось:</b> ${left} сек.</p>
    </div>

    <div class="wh-actions">
      <button class="wh-btn" type="button" data-act="accepted">Сымитировать принятие</button>
      <button class="wh-btn secondary" type="button" data-act="menu">Назад</button>
    </div>
  `;

  el.querySelector('[data-act="accepted"]')?.addEventListener('click', actions.acceptMockOpponent);
  el.querySelector('[data-act="menu"]')?.addEventListener('click', actions.openMenu);

  root.append(el);
};
