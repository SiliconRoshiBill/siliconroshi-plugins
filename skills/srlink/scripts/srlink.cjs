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
//    node srlink.cjs share --title T [--summary S] [--publish-at ISO] --link rednote=URL [--link youtube=URL ...]
//    node srlink.cjs auto-share on|off            plugin hook registers my new posts (default on)
//    node srlink.cjs feed
//    node srlink.cjs mine                        my posts of the last 10 days (to monitor)
//    node srlink.cjs handles [--rednote NAME --youtube @NAME --linkedin NAME --x NAME]
//    node srlink.cjs observed --url URL --platform P [--comment HANDLE[@ISO] ...] [--like HANDLE ...]
//    node srlink.cjs mark <postId> commented|liked|skipped [--off]
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
    publish_at: publishAt || undefined,
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
  if (cmd === 'feed') return console.log(JSON.stringify(await feed(), null, 2));
  if (cmd === 'mine') return console.log(JSON.stringify(await mine(), null, 2));
  if (cmd === 'handles') return console.log(JSON.stringify(await handles(f)));
  if (cmd === 'observed') return console.log(JSON.stringify(await observed(f.url, f.platform, f.comment, f.like)));
  if (cmd === 'mark') return console.log(JSON.stringify(await mark(f._[0], f._[1], f.off !== true)));
  throw new Error('usage: srlink.cjs login | logout | status | share | feed | mine | handles | observed | mark | auto-share');
}

module.exports = { share, feed, platformKey, loadConfig, DIR };

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
