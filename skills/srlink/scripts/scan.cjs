// ============================================================
//  scan.cjs -- find my YouTube videos in my own Claude Code sessions.
//
//    node scan.cjs              scan now (also part of the background run)
//    node scan.cjs on|off       opt in / out (asked once at setup)
//
//  Reads ~/.claude/projects/**/*.jsonl changed since the last scan,
//  on this computer only, and keeps nothing but YouTube links. Links
//  SRlink already has are dropped (POST /api/srlink/known). A video is
//  checked without a browser: oEmbed says who uploaded it; mine ->
//  registered with title, summary, publish time.
//  Other platforms are not queued any more (owner, 2026-11-08: no
//  backfill). A post on them reaches SRlink when it is published in a
//  session (hook.cjs), or through Submit manually on srlink.app.
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

/* Only public videos belong on SRlink. oEmbed also answers for
 * unlisted videos (class recordings, owner 2026-10-28), so read the
 * watch page: unlisted or not playable (private, removed) is not public. */
async function youtubePublic(id) {
  const html = await (await fetch(`https://www.youtube.com/watch?v=${id}`, { headers: UA })).text();
  return /"isUnlisted":false/.test(html) && /"playabilityStatus":\{"status":"OK"/.test(html) ? html : null;
}

async function youtubeIfMine(url, handle) {
  const id = videoId(url);
  const o = await fetch(`https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${id}&format=json`, { headers: UA });
  if (!o.ok) return null;
  const { author_url: author } = await o.json();
  const channel = loadConfig().youtubeChannel?.id;
  if (!sameHandle(author, handle) && !(channel && author.endsWith(channel))) return null;
  const html = await youtubePublic(id);
  if (!html) return { id, notPublic: true };
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
  /* The old queue of other platforms' links is dropped (no backfill). */
  for (const [key, c] of Object.entries(candidates)) if (c.status === 'pending') delete candidates[key];
  const fresh = new Map();
  for (const file of sessionFiles(since)) {
    for (const [key, link] of linksIn(fs.readFileSync(file, 'utf8'))) {
      if (link.platform === 'youtube' && !candidates[key]) fresh.set(key, link);
    }
  }
  const have = new Set(fresh.size ? await known([...fresh.values()].map((l) => l.url)) : []);
  const handle = (await handlesCached()).youtube;
  const added = [];
  const failed = [];
  const tooOld = (iso) => iso && Date.parse(iso) < Date.now() - MAX_AGE_DAYS * 86400000;
  for (const [key, { url, platform }] of fresh) {
    const entry = (status) => { candidates[key] = { url, platform, status, seen: started }; };
    if (have.has(url)) { entry('registered'); continue; }
    const v = handle ? await youtubeIfMine(url, handle).catch(() => null) : null;
    if (!v) { entry('not-mine'); continue; }
    if (v.notPublic) { entry('not-public'); continue; }
    if (tooOld(v.published)) { entry('old'); continue; }
    /* A failed share (rate limit, network) leaves no record, so the
     * next run tries this video again; the rest of the scan goes on. */
    const r = await share({ title: v.title, summary: summaryOf(v.description), publishAt: v.published || undefined,
      links: [{ platform: 'youtube', url: `https://www.youtube.com/watch?v=${v.id}` }] }).catch((e) => ({ error: e.message }));
    if (r.error) { failed.push(r.error); continue; }
    entry('registered');
    if (!r.existing) added.push({ id: r.id, title: v.title });
  }
  saveCandidates(candidates);
  saveConfig({ ...loadConfig(), lastScan: started });
  return { scanned: fresh.size, added, ...(failed.length ? { retryLater: failed.length, error: failed[0] } : {}) };
}

function toggle(mode) {
  saveConfig({ ...loadConfig(), scanSessions: mode === 'on' });
  return `Session scan ${mode}.`;
}

async function run(argv) {
  const [cmd] = argv;
  if (cmd === 'on' || cmd === 'off') return console.log(toggle(cmd));
  console.log(`${new Date().toISOString()} scan ${JSON.stringify(await scan())}`);
}

module.exports = { linksIn, sameHandle, youtubePublic, scan, run };

if (require.main === module) run(process.argv.slice(2)).catch((e) => { console.error(`scan failed: ${e.message}`); process.exit(1); });
