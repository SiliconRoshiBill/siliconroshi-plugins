// ============================================================
//  Windows / macOS / Linux rows: every OS has an answer, and the
//  Windows ones never pass a URL or a path through a shell.
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const { OPEN, CLIPBOARD } = require('./platform.cjs');
const { windowsTaskArgs, SCHEDULERS } = require('./sync.cjs');
const { namedJsonFiles } = require('./hook.cjs');

const OSES = ['darwin', 'win32', 'linux'];

test('every supported OS can open a URL, read the clipboard and schedule the check', () => {
  for (const os of OSES) {
    assert.ok(OPEN[os] && CLIPBOARD[os], os);
    assert.deepEqual(Object.keys(SCHEDULERS[os]).sort(), ['installed', 'off', 'on'], os);
  }
});

test('Windows opens the login link without cmd, so "&" in it is not a command separator', () => {
  const [cmd, args] = OPEN.win32('https://x/approve?code=AB&lang=zh');
  assert.equal(cmd, 'rundll32');
  assert.equal(args.at(-1), 'https://x/approve?code=AB&lang=zh');
});

test('Windows task: HOURLY with a 1-23 modifier, DAILY for 24, node + launcher quoted, output logged', () => {
  const three = windowsTaskArgs(3);
  assert.deepEqual(three.slice(4, 8), ['/SC', 'HOURLY', '/MO', '3']);
  assert.deepEqual(windowsTaskArgs(24).slice(4, 6), ['/SC', 'DAILY']);
  assert.match(three.at(-1), /^".+" ".+run-sync\.cjs" --log$/);
});

test('namedJsonFiles: POSIX and Windows paths (JSON-escaped or not)', () => {
  const out = String.raw`wrote /tmp/out/result.json; also C:\\work\\up\\r.json and D:/x/y.json`;
  assert.deepEqual(namedJsonFiles(out), ['/tmp/out/result.json', String.raw`C:\work\up\r.json`, 'D:/x/y.json']);
});

test('ensureScheduled: on by default once logged in, never after the user turned it off', () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  process.env.SRLINK_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'srlink-sched-'));
  for (const k of Object.keys(require.cache)) if (/srlink\.cjs$|sync\.cjs$|log\.cjs$/.test(k)) delete require.cache[k];
  const srlink = require('./srlink.cjs');
  const sync = require('./sync.cjs');
  /* a fake scheduler for this OS: nothing real is installed */
  let installed = false;
  sync.SCHEDULERS[process.platform] = { on: () => { installed = true; }, off: () => { installed = false; }, installed: () => installed };

  assert.equal(sync.ensureScheduled(), null, 'not logged in: nothing');
  srlink.saveConfig({ token: 't' });
  assert.match(sync.ensureScheduled(), /^Background check on, every hour\..*schedule off/);
  assert.equal(installed, true);
  assert.equal(sync.ensureScheduled(), null, 'already on: nothing');

  sync.schedule('off');
  assert.equal(installed, false);
  assert.equal(srlink.loadConfig().scheduleOff, true);
  assert.equal(sync.ensureScheduled(), null, 'the user said off: stays off');

  sync.schedule('on', 3);
  assert.equal(srlink.loadConfig().scheduleOff, undefined, 'turning it on again clears the off');
});
