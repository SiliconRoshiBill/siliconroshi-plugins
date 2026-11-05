// ============================================================
//  log.cjs -- every conversation with the SRlink server, on disk.
//
//  Where:  ~/.srlink/logs/YYYY-MM-DD.jsonl   (SRLINK_HOME moves it)
//          Same folder on macOS, Linux and Windows, next to the
//          config and sync.log, so "send me ~/.srlink/logs" is the
//          whole support instruction. Kept 14 days.
//
//  What:   one JSON line per request --
//            ts      UTC instant          local  the user's wall clock
//            rid     request id, also sent as x-srlink-request-id,
//                    so the server's own logs find the same request
//            via     which entry point: "srlink share", "hook", "sync"...
//            method, url, sent (body), status, ms, got (reply) | error
//          Tokens, device codes and passwords are never written.
//
//  Read:   node srlink.cjs log [N]     last N lines, human-readable
//
//  Logging never breaks the caller: every write is best effort.
// ============================================================

const fs = require('fs');
const path = require('path');

const KEEP_DAYS = 14;
const MAX_FIELD = 1500;
const SECRET = /token|device_code|secret|password|authorization/i;

const logDir = () => path.join(process.env.SRLINK_HOME || path.join(require('os').homedir(), '.srlink'), 'logs');

/* The entry point, from argv alone: "srlink share", "hook", "run-sync". */
function via() {
  const script = path.basename(process.argv[1] || 'node', '.cjs');
  return script === 'srlink' ? `srlink ${process.argv[2] || ''}`.trim() : script;
}

/* Deep copy with every secret-looking key blanked. */
function redact(value) {
  if (Array.isArray(value)) return value.map(redact);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, SECRET.test(k) ? '[redacted]' : redact(v)]));
}

const clip = (v) => {
  if (v === undefined) return undefined;
  const s = JSON.stringify(redact(v));
  return s.length > MAX_FIELD ? `${s.slice(0, MAX_FIELD)}...(${s.length} chars)` : JSON.parse(s);
};

function prune(dir) {
  const cutoff = Date.now() - KEEP_DAYS * 86400000;
  for (const f of fs.readdirSync(dir)) {
    if (/^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f) && Date.parse(f.slice(0, 10)) < cutoff) fs.rmSync(path.join(dir, f), { force: true });
  }
}

function record(entry) {
  try {
    const dir = logDir();
    const now = new Date();
    const file = path.join(dir, `${now.toISOString().slice(0, 10)}.jsonl`);
    const fresh = !fs.existsSync(file);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const line = { ts: now.toISOString(), local: now.toString().slice(4, 33), via: via(), ...entry, sent: clip(entry.sent), got: clip(entry.got) };
    fs.appendFileSync(file, JSON.stringify(line) + '\n', { mode: 0o600 });
    if (fresh) prune(dir);
  } catch { /* a log that cannot be written must not stop the request */ }
}

/* Last n lines across the newest files, one readable row each. */
function tail(n = 20) {
  const dir = logDir();
  if (!fs.existsSync(dir)) return `No SRlink log yet (${dir}).`;
  const lines = fs.readdirSync(dir).filter((f) => f.endsWith('.jsonl')).sort()
    .flatMap((f) => fs.readFileSync(path.join(dir, f), 'utf8').split('\n').filter(Boolean)).slice(-n);
  const row = (l) => {
    try {
      const e = JSON.parse(l);
      const what = e.error ? `ERROR ${e.error}` : `${e.status} ${e.ms}ms`;
      const show = (v) => (typeof v === 'string' ? v : JSON.stringify(v ?? null));
      return `${e.local}  ${e.via.padEnd(16)} ${e.method || ''} ${e.url || ''}  ${what}  [${e.rid || '-'}]\n    sent ${show(e.sent)}\n    got  ${show(e.got)}`;
    } catch { return l; }
  };
  return [`${dir}`, ...lines.map(row)].join('\n');
}

module.exports = { record, tail, redact, logDir };
