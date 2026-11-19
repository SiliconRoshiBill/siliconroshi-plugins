// ============================================================
//  due.cjs -- scheduled posts that went out with their link still
//  pending (LinkedIn, X, Rednote ...), filled from the user's own
//  browser without asking them (owner, 2026-11-19).
//
//    node srlink.cjs due                 the list, as JSON
//    node srlink.cjs due --steps         what the AI does for each one
//    node srlink.cjs due --missing <id>  it is not on the platform:
//                                        stop reminding about it
//
//  LinkedIn and X post ids carry their publish time, so the page
//  script below lists the user's posts with exact times; the AI
//  picks the one in the time window whose text matches the summary.
// ============================================================

const fs = require('fs');
const path = require('path');

const CLI = path.join(__dirname, 'srlink.cjs');
const BEFORE_MS = 15 * 60_000;            /* platforms post a little early or late */
const AFTER_MS = 6 * 3600_000;

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

/* ------------------------------------------------------------
 *  "Not on the platform" marks, kept in ~/.srlink/due-missing.json
 * ------------------------------------------------------------ */
const missingFile = (dir) => path.join(dir, 'due-missing.json');

function loadMissing(dir) {
  try { return JSON.parse(fs.readFileSync(missingFile(dir), 'utf8')); } catch { return {}; }
}

function markMissing(dir, id) {
  if (!/^\d+$/.test(String(id))) throw new Error('usage: due --missing <post id>');
  const marks = { ...loadMissing(dir), [id]: new Date().toISOString() };
  fs.writeFileSync(missingFile(dir), JSON.stringify(marks), { mode: 0o600 });
  return `#${id} will not be mentioned again. Tell the user in one line that it is not on the platform.`;
}

/* Rescheduled: it is coming, so it is not missing any more. */
function clearMissing(dir, id) {
  const { [id]: _, ...rest } = loadMissing(dir);
  fs.writeFileSync(missingFile(dir), JSON.stringify(rest), { mode: 0o600 });
}

const SCHEDULED = {
  linkedin: 'LinkedIn: on the feed click Start a post, then the clock icon, then View all scheduled posts',
  x: 'X: https://x.com/compose/post/unsent/scheduled',
};

const open = (dir, items) => items.filter((p) => !loadMissing(dir)[p.id]);

/* ------------------------------------------------------------
 *  The recipe for one post on one platform
 * ------------------------------------------------------------ */
function timeWindow(publishAt) {
  const t = Date.parse(String(publishAt).replace(' ', 'T') + (/Z|[+-]\d\d:?\d\d$/.test(publishAt) ? '' : 'Z'));
  return [new Date(t - BEFORE_MS).toISOString(), new Date(t + AFTER_MS).toISOString()];
}

function steps(p, platform, handles, localTime) {
  const url = PROFILE[platform]?.(handles?.[platform]);
  const [from, to] = timeWindow(p.publish_at);
  const find = SCRIPT[platform]
    ? `Run this in the page (javascript tool); it lists the user's posts with their real publish times:\n${SCRIPT[platform].replace(/^/gm, '     ')}\n   Pick the one with "at" between ${from} and ${to} whose text matches the summary. None there: a LATER one whose text matches (it went out late; the text may have been edited) is the one.`
    : `Find the user's post published between ${from} and ${to} whose text matches the summary, or a later one that matches (it went out late), and copy its link.`;
  return [
    `#${p.id} "${p.title}" on ${platform}, due ${localTime(p.publish_at)}`,
    `   Summary: ${p.summary || '(none, match the title)'}`,
    `1. Open ${url || `the user's ${platform} profile`} in the user's own Chrome and let the posts load.`,
    `2. ${find}`,
    `3. Found: node "${CLI}" share --into ${p.id} --title "${p.title.replace(/"/g, '\\"')}" --publish-at <its "at"> --link ${platform}=<url>`,
    `4. Not out yet: open the scheduled posts (${SCHEDULED[platform] || `the ${platform} scheduled-posts list`}). Still scheduled for a new time: node "${CLI}" reschedule ${p.id} --publish-at <that time>`,
    `5. In neither place (cancelled, or a different post went out instead): node "${CLI}" due --missing ${p.id}`,
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
  const list = items.map((p) => `#${p.id} "${p.title}" on ${p.platforms.join(', ')} (went out ${localTime(p.publish_at)})`).join('; ');
  return `SRlink: scheduled post(s) went out but have no link on SRlink yet: ${list}. ` +
    `Fill them now from the user's own browser, without asking the user: run node "${CLI}" due --steps and follow it. ` +
    'Only if no browser tool can be used here, tell the user in one line.';
}

module.exports = { PROFILE, SCRIPT, SCHEDULED, loadMissing, markMissing, clearMissing, open, timeWindow, steps, allSteps, hookNote };
