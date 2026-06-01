export const renderVoiceButton = onToggle => {
  const btn = document.createElement('button');
  btn.className = 'wh-voice';
  btn.type = 'button';
  btn.textContent = '🎙';
  btn.setAttribute('aria-label', 'Удерживать и говорить');

  let active = false;

  const setActive = next => {
    next = !!next;
    if (active === next) return;
    active = next;
    btn.classList.toggle('is-active', active);
    onToggle(active);
  };

  btn.addEventListener('pointerdown', e => {
    e.preventDefault();
    btn.setPointerCapture?.(e.pointerId);
    setActive(true);
  });

  btn.addEventListener('pointerup', e => {
    e.preventDefault();
    setActive(false);
  });

  btn.addEventListener('pointercancel', () => setActive(false));
  btn.addEventListener('lostpointercapture', () => setActive(false));

  return btn;
};
