const test = require('node:test');
const assert = require('node:assert/strict');
const { detectPosts, recordFor } = require('./hook.cjs');

test('detectPosts: finds new post links from each platform in tool output', () => {
  const out = 'done https://youtu.be/abcdefghijk and https://www.xiaohongshu.com/explore/0123456789abcdef01234567 ' +
    'https://www.linkedin.com/feed/update/urn:li:activity:7123456789 https://x.com/bill/status/123456';
  assert.deepEqual(detectPosts('', out).map((p) => p.platform), ['youtube', 'rednote', 'linkedin', 'x']);
});

test('detectPosts: a link that was in the tool input (just viewed) is not a new post', () => {
  const url = 'https://www.youtube.com/watch?v=abcdefghijk';
  assert.deepEqual(detectPosts(`{"url":"${url}"}`, `navigated to ${url}`), []);
});

test('detectPosts: ignores channel pages and duplicates', () => {
  const out = 'https://www.youtube.com/@SiliconRoshi https://youtu.be/abcdefghijk https://youtu.be/abcdefghijk';
  assert.equal(detectPosts('', out).length, 1);
});

test('recordFor: finds title and schedule in JSON printed by any uploader, whatever its key names', () => {
  const url = 'https://youtu.be/abcdefghijk';
  const out = `done {"result":{"video_url":"${url}","name":"My talk","scheduled_at":"2026-11-01T19:00:00-07:00"}}`;
  assert.deepEqual(recordFor(out, url), { title: 'My talk', publishAt: '2026-11-01T19:00:00-07:00', label: '2026-11-01T19:00:00-07:00' });
});

test('recordFor: a bare link with no structured record returns null (Claude fills the title)', () => {
  assert.equal(recordFor('posted https://x.com/a/status/1', 'https://x.com/a/status/1'), null);
});

test('recordFor: JSON printed inside a tool envelope is still read', () => {
  const url = 'https://youtu.be/abcdefghijk';
  const out = `{"stdout":"{"url":"${url}","title":"Printed"}"}`;
  assert.equal(recordFor(out, url).title, 'Printed');
});

test('detectPosts: rednote.com note links count as rednote', () => {
  assert.equal(detectPosts('', 'https://www.rednote.com/explore/0123456789abcdef01234567')[0].platform, 'rednote');
});

test('detectPosts: a bare /<own handle>/status/<id> path from a Chrome page counts as the user\'s X post', () => {
  const out = '- ref_107: link "5 seconds ago" (href="/SiliconRoshi/status/2114306353309311320")';
  assert.deepEqual(detectPosts('', out, { x: 'siliconroshi' }),
    [{ url: 'https://x.com/SiliconRoshi/status/2114306353309311320', platform: 'x' }]);
});

test('detectPosts: bare status paths of other accounts, or with no X handle saved, are ignored', () => {
  const out = 'href="/otheruser/status/2000000000000000001" href="/SiliconRoshi/status/1"';
  assert.equal(detectPosts('', out, { x: 'someoneelse' }).length, 0);
  assert.equal(detectPosts('', out).length, 0);
});

test('handle: on by default once logged in; silent before login and after auto-share off', async () => {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'srlink-test-'));
  process.env.SRLINK_HOME = home;
  for (const k of Object.keys(require.cache)) if (/srlink\.cjs$|hook\.cjs$/.test(k)) delete require.cache[k];
  const hook = require('./hook.cjs');
  const event = { tool_input: {}, tool_response: { stdout: 'published https://youtu.be/abcdefghijk' } };
  assert.equal(await hook.handle(event), null);                       /* no config: silent */
  fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify({ autoShare: true }));
  assert.match(await hook.handle(event), /not logged in/);
  fs.writeFileSync(path.join(home, 'config.json'), JSON.stringify({ token: 't', autoShare: false }));
  assert.equal(await hook.handle(event), null);                       /* explicitly off */
  fs.rmSync(home, { recursive: true, force: true });
});
