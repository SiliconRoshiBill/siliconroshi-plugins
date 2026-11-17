// ============================================================
//  due: a scheduled post that went out with its link still pending
//  is mentioned by the hook, once an hour (owner, 2026-11-17).
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'srlink-due-'));
process.env.SRLINK_HOME = home;
const { handle } = require('./hook.cjs');

test('hook: a went-out post with no link is mentioned once, with the --into command', async () => {
  fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify({ token: 't', autoShare: true }));
  fs.writeFileSync(path.join(home, 'due.json'), JSON.stringify({
    checked_at: new Date().toISOString(),
    due: [{ id: 91, title: 'Stay in the driver seat', publish_at: '2026-11-18 15:00:00', platforms: ['linkedin'] }],
  }));
  const event = { tool_name: 'Bash', tool_input: { command: 'ls' }, tool_response: { stdout: 'a.txt' } };
  const first = await handle(event);
  assert.match(first, /#91 "Stay in the driver seat" on linkedin/);
  assert.match(first, /share --into <id>/);
  assert.equal(await handle(event), null);   /* not again within the hour */
});
