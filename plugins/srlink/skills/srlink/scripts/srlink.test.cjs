// ============================================================
//  srlink.cjs -- timezone-dependent helpers.
//
//  Run once per machine timezone, as the owner asked:
//    TZ=America/New_York node --test skills/srlink/scripts/srlink.test.cjs
//    TZ=America/Los_Angeles node --test skills/srlink/scripts/srlink.test.cjs
//  (plain `npm test` runs it too, under whatever TZ the shell has.)
//
//  `toAbsoluteISO` and `localTime` both read this process's own
//  timezone (via Date()/Intl's implicit default, which Node sets
//  from TZ at startup) -- the whole point being that a bare local
//  time means something different depending on who runs the CLI.
// ============================================================

const test = require('node:test');
const assert = require('node:assert/strict');
const { toISO, localTime, toAbsoluteISO } = require('./srlink.cjs');

const TZ = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;

test('toISO: a naive D1 timestamp gets a Z; an offset is left alone', () => {
  assert.equal(toISO('2026-10-26 05:30:00'), '2026-10-26T05:30:00Z');
  assert.equal(toISO('2026-10-26T05:30:00Z'), '2026-10-26T05:30:00Z');
  assert.equal(toISO('2026-10-26T05:30:00-07:00'), '2026-10-26T05:30:00-07:00');
});

test('toAbsoluteISO: an input that already carries an offset/Z is untouched', () => {
  assert.equal(toAbsoluteISO('2026-11-01T19:00:00-07:00'), '2026-11-01T19:00:00-07:00');
  assert.equal(toAbsoluteISO('2026-11-01T19:00:00Z'), '2026-11-01T19:00:00Z');
});

test(`toAbsoluteISO: a bare local time is read in this process's own zone (${TZ})`, () => {
  /* Away from any DST boundary, so -04:00/-07:00 (not -05:00/-08:00)
   * hold for both US zones this script is tested under. */
  const bare = '2026-10-20T19:00:00';
  const absolute = toAbsoluteISO(bare);
  assert.match(absolute, /Z$/);
  if (TZ === 'America/New_York') assert.equal(absolute, '2026-10-20T23:00:00.000Z');
  if (TZ === 'America/Los_Angeles') assert.equal(absolute, '2026-10-21T02:00:00.000Z');
  /* Whatever the zone, converting back must land on 19:00 again --
   * this is the real contract, true for any TZ this runs under. */
  const wallClock = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(absolute));
  assert.equal(wallClock, '19:00');
});

test(`localTime: prints a UTC instant in this process's own zone (${TZ}) with a short zone name`, () => {
  const text = localTime('2026-10-26 05:30:00');
  if (TZ === 'America/New_York') { assert.match(text, /01:30\s*AM/); assert.match(text, /EDT/); }
  if (TZ === 'America/Los_Angeles') { assert.match(text, /10:30\s*PM/); assert.match(text, /PDT/); }
  assert.match(text, /2026/);
});

test('localTime: unparseable input is returned as-is', () => {
  assert.equal(localTime('not-a-date'), 'not-a-date');
});
