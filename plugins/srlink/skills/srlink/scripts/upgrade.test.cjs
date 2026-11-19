// ============================================================
//  upgrade: a daily look for a newer SRlink (owner, 2026-11-19)
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'srlink-upgrade-'));
process.env.SRLINK_HOME = home;
const srlink = require('./srlink.cjs');
const up = require('./upgrade.cjs');

test('newer: numeric, not string, comparison', () => {
  assert.equal(up.newer('0.1.10', '0.1.9'), true);
  assert.equal(up.newer('0.1.26', '0.1.26'), false);
  assert.equal(up.newer('0.2.0', '0.1.99'), true);
  assert.equal(up.newer('0.1.25', '0.1.26'), false);
});

test('installed: reads this checkout\'s manifest', () => {
  assert.match(up.installed().version, /^\d+\.\d+\.\d+$/);
});

test('check: at most once a day, and silent when the network says nothing newer', async () => {
  const realFetch = global.fetch;
  let calls = 0;
  global.fetch = async () => { calls++; return { ok: true, json: async () => ({ version: '0.0.1' }) }; };
  try {
    srlink.saveConfig({});
    assert.equal(await up.check(srlink), null);
    assert.equal(await up.check(srlink), null);
    assert.equal(calls, 1);
  } finally { global.fetch = realFetch; }
});

test('check: auto-upgrade off -> a reminder, nothing installed', async () => {
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: true, json: async () => ({ version: '99.0.0' }) });
  try {
    srlink.saveConfig({ autoUpgrade: false });
    assert.match(await up.check(srlink), /99\.0\.0 is out .*upgrade SRlink/);
  } finally { global.fetch = realFetch; }
});

test('auto-upgrade on|off', () => {
  assert.equal(up.autoUpgrade('off', srlink), 'Auto-upgrade off.');
  assert.match(up.autoUpgrade('', srlink), /is off/);
  assert.equal(up.autoUpgrade('on', srlink), 'Auto-upgrade on.');
});
