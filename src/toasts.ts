export function showToast(msg: string, durationMs = 2000) {
  const existing = document.getElementById('kept-toast');
  if (existing) existing.remove();
  const toast = document.createElement('div');
  toast.id = 'kept-toast';
  toast.className = 'kept-toast';
  toast.textContent = msg;
  document.body.appendChild(toast);
  requestAnimationFrame(() => { toast.classList.add('kept-toast-visible'); });
  setTimeout(() => {
    toast.classList.remove('kept-toast-visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, durationMs);
}

let _undoToastTimer: ReturnType<typeof setTimeout> | null = null;

export function showUndoToast(msg: string, undoFn: () => Promise<void> | void) {
  const existing = document.getElementById('kept-undo-toast');
  if (existing) {
    existing.remove();
    if (_undoToastTimer !== null) { clearTimeout(_undoToastTimer); _undoToastTimer = null; }
  }

  const toast = document.createElement('div');
  toast.id = 'kept-undo-toast';
  toast.className = 'undo-toast';
  toast.innerHTML = `
    <span class="undo-toast-msg">${msg}</span>
    <button class="undo-toast-btn">Undo</button>
    <div class="undo-toast-progress"></div>
  `;
  document.body.appendChild(toast);

  const DURATION = 5000;

  function dismiss() {
    if (_undoToastTimer !== null) { clearTimeout(_undoToastTimer); _undoToastTimer = null; }
    toast.remove();
  }

  toast.querySelector('.undo-toast-btn')!.addEventListener('click', async () => {
    dismiss();
    await undoFn();
  });

  _undoToastTimer = setTimeout(dismiss, DURATION);
}
