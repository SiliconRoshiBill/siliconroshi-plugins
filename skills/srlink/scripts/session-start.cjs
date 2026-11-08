// ============================================================
//  session-start.cjs -- SessionStart hook: hand Claude the work
//  only a browser can do (Rednote, LinkedIn, X):
//    - post links the session scan found that may be the user's;
//    - feed comments on the user's posts whose writer has no handle
//      there yet: find who wrote it under the post, then claim.
//  At most one reminder every 6 hours, at most 10 items of each.
//  Also turns the background check on for a logged-in user who never
//  had it (sync.cjs ensureScheduled), and refreshes the skill copy
//  other AIs link to (install.cjs). Silent when there is nothing.
// ============================================================

const path = require('path');
const { loadConfig, saveConfig, api, authed } = require('./srlink.cjs');

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
  try { require('./install.cjs').refresh(); } catch { /* other AIs keep the old copy */ }
  if (!loadConfig().token) return null;
  const scheduled = require('./sync.cjs').ensureScheduled();
  const lines = [...(scheduled ? [`SRlink: ${scheduled} Tell the user in one line.`] : []), ...await reminders()];
  return lines.length ? lines.join('\n') : null;
}

async function reminders() {
  const cfg = loadConfig();
  if (cfg.lastScanReminder && Date.now() - Date.parse(cfg.lastScanReminder) < EVERY_MS) return [];
  const comments = await unmatchedForBrowser();
  if (!comments.length) return [];
  saveConfig({ ...cfg, lastScanReminder: new Date().toISOString() });
  return commentsNote(comments, path.join(__dirname, 'srlink.cjs'));
}

function commentsNote(comments, cli) {
  return [
    `SRlink: ${comments.length} comment(s) on the user's posts were taken from the SRlink feed by members whose account on that platform is unknown. Tell the user in one line, then for each open the post in Chrome, find the comment that reads like the text below (the member may have edited it), and if found run`,
    `  node "${cli}" claim <post_id> <person_id> <platform> <the commenter's account name as shown>`,
    ...comments.map((c) => `- post ${c.post_id} person ${c.person_id} ${c.platform} ${c.url}\n  comment: ${c.comment_text}`),
    'Skip any comment written by the user themselves. Do not claim when unsure.',
  ];
}

if (require.main === module) {
  note().then((text) => {
    if (text) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }));
  }).catch(() => { /* a broken hook must never break the session */ }).finally(() => process.exit(0));
}

module.exports = { note };
