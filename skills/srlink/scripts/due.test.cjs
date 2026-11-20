// ============================================================
//  due: a scheduled post that went out with its link still pending
//  is mentioned by the hook, once an hour (owner, 2026-11-17), and
//  filled from the user's browser without asking (2026-11-19).
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'srlink-due-'));
process.env.SRLINK_HOME = home;
const { handle } = require('./hook.cjs');
const due = require('./due.cjs');

const POST = { id: 91, title: 'Stay in the driver seat', summary: 'Taste is the last 5%.',
  publish_at: '2026-11-18 15:00:00', platforms: ['linkedin'] };
const event = { tool_name: 'Bash', tool_input: { command: 'ls' }, tool_response: { stdout: 'a.txt' } };
const writeDue = (items) => fs.writeFileSync(path.join(home, 'due.json'),
  JSON.stringify({ checked_at: new Date().toISOString(), due: items }));

test('hook: a went-out post is mentioned once an hour, pointing at due --steps, never "ask the user"', async () => {
  fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify({ token: 't', autoShare: true }));
  writeDue([POST]);
  const first = await handle(event);
  assert.match(first, /#91 "Stay in the driver seat" on linkedin/);
  assert.match(first, /due --steps/);
  assert.match(first, /without asking the user/);
  assert.equal(await handle(event), null);   /* not again within the hour */
});

test('steps: profile page, the page script, the time window, both outcomes', () => {
  const text = due.steps(POST, 'linkedin', {}, (t) => t);
  assert.match(text, /linkedin\.com\/in\/me\/recent-activity\/all/);
  assert.match(text, /urn:li:activity/);
  assert.match(text, /between 2026-11-16T15:00:00\.000Z and /);         /* two days early, up to now */
  assert.deepEqual(due.timeWindow('2026-11-18 15:00:00', Date.parse('2026-11-19T16:10:00Z')),
    ['2026-11-16T15:00:00.000Z', '2026-11-19T16:10:00.000Z']);             /* the 11-19 incident: a day late is inside */
  assert.match(text, /Taste is the last 5%/);
  assert.match(text, /share --into 91 .*--link linkedin=<url>/);
  assert.match(text, /due --missing 91/);
  assert.match(text, /nearest the scheduled time/);
  assert.match(text, /do nothing and mark nothing/);
  assert.match(text, /View all scheduled posts.*reschedule 91 --publish-at/);
  assert.match(due.steps({ ...POST, platforms: ['x'] }, 'x', { x: '@SiliconRoshi' }, (t) => t), /https:\/\/x\.com\/SiliconRoshi/);
});

test('page scripts: ids decode to the real publish time', () => {
  /* urn:li:activity:7528836626521739264 went out 2026-11-18T15:08:50.783Z */
  assert.equal(new Date(Number(7528836626521739264n >> 22n)).toISOString(), '2026-11-18T15:08:50.783Z');
  assert.match(due.SCRIPT.linkedin, />> 22n/);
  assert.match(due.SCRIPT.x, /1288834974657n/);
});

test('auto-fill: hourly for 6 hours after the time, then every 6 hours; only Chrome and this CLI', () => {
  const now = Date.parse('2026-11-19T20:00:00Z');
  const fresh = { id: 1, publish_at: '2026-11-19 17:00:00' }, late = { id: 2, publish_at: '2026-11-18 15:00:00' };
  assert.deepEqual(due.toTry([fresh, late], { 1: now - 60_000, 2: now - 3600_000 }, now).map((p) => p.id), [1]);
  assert.deepEqual(due.toTry([late], { 2: now - 7 * 3600_000 }, now).map((p) => p.id), [2]);
  const args = due.claudeArgs();
  assert.ok(args.includes('--chrome') && args.includes('--permission-prompts'));
  assert.equal(args[args.indexOf('--permission-prompts') + 1], 'none');
  assert.ok(args.some((a) => /^Bash\(node .*srlink\.cjs:\*\)$/.test(a)));
  assert.ok(!args.includes('Bash') && !args.includes('Write'));
});
