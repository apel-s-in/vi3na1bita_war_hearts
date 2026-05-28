export const renderChat = (messages, onSend) => {
  const wrap = document.createElement('div');
  wrap.className = 'wh-chat';

  const log = document.createElement('div');
  log.className = 'wh-chat-log';
  log.innerHTML = messages.slice(-40).map(msg => {
    const isSystem = String(msg.from || '').toLowerCase() === 'система';
    return `
      <div class="wh-chat-line ${isSystem ? 'is-system' : ''}">
        <span class="wh-chat-time">${formatTime(msg.at)}</span>
        <b>${escapeHtml(msg.from)}:</b>
        <span>${escapeHtml(msg.text)}</span>
      </div>
    `;
  }).join('');

  log.scrollTop = log.scrollHeight;

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

const formatTime = value => {
  const date = value ? new Date(value) : new Date();
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
};

const escapeHtml = value => String(value || '').replace(/[&<>"']/g, ch => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#039;'
})[ch]);
