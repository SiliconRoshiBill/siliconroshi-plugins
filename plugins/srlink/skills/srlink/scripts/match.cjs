// ============================================================
//  match.cjs -- fill in a reader's missing handle from their comment.
//
//    node match.cjs                 check now (also part of the hourly run)
//    node match.cjs claim <postId> <personId> <platform> <handle>
//
//  SRlink keeps the comment a reader took from the feed. For my posts,
//  the server lists those whose writer has no handle on that platform
//  (GET /api/srlink/unmatched). YouTube: read the video's public
//  comments (no browser, no key), find the one that reads the same,
//  and report who wrote it (POST /api/srlink/unmatched). The server
//  refuses a handle someone already uses, so my own never lands on a
//  reader. Rednote / LinkedIn / X need a browser: they wait for Claude
//  at the next session start (session-start.cjs).
// ============================================================

const { api, authed, handlesCached } = require('./srlink.cjs');

const UA = { 'user-agent': 'Mozilla/5.0 (srlink-match)', 'accept-language': 'en' };
const SAME = 0.8;
const MAX_PAGES = 5;

/* Same text after punctuation and spacing: identical, or most of the
 * two-character pieces shared (Dice). Readers may tweak a draft. */
const squash = (s) => String(s).toLowerCase().replace(/[\s\p{P}\p{S}]/gu, '');
function similarity(a, b) {
  const x = squash(a), y = squash(b);
  if (x === y) return 1;
  const count = (s) => { const m = new Map(); for (let i = 0; i < s.length - 1; i++) m.set(s.slice(i, i + 2), (m.get(s.slice(i, i + 2)) || 0) + 1); return m; };
  const px = count(x), py = count(y);
  let common = 0;
  for (const [k, n] of px) common += Math.min(n, py.get(k) || 0);
  const total = Math.max(x.length - 1, 0) + Math.max(y.length - 1, 0);
  return total ? (2 * common) / total : 0;
}

/* ------------------------------------------------------------
 *  YouTube comments: the watch page's continuation tokens, then
 *  youtubei/v1/next pages (the same calls the web page makes).
 * ------------------------------------------------------------ */
const videoId = (url) => (String(url).match(/(?:[?&]v=|youtu\.be\/|\/shorts\/)([\w-]{11})/) || [])[1];

async function youtubeComments(id) {
  const html = await (await fetch(`https://www.youtube.com/watch?v=${id}`, { headers: UA })).text();
  const key = (html.match(/"INNERTUBE_API_KEY":"([^"]+)"/) || [])[1];
  const version = (html.match(/"INNERTUBE_CLIENT_VERSION":"([^"]+)"/) || [])[1];
  const initial = html.match(/var ytInitialData = (\{.*?\});<\/script>/s);
  if (!key || !initial) return [];
  const tokensIn = (o) => { const t = []; JSON.stringify(o, (k, v) => { if (k === 'token' && typeof v === 'string' && v.length > 40) t.push(v); return v; }); return t; };
  const context = { client: { clientName: 'WEB', clientVersion: version, hl: 'en' } };
  const comments = [];
  let queue = tokensIn(JSON.parse(initial[1])).slice(-3);
  for (let page = 0; page < MAX_PAGES && queue.length; page++) {
    const next = [];
    for (const continuation of queue) {
      const r = await (await fetch(`https://www.youtube.com/youtubei/v1/next?key=${key}`, {
        method: 'POST', headers: { ...UA, 'content-type': 'application/json' }, body: JSON.stringify({ context, continuation }),
      })).json();
      const found = [];
      JSON.stringify(r, (k, v) => {
        if (k === 'commentEntityPayload') found.push({ author: v.author?.displayName, text: v.properties?.content?.content || '' });
        return v;
      });
      if (found.length) { comments.push(...found); next.push(...tokensIn(r.onResponseReceivedEndpoints || []).slice(-1)); }
    }
    queue = next;
  }
  /* Several continuation entry points can return the same thread. */
  const seen = new Set();
  return comments.filter((c) => { const k = `${c.author}\n${c.text}`; return !seen.has(k) && seen.add(k); });
}

/* ------------------------------------------------------------
 *  One check
 * ------------------------------------------------------------ */
async function claim(postId, personId, platform, handle) {
  const r = await api('POST', '/api/srlink/unmatched', { post_id: Number(postId), person_id: Number(personId), platform, handle }, authed());
  return r.ok ? 'ok' : (r.data.error || `http ${r.status}`);
}

async function match() {
  const r = await api('GET', '/api/srlink/unmatched', null, authed());
  if (!r.ok) throw new Error(`unmatched failed: ${r.status} ${r.data.error || ''}`);
  const mine = String((await handlesCached()).youtube || '').replace(/^@/, '').toLowerCase();
  const cache = new Map();
  const filled = [];
  const waiting = [];
  for (const u of r.data.unmatched) {
    for (const platform of u.missing) {
      const link = u.links.find((l) => l.platform === platform);
      if (platform !== 'youtube') { waiting.push({ ...u, platform, url: link.url }); continue; }
      const id = videoId(link.url);
      if (!cache.has(id)) cache.set(id, await youtubeComments(id).catch(() => []));
      const hit = cache.get(id)
        .map((c) => ({ ...c, score: similarity(c.text, u.comment_text) }))
        .filter((c) => c.score >= SAME && c.author && c.author.replace(/^@/, '').toLowerCase() !== mine)
        .sort((a, b) => b.score - a.score)[0];
      if (!hit) continue;
      const result = await claim(u.post_id, u.person_id, platform, hit.author);
      filled.push({ post_id: u.post_id, person_id: u.person_id, platform, handle: hit.author, result });
    }
  }
  return { filled, waiting };
}

async function run(argv) {
  const [cmd, ...a] = argv;
  if (cmd === 'claim') return console.log(await claim(...a));
  const r = await match();
  const quiet = argv.includes('--quiet');
  if (!quiet || r.filled.length) console.log(`${new Date().toISOString()} match ${JSON.stringify({ filled: r.filled, waiting: r.waiting.length })}`);
  return r;
}

module.exports = { similarity, youtubeComments, match, run };

if (require.main === module) run(process.argv.slice(2)).catch((e) => { console.error(`match failed: ${e.message}`); process.exit(1); });
