#!/usr/bin/env node
/**
 * check-voice.mjs 的測試 — `node --test skills/ray-voice/scripts/*.test.mjs`
 *
 * 規範改了先改這裡再改驗證器，兩邊不能脫鉤。
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { check, loadProfile, scan } from './check-voice.mjs';

const profile = loadProfile();
const chat = (text) => check(text, { profile, mode: 'chat' });
const doc = (text) => check(text, { profile, mode: 'doc' });
const ruleIds = (r) => r.findings.map((f) => f.rule);
const has = (r, id) => ruleIds(r).includes(id);

// ── profile 本身 ─────────────────────────────────────────────────────────

test('profile 有 rules，且每條都有 id / severity / type', () => {
  assert.ok(profile.rules.length > 0);
  for (const r of profile.rules) {
    assert.ok(r.id, `rule 缺 id: ${JSON.stringify(r)}`);
    assert.ok(['error', 'warning', 'info'].includes(r.severity), `${r.id} severity 不合法`);
    assert.ok(r.type, `${r.id} 缺 type`);
  }
});

test('rule id 不重複', () => {
  const ids = profile.rules.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

// ── 前處理：程式碼與 frontmatter 不該被檢查 ──────────────────────────────

test('scan 會標出 frontmatter / code fence / 表格 / 標題', () => {
  const { lines } = scan(['---', 'title: "X"', '---', '# H1', '```js', 'const 蠻 = 1;', '```', '| a | b |', '正文'].join('\n'));
  assert.equal(lines[0].kind, 'frontmatter');
  assert.equal(lines[1].kind, 'frontmatter');
  assert.equal(lines[3].kind, 'heading');
  assert.equal(lines[4].kind, 'fence-open');
  assert.equal(lines[5].kind, 'code');
  assert.equal(lines[7].kind, 'table');
  assert.equal(lines[8].kind, 'prose');
});

test('程式碼區塊裡的違規詞不算數', () => {
  const inCode = doc(['```js', '// 蠻多的 緩存 代碼', '```'].join('\n'));
  assert.equal(has(inCode, 'man-char'), false);
  assert.equal(has(inCode, 'cn-term'), false);
});

test('行內 code 與網址裡的內容不算數', () => {
  const r = chat('請執行 `npm run 蠻` 然後開 https://example.com/緩存 就好');
  assert.equal(has(r, 'man-char'), false);
  assert.equal(has(r, 'cn-term'), false);
});

// ── 台灣用語 ─────────────────────────────────────────────────────────────

test('簡體字是 error', () => {
  const r = chat('这个功能没有问题');
  assert.ok(has(r, 'simplified-han'));
  assert.equal(r.findings.find((f) => f.rule === 'simplified-han').severity, 'error');
});

test('大陸用語是 error 並給台灣替代詞', () => {
  const r = chat('請先清除緩存，然後調用這個接口取得數據。');
  assert.ok(has(r, 'cn-term'));
  const msgs = r.findings.filter((f) => f.rule === 'cn-term').map((f) => f.message).join('|');
  assert.match(msgs, /快取/);
  assert.match(msgs, /呼叫/);
});

test('「代碼」有語境排除：股票代碼不判、原始碼要判', () => {
  assert.equal(has(chat('輸入股票代碼就可以查詢，錯誤代碼 500 也一樣。'), 'cn-term'), false);
  assert.ok(has(chat('把這段代碼複製過去就好。'), 'cn-term'));
});

test('「用戶端」不判、「用戶」要判', () => {
  assert.equal(has(chat('用戶端會自己重試一次。'), 'cn-term'), false);
  assert.ok(has(chat('這個功能是給用戶使用的。'), 'cn-term'));
});

test('乾淨的台灣用語不該有 cn-term', () => {
  const r = chat('請先清除快取，然後呼叫這個介面取得資料，使用者就會看到畫面了。');
  assert.equal(has(r, 'cn-term'), false);
});

// ── 慣用寫法 ─────────────────────────────────────────────────────────────

test('蠻 → 滿 是 error', () => {
  const r = chat('這個東西蠻好用的');
  assert.ok(has(r, 'man-char'));
  assert.equal(r.findings.find((f) => f.rule === 'man-char').severity, 'error');
  assert.equal(has(chat('這個東西滿好用的'), 'man-char'), false);
});

test('簡單來說 / 舉例來說 / 但是 會被提醒改成 Ray 的寫法', () => {
  assert.ok(has(chat('簡單來說就是這樣'), 'prefer-form'));
  assert.ok(has(chat('舉例來說我們可以這樣寫'), 'prefer-form'));
  assert.ok(has(chat('可以這樣寫，但是要注意順序'), 'prefer-form'));
  assert.equal(has(chat('簡單來講就是這樣，可是要注意順序'), 'prefer-form'), false);
});

// ── AI 腔 ────────────────────────────────────────────────────────────────

test('語料實測 0 次的 AI 腔是 error', () => {
  const r = chat('綜上所述，這個功能至關重要。');
  assert.ok(has(r, 'never-phrase'));
  assert.equal(r.findings.find((f) => f.rule === 'never-phrase').severity, 'error');
});

test('never-phrase 清單不包含 Ray 實際會用的詞', () => {
  const list = profile.rules.find((r) => r.id === 'never-phrase').phrases;
  // 「本文將」是他頁尾樣板（本文將同步更新至以下網站），實測 60 篇，不能列為 0 次
  assert.equal(list.includes('本文將'), false);
  assert.equal(list.includes('首先'), false);
  assert.equal(list.includes('我們'), false);
});

test('reduce-phrase 只給 warning', () => {
  const r = chat('接下來讓我們看看這段程式碼');
  assert.ok(has(r, 'reduce-phrase'));
  assert.equal(r.findings.find((f) => f.rule === 'reduce-phrase').severity, 'warning');
});

// ── 標點與排版 ───────────────────────────────────────────────────────────

test('emoji 是 error', () => {
  assert.ok(has(chat('這樣就完成了 🎉'), 'emoji'));
  assert.equal(has(chat('這樣就完成了'), 'emoji'), false);
});

test('中英之間沒空格會被抓', () => {
  assert.ok(has(chat('我們使用Docker來封裝專案'), 'cjk-latin-space'));
  assert.equal(has(chat('我們使用 Docker 來封裝專案'), 'cjk-latin-space'), false);
});

test('中文句子裡的半形標點會被抓', () => {
  assert.ok(has(chat('這是什麼呢?我也不知道'), 'halfwidth-punct'));
  assert.equal(has(chat('這是什麼呢？我也不知道'), 'halfwidth-punct'), false);
});

// ── 節奏 ─────────────────────────────────────────────────────────────────

test('過厚的段落會被抓，一句一段不會', () => {
  const fat = '這是第一句話而且講了滿多東西。這是第二句話。這是第三句話。這是第四句話。這是第五句話。';
  assert.ok(has(doc(fat), 'fat-paragraph'));
  const thin = ['這是第一句話而且講了滿多東西。', '', '這是第二句話。', '', '這是第三句話。'].join('\n');
  assert.equal(has(doc(thin), 'fat-paragraph'), false);
});

test('長句本身不該被判（Ray 的句子本來就長）', () => {
  const long = '這一篇將會介紹如何使用這個工具來處理專案的建置流程，因為這個流程其實滿容易踩到雷的，'
    + '所以這邊就把我自己遇到的狀況整理一下，讓你可以少走一點冤枉路。';
  assert.equal(has(chat(long), 'long-sentence'), false);
});

test('第一人稱密度過低會被抓', () => {
  const impersonal = '本工具提供設定檔載入功能。'.repeat(40);
  assert.ok(has(chat(impersonal), 'first-person'));
});

// ── markdown 文件（只在 doc 模式）───────────────────────────────────────

test('h4 會被抓', () => {
  assert.ok(has(doc('## 標題\n\n內容\n\n#### 小標題\n\n內容'), 'heading-depth'));
});

test('code fence 沒標語言會被抓', () => {
  assert.ok(has(doc('## 標題\n\n內容\n\n```\nnpm install\n```'), 'code-fence-lang'));
  assert.equal(has(doc('## 標題\n\n內容\n\n```bash\nnpm install\n```'), 'code-fence-lang'), false);
});

test('表格分隔線沒空格會被抓', () => {
  assert.ok(has(doc('## 標題\n\n內容\n\n| a | b |\n|---|---|\n| 1 | 2 |'), 'table-sep-space'));
  assert.equal(has(doc('## 標題\n\n內容\n\n| a | b |\n| ------ | ------ |\n| 1 | 2 |'), 'table-sep-space'), false);
});

// ── 整體 ─────────────────────────────────────────────────────────────────

test('一段像 Ray 的文字應該零 error', () => {
  const good = '這一篇稍微來聊一下 Docker 是什麼，其實它的概念滿簡單的，'
    + '你可以把它想像成一個獨立的小房間，裡面裝好了你的程式需要的所有東西，'
    + '所以不管搬到哪一台機器上都可以正常跑起來。';
  const r = chat(good);
  assert.equal(r.stats.errors, 0, `不該有 error：${JSON.stringify(r.findings, null, 2)}`);
});

test('stats 有回報「」與第一人稱密度', () => {
  const r = chat('我這邊要跟你講一件事情，這個東西滿重要的。');
  assert.equal(typeof r.stats.quotePer10k, 'number');
  assert.ok(r.stats.firstPersonPer10k > 0);
  assert.ok(r.stats.cjk > 0);
});

test('findings 依嚴重度排序，error 在最前面', () => {
  const r = chat('这个东西蠻好用的，我們使用Docker來處理。');
  const order = { error: 0, warning: 1, info: 2 };
  for (let i = 1; i < r.findings.length; i += 1) {
    assert.ok(order[r.findings[i - 1].severity] <= order[r.findings[i].severity]);
  }
});

test('同一行同一規則不重複回報', () => {
  const r = chat('蠻好用蠻方便蠻棒的');
  assert.equal(r.findings.filter((f) => f.rule === 'man-char').length, 1);
});

// ── 停用標記 ─────────────────────────────────────────────────────────────

test('check-voice-disable / enable 區塊內不檢查', () => {
  const doc = [
    '這段是正常的內容。',
    '',
    '<!-- check-voice-disable -->',
    '',
    '禁用詞示範：綜上所述、蠻好用的、緩存。',
    '',
    '<!-- check-voice-enable -->',
    '',
    '這段又要檢查了，蠻好用的。',
  ].join('\n');
  const r = chat(doc);
  const lines = r.findings.map((f) => f.line);
  assert.equal(lines.includes(5), false, '停用區塊內不該有 finding');
  assert.ok(lines.includes(9), '停用區塊外要照常檢查');
});

test('check-voice-disable-next-line 只跳過下一行', () => {
  const doc = ['<!-- check-voice-disable-next-line -->', '這行蠻多的不檢查。', '這行蠻多的要檢查。'].join('\n');
  const r = chat(doc);
  const lines = r.findings.filter((f) => f.rule === 'man-char').map((f) => f.line);
  assert.deepEqual(lines, [3]);
});

test('停用標記也套用到 markdown 結構規則（h4 / fence 語言）', () => {
  const md = ['## 標題', '', '內容', '', '<!-- check-voice-disable -->', '', '#### 這個 h4 是範例', '', '```', 'x', '```'].join('\n');
  const r = doc(md);
  assert.equal(has(r, 'heading-depth'), false);
  assert.equal(has(r, 'code-fence-lang'), false);
});

// ── 新增的用語與模式 ─────────────────────────────────────────────────────

test('擴充後的大陸用語表抓得到常見詞', () => {
  for (const w of ['拷貝一份過去', '設定自定義欄位', '打開菜單', '這個模板不錯', '匯出文檔']) {
    assert.ok(has(chat(w), 'cn-term'), `應該抓到：${w}`);
  }
});

test('「筆者」會被提醒改成「我」', () => {
  assert.ok(has(chat('筆者認為這樣比較好'), 'prefer-form'));
});

test('doc 模式才檢查 markdown 格式，chat 模式不檢查', () => {
  const md = '內容\n\n```\nnpm install\n```';
  assert.ok(has(doc(md), 'code-fence-lang'));
  assert.equal(has(chat(md), 'code-fence-lang'), false);
});

test('已移除的部落格專用規則不在 profile 裡', () => {
  const ids = profile.rules.map((r) => r.id);
  for (const gone of ['missing-intro', 'missing-outro', 'flat-ending']) {
    assert.equal(ids.includes(gone), false, `${gone} 應該已移除`);
  }
});

// ── table-sep 誤判修正 ───────────────────────────────────────────────────

test('表格行裡的行內 code 示範錯誤分隔線不算數', () => {
  const md = ['## 標題', '', '| 符號 | 規則 |', '| ------ | ------ |',
    '| 表格分隔線 | 要有空格：`| ------ |`，不寫 `|------|` |'].join('\n');
  assert.equal(has(doc(md), 'table-sep-space'), false);
});
