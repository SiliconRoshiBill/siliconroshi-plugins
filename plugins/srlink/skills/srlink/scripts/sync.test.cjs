// ============================================================
//  sync.cjs -- feed parsing and summaries (no network).
// ============================================================
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseFeed, summaryOf, cleanTitle } = require('./sync.cjs');

const XML = `<feed><entry><yt:videoId>abcdefghijk</yt:videoId><title>A &amp; B｜硅谷老兵</title>
<published>2026-10-24T02:00:27+00:00</published><media:group><media:description>第一句。第二句!
https://example.com/x
#AI #硅谷老兵
0:00 开场
第三句？第四句。第五句。第六句。</media:description></media:group></entry></feed>`;

test('parseFeed: id, title (entities decoded), publish time, description', () => {
  const [v] = parseFeed(XML);
  assert.equal(v.id, 'abcdefghijk');
  assert.equal(v.title, 'A & B｜硅谷老兵');
  assert.equal(v.published, '2026-10-24T02:00:27+00:00');
});

test('summaryOf: links, hashtags and chapters dropped; at most 5 sentences', () => {
  assert.equal(summaryOf(parseFeed(XML)[0].description), '第一句。第二句!第三句？第四句。第五句。');
});

test('cleanTitle: trailing hashtags dropped, the rest kept', () => {
  assert.equal(cleanTitle('AI 说得像真的｜硅谷老兵 #Shorts'), 'AI 说得像真的｜硅谷老兵');
  assert.equal(cleanTitle('一句话请三个高手挑刺 #AI #ClaudeCode #投资理财'), '一句话请三个高手挑刺');
  assert.equal(cleanTitle('No #tags in the middle stay'), 'No #tags in the middle stay');
});
