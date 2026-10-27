// ============================================================
//  srlink — SRlink from Claude Code.
//
//  Login works like `wrangler login`: the terminal shows a code
//  and a link; you approve in the browser; a token is saved to
//  ~/.srlink/config.json (mode 600). Nothing posts to any social
//  platform from here: comments are written and posted by you.
//
//  Usage:
//    node srlink.cjs login [--url https://test-site] [--lang en] [--name "Bill's MacBook"]
//    node srlink.cjs logout | status
//    node srlink.cjs share --title T [--summary S] [--publish-at WHEN] --link rednote=URL [--link youtube=URL ...]
//      --publish-at: ISO with an offset/Z is sent as-is; a bare
//      "2026-11-01T19:00:00" (no offset) is read in YOUR OWN local
//      timezone and converted to an absolute UTC instant before it
//      is sent, so the server never re-interprets it as UTC.
//    node srlink.cjs auto-share on|off            plugin hook registers my new posts (default on)
//    node srlink.cjs feed
//    node srlink.cjs mine                        my posts of the last 10 days (to monitor)
//    node srlink.cjs handles [--rednote NAME --youtube @NAME --linkedin NAME --x NAME]
//    node srlink.cjs observed --url URL --platform P [--comment HANDLE[@ISO] ...] [--like HANDLE ...]
//    node srlink.cjs mark <postId> commented|liked|skipped [--off]
//    node srlink.cjs sync                        register my new YouTube videos now
//    node srlink.cjs schedule on|off             ...and every hour on this computer
//
//  Server: the one you logged in to (login --url ...), else SRLINK_URL,
//  else https://www.siliconroshi.ai. Log in again to switch.
// ============================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');

const DIR = process.env.SRLINK_HOME || path.join(os.homedir(), '.srlink');
const CONFIG = path.join(DIR, 'config.json');
const PRODUCTION = 'https://www.siliconroshi.ai';
const trimUrl = (u) => String(u).replace(/\/$/, '');

const PLATFORM_ALIASES = {
  rednote: 'xiaohongshu', xhs: 'xiaohongshu', xiaohongshu: 'xiaohongshu',
  youtube: 'youtube', yt: 'youtube', linkedin: 'linkedin', x: 'x', twitter: 'x',
};
const platformKey = (p) => PLATFORM_ALIASES[String(p || '').toLowerCase()] || 'other';

const HAS_OFFSET = /[Zz]|[+-]\d{2}:?\d{2}$/;

/* A stored SQLite timestamp has no offset ('YYYY-MM-DD HH:MM:SS')
 * and is always UTC; normalize it to something every Date parses
 * as that same instant, regardless of this machine's timezone. */
function toISO(s) {
  if (!s) return s;
  return HAS_OFFSET.test(s) ? s : `${s.includes('T') ? s : s.replace(' ', 'T')}Z`;
}

/* What the user reads: their own machine's timezone, never UTC
 * (see SKILL.md). `timeZoneName: 'short'` prints EST/PST/... so a
 * time is never ambiguous. */
function localTime(s) {
  const d = new Date(toISO(s));
  if (isNaN(+d)) return s;
  return new Intl.DateTimeFormat(undefined, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', timeZoneName: 'short',
  }).format(d);
}

/* A bare "YYYY-MM-DDTHH:mm:ss" (no offset) is, by spec, parsed as
 * local time by Date() -- i.e. THIS machine's local time, which is
 * the caller's own. Convert it to an absolute UTC instant before it
 * crosses the wire: the server has no notion of the caller's zone
 * and would otherwise read the same bare string as UTC. Anything
 * that already carries an offset/Z is left untouched. */
function toAbsoluteISO(raw) {
  if (!raw) return raw;
  if (HAS_OFFSET.test(raw)) return raw;
  const d = new Date(raw);
  return isNaN(+d) ? raw : d.toISOString();
}

function loadConfig() {
  try {
    return JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
  } catch {
    return {};
  }
}

function saveConfig(cfg) {
  fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
  fs.writeFileSync(CONFIG, JSON.stringify(cfg, null, 2), { mode: 0o600 });
}

/* Where requests go: the saved login wins, so the hook (which runs with
 * no extra env) follows whatever server you logged in to. */
function serverUrl() {
  return trimUrl(loadConfig().base || process.env.SRLINK_URL || PRODUCTION);
}

async function api(method, route, body, token, base = serverUrl()) {
  const headers = { 'content-type': 'application/json' };
  if (token) headers.authorization = `Bearer ${token}`;
  const res = await fetch(base + route, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, data };
}

function authed() {
  const cfg = loadConfig();
  if (!cfg.token) throw new Error('Not logged in to SRlink. Run: node srlink.cjs login');
  return cfg.token;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function login(lang, name, url) {
  const base = trimUrl(url || process.env.SRLINK_URL || PRODUCTION);
  const start = await api('POST', '/api/srlink/device/start', { lang, client_name: name || `Claude Code on ${os.hostname()}` }, null, base);
  if (!start.ok) throw new Error(`login start failed: ${start.status} ${JSON.stringify(start.data)}`);
  const s = start.data;
  console.log(`\nOpen this link and approve:\n  ${s.verification_uri_complete}\n\nCode: ${s.user_code}\n`);
  if (process.platform === 'darwin') execFile('open', [s.verification_uri_complete], () => {});
  const deadline = Date.now() + s.expires_in * 1000;
  while (Date.now() < deadline) {
    await sleep(s.interval * 1000);
    const poll = await api('POST', '/api/srlink/device/poll', { device_code: s.device_code }, null, base);
    const st = poll.data.status;
    if (st === 'approved') {
      saveConfig({ ...loadConfig(), base, token: poll.data.access_token, saved_at: new Date().toISOString() });
      return `Logged in to ${base}. Token saved to ${CONFIG}`;
    }
    if (st === 'denied') throw new Error('Login denied in the browser.');
    if (st === 'expired') throw new Error('Code expired. Run login again.');
  }
  throw new Error('Timed out waiting for approval. Run login again.');
}

async function logout() {
  const cfg = loadConfig();
  if (cfg.token) await api('POST', '/api/srlink/tokens', { current: true }, cfg.token).catch(() => {});
  const { token, base, saved_at, ...keep } = cfg;
  if (Object.keys(keep).length) saveConfig(keep); else fs.rmSync(CONFIG, { force: true });
  return 'Logged out.';
}

async function status() {
  const cfg = loadConfig();
  if (!cfg.token) return `Not logged in (server would be ${serverUrl()}).`;
  const r = await api('GET', '/api/srlink/feed', null, cfg.token);
  if (r.status === 401) return 'Token no longer valid. Run login again.';
  return `Logged in to ${cfg.base} as a ${r.data.member ? 'member' : 'user'}; ${r.data.posts?.length ?? 0} posts in SRfeed; auto-share ${cfg.autoShare === false ? 'off' : 'on'}.`;
}

/* links: [{ platform, url }]; platform names may be aliases (rednote, twitter...).
 * publishAt: ISO time for scheduled posts; SRfeed shows them from then on. */
async function share({ title, summary, links, publishAt }) {
  const body = {
    title: String(title || '').trim().slice(0, 150),
    summary: summary ? String(summary).trim().slice(0, 600) : '',
    links: (links || []).map((l) => ({ platform: platformKey(l.platform), url: l.url })),
    publish_at: toAbsoluteISO(publishAt) || undefined,
  };
  const r = await api('POST', '/api/srlink/posts', body, authed());
  if (!r.ok) throw new Error(`share failed: ${r.status} ${r.data.error || ''}`);
  return r.data;
}

async function feed() {
  const r = await api('GET', '/api/srlink/feed', null, authed());
  if (!r.ok) throw new Error(`feed failed: ${r.status} ${r.data.error || ''}`);
  return r.data;
}

async function mine() {
  const d = await feed();
  return d.posts.filter((p) => p.mine).map(({ id, title, links, created_at }) => ({ id, title, links, created_at }));
}

async function handles(f) {
  const body = {};
  for (const [flag, key] of [['rednote', 'xiaohongshu'], ['youtube', 'youtube'], ['linkedin', 'linkedin'], ['x', 'x']]) {
    if (f[flag] !== undefined) body[key] = f[flag] === true ? '' : f[flag];
  }
  const r = Object.keys(body).length
    ? await api('POST', '/api/srlink/handles', body, authed())
    : await api('GET', '/api/srlink/handles', null, authed());
  if (!r.ok) throw new Error(`handles failed: ${r.status} ${r.data.error || ''}`);
  /* the hook reads them offline to spot the user's own post links */
  saveConfig({ ...loadConfig(), handles: r.data.handles });
  return r.data.handles;
}

/* The saved handles, asking the server only when none are cached. */
async function handlesCached() {
  return loadConfig().handles || handles({});
}

/* Who commented on / liked one of my posts, as read on the platform.
 * The server keeps only matches to SRlink members. */
async function observed(url, platform, comments, likes) {
  const items = [
    ...comments.map((c) => { const [handle, at] = String(c).split(/@(?=\d{4}-)/); return { handle, kind: 'comment', at }; }),
    ...likes.map((h) => ({ handle: String(h), kind: 'like' })),
  ];
  const r = await api('POST', '/api/srlink/observed', { url, platform: platformKey(platform), items }, authed());
  if (!r.ok) throw new Error(`observed failed: ${r.status} ${r.data.error || ''}`);
  return r.data;
}

async function mark(postId, action, on) {
  const r = await api('POST', '/api/srlink/interact', { postId: Number(postId), action, on }, authed());
  if (!r.ok) throw new Error(`mark failed: ${r.status} ${r.data.error || ''}`);
  return r.data;
}

/* The plugin hook stays silent unless this is on. */
function autoShare(mode) {
  if (mode !== 'on' && mode !== 'off') {
    return `Auto-share is ${loadConfig().autoShare === false ? 'off' : 'on'}. Use: auto-share on|off`;
  }
  saveConfig({ ...loadConfig(), autoShare: mode === 'on' });
  return `Auto-share ${mode}.`;
}

function flags(argv) {
  const out = { _: [], link: [], comment: [], like: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    if (key === 'link' || key === 'comment' || key === 'like') out[key].push(val); else out[key] = val;
  }
  return out;
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  const f = flags(rest);
  if (cmd === 'login') return console.log(await login(f.lang === 'en' ? 'en' : 'zh', f.name, f.url));
  if (cmd === 'logout') return console.log(await logout());
  if (cmd === 'status') return console.log(await status());
  if (cmd === 'share') {
    const links = f.link.map((s) => ({ platform: s.split('=')[0], url: s.slice(s.indexOf('=') + 1) }));
    return console.log(JSON.stringify(await share({ title: f.title, summary: f.summary, links, publishAt: f['publish-at'] })));
  }
  if (cmd === 'auto-share') return console.log(autoShare(f._[0]));
  /* `created_at` stays ISO (machine-readable); `created_at_local` is
   * added for a human reading the terminal, in THEIR OWN timezone. */
  if (cmd === 'feed') {
    const d = await feed();
    const posts = d.posts.map((p) => ({ ...p, created_at_local: localTime(p.created_at) }));
    return console.log(JSON.stringify({ ...d, posts }, null, 2));
  }
  if (cmd === 'mine') {
    const posts = (await mine()).map((p) => ({ ...p, created_at_local: localTime(p.created_at) }));
    return console.log(JSON.stringify(posts, null, 2));
  }
  if (cmd === 'handles') return console.log(JSON.stringify(await handles(f)));
  if (cmd === 'observed') return console.log(JSON.stringify(await observed(f.url, f.platform, f.comment, f.like)));
  if (cmd === 'mark') return console.log(JSON.stringify(await mark(f._[0], f._[1], f.off !== true)));
  if (cmd === 'sync') return require('./sync.cjs').run(rest);
  if (cmd === 'schedule') return require('./sync.cjs').run(['schedule', ...rest]);
  throw new Error('usage: srlink.cjs login | logout | status | share | feed | mine | handles | observed | mark | auto-share | sync | schedule');
}

module.exports = { share, feed, handles, handlesCached, platformKey, loadConfig, saveConfig, DIR, toISO, localTime, toAbsoluteISO };

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
