// ============================================================
//  session-start.cjs -- SessionStart hook: hand Claude the work
//  only a browser can do (Rednote, LinkedIn, X):
//    - post links the session scan found that may be the user's;
//    - feed comments on the user's posts whose writer has no handle
//      there yet: find who wrote it under the post, then claim.
//  At most one reminder every 6 hours, at most 10 items of each.
//  Silent when there is nothing.
// ============================================================

const path = require('path');
const { loadConfig, saveConfig, api, authed } = require('./srlink.cjs');
const { pending } = require('./scan.cjs');

const EVERY_MS = 6 * 3600 * 1000;
const MAX = 10;

/* Feed comments on my posts whose writer has no handle on a browser-only platform. */
async function unmatchedForBrowser() {
  const r = await api('GET', '/api/srlink/unmatched', null, authed()).catch(() => null);
  if (!r?.ok) return [];
  return r.data.unmatched.flatMap((u) => u.missing.filter((p) => p !== 'youtube')
    .map((platform) => ({ ...u, platform, url: u.links.find((l) => l.platform === platform).url }))).slice(0, MAX);
}

async function note() {
  const cfg = loadConfig();
  if (!cfg.token) return null;
  if (cfg.lastScanReminder && Date.now() - Date.parse(cfg.lastScanReminder) < EVERY_MS) return null;
  const list = cfg.scanSessions ? pending().slice(0, MAX) : [];
  const comments = await unmatchedForBrowser();
  if (!list.length && !comments.length) return null;
  saveConfig({ ...cfg, lastScanReminder: new Date().toISOString() });
  const cli = path.join(__dirname, 'srlink.cjs');
  return [...(list.length ? postsNote(list, cli) : []), ...(comments.length ? commentsNote(comments, cli) : [])].join('\n');
}

function commentsNote(comments, cli) {
  return [
    `SRlink: ${comments.length} comment(s) on the user's posts were taken from the SRlink feed by members whose account on that platform is unknown. Tell the user in one line, then for each open the post in Chrome, find the comment that reads like the text below (the member may have edited it), and if found run`,
    `  node "${cli}" claim <post_id> <person_id> <platform> <the commenter's account name as shown>`,
    ...comments.map((c) => `- post ${c.post_id} person ${c.person_id} ${c.platform} ${c.url}\n  comment: ${c.comment_text}`),
    'Skip any comment written by the user themselves. Do not claim when unsure.',
  ];
}

function postsNote(list, cli) {
  return [
    `SRlink found ${list.length} post link(s) in the user's past Claude sessions that may be the user's own and are not registered:`,
    ...list.map((c) => `- ${c.platform} ${c.url}`),
    'Tell the user in one line that you will check them, then for each: open it in Chrome; if the author is NOT the user (compare with `srlink handles`), run',
    `  node "${cli}" scan mark <url> not-mine`,
    `If it was published more than 30 days ago, run node "${cli}" scan mark <url> old.`,
    'If it IS the user\'s recent post, read its title, text and publish time and run',
    `  node "${cli}" share --title "<title>" --summary "<3-5 sentences from the post's own text>" --publish-at <publish time> --link <platform>=<url>`,
    `then node "${cli}" scan mark <url> registered. Rednote: register the Copy Link share URL (with xsec_token), not a bare note URL.`,
  ];
}

if (require.main === module) {
  note().then((text) => {
    if (text) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }));
  }).catch(() => { /* a broken hook must never break the session */ }).finally(() => process.exit(0));
}

module.exports = { note };
