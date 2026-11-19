// ============================================================
//  upgrade.cjs -- keep SRlink current (owner, 2026-11-19).
//
//  Once a day the SessionStart hook compares this copy's version
//  with the one on GitHub. When a newer one is out:
//    Claude Code plugin, auto-upgrade on (default): install it in
//      the background; it takes effect next time Claude Code starts.
//    anything else, or auto-upgrade off: a one-line reminder.
//
//    node srlink.cjs upgrade                 install the newest now
//    node srlink.cjs auto-upgrade on|off     background install (default on)
// ============================================================

const fs = require('fs');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const LATEST_URL = 'https://raw.githubusercontent.com/SiliconRoshiBill/siliconroshi-plugins/main/plugins/srlink/.claude-plugin/plugin.json';
const EVERY_MS = 24 * 3600 * 1000;
const CLAUDE_UPGRADE = 'claude plugin marketplace update siliconroshi && claude plugin update srlink@siliconroshi';
const MANUAL = 'Claude Code: `claude plugin marketplace update siliconroshi` then `claude plugin update srlink@siliconroshi`; ' +
  'Codex: `codex plugin marketplace upgrade siliconroshi`; Gemini CLI: `gemini extensions update srlink`; others: `srlink update`';

/* ------------------------------------------------------------
 *  Which version this is, and whether Claude Code installed it
 *    plugins/cache/.../srlink/<v>/.claude-plugin/plugin.json
 *    <repo>/gemini-extension.json  (Gemini CLI extension)
 * ------------------------------------------------------------ */
const ROOT = path.resolve(__dirname, '..', '..', '..');
const MANIFESTS = [
  { file: path.join(ROOT, '.claude-plugin', 'plugin.json'), claude: true },
  { file: path.join(ROOT, 'gemini-extension.json'), claude: false },
];

function installed() {
  for (const m of MANIFESTS) {
    try { return { version: JSON.parse(fs.readFileSync(m.file, 'utf8')).version, claude: m.claude }; }
    catch { /* not this layout */ }
  }
  return null;
}

/* "0.1.10" > "0.1.9" */
function newer(a, b) {
  const x = String(a).split('.').map(Number), y = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0);
  return false;
}

async function latest() {
  const r = await fetch(LATEST_URL, { signal: AbortSignal.timeout(4000) });
  if (!r.ok) throw new Error(`latest: HTTP ${r.status}`);
  return (await r.json()).version;
}

/* ------------------------------------------------------------
 *  Install
 * ------------------------------------------------------------ */
function background(dir) {
  fs.mkdirSync(path.join(dir, 'logs'), { recursive: true });
  const log = fs.openSync(path.join(dir, 'logs', 'upgrade.log'), 'a');
  spawn('sh', ['-c', `date; ${CLAUDE_UPGRADE}`], { detached: true, stdio: ['ignore', log, log] }).unref();
}

function now() {
  const r = spawnSync('sh', ['-c', CLAUDE_UPGRADE], { encoding: 'utf8', timeout: 120000 });
  if (r.status === 0) return `${r.stdout.trim()}\nRestart Claude Code to use it.`;
  return `Could not upgrade here (${(r.stderr || r.error?.message || '').trim()}). Run it by hand: ${MANUAL}`;
}

/* ------------------------------------------------------------
 *  The daily check: returns a line for the session, or null
 * ------------------------------------------------------------ */
async function check({ loadConfig, saveConfig, DIR }) {
  const cfg = loadConfig();
  if (cfg.upgradeCheckedAt && Date.now() - Date.parse(cfg.upgradeCheckedAt) < EVERY_MS) return null;
  saveConfig({ ...cfg, upgradeCheckedAt: new Date().toISOString() });
  const mine = installed();
  const top = mine && await latest().catch(() => null);
  if (!top || !newer(top, mine.version)) return null;
  if (mine.claude && cfg.autoUpgrade !== false) {
    background(DIR);
    return `SRlink: version ${top} is out (this is ${mine.version}). It is installing in the background and takes effect next time Claude Code starts. Tell the user in one line.`;
  }
  return `SRlink: version ${top} is out (this is ${mine.version}). Tell the user in one line that saying "upgrade SRlink" installs it (${MANUAL}).`;
}

function autoUpgrade(mode, { loadConfig, saveConfig }) {
  if (mode !== 'on' && mode !== 'off') {
    return `Auto-upgrade is ${loadConfig().autoUpgrade === false ? 'off' : 'on'}. Use: auto-upgrade on|off`;
  }
  saveConfig({ ...loadConfig(), autoUpgrade: mode === 'on' });
  return `Auto-upgrade ${mode}.`;
}

module.exports = { check, now, autoUpgrade, newer, installed, LATEST_URL };
