// ============================================================
//  SRlink post-tool hook: PostToolUse in Claude Code and Codex,
//  AfterTool in Gemini CLI (same stdin fields, same JSON reply).
//
//  After any Bash or MCP tool, whatever the posting skill is called
//  (ytupload, someone's own uploader, Claude in Chrome...), look in
//  the tool output for a freshly published post link.
//  - Structured record next to the link (JSON in the output, or a
//    .json file the output names) with a title: share to SRlink
//    directly, scheduled time included.
//  - A bare link: tell the agent, which knows the title, to share it,
//    but only if the user just published it.
//  Never blocks a tool; always exits 0.
//
//  Shipped as a plugin hook (hooks/hooks.json). Off until the user
//  is on by default once logged in; `srlink auto-share off` stops it.
// ============================================================

const fs = require('fs');
const path = require('path');

const POST_PATTERNS = [
  ['youtube', /https?:\/\/(?:www\.)?(?:youtu\.be\/[\w-]{11}|youtube\.com\/(?:watch\?v=|shorts\/)[\w-]{11})/g],
  /* Rednote note URLs keep their query when it carries xsec_token: only
   * that form (or an xhslink.com share link) opens for other viewers. */
  ['rednote', /https?:\/\/(?:www\.)?(?:(?:xiaohongshu|rednote)\.com\/(?:explore|discovery\/item)\/[0-9a-f]{24}(?:\?[^\s"'<>]*xsec_token=[^\s"'<>]+)?|xhslink\.com\/[\w/]+)/g],
  ['linkedin', /https?:\/\/(?:www\.)?linkedin\.com\/(?:feed\/update\/urn:li:[a-zA-Z]+:\d+|posts\/[\w%-]+)/g],
  ['x', /https?:\/\/(?:www\.)?(?:x|twitter)\.com\/\w+\/status\/\d+/g],
];

/* Pages read through Claude in Chrome give X links as bare paths
 * ("/SiliconRoshi/status/123"). Only the user's own handle counts,
 * so a timeline full of other people's posts is not picked up. */
function ownXPaths(outputText, xHandle) {
  if (!xHandle) return [];
  const re = new RegExp(`(?:^|[\\s"'(=])\\/(${xHandle.replace(/\W/g, '')})\\/status\\/(\\d+)`, 'gi');
  return [...outputText.matchAll(re)].map((m) => `https://x.com/${m[1]}/status/${m[2]}`);
}

/* Post links that appear in the tool OUTPUT but not in its input:
 * a link we only navigated to is in the input, a new post is not. */
function detectPosts(inputText, outputText, handles = {}) {
  const found = new Map();
  const add = (url, platform) => {
    if (!inputText.includes(url) && !found.has(url)) found.set(url, platform);
  };
  for (const [platform, re] of POST_PATTERNS) {
    for (const url of outputText.match(re) || []) add(url, platform);
  }
  for (const url of ownXPaths(outputText, handles.x)) add(url, 'x');
  return dropBareTwins([...found].map(([url, platform]) => ({ url, platform })));
}

/* A Rednote note URL without xsec_token is blocked for other viewers;
 * it needs the share link (Share > Copy Link) before it is registered. */
function needsShareLink(p) {
  return p.platform === 'rednote' && !/xsec_token=|xhslink\.com/.test(p.url);
}

/* The same note seen bare and with its token: keep the tokened one. */
function dropBareTwins(posts) {
  const noteId = (u) => (u.match(/[0-9a-f]{24}/) || [])[0];
  const tokened = new Set(posts.filter((p) => p.platform === 'rednote' && !needsShareLink(p)).map((p) => noteId(p.url)));
  return posts.filter((p) => !(needsShareLink(p) && tokened.has(noteId(p.url))));
}

const TITLE_KEYS = ['title', 'name', 'caption', 'subject'];
const WHEN_KEYS = ['publishAt', 'publish_at', 'scheduledAt', 'scheduled_at', 'scheduledFor'];

/* Walks parsed JSON for an object that holds this url plus a title. */
function findRecord(node, url, depth = 0) {
  if (!node || typeof node !== 'object' || depth > 6) return null;
  const values = Object.values(node);
  const title = TITLE_KEYS.map((k) => node[k]).find((v) => typeof v === 'string' && v.trim());
  if (title && values.some((v) => typeof v === 'string' && v.includes(url))) {
    const when = ['publishAt', 'publish_at', 'scheduledAt', 'scheduled_at'].map((k) => node[k]).find((v) => typeof v === 'string');
    return { title: title.trim(), publishAt: when, label: WHEN_KEYS.map((k) => node[k]).find((v) => typeof v === 'string') };
  }
  for (const v of values) {
    const hit = findRecord(v, url, depth + 1);
    if (hit) return hit;
  }
  return null;
}

/* Uploaders often print only "wrote result.json": append the contents
 * of up to 5 small .json files the output names, so links and records
 * inside them are seen too. */
function withNamedFiles(outputText) {
  let text = outputText;
  for (const file of (outputText.match(/\/[^\s"'\\]+\.json\b/g) || []).slice(0, 5)) {
    try {
      if (fs.statSync(file).size < 200000) text += '\n' + fs.readFileSync(file, 'utf8');
    } catch { /* missing or unreadable */ }
  }
  return text;
}

/* JSON blocks in the (expanded) output that hold this url plus a title. */
function recordFor(outputText, url) {
  const blocks = [];
  /* Two-level objects first, then flat ones: printed JSON is often
   * wrapped in the tool's own envelope, so the outer match may not parse. */
  const found = [
    ...(outputText.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) || []),
    ...(outputText.match(/\{[^{}]*\}/g) || []),
  ];
  for (const m of found) {
    try { blocks.push(JSON.parse(m)); } catch { /* not JSON */ }
  }
  for (const b of blocks) {
    const hit = findRecord(b, url);
    if (hit) return hit;
  }
  return null;
}

const seenFile = (dir) => path.join(dir, 'seen.json');
function loadSeen(dir) {
  try { return JSON.parse(fs.readFileSync(seenFile(dir), 'utf8')); } catch { return []; }
}
function saveSeen(dir, seen) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  fs.writeFileSync(seenFile(dir), JSON.stringify(seen.slice(-500)));
}

async function handle(event) {
  const srlink = require('./srlink.cjs');
  const cfg = srlink.loadConfig();
  /* On by default (owner, 2026-10-25); `srlink auto-share off` stops it.
   * Before the first login it stays silent instead of nagging. */
  if (cfg.autoShare === false) return null;
  if (!cfg.token && cfg.autoShare !== true) return null;
  const inputText = JSON.stringify(event.tool_input || {});
  /* Our own CLI prints links that are already on SRlink. */
  if (/srlink\.cjs|\/api\/srlink\//.test(inputText)) return null;
  const raw = JSON.stringify(event.tool_response || {}).replace(/\\\//g, '/');
  const outputText = withNamedFiles(raw.replace(/\\"/g, '"').replace(/\\n/g, '\n'));
  const seen = loadSeen(srlink.DIR);
  const posts = detectPosts(inputText, outputText, cfg.handles).filter((p) => !seen.includes(p.url));
  if (!posts.length) return null;
  saveSeen(srlink.DIR, [...seen, ...posts.map((p) => p.url)]);
  if (!cfg.token) {
    return `SRlink: new post link(s) ${posts.map((p) => p.url).join(', ')} seen, but SRlink is not logged in. Do nothing unless the user asks.`;
  }
  /* Skip links that are already on SRlink (e.g. printed by a query). */
  let known = new Set();
  try {
    const mine = await srlink.feed();
    known = new Set(mine.posts.filter((x) => x.mine).flatMap((x) => x.links.map((l) => l.url)));
  } catch { /* offline: fall through and let the agent judge */ }
  posts.splice(0, posts.length, ...posts.filter((p) => !known.has(p.url)));
  if (!posts.length) return null;

  const notes = [];
  const ask = [];
  for (const p of posts) {
    const s = recordFor(outputText, p.url);
    if (!s || needsShareLink(p)) { ask.push(p); continue; }
    /* Never auto-register an unlisted or private upload (class recordings). */
    if (p.platform === 'youtube') {
      const id = (p.url.match(/(?:[?&]v=|youtu\.be\/|\/shorts\/)([\w-]{11})/) || [])[1];
      const pub = await require('./scan.cjs').youtubePublic(id).catch(() => null);
      if (!pub) { notes.push(`Not registered on SRlink: ${p.url} is not a public video. Only public posts go on SRlink.`); continue; }
    }
    try {
      const r = await srlink.share({ title: s.title, links: [{ platform: p.platform, url: p.url }], publishAt: s.publishAt });
      notes.push(`Registered on SRlink: "${s.title}" ${p.url}${s.publishAt ? ` (shows in SRfeed from ${s.label || s.publishAt})` : ''}${r.merged ? ', added to the existing card' : ''}. Tell the user in one line.`);
    } catch (e) {
      notes.push(`SRlink share failed for ${p.url}: ${e.message}. Tell the user; they can retry with srlink share.`);
    }
  }
  if (ask.length) {
    const cli = path.join(__dirname, 'srlink.cjs');
    notes.push(
      `New post link(s): ${ask.map((p) => `${p.platform} ${p.url}`).join('; ')}. ` +
      'ONLY if the user just published this post themselves (not someone else\'s post you opened) AND it is public (never an unlisted or private video, such as a class recording), share it to SRlink: ' +
      `node "${cli}" share --title "<the post title>" --summary "<3-5 sentences from the post's own text>" --publish-at <when it went or goes public> --link <platform>=<url>. ` +
      'Use the title you just published. Then tell the user in one line. Otherwise ignore this note.' +
      (ask.some(needsShareLink)
        ? ' Rednote: that bare note URL is blocked for other viewers, so do not register it. Get the share link first: open the note in Chrome from the user\'s profile, click the share arrow, click Copy Link, read it with `pbpaste`, and register that URL.'
        : ''),
    );
  }
  return notes.join('\n');
}

module.exports = { detectPosts, recordFor, withNamedFiles, handle, POST_PATTERNS };

if (require.main === module) {
  let raw = '';
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', async () => {
    try {
      const event = JSON.parse(raw || '{}');
      const note = await handle(event);
      if (note) {
        /* PostToolUse (Claude Code, Codex) or AfterTool (Gemini CLI). */
        const hookEventName = event.hook_event_name || 'PostToolUse';
        process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName, additionalContext: note } }));
      }
    } catch { /* a broken hook must never break the user's tool */ }
    process.exit(0);
  });
}
