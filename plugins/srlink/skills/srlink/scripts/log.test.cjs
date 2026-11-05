// ============================================================
//  log.cjs -- secrets never reach the disk; lines are readable.
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.SRLINK_HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'srlink-log-'));
const log = require('./log.cjs');

test('redact: token-like keys are blanked at any depth', () => {
  const out = log.redact({ access_token: 'a', device_code: 'b', nested: [{ Authorization: 'c', title: 'ok' }] });
  assert.deepEqual(out, { access_token: '[redacted]', device_code: '[redacted]', nested: [{ Authorization: '[redacted]', title: 'ok' }] });
});

test('record + tail: one JSON line per request, shown back in plain words', () => {
  log.record({ rid: 'r1', method: 'POST', url: 'https://x/api/srlink/posts', sent: { title: 'Hi' }, status: 200, ms: 12, got: { ok: true, id: 7, access_token: 'zzz' } });
  log.record({ rid: 'r2', method: 'GET', url: 'https://x/api/srlink/feed', ms: 3, error: 'ECONNREFUSED' });
  const files = fs.readdirSync(log.logDir());
  assert.equal(files.length, 1);
  const raw = fs.readFileSync(path.join(log.logDir(), files[0]), 'utf8');
  assert.equal(raw.trim().split('\n').length, 2);
  assert.doesNotMatch(raw, /zzz/);
  const text = log.tail(10);
  assert.match(text, /POST https:\/\/x\/api\/srlink\/posts {2}200 12ms/);
  assert.match(text, /ERROR ECONNREFUSED/);
});

test('record: old day files are pruned when a new day starts', () => {
  const old = path.join(log.logDir(), '2000-01-01.jsonl');
  fs.writeFileSync(old, '{}\n');
  fs.rmSync(path.join(log.logDir(), `${new Date().toISOString().slice(0, 10)}.jsonl`));
  log.record({ rid: 'r3', method: 'GET', url: 'u', status: 200, ms: 1 });
  assert.equal(fs.existsSync(old), false);
});
