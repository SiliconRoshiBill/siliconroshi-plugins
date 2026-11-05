// ============================================================
//  platform.cjs -- the few things that differ by operating system,
//  each as one table row, so macOS, Windows and Linux take the
//  same code path everywhere else.
//
//    openUrl(url)    open the user's browser (login approval)
//    clipboard()     read the clipboard (Rednote "Copy Link")
//
//  The background scheduler (launchd / Task Scheduler / cron)
//  lives in sync.cjs, next to the job it runs.
// ============================================================

const { execFile, execFileSync } = require('child_process');

/* Windows: rundll32, not `cmd /c start`, so the "&" in a URL is
 * never read as a shell command separator. */
const OPEN = {
  darwin: (url) => ['open', [url]],
  win32: (url) => ['rundll32', ['url.dll,FileProtocolHandler', url]],
  linux: (url) => ['xdg-open', [url]],
};

const CLIPBOARD = {
  darwin: ['pbpaste', []],
  win32: ['powershell', ['-NoProfile', '-Command', 'Get-Clipboard']],
  linux: ['sh', ['-c', 'wl-paste 2>/dev/null || xclip -o -selection clipboard']],
};

/* Best effort: the link is printed too, so a missing opener is harmless. */
function openUrl(url, platform = process.platform) {
  const row = OPEN[platform];
  if (row) execFile(...row(url), () => {});
}

function clipboard(platform = process.platform) {
  const row = CLIPBOARD[platform];
  if (!row) throw new Error(`reading the clipboard is not supported on ${platform}`);
  return execFileSync(row[0], row[1], { encoding: 'utf8' }).trim();
}

module.exports = { openUrl, clipboard, OPEN, CLIPBOARD };
