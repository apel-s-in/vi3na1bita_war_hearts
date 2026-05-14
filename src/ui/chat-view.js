export const renderChat = (messages, onSend) => {
  const wrap = document.createElement('div');
  wrap.className = 'wh-chat';

  const log = document.createElement('div');
  log.className = 'wh-chat-log';
  log.innerHTML = messages.slice(-20).map(msg =>
    `<div><b>${escapeHtml(msg.from)}:</b> ${escapeHtml(msg.text)}</div>`
  ).join('');

  const form = document.createElement('form');
  form.className = 'wh-chat-form';
  form.innerHTML = `
    <input type="text" maxlength="300" placeholder="Сообщение..." aria-label="Сообщение">
    <button class="wh-btn" type="submit">▶</button>
  `;

  form.addEventListener('submit', e => {
    e.preventDefault();
    const input = form.querySelector('input');
    const text = input?.value || '';
    onSend(text);
    if (input) input.value = '';
  });

  wrap.append(log, form);
  return wrap;
};

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
})[ch]);
