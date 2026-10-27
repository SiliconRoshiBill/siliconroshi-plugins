// ============================================================
//  sync.cjs -- register my new YouTube videos on SRlink, in the background.
//
//    node sync.cjs [--quiet]          check once now
//    node sync.cjs schedule on [H]    run it every H hours (1-24,
//                                     default 1) on this computer
//    node sync.cjs schedule off|status       (launchd / crontab)
//
//  Reads the channel's public RSS feed (no Chrome, no Claude), takes
//  the newest SYNC_MAX videos of the last SYNC_DAYS, and registers
//  each one SRlink has not seen: title, a 3-5 sentence summary from
//  the description, the YouTube publish time. The server ignores a
//  video already registered (or deleted), so resending is safe.
//  Rednote, LinkedIn and X need a logged-in browser: the skill does
//  those when the user asks.
// ============================================================

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { share, handlesCached, loadConfig, saveConfig, DIR } = require('./srlink.cjs');

const SYNC_DAYS = 30;
const SYNC_MAX = 10;
const UA = { 'user-agent': 'Mozilla/5.0 (srlink-sync)' };

/* ------------------------------------------------------------
 *  YouTube: handle -> channel id (cached) -> RSS entries
 * ------------------------------------------------------------ */
async function channelId(handle) {
  const cfg = loadConfig();
  if (cfg.youtubeChannel?.handle === handle) return cfg.youtubeChannel.id;
  const name = String(handle).replace(/^.*youtube\.com\//, '').replace(/^@?/, '@').split(/[/?]/)[0];
  const html = await (await fetch(`https://www.youtube.com/${name}`, { headers: UA })).text();
  const id = (html.match(/"(?:externalId|channelId)":"(UC[\w-]{22})"/) || [])[1];
  if (!id) throw new Error(`could not find the YouTube channel for ${handle}`);
  saveConfig({ ...loadConfig(), youtubeChannel: { handle, id } });
  return id;
}

const XML_ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const unxml = (s) => String(s || '').replace(/&(amp|lt|gt|quot|apos|#\d+);/g, (_, e) =>
  e[0] === '#' ? String.fromCodePoint(Number(e.slice(1))) : XML_ENT[e]);
const tag = (block, name) => unxml((block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`)) || [])[1]);

function parseFeed(xml) {
  return (xml.match(/<entry>[\s\S]*?<\/entry>/g) || []).map((e) => ({
    id: tag(e, 'yt:videoId'),
    title: tag(e, 'title').trim(),
    published: tag(e, 'published'),
    description: tag(e, 'media:description'),
  })).filter((v) => v.id && v.title);
}

/* 3-5 sentences from the description: links, hashtags and chapter
 * lines dropped, cut on sentence ends, at most 600 characters. */
function summaryOf(description) {
  const text = String(description).split('\n')
    .filter((l) => !/https?:\/\/|^\s*#|^\s*\d{1,2}:\d{2}/.test(l)).join(' ').replace(/\s+/g, ' ').trim();
  const sentences = text.match(/[^。！？!?.]+[。！？!?.]+/g) || (text ? [text] : []);
  return sentences.slice(0, 5).map((x) => x.trim()).join('').slice(0, 600);
}

/* YouTube titles often end in hashtags (#AI #Shorts); the card does not. */
const cleanTitle = (t) => String(t).replace(/(\s+#\S+)+\s*$/, '').trim();

/* ------------------------------------------------------------
 *  One check: register what is new, remember what was seen
 * ------------------------------------------------------------ */
async function syncYouTube() {
  const handle = (await handlesCached()).youtube;
  if (!handle) return { platform: 'youtube', skipped: 'no YouTube account saved (srlink handles --youtube @name)' };
  const xml = await (await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${await channelId(handle)}`, { headers: UA })).text();
  const since = Date.now() - SYNC_DAYS * 86400000;
  const recent = parseFeed(xml).filter((v) => Date.parse(v.published) >= since).slice(0, SYNC_MAX);
  const seen = new Set(loadConfig().synced?.youtube || []);
  const added = [];
  for (const v of recent.filter((x) => !seen.has(x.id))) {
    try {
      const r = await share({ title: cleanTitle(v.title), summary: summaryOf(v.description), publishAt: v.published,
        links: [{ platform: 'youtube', url: `https://www.youtube.com/watch?v=${v.id}` }] });
      if (!r.existing) added.push({ id: r.id, title: cleanTitle(v.title) });
      seen.add(v.id);
    } catch (e) {
      if (/monthly_limit/.test(e.message)) return { platform: 'youtube', added, stopped: 'monthly share limit reached' };
      throw e;
    }
  }
  const cfg = loadConfig();
  saveConfig({ ...cfg, synced: { ...cfg.synced, youtube: [...seen].slice(-200) }, lastSync: new Date().toISOString() });
  return { platform: 'youtube', checked: recent.length, added };
}

/* ------------------------------------------------------------
 *  schedule on [H] | off | status -- every H hours (1-24) on this
 *  computer; H is kept in the config as scheduleHours. The launcher
 *  finds the newest installed copy each run (Claude Code, Codex or
 *  Gemini CLI), so plugin updates need no re-install.
 * ------------------------------------------------------------ */
const LABEL = 'ai.siliconroshi.srlink-sync';
const PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', `${LABEL}.plist`);
const LAUNCHER = path.join(DIR, 'run-sync.cjs');
const LOG = path.join(DIR, 'sync.log');

const LAUNCHER_SRC = `// Written by \`srlink schedule on\`. Runs the newest installed srlink sync.cjs,
// whichever agent installed it (Claude Code, Codex, Gemini CLI).
const fs = require('fs'), path = require('path'), home = require('os').homedir();
const SCRIPT = 'skills/srlink/scripts/sync.cjs';
const num = (v) => v.split('.').map(Number);
const newer = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const newest = (root) => {
  const v = fs.existsSync(root) ? fs.readdirSync(root).filter((d) => /^\\d+\\.\\d+\\.\\d+$/.test(d)).sort(newer).pop() : null;
  return v ? { version: v, file: path.join(root, v, SCRIPT) } : null;
};
const gemini = path.join(home, '.gemini/extensions/srlink');
const geminiVersion = (() => { try { return JSON.parse(fs.readFileSync(path.join(gemini, 'gemini-extension.json'), 'utf8')).version; } catch { return null; } })();
const found = [
  newest(path.join(home, '.claude/plugins/cache/siliconroshi/srlink')),
  newest(path.join(home, '.codex/plugins/cache/siliconroshi/srlink')),
  geminiVersion && { version: geminiVersion, file: path.join(gemini, SCRIPT) },
].filter((c) => c && fs.existsSync(c.file)).sort((a, b) => newer(a.version, b.version));
require(found.length ? found.pop().file : ${JSON.stringify(__filename)}).run(['--quiet']);
`;

function plistXml(hours) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key><array><string>${process.execPath}</string><string>${LAUNCHER}</string></array>
  <key>StartInterval</key><integer>${hours * 3600}</integer>
  <key>RunAtLoad</key><true/>
  <key>StandardOutPath</key><string>${LOG}</string>
  <key>StandardErrorPath</key><string>${LOG}</string>
</dict></plist>
`;
}

const CRON_MARK = '# srlink-sync';
const crontab = () => { try { return execFileSync('crontab', ['-l'], { encoding: 'utf8' }); } catch { return ''; } };
const setCrontab = (text) => execFileSync('crontab', ['-'], { input: text });

const every = (h) => (h === 1 ? 'every hour' : `every ${h} hours`);

function schedulePlatform(on, hours) {
  const uid = String(process.getuid?.() ?? '');
  if (process.platform === 'darwin') {
    try { execFileSync('launchctl', ['bootout', `gui/${uid}`, PLIST], { stdio: 'ignore' }); } catch { /* not loaded */ }
    if (!on) return fs.rmSync(PLIST, { force: true });
    fs.mkdirSync(path.dirname(PLIST), { recursive: true });
    fs.writeFileSync(PLIST, plistXml(hours));
    return execFileSync('launchctl', ['bootstrap', `gui/${uid}`, PLIST]);
  }
  /* Cron hour step H: H=1 every hour, H=24 once a day at 00:17. */
  const kept = crontab().split('\n').filter((l) => l && !l.includes(CRON_MARK));
  if (on) kept.push(`17 */${hours} * * * "${process.execPath}" "${LAUNCHER}" >> "${LOG}" 2>&1 ${CRON_MARK}`);
  setCrontab(kept.join('\n') + '\n');
}

/* Installs from before 0.1.10 ran hourly without saving scheduleHours. */
const scheduledHours = () => loadConfig().scheduleHours
  || (fs.existsSync(PLIST) || crontab().includes(CRON_MARK) ? 1 : 0);

function schedule(mode, h) {
  const now = scheduledHours();
  if (mode === 'status') return now ? `Background check on, ${every(now)}. Log: ${LOG}` : 'Background check off.';
  if (mode !== 'on' && mode !== 'off') return 'Use: schedule on [hours 1-24] | off | status';
  if (!['darwin', 'linux'].includes(process.platform)) return 'The background check runs on macOS and Linux; run `node sync.cjs` yourself elsewhere.';
  const hours = h === undefined ? (now || 1) : Number(h);
  if (mode === 'on' && !(Number.isInteger(hours) && hours >= 1 && hours <= 24)) return 'Hours must be a whole number from 1 to 24.';
  if (mode === 'on') {
    fs.mkdirSync(DIR, { recursive: true, mode: 0o700 });
    fs.writeFileSync(LAUNCHER, LAUNCHER_SRC);
  }
  schedulePlatform(mode === 'on', hours);
  const { scheduleHours, ...rest } = loadConfig();
  saveConfig(mode === 'on' ? { ...rest, scheduleHours: hours } : rest);
  return mode === 'on' ? `Background check on, ${every(hours)}. Log: ${LOG}` : 'Background check off.';
}

/* --quiet (the background run) logs only when something was added. */
async function run(argv) {
  const [cmd, arg, hours] = argv.filter((a) => a !== '--quiet');
  if (cmd === 'schedule') return console.log(schedule(arg, hours));
  const stamp = () => new Date().toISOString();
  try {
    const r = await syncYouTube();
    if (!argv.includes('--quiet') || r.added?.length || r.stopped) console.log(`${stamp()} ${JSON.stringify(r)}`);
  } catch (e) {
    console.error(`${stamp()} sync failed: ${e.message}`);
    process.exitCode = 1;
  }
  if (!argv.includes('--quiet')) return;
  /* The background run also scans my Claude sessions when that is on, and
   * fills readers' missing handles from their comments; a failure in
   * one step must not stop the next. */
  if (loadConfig().scanSessions) {
    try {
      const s = await require('./scan.cjs').scan();
      if (s.added?.length || s.retryLater) console.log(`${stamp()} scan ${JSON.stringify(s)}`);
    } catch (e) {
      console.error(`${stamp()} scan failed: ${e.message}`);
      process.exitCode = 1;
    }
  }
  try {
    await require('./match.cjs').run(['--quiet']);
  } catch (e) {
    console.error(`${stamp()} match failed: ${e.message}`);
    process.exitCode = 1;
  }
}

module.exports = { LAUNCHER_SRC, parseFeed, summaryOf, cleanTitle, schedule, scheduledHours, plistXml, syncYouTube, run };

if (require.main === module) run(process.argv.slice(2));
