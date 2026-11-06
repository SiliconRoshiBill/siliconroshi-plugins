// ============================================================
//  install.cjs -- setup links the skill into every AI found,
//  leaves plugin AIs to their plugin, never touches another
//  skill, and removes only what it made. Runs in a temp HOME.
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = fs.mkdtempSync(path.join(os.tmpdir(), 'srlink-install-'));
process.env.HOME = HOME;
process.env.USERPROFILE = HOME;
process.env.SRLINK_HOME = path.join(HOME, '.srlink');
const install = require('./install.cjs');

const at = (p) => path.join(HOME, p);
const mk = (p) => fs.mkdirSync(at(p), { recursive: true });
const skillOf = (dir) => fs.readFileSync(path.join(at(dir), 'srlink', 'SKILL.md'), 'utf8');

test('setup: links every AI found, skips AIs not on this computer', () => {
  ['.cursor', '.copilot', '.workbuddy', '.grok', '.gemini'].forEach(mk);
  const { rows } = install.setup();
  assert.deepEqual(rows.map((r) => [r.agent, r.how]), [
    ['gemini-cli', 'linked'], ['cursor', 'linked'], ['github-copilot', 'linked'], ['workbuddy', 'linked'], ['grok', 'linked'],
  ]);
  for (const d of ['.cursor/skills', '.copilot/skills', '.workbuddy/skills', '.grok/skills']) assert.match(skillOf(d), /^name: srlink$/m);
  assert.ok(fs.lstatSync(at('.cursor/skills/srlink')).isSymbolicLink());
});

test('setup: an AI with the plugin keeps only the plugin (no second copy)', () => {
  mk('.gemini/extensions/srlink');
  mk('.claude/plugins');
  fs.writeFileSync(at('.claude/plugins/installed_plugins.json'), '{"plugins":{"srlink@siliconroshi":[]}}');
  const { rows } = install.setup();
  assert.equal(rows.find((r) => r.agent === 'gemini-cli').how, 'plugin');
  assert.equal(rows.find((r) => r.agent === 'claude-code').how, 'plugin');
  assert.equal(fs.existsSync(at('.gemini/skills/srlink')), false, 'the earlier link is gone');
  assert.equal(fs.existsSync(at('.claude/skills/srlink')), false);
});

test('setup: never overwrites someone else\'s skill named srlink', () => {
  mk('.codeium/windsurf/skills/srlink');
  fs.writeFileSync(at('.codeium/windsurf/skills/srlink/SKILL.md'), '---\nname: other\n---\n');
  const row = install.setup().rows.find((r) => r.agent === 'windsurf');
  assert.match(row.how, /^not linked/);
  assert.match(fs.readFileSync(at('.codeium/windsurf/skills/srlink/SKILL.md'), 'utf8'), /name: other/);
});

test('skill link: an AI not in the table', () => {
  assert.match(install.run(['link', path.join(HOME, 'my-ai', 'skills')]), /linked$/);
  assert.match(skillOf('my-ai/skills'), /^name: srlink$/m);
});

test('report: one row per AI, next step when logged out', () => {
  const text = install.report(install.setup());
  assert.match(text, /\| cursor \| skill linked \|/);
  assert.match(text, /\| claude-code \| plugin \(with the auto-share hook\) \|/);
  assert.match(text, /log in to SRlink/);
});

test('update: a source that no longer exists keeps the current copy', () => {
  fs.writeFileSync(path.join(process.env.SRLINK_HOME, 'skill-source'), path.join(HOME, 'gone') + '\n');
  install.run(['update']);
  assert.match(fs.readFileSync(path.join(install.COPY, 'SKILL.md'), 'utf8'), /^name: srlink$/m);
});

test('remove: dry run changes nothing; remove takes only our links and copy', () => {
  assert.match(install.remove(true), /Would remove:[\s\S]*\.cursor/);
  assert.ok(fs.existsSync(at('.cursor/skills/srlink')));
  install.remove(false);
  for (const d of ['.cursor', '.copilot', '.workbuddy', '.grok', 'my-ai']) assert.equal(fs.existsSync(at(`${d}/skills/srlink`)), false);
  assert.equal(fs.existsSync(install.COPY), false);
  assert.ok(fs.existsSync(at('.codeium/windsurf/skills/srlink/SKILL.md')), 'the other skill stays');
});

test.after(() => fs.rmSync(HOME, { recursive: true, force: true }));
