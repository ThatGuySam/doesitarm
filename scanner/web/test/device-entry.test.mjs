import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultEntry, deviceProfile, publicDownload } from '../public/download-input.js';

test('entry preference wins over platform detection', () => {
  assert.equal(defaultEntry({ mac: true }, null), 'files');
  assert.equal(defaultEntry({ mac: false }, null), 'url');
  assert.equal(defaultEntry({ mac: true }, 'url'), 'url');
  assert.equal(defaultEntry({ mac: false }, 'files'), 'files');
  assert.equal(defaultEntry({ mac: false }, 'unknown'), 'url');
});

test('Mac identification honors UA hints, platform fallbacks and iPad touches', () => {
  assert.deepEqual(deviceProfile({ userAgentData: { platform: 'macOS' }, platform: 'Linux' }), { mac: true, touch: false });
  assert.deepEqual(deviceProfile({ userAgentData: { platform: 'Windows' }, platform: 'MacIntel' }), { mac: false, touch: false });
  assert.deepEqual(deviceProfile({ platform: 'MacIntel' }), { mac: true, touch: false });
  assert.deepEqual(deviceProfile({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)' }), { mac: true, touch: false });
  assert.deepEqual(deviceProfile({ platform: 'MacIntel', maxTouchPoints: 5, userAgent: 'Macintosh' }), { mac: false, touch: true });
  assert.deepEqual(deviceProfile({ platform: 'iPhone', userAgent: 'iPhone' }), { mac: false, touch: true });
  assert.deepEqual(deviceProfile({ platform: 'Linux aarch64', userAgent: 'Android' }), { mac: false, touch: true });
  assert.deepEqual(deviceProfile({ platform: 'Win32' }, true), { mac: false, touch: true });
});

test('candidate-link display validates HTTPS again', () => {
  assert.equal(publicDownload('https://example.com/file.dmg#mac').href, 'https://example.com/file.dmg');
  for (const bad of ['https://@example.com/a', 'https://example.com:80/a', 'data:text/html,X',
    'https://0x7f000001/', 'https://[::1]/a', 'https://host.internal/']) assert.throws(() => publicDownload(bad));
});
