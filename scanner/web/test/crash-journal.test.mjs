import assert from 'node:assert/strict';
import test from 'node:test';
import { browserInfo, crashReportLines } from '../public/crash-journal.js';
import { recoverableFolderError } from '../public/local-inputs.js';
import { FolderLimitError } from '../public/folder-walk.js';

test('browser detection uses features and keeps the user agent for the report', () => {
  const firefox = browserInfo({ navigator: { userAgent: 'Mozilla/5.0 Firefox/140.0' }, mozInnerScreenX: 0 });
  assert.equal(firefox.name, 'Firefox');
  assert.equal(firefox.version, '140.0');
  assert.equal(firefox.show_directory_picker, false);
  const chromium = browserInfo({
    navigator: { userAgent: 'Chrome/130.0.1 Safari', userAgentData: { brands: [{ brand: 'Chromium', version: '130' }] } },
    showDirectoryPicker() {}, performance: { memory: {} },
  });
  assert.equal(chromium.name, 'Chromium');
  assert.equal(chromium.show_directory_picker, true);
  assert.equal(chromium.memory_api, true);
  assert.equal(browserInfo({ navigator: { userAgent: 'x' }, GestureEvent: class {} }).name, 'Safari');
});

test('the crash report is NDJSON with home paths redacted and no contents', () => {
  const text = crashReportLines({
    id: 'a', started_at: '2026-01-01T00:00:00Z', input: 'drop', stage: 'scanning', browser: { name: 'Firefox' },
    events: [{ at_ms: 1, type: 'js_error', message: 'failed at /Users/jane/Apps/Foo.app and C:\\Users\\Jane\\x' }],
    samples: [{ at_ms: 1000, stage: 'scanning', files_seen: 10, rows_done: 2 }], long_tasks: [{ at_ms: 5, duration_ms: 90 }],
  });
  const lines = text.trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(lines.map(({ type }) => type), ['crash_report', 'journal_event', 'sample', 'long_task']);
  assert.equal(lines[0].outcome, 'no_clean_end');
  assert.doesNotMatch(text, /jane/i);
  assert.match(text, /\/Users\/<user>/);
});

test('folder read errors are classified so the scan stops and keeps its rows', () => {
  assert.equal(recoverableFolderError(new FolderLimitError('x')), 'folder_result_limit');
  assert.equal(recoverableFolderError(new RangeError('Array buffer allocation failed')), 'out_of_memory');
  assert.equal(recoverableFolderError(new DOMException('gone', 'NotFoundError')), 'dom_exception:NotFoundError');
  assert.equal(recoverableFolderError(new TypeError('x')), 'enumeration_error:TypeError');
});
