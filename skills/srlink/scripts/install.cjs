// ============================================================
//  install.cjs -- one skill, every AI on this computer.
//
//  One real copy lives in ~/.srlink/skill; each AI's skills
//  folder gets a link to it. An AI that already has SRlink as a
//  plugin or extension (Claude Code, Codex, Gemini CLI) is left
//  to that plugin, which also carries the auto-share hook: a
//  second copy would show the skill twice.
//
//    srlink setup                 copy + link into every AI found
//    srlink skill                 where it is installed now
//    srlink skill link <folder>   link into an AI not in the table
//    srlink skill remove [--dry-run]
//    srlink update                pull the source, then setup
// ============================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const NAME = 'srlink';
const HOME = os.homedir();
const DIR = process.env.SRLINK_HOME || path.join(HOME, '.srlink');
const COPY = path.join(DIR, 'skill');
const SOURCE_FILE = path.join(DIR, 'skill-source');
const SOURCE = path.resolve(__dirname, '..');

const has = (file, text) => { try { return fs.readFileSync(file, 'utf8').includes(text); } catch { return false; } };
const home = (p) => path.join(HOME, p);

/* name, config folder that proves the AI is installed, its skills
 * folder, and when SRlink is already there natively (or null). */
const AGENTS = [
  ['claude-code', '.claude', '.claude/skills', () => has(home('.claude/plugins/installed_plugins.json'), '"srlink@')],
  ['codex', '.codex', '.agents/skills', () => has(home('.codex/config.toml'), 'plugins."srlink@')],
  ['gemini-cli', '.gemini', '.gemini/skills', () => fs.existsSync(home('.gemini/extensions/srlink'))],
  ['cursor', '.cursor', '.cursor/skills', null],
  ['github-copilot', '.copilot', '.copilot/skills', null],
  ['windsurf', '.codeium/windsurf', '.codeium/windsurf/skills', null],
  ['opencode', '.config/opencode', '.config/opencode/skills', null],
  ['workbuddy', '.workbuddy', '.workbuddy/skills', null],
  ['grok', '.grok', '.grok/skills', null],
].map(([name, config, skills, native]) => ({ name, config: home(config), skills: home(skills), native: native || (() => false) }));

/* A folder whose SKILL.md says `name: srlink` is ours. */
function isOurs(dir) {
  return /^name:\s*srlink\s*$/m.test(fs.existsSync(path.join(dir, 'SKILL.md')) ? fs.readFileSync(path.join(dir, 'SKILL.md'), 'utf8') : '');
}

function files(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p, base) : [path.relative(base, p)];
  }).sort();
}

function sameTree(a, b) {
  if (!fs.existsSync(a) || !fs.existsSync(b)) return false;
  const fa = files(a);
  const fb = files(b);
  return fa.join('\n') === fb.join('\n') && fa.every((f) => fs.readFileSync(path.join(a, f)).equals(fs.readFileSync(path.join(b, f))));
}

/* ~/.srlink/skill = the folder this script runs from. Running from
 * the copy itself (srlink update) changes nothing here. */
function copySkill(src = SOURCE) {
  if (!fs.existsSync(path.join(src, 'SKILL.md'))) return false; // source gone: keep the copy we have
  if (path.resolve(src) === path.resolve(COPY) || sameTree(src, COPY)) return false;
  fs.rmSync(COPY, { recursive: true, force: true });
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  fs.cpSync(src, COPY, { recursive: true });
  fs.writeFileSync(SOURCE_FILE, src + '\n');
  return true;
}

/* What is at <skills>/srlink now: missing, our link, or someone else's. */
function stateOf(target) {
  let st;
  try { st = fs.lstatSync(target); } catch { return 'missing'; }
  if (!st.isSymbolicLink()) return isOurs(target) ? 'stale-copy' : 'foreign';
  const to = path.resolve(path.dirname(target), fs.readlinkSync(target));
  if (to === path.resolve(COPY)) return 'linked';
  return !fs.existsSync(to) || isOurs(to) ? 'stale-link' : 'foreign';
}

function link(skillsDir) {
  const target = path.join(skillsDir, NAME);
  const state = stateOf(target);
  if (state === 'linked') return 'linked';
  if (state === 'foreign') return `not linked: ${target} is another skill`;
  fs.mkdirSync(skillsDir, { recursive: true });
  fs.rmSync(target, { recursive: true, force: true });
  fs.symlinkSync(COPY, target, process.platform === 'win32' ? 'junction' : 'dir');
  return 'linked';
}

function unlink(skillsDir) {
  const target = path.join(skillsDir, NAME);
  if (!['linked', 'stale-link'].includes(stateOf(target))) return false;
  fs.rmSync(target, { recursive: true, force: true });
  return true;
}

/* One row per AI found on this computer: what setup did there. */
function setup() {
  const copied = copySkill();
  const rows = AGENTS.filter((a) => fs.existsSync(a.config)).map((a) => {
    if (!a.native()) return { agent: a.name, how: link(a.skills), path: path.join(a.skills, NAME) };
    unlink(a.skills); // the plugin's copy wins; never show the skill twice
    return { agent: a.name, how: 'plugin', path: null };
  });
  return { copy: COPY, copied, rows, extra: extraLinks() };
}

/* Links made by `skill link <folder>` for AIs not in the table. */
function extraLinks() {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, 'skill-links.json'), 'utf8')); } catch { return []; }
}

function linkExtra(folder) {
  const dir = path.resolve(folder.replace(/^~(?=$|[\\/])/, HOME));
  const skillsDir = path.basename(dir) === NAME ? path.dirname(dir) : dir;
  copySkill();
  const how = link(skillsDir);
  if (how === 'linked') fs.writeFileSync(path.join(DIR, 'skill-links.json'), JSON.stringify([...new Set([...extraLinks(), skillsDir])], null, 2));
  return `${path.join(skillsDir, NAME)}: ${how}`;
}

function remove(dryRun) {
  const dirs = [...AGENTS.map((a) => a.skills), ...extraLinks()];
  const links = dirs.map((d) => path.join(d, NAME)).filter((t) => ['linked', 'stale-link'].includes(stateOf(t)));
  const doomed = [...links, ...(fs.existsSync(COPY) ? [COPY] : [])];
  if (!dryRun) {
    dirs.forEach(unlink);
    fs.rmSync(COPY, { recursive: true, force: true });
    fs.rmSync(path.join(DIR, 'skill-links.json'), { force: true });
  }
  const head = dryRun ? 'Would remove:' : 'Removed:';
  return doomed.length ? [head, ...doomed.map((p) => `  ${p}`), 'Login, settings and plugins are untouched.'].join('\n') : 'Nothing to remove.';
}

/* Pull the source checkout when there is one, then set up again. */
function update() {
  const src = fs.existsSync(SOURCE_FILE) ? fs.readFileSync(SOURCE_FILE, 'utf8').trim() : SOURCE;
  const repo = (() => { try { return execFileSync('git', ['-C', src, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim(); } catch { return null; } })();
  if (repo) execFileSync('git', ['-C', repo, 'pull', '--ff-only', '--quiet'], { stdio: 'inherit' });
  copySkill(src);
  return report(setup(), repo ? `Pulled ${repo}.` : 'Installed from a plugin: the plugin updates it (claude plugin update srlink@siliconroshi).');
}

/* Session start in a plugin AI: keep the shared copy at the plugin's version. */
function refresh() {
  return fs.existsSync(COPY) && copySkill();
}

const HOW = {
  linked: 'skill linked',
  plugin: 'plugin (with the auto-share hook)',
};

/* The installation report: the agent shows it to the user as is. */
function report({ rows, extra }, lead = '') {
  const lines = rows.map((r) => `| ${r.agent} | ${HOW[r.how] || r.how} |`);
  const more = extra.map((d) => `| ${d} | skill linked |`);
  const loggedIn = (() => { try { return Boolean(JSON.parse(fs.readFileSync(path.join(DIR, 'config.json'), 'utf8')).token); } catch { return false; } })();
  return [
    ...(lead ? [lead, ''] : []),
    `**SRlink skill installed for ${rows.length + extra.length} AI(s) on this computer.**`,
    '',
    '| AI | How |',
    '|---|---|',
    ...lines, ...more,
    '',
    'All of them share one login and settings in `~/.srlink/`. Open a new session in each AI to load the skill.',
    loggedIn ? 'Already logged in.' : 'Next: say "log in to SRlink".',
  ].join('\n');
}

function status() {
  const rows = AGENTS.filter((a) => fs.existsSync(a.config)).map((a) => ({
    agent: a.name,
    how: a.native() ? 'plugin' : (stateOf(path.join(a.skills, NAME)) === 'linked' ? 'linked' : 'not installed (run srlink setup)'),
  }));
  return report({ rows, extra: extraLinks() });
}

function run([sub, ...rest]) {
  if (sub === 'setup') return report(setup());
  if (sub === 'update') return update();
  if (sub === undefined) return status();
  if (sub === 'link' && rest[0]) return linkExtra(rest[0]);
  if (sub === 'remove') return remove(rest.includes('--dry-run'));
  throw new Error('usage: srlink skill [link <skills folder> | remove [--dry-run]]');
}

module.exports = { AGENTS, run, setup, refresh, remove, report, stateOf, COPY };
