import assert from 'node:assert/strict';
import test from 'node:test';
import { notify } from '../public/notifications.js';

function documentFixture(t, listAvailable = true) {
  class Node extends EventTarget {
    children = [];
    dataset = {};
    attributes = new Map();
    textContent = '';
    classList = new Set(['visually-hidden']);
    setAttribute(name, value) { this.attributes.set(name, value); }
    append(...nodes) {
      for (const node of nodes) node.parent = this;
      this.children.push(...nodes);
    }
    contains(node) { return node === this || this.children.some((child) => child.contains(node)); }
    remove() { this.parent.children = this.parent.children.filter((node) => node !== this); }
    focus() { document.activeElement = this; }
    click() { this.dispatchEvent(new Event('click')); }
  }
  const list = new Node();
  const announcement = new Node();
  announcement.classList.remove = (name) => announcement.classList.delete(name);
  const origin = new Node();
  origin.isConnected = true;
  const document = {
    querySelector: () => listAvailable ? list : null,
    getElementById: () => announcement,
    createElement: () => new Node(),
    activeElement: origin,
  };
  t.mock.method(globalThis, 'setTimeout', () => assert.fail('Notifications must persist until dismissed'));
  Object.defineProperty(globalThis, 'document', { value: document, configurable: true });
  t.after(() => { delete globalThis.document; });
  return { list, announcement, origin, document };
}

test('a repeated error stays in one persistent toast and redacts paths', (t) => {
  const { list, announcement, origin, document } = documentFixture(t);
  const onDismiss = t.mock.fn();
  notify.error('Could not read the file.', '/Users/alice/App', { onDismiss });
  notify.error('Could not read the file.', '/Users/alice/App');
  assert.equal(list.children.length, 1);
  assert.equal(announcement.textContent, 'Could not read the file. /Users/<user>/App');
  assert.equal(document.activeElement, origin);
  const [toast] = list.children;
  assert.equal(toast.dataset.type, 'error');
  const close = toast.children[1];
  close.focus();
  close.click();
  assert.equal(list.children.length, 0);
  assert.equal(announcement.textContent, '');
  assert.equal(document.activeElement, origin);
  assert.equal(onDismiss.mock.callCount(), 1);
});

test('the live text becomes visible if the toaster is missing', (t) => {
  const { announcement } = documentFixture(t, false);
  notify.info('No apps were found.');
  assert.equal(announcement.textContent, 'No apps were found.');
  assert.equal(announcement.classList.has('visually-hidden'), false);
});

test('a recovery toast closes after its dismissal is saved', async (t) => {
  const { list } = documentFixture(t);
  const { promise, resolve } = Promise.withResolvers();
  const onDismiss = t.mock.fn(() => promise);
  notify.error('The last scan ended unexpectedly.', null, { onDismiss });
  const close = list.children[0].children[1];
  close.click();
  close.click();
  assert.equal(onDismiss.mock.callCount(), 1);
  assert.equal(list.children.length, 1);
  resolve();
  await promise;
  assert.equal(list.children.length, 0);
});
