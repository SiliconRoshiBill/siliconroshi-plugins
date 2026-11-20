// ============================================================
//  due.cjs -- scheduled posts that went out with their link still
//  pending (LinkedIn, X, Rednote ...), filled from the user's own
//  browser without asking them (owner, 2026-11-19).
//
//    node srlink.cjs due                 the list, as JSON
//    node srlink.cjs due --steps         what the AI does for each one
//    node srlink.cjs due --upcoming      scheduled ones not out yet (ids)
//    node srlink.cjs due --missing <id>  the user cancelled it: the card
//                                        is deleted on SRlink
//
//  LinkedIn and X post ids carry their publish time, so the page
//  script below lists the user's posts with exact times; the AI
//  picks the one whose text matches the summary, nearest the
//  scheduled time. Not found: nothing is marked; the next hour
//  looks again, and the server stops listing it after 3 days
//  (owner, 2026-11-19).
//
//  Background fill: the hourly check (sync.cjs) starts a headless
//  Claude in the user's Chrome for due posts, so the link lands
//  within the hour after the scheduled time with no session open.
//  `srlink auto-fill off` stops it.
// ============================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const CLI = path.join(__dirname, 'srlink.cjs');
const BEFORE_MS = 2 * 86400_000;         /* it may go out early, even a day or two */

/* ------------------------------------------------------------
 *  Where the user's own posts are listed, newest first
 * ------------------------------------------------------------ */
const bare = (h) => String(h || '').replace(/^@/, '').replace(/^u\//, '');
const PROFILE = {
  linkedin: () => 'https://www.linkedin.com/in/me/recent-activity/all/',
  x: (h) => h && `https://x.com/${bare(h)}`,
  tiktok: (h) => h && `https://www.tiktok.com/@${bare(h)}`,
  instagram: (h) => h && `https://www.instagram.com/${bare(h)}/`,
  reddit: (h) => h && `https://www.reddit.com/user/${bare(h)}/submitted/`,
  xiaohongshu: (h) => /^https?:/.test(h || '') ? h : null,
};

/* ------------------------------------------------------------
 *  Page scripts: run in the profile page, return [{ url, at, text }]
 *  LinkedIn activity id >> 22 = epoch ms; X status id >> 22 + the
 *  Twitter epoch = epoch ms.
 * ------------------------------------------------------------ */
const SCRIPT = {
  linkedin: `[...new Set(document.documentElement.outerHTML.match(/urn:li:activity:\\d{15,22}/g) || [])].map((u) => {
  let c = document.querySelector('[href*="' + u + '"]');
  for (let i = 0; c && i < 30 && !/^Feed post/.test(c.innerText || ''); i++) c = c.parentElement;
  const text = (c?.innerText || '').replace(/\\s+/g, ' ').replace(/^.*?\\b\\d+(m|h|d|w|mo|yr) • (Edited • )?/, '');
  return { url: 'https://www.linkedin.com/feed/update/' + u + '/', at: new Date(Number(BigInt(u.split(':').pop()) >> 22n)).toISOString(), text: text.slice(0, 240) };
})`,
  x: `[...document.querySelectorAll('article')].map((a) => {
  const me = location.pathname.split('/')[1].toLowerCase();
  const link = [...a.querySelectorAll('a[href*="/status/"]')].map((l) => l.href.match(/^https:\\/\\/x\\.com\\/([^/]+)\\/status\\/(\\d+)$/)).find((m) => m && m[1].toLowerCase() === me);
  if (!link) return null;
  return { url: link[0], at: new Date(Number((BigInt(link[2]) >> 22n) + 1288834974657n)).toISOString(), text: (a.querySelector('[data-testid="tweetText"]')?.innerText || '').slice(0, 240) };
}).filter(Boolean)`,
};

const SCHEDULED = {
  linkedin: 'LinkedIn: on the feed click Start a post, then the clock icon, then View all scheduled posts',
  x: 'X: https://x.com/compose/post/unsent/scheduled',
};

/* ------------------------------------------------------------
 *  The recipe for one post on one platform
 * ------------------------------------------------------------ */
/* From two days before the scheduled time up to now: early, on
 * time or late, it is in there once it is out. */
const utcMs = (t) => Date.parse(String(t).replace(' ', 'T') + (/Z|[+-]\d\d:?\d\d$/.test(t) ? '' : 'Z'));

function timeWindow(publishAt, now = Date.now()) {
  const t = utcMs(publishAt);
  return [new Date(t - BEFORE_MS).toISOString(), new Date(now).toISOString()];
}

function steps(p, platform, handles, localTime) {
  const url = PROFILE[platform]?.(handles?.[platform]);
  const [from, to] = timeWindow(p.publish_at);
  const find = SCRIPT[platform]
    ? `Run this in the page (javascript tool); it lists the user's posts with their real publish times:\n${SCRIPT[platform].replace(/^/gm, '     ')}\n   Pick the one with "at" between ${from} and ${to} whose text matches the summary (it may have been edited); if several match, the one nearest the scheduled time.`
    : `Find the user's post published between ${from} and ${to} whose text matches the summary (nearest the scheduled time if several), and copy its link and publish time.`;
  return [
    `#${p.id} "${p.title}" on ${platform}, due ${localTime(p.publish_at)}`,
    `   Summary: ${p.summary || '(none, match the title)'}`,
    `1. Open ${url || `the user's ${platform} profile`} in the user's own Chrome and let the posts load.`,
    `2. ${find}`,
    `3. Found: node "${CLI}" share --into ${p.id} --title "${p.title.replace(/"/g, '\\"')}" --publish-at <its "at"> --link ${platform}=<url>`,
    `4. Not out yet: open the scheduled posts (${SCHEDULED[platform] || `the ${platform} scheduled-posts list`}). Still scheduled for a new time: node "${CLI}" reschedule ${p.id} --publish-at <that time>`,
    `5. Not found anywhere: do nothing and mark nothing. It is looked for again next hour, and it drops off by itself after 3 days. Only if the user says they cancelled it: node "${CLI}" due --missing ${p.id}`,
  ].join('\n');
}

function allSteps(items, handles, localTime) {
  if (!items.length) return 'Nothing is waiting for a link.';
  const body = items.flatMap((p) => p.platforms.map((pl) => steps(p, pl, handles, localTime)));
  return ['Do these now in the user\'s Chrome, without asking the user first. Report each result in one line.', ...body].join('\n\n');
}

/* ------------------------------------------------------------
 *  Hook note: short, points at --steps
 * ------------------------------------------------------------ */
function hookNote(items, localTime) {
  const list = items.map((p) => `#${p.id} "${p.title}" on ${p.platforms.join(', ')} (scheduled ${localTime(p.publish_at)})`).join('; ');
  return `SRlink: scheduled time passed but no link on SRlink yet: ${list}. ` +
    `Fill them now from the user's own browser, without asking the user: run node "${CLI}" due --steps and follow it. ` +
    'Only if no browser tool can be used here, tell the user in one line.';
}

/* ------------------------------------------------------------
 *  Background fill (owner, 2026-11-19). Hourly for the first 6
 *  hours after the scheduled time, then every 6 hours until the
 *  server stops listing it (3 days). The headless Claude may only
 *  use Chrome and this CLI; anything else is denied.
 * ------------------------------------------------------------ */
const FRESH_MS = 6 * 3600_000;
const LATE_EVERY_MS = 6 * 3600_000;
const RUN_LIMIT_MS = 10 * 60_000;

function toTry(items, tried, now = Date.now()) {
  return items.filter((p) => now - utcMs(p.publish_at) < FRESH_MS || now - (tried[p.id] || 0) >= LATE_EVERY_MS);
}

/* Every claude this machine has (login and interactive shell PATH,
 * nvm, the usual places); the newest one wins, since an old one may
 * lack --chrome. The pick is kept in the config. */
const sh = (args) => { try { return execFileSync(process.env.SHELL || '/bin/zsh', args, { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return ''; } };
const versionOf = (bin) => { try { return (execFileSync(bin, ['--version'], { encoding: 'utf8', timeout: 10_000, env: childEnv() }).match(/\d+\.\d+\.\d+/) || ['0.0.0'])[0]; } catch { return null; } };
const newerVersion = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };

function findClaude(cfg) {
  if (process.env.SRLINK_CLAUDE) return process.env.SRLINK_CLAUDE;
  if (cfg.claudePath && fs.existsSync(cfg.claudePath)) return cfg.claudePath;
  const home = os.homedir(), nvm = path.join(home, '.nvm/versions/node');
  const found = [
    ...(process.platform === 'win32' ? [] : [sh(['-lc', 'command -v claude']), sh(['-ic', 'command -v claude'])]),
    ...(fs.existsSync(nvm) ? fs.readdirSync(nvm).map((v) => path.join(nvm, v, 'bin/claude')) : []),
    path.join(home, '.local/bin/claude'), path.join(home, '.claude/local/claude'), '/opt/homebrew/bin/claude', '/usr/local/bin/claude',
  ].filter((c, i, all) => c && all.indexOf(c) === i && fs.existsSync(c));
  return found.map((bin) => ({ bin, v: versionOf(bin) })).filter((c) => c.v)
    .sort((a, b) => newerVersion(a.v, b.v)).pop()?.bin || null;
}

/* launchd and Task Scheduler start with a bare PATH: a claude that is
 * a node script needs this node on it. */
const childEnv = () => ({ ...process.env, PATH: [path.dirname(process.execPath), process.env.PATH].filter(Boolean).join(path.delimiter) });

const FILL_PROMPT = `Use the srlink skill. Run: node ${CLI} due --steps and follow it in the user's own Chrome ` +
  '(Claude in Chrome tools; load them with ToolSearch first). Open one new tab and close it when done. ' +
  'Only find post links and run the srlink commands the steps give: never post, comment, like, follow or message anyone. ' +
  'At any login, 2FA, captcha or rate-limit page, stop. Reply with one line per post: found <url>, or not found.';

function claudeArgs() {
  return ['-p', FILL_PROMPT, '--chrome', '--model', 'sonnet', '--permission-mode', 'default', '--permission-prompts', 'none',
    '--allowedTools', 'ToolSearch', 'mcp__claude-in-chrome', `Bash(node ${CLI}:*)`, `Bash(node "${CLI}":*)`];
}

/* Called by the hourly check. Returns a log line, or null. */
async function autoFill() {
  const srlink = require('./srlink.cjs');
  const cfg = srlink.loadConfig();
  if (cfg.autoFill === false || !cfg.token) return null;
  const items = toTry((await srlink.due()).due, cfg.fillTried || {});
  if (!items.length) return null;
  const bin = findClaude(cfg);
  if (!bin) return 'auto-fill skipped: Claude Code not found (the next Claude session fills the links)';
  const tried = { ...(cfg.fillTried || {}) };
  items.forEach((p) => { tried[p.id] = Date.now(); });
  srlink.saveConfig({ ...srlink.loadConfig(), claudePath: bin, fillTried: tried });
  try {
    const out = execFileSync(bin, claudeArgs(), { encoding: 'utf8', timeout: RUN_LIMIT_MS, stdio: ['ignore', 'pipe', 'pipe'], env: childEnv() });
    return `auto-fill ${items.map((p) => '#' + p.id).join(' ')}: ${out.trim().split('\n').slice(-5).join(' | ')}`;
  } catch (e) {
    return `auto-fill ${items.map((p) => '#' + p.id).join(' ')} failed: ${String(e.message).split('\n')[0]}`;
  }
}

module.exports = { PROFILE, SCRIPT, SCHEDULED, timeWindow, steps, allSteps, hookNote, toTry, claudeArgs, childEnv, findClaude, autoFill };
