import assert from 'node:assert/strict';
import test from 'node:test';
import { redactPath, stringifyRedacted } from '../public/path-privacy.js';

test('all supported home paths redact usernames consistently in text', () => {
  const examples = [
    ['/Users/Alice/Library/x', '/Users/<user>/Library/x'],
    ['/home/xavier/My App', '/Users/<user>/My App'],
    ['C:\\Users\\bob\\AppData\\app', '/Users/<user>/AppData\\app'],
    ['D:/USERS/First Last/file', '/Users/<user>/file'],
    ['Users/Local Account/Foo', '/Users/<user>/Foo'],
    ['file:///Users/Quoted "Name"/App', 'file:///Users/<user>/App'],
    ['https://example.net/%2Fhome%2Fallison%2Fapp', 'https://example.net//Users/<user>/app'],
    ['/home/adam', '/Users/<user>'],
    ['Error reading /Users/alice/a and /home/bob/b', 'Error reading /Users/<user>/a and /Users/<user>/b'],
    ['/Applications/Example.app', '/Applications/Example.app'],
  ];
  for (const [input, expected] of examples) {
    assert.equal(redactPath(input), expected);
    assert.equal(redactPath(expected), expected);
  }
});

test('JSON redacts nested keys, strings and diagnostic bytes before serializing', () => {
  const toHex = (text) => Buffer.from(text).toString('hex');
  const result = JSON.parse(stringifyRedacted({
    info_plist: {
      '/Users/nest"ed/bin': ['C:\\Users\\Test User\\Nested.app', { path: '/home/name/Projects' }],
      content: { $plist: 'data_hex', value: toHex('First /home/binuser/bin\0') },
    },
    executable_prefix_hex: toHex('#!/Users/runner/bin/script\n'),
    read_log: [{ path: '/home/reader/file', offset: 7, outcome: 'ok' }],
  }));
  assert.deepEqual(result.info_plist['/Users/<user>/bin'], ['/Users/<user>/Nested.app', {
    path: '/Users/<user>/Projects',
  }]);
  assert.equal(Buffer.from(result.info_plist.content.value, 'hex').toString(), 'First /Users/<user>/bin\0');
  assert.equal(Buffer.from(result.executable_prefix_hex, 'hex').toString(), '#!/Users/<user>/bin/script\n');
  assert.deepEqual(result.read_log, [{ path: '/Users/<user>/file', offset: 7, outcome: 'ok' }]);
});
