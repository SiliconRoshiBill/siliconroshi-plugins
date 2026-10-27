// ============================================================
//  session-start.cjs -- SessionStart hook: hand Claude the post
//  links the session scan found that only a browser can check
//  (Rednote, LinkedIn, X). At most one reminder every 6 hours,
//  at most 10 links at a time. Silent when there is nothing.
// ============================================================

const path = require('path');
const { loadConfig, saveConfig } = require('./srlink.cjs');
const { pending } = require('./scan.cjs');

const EVERY_MS = 6 * 3600 * 1000;
const MAX = 10;

function note() {
  const cfg = loadConfig();
  if (!cfg.token || !cfg.scanSessions) return null;
  if (cfg.lastScanReminder && Date.now() - Date.parse(cfg.lastScanReminder) < EVERY_MS) return null;
  const list = pending().slice(0, MAX);
  if (!list.length) return null;
  saveConfig({ ...cfg, lastScanReminder: new Date().toISOString() });
  const cli = path.join(__dirname, 'srlink.cjs');
  return [
    `SRlink found ${list.length} post link(s) in the user's past Claude sessions that may be the user's own and are not registered:`,
    ...list.map((c) => `- ${c.platform} ${c.url}`),
    'Tell the user in one line that you will check them, then for each: open it in Chrome; if the author is NOT the user (compare with `srlink handles`), run',
    `  node "${cli}" scan mark <url> not-mine`,
    `If it was published more than 30 days ago, run node "${cli}" scan mark <url> old.`,
    'If it IS the user\'s recent post, read its title, text and publish time and run',
    `  node "${cli}" share --title "<title>" --summary "<3-5 sentences from the post's own text>" --publish-at <publish time> --link <platform>=<url>`,
    `then node "${cli}" scan mark <url> registered. Rednote: register the Copy Link share URL (with xsec_token), not a bare note URL.`,
  ].join('\n');
}

if (require.main === module) {
  try {
    const text = note();
    if (text) process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }));
  } catch { /* a broken hook must never break the session */ }
  process.exit(0);
}

module.exports = { note };
