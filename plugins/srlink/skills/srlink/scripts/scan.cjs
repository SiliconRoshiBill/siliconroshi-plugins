// ============================================================
//  scan.cjs -- find my posts in my own Claude Code sessions.
//
//    node scan.cjs              scan now (also part of the hourly run)
//    node scan.cjs on|off       opt in / out (asked once at setup)
//    node scan.cjs list         candidates still waiting for Claude
//    node scan.cjs mark <url> registered|not-mine|old
//
//  Reads ~/.claude/projects/**/*.jsonl changed since the last scan,
//  on this computer only, and keeps nothing but post links. Links
//  SRlink already has are dropped (POST /api/srlink/known). Then:
//    YouTube   checked without a browser: oEmbed says who uploaded it;
//              mine -> registered with title, summary, publish time.
//    others    queued as candidates; the SessionStart hook asks Claude
//              to open each in Chrome, confirm the author is the user,
//              read it, and register it (or mark it not-mine).
// ============================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const { share, known, handlesCached, loadConfig, saveConfig, DIR } = require('./srlink.cjs');
const { POST_PATTERNS } = require('./hook.cjs');
const { cleanTitle, summaryOf } = require('./sync.cjs');

const PROJECTS = path.join(os.homedir(), '.claude', 'projects');
const CANDIDATES = path.join(DIR, 'candidates.json');
/* The first scan looks back one day only (Bill, 2026-10-27); after
 * that each run reads what changed since the last one. */
const FIRST_SCAN_HOURS = 24;
/* Only posts published in the feed's window are worth registering. */
const MAX_AGE_DAYS = 30;
const UA = { 'user-agent': 'Mozilla/5.0 (srlink-scan)' };

const readJson = (f, fallback) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return fallback; } };
const loadCandidates = () => readJson(CANDIDATES, {});
const saveCandidates = (c) => fs.writeFileSync(CANDIDATES, JSON.stringify(c, null, 2), { mode: 0o600 });

/* ------------------------------------------------------------
 *  Session files -> post links
 * ------------------------------------------------------------ */
function sessionFiles(sinceMs) {
  if (!fs.existsSync(PROJECTS)) return [];
  return fs.readdirSync(PROJECTS).flatMap((dir) => {
    const full = path.join(PROJECTS, dir);
    if (!fs.statSync(full).isDirectory()) return [];
    return fs.readdirSync(full).filter((f) => f.endsWith('.jsonl')).map((f) => path.join(full, f))
      .filter((f) => fs.statSync(f).mtimeMs > sinceMs);
  });
}

/* One candidate per post: a Rednote note seen bare and with its share
 * token is one note (the tokened URL wins); everything else by URL. */
const noteId = (url) => (url.match(/(?:xiaohongshu|rednote)\.com\/(?:explore|discovery\/item)\/([0-9a-f]{24})/) || [])[1];
const postKey = (url) => noteId(url) ? `rednote:${noteId(url)}` : url;

/* JSON escapes "&" and "/" inside the transcript; undo that, then match.
 * Returns key -> { url, platform }. */
function linksIn(text) {
  const plain = text.replace(/\\u0026/g, '&').replace(/\\\//g, '/');
  const found = new Map();
  for (const [platform, re] of POST_PATTERNS) {
    for (const raw of plain.match(new RegExp(re.source, 'g')) || []) {
      const url = raw.replace(/[.,)\]}>'"]+$/, '');
      const prev = found.get(postKey(url));
      if (!prev || (!prev.url.includes('xsec_token') && url.includes('xsec_token'))) found.set(postKey(url), { url, platform });
    }
  }
  return found;
}

/* ------------------------------------------------------------
 *  YouTube: whose video, and its details (no browser needed)
 * ------------------------------------------------------------ */
const videoId = (url) => (url.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/)([\w-]{11})/) || [])[1];
const sameHandle = (a, b) => String(a || '').replace(/^.*\//, '').replace(/^@/, '').toLowerCase()
  === String(b || '').replace(/^.*\//, '').replace(/^@/, '').toLowerCase();

async function youtubeIfMine(url, handle) {
  const id = videoId(url);
  const o = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`, { headers: UA });
  if (!o.ok) return null;
  const { author_url: author } = await o.json();
  const channel = loadConfig().youtubeChannel?.id;
  if (!sameHandle(author, handle) && !(channel && author.endsWith(channel))) return null;
  const html = await (await fetch(`https://www.youtube.com/watch?v=${id}`, { headers: UA })).text();
  const pick = (re) => { const m = html.match(re); return m ? JSON.parse(`"${m[1]}"`) : ''; };
  return {
    id,
    title: cleanTitle(pick(/"title":\{"simpleText":"((?:[^"\\]|\\.)*)"/) || pick(/<meta name="title" content="([^"]*)"/)),
    description: pick(/"shortDescription":"((?:[^"\\]|\\.)*)"/),
    published: pick(/"publishDate":"([^"]+)"/),
  };
}

/* ------------------------------------------------------------
 *  One scan
 * ------------------------------------------------------------ */
async function scan() {
  const cfg = loadConfig();
  if (!cfg.scanSessions) return { skipped: 'session scan is off (srlink scan on)' };
  const since = cfg.lastScan ? Date.parse(cfg.lastScan) : Date.now() - FIRST_SCAN_HOURS * 3600000;
  const started = new Date().toISOString();
  const candidates = loadCandidates();
  const fresh = new Map();
  for (const file of sessionFiles(since)) {
    for (const [key, link] of linksIn(fs.readFileSync(file, 'utf8'))) {
      const old = candidates[key];
      if (!old || (old.status === 'pending' && !old.url.includes('xsec_token') && link.url.includes('xsec_token'))) fresh.set(key, link);
    }
  }
  const have = new Set(fresh.size ? await known([...fresh.values()].map((l) => l.url)) : []);
  const handle = (await handlesCached()).youtube;
  const added = [];
  const tooOld = (iso) => iso && Date.parse(iso) < Date.now() - MAX_AGE_DAYS * 86400000;
  for (const [key, { url, platform }] of fresh) {
    const entry = (status) => { candidates[key] = { url, platform, status, seen: started }; };
    if (have.has(url)) { entry('registered'); continue; }
    if (platform !== 'youtube') { entry('pending'); continue; }
    const v = handle ? await youtubeIfMine(url, handle).catch(() => null) : null;
    if (!v) { entry('not-mine'); continue; }
    if (tooOld(v.published)) { entry('old'); continue; }
    const r = await share({ title: v.title, summary: summaryOf(v.description), publishAt: v.published || undefined,
      links: [{ platform: 'youtube', url: `https://www.youtube.com/watch?v=${v.id}` }] });
    entry('registered');
    if (!r.existing) added.push({ id: r.id, title: v.title });
  }
  saveCandidates(candidates);
  saveConfig({ ...loadConfig(), lastScan: started });
  return { scanned: fresh.size, added, pending: pending().length };
}

const pending = () => Object.values(loadCandidates()).filter((c) => c.status === 'pending')
  .map(({ url, platform }) => ({ url, platform }));

function mark(url, status) {
  if (!['registered', 'not-mine', 'old'].includes(status)) return 'Use: mark <url> registered|not-mine|old';
  const c = loadCandidates();
  const key = postKey(url);
  if (!c[key]) return `not a candidate: ${url}`;
  c[key].status = status;
  saveCandidates(c);
  return `${url} -> ${status}`;
}

function toggle(mode) {
  saveConfig({ ...loadConfig(), scanSessions: mode === 'on' });
  return `Session scan ${mode}.`;
}

async function run(argv) {
  const [cmd, a, b] = argv;
  if (cmd === 'on' || cmd === 'off') return console.log(toggle(cmd));
  if (cmd === 'list') return console.log(JSON.stringify(pending(), null, 2));
  if (cmd === 'mark') return console.log(mark(a, b));
  console.log(`${new Date().toISOString()} scan ${JSON.stringify(await scan())}`);
}

module.exports = { linksIn, sameHandle, pending, scan, run };

if (require.main === module) run(process.argv.slice(2)).catch((e) => { console.error(`scan failed: ${e.message}`); process.exit(1); });
