import { redactPath } from './path-privacy.js';

function part(tag, attribute, text) {
  const node = document.createElement(tag);
  node.setAttribute(attribute, '');
  if (text) node.textContent = text;
  return node;
}

function show(type, title, detail, { id, action, onDismiss } = {}) {
  const list = document.querySelector('[data-sonner-toaster]');
  const announcement = document.getElementById('input-status');
  title = redactPath(title);
  detail = redactPath(detail);
  const message = `${title}${detail ? ` ${detail}` : ''}`;
  if (!list) {
    announcement?.classList.remove('visually-hidden');
    if (announcement) announcement.textContent = message;
    return;
  }
  if (Array.from(list.children).some((node) => id ? node.id === id : node.dataset.message === message)) return;

  const origin = document.activeElement;
  const toast = part('li', 'data-sonner-toast');
  if (id) toast.id = id;
  toast.dataset.type = type;
  toast.dataset.message = message;
  const content = part('div', 'data-content');
  content.append(part('p', 'data-title', title));
  if (detail) content.append(part('p', 'data-description', detail));
  if (action) content.append(action);

  const close = part('button', 'data-close-button', '×');
  close.type = 'button';
  close.setAttribute('aria-label', `Dismiss ${title}`);
  close.addEventListener('click', () => {
    const restoreFocus = toast.contains(document.activeElement);
    const next = toast.nextElementSibling ?? toast.previousElementSibling;
    toast.remove();
    if (restoreFocus) {
      const target = next?.querySelector('[data-close-button]') ?? (origin?.isConnected ? origin : null);
      target?.focus({ preventScroll: true });
    }
    if (announcement?.textContent === message) announcement.textContent = '';
    onDismiss?.();
  });
  toast.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close.click();
  });
  toast.append(content, close);
  list.append(toast);
  if (announcement) announcement.textContent = message;
}

export const notify = {
  error: (title, detail, options) => show('error', title, detail, options),
  info: (title, detail, options) => show('info', title, detail, options),
};
