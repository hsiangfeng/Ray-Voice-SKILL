#!/usr/bin/env node
/**
 * check-voice.mjs — ray-voice 語氣驗證器（零依賴，Node ≥ 18）
 *
 * 依 ../assets/voice-profile.json 檢查一段中文：
 *   - 繁體台灣用語：簡體字、大陸用語（error）／看語境的詞（warning）
 *   - 語料實測 0 出現的 AI 腔（error）、近年幾乎不用的詞（warning）
 *   - 慣用寫法：蠻→滿、簡單來說→簡單來講、但是→可是、或者→or
 *   - 標點排版：emoji、中英空格、半形標點、「」／粗體／驚嘆號密度
 *   - 節奏：句子過長、段落過厚、第一人稱密度過低
 *   - markdown 文件（--mode doc）：標題深度、code fence 語言、表格分隔線
 *
 * 停用（討論規範本身的文件會逐字引用被禁的詞，那不是違規）：
 *   <!-- check-voice-disable -->  …  <!-- check-voice-enable -->   區塊停用
 *   <!-- check-voice-disable-next-line -->                          單行停用
 *
 * 用法：
 *   node check-voice.mjs -m "一段回覆"              驗一段回覆
 *   node check-voice.mjs draft.md                   驗一份 markdown
 *   node check-voice.mjs content/**\/*.md            驗多份
 *   echo "文字" | node check-voice.mjs -             從 stdin 讀
 * 選項：
 *   --mode doc|chat|auto       auto（預設）：.md 檔走 doc，-m／stdin 走 chat
 *   --strict                   warning 也算失敗
 *   --json                     輸出 JSON
 *   --profile <path>           指定 voice-profile.json
 *   --help
 * 結束碼：0 全過；1 有 error（或 --strict 下有 warning）；2 用法錯誤。
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_PROFILE = path.join(HERE, '..', 'assets', 'voice-profile.json');

/**
 * 常見「僅簡體有」的字 — 只收兩岸字位不同、且繁體不會用到的字。
 */
const SIMPLIFIED_CHARS =
  '们这个为会时说过还进对开关长从应样没来与两让该见学习写读儿几别电现经问题动无论图数据库网络请错误设优实组页参类状态项处调显变运编译测试认识选择单输结构务统级属标签记录语词转换检询报备权访连传递归异缓载视频质确删辑环启继续终计机脑层隐击览观释义议证验简体边达头张发复内';

const CJK = '\\u4e00-\\u9fff';
const CJK_RE = new RegExp(`[${CJK}]`, 'g');
const EMOJI_RE =
  /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{2B00}-\u{2BFF}\u{FE0F}\u{1F000}-\u{1F0FF}]/gu;

// ── 讀取設定 ──────────────────────────────────────────────────────────────

/** 讀 voice-profile.json。@param {string} p @returns {object} */
export function loadProfile(p = DEFAULT_PROFILE) {
  if (!existsSync(p)) throw new Error(`找不到 profile：${p}`);
  return JSON.parse(readFileSync(p, 'utf8'));
}

// ── 前處理：遮蔽不該檢查的區塊，但保住行號與欄位 ──────────────────────────

/** 用等長空白蓋掉一段文字，讓行號與 column 維持正確。 */
const blank = (s) => ' '.repeat([...s].length);

/**
 * 把原始文字切成逐行紀錄，標好哪些行是程式碼／frontmatter／表格，
 * 並把行內的 inline code、網址、圖片、連結目標遮成空白。
 * @param {string} raw
 * @returns {{lines: Array<{no:number, raw:string, prose:string, kind:string}>}}
 */
export function scan(raw) {
  const src = raw.replace(/\r\n?/g, '\n').split('\n');
  const lines = [];
  let inFence = false;
  let fenceInfo = '';
  let inFrontmatter = false;
  let suppressed = false;
  let suppressNext = false;

  src.forEach((text, i) => {
    const no = i + 1;
    let kind = 'prose';

    // 停用標記：討論規範本身的文件會逐字引用被禁的詞，那不是違規。
    if (/<!--\s*check-voice-disable\s*-->/.test(text)) suppressed = true;
    if (/<!--\s*check-voice-enable\s*-->/.test(text)) suppressed = false;
    const skipThis = suppressed || suppressNext;
    suppressNext = /<!--\s*check-voice-disable-next-line\s*-->/.test(text);

    if (i === 0 && text.trim() === '---') {
      inFrontmatter = true;
      kind = 'frontmatter';
    } else if (inFrontmatter) {
      kind = 'frontmatter';
      if (text.trim() === '---') inFrontmatter = false;
    } else {
      const fence = text.match(/^\s*```+\s*(\S*)/);
      if (fence) {
        if (!inFence) {
          inFence = true;
          fenceInfo = fence[1] || '';
          kind = 'fence-open';
        } else {
          inFence = false;
          kind = 'fence-close';
        }
      } else if (inFence) {
        kind = 'code';
      } else if (/^\s*\|/.test(text)) {
        kind = 'table';
      } else if (/^\s*#{1,6}\s/.test(text)) {
        kind = 'heading';
      } else if (/^\s*>/.test(text)) {
        kind = 'quote';
      }
    }

    let prose = '';
    if (!skipThis && (kind === 'prose' || kind === 'quote' || kind === 'heading')) {
      prose = text
        .replace(/!\[[^\]]*\]\([^)]*\)/g, blank)
        .replace(/\[([^\]]*)\]\(([^)]*)\)/g, (m, label) => `${blank('[')}${label}${blank(`](${''})`)}${blank(m.slice(label.length + 3))}`)
        .replace(/https?:\/\/\S+/g, blank)
        .replace(/`[^`\n]*`/g, blank)
        .replace(/<!--[\s\S]*?-->/g, blank)
        .replace(/<[^>]+>/g, blank);
      // 長度可能因 link 替換而變，簡化處理：只要長度不同就退回較保守的遮法
      if (prose.length !== text.length) {
        prose = text
          .replace(/!\[[^\]]*\]\([^)]*\)/g, blank)
          .replace(/\[[^\]]*\]\([^)]*\)/g, blank)
          .replace(/https?:\/\/\S+/g, blank)
          .replace(/`[^`\n]*`/g, blank)
          .replace(/<!--[\s\S]*?-->/g, blank)
          .replace(/<[^>]+>/g, blank);
      }
    }

    lines.push({
      no, raw: text, prose, kind, suppressed: skipThis,
      fenceInfo: kind === 'fence-open' ? fenceInfo : '',
    });
  });

  return { lines };
}

// ── 檢查 ─────────────────────────────────────────────────────────────────

/** 建一筆 finding。 */
const F = (rule, severity, line, message, snippet, hint) => ({
  rule, severity, line, message, snippet, hint,
});

const cjkCount = (s) => (s.match(CJK_RE) || []).length;

/**
 * 主檢查。
 * @param {string} raw 原文
 * @param {{mode?: 'doc'|'chat', profile?: object, label?: string}} opts
 * @returns {{label:string, mode:string, findings:Array, stats:object}}
 */
export function check(raw, opts = {}) {
  const profile = opts.profile || loadProfile();
  const mode = opts.mode === 'doc' ? 'doc' : 'chat';
  const { lines } = scan(raw);
  const findings = [];

  const proseLines = lines.filter((l) => l.kind === 'prose' || l.kind === 'quote');
  const proseText = proseLines.map((l) => l.prose).join('\n');
  const totalCjk = cjkCount(proseText);
  const per10k = (n) => (totalCjk ? (n / totalCjk) * 10000 : 0);

  /** 對每個散文行跑一次 fn(line)。 */
  const eachProse = (fn) => proseLines.forEach(fn);

  for (const rule of profile.rules) {
    if (rule.mode && rule.mode !== mode) continue;

    switch (rule.type) {
      case 'simplified': {
        const re = new RegExp(`[${SIMPLIFIED_CHARS}]`, 'g');
        eachProse((l) => {
          const hits = [...new Set(l.prose.match(re) || [])];
          if (hits.length) {
            findings.push(F(rule.id, rule.severity, l.no, `${rule.message}：${hits.join('、')}`, l.raw.trim(), rule.hint));
          }
        });
        break;
      }

      case 'terms': {
        for (const [bad, good] of Object.entries(rule.terms)) {
          const re = new RegExp(bad, 'g');
          eachProse((l) => {
            if (re.test(l.prose)) {
              re.lastIndex = 0;
              findings.push(F(rule.id, rule.severity, l.no, `${rule.message}「${bad}」→「${good}」`, l.raw.trim(), rule.hint));
            }
          });
        }
        break;
      }

      case 'phrases': {
        for (const phrase of rule.phrases) {
          eachProse((l) => {
            if (l.prose.includes(phrase)) {
              findings.push(F(rule.id, rule.severity, l.no, `${rule.message}：「${phrase}」`, l.raw.trim(), rule.hint));
            }
          });
        }
        break;
      }

      case 'swap': {
        for (const [bad, good] of Object.entries(rule.swaps)) {
          eachProse((l) => {
            if (l.prose.includes(bad)) {
              findings.push(F(rule.id, rule.severity, l.no, `${rule.message}：「${bad}」→「${good}」`, l.raw.trim(), rule.hint));
            }
          });
        }
        break;
      }

      case 'emoji': {
        eachProse((l) => {
          const hits = l.prose.match(EMOJI_RE);
          if (hits) findings.push(F(rule.id, rule.severity, l.no, `${rule.message}：${hits.join('')}`, l.raw.trim(), rule.hint));
        });
        break;
      }

      case 'spacing': {
        const missA = new RegExp(`[${CJK}][A-Za-z0-9]`, 'g');
        const missB = new RegExp(`[A-Za-z0-9][${CJK}]`, 'g');
        eachProse((l) => {
          const hits = [...(l.prose.match(missA) || []), ...(l.prose.match(missB) || [])];
          if (hits.length) {
            findings.push(F(rule.id, rule.severity, l.no, `${rule.message}：${[...new Set(hits)].slice(0, 5).join('、')}`, l.raw.trim(), rule.hint));
          }
        });
        break;
      }

      case 'halfwidth': {
        const re = new RegExp(`[${CJK}]\\s*[,;?!]\\s*(?=[${CJK}]|$)`, 'g');
        eachProse((l) => {
          const hits = l.prose.match(re);
          if (hits) findings.push(F(rule.id, rule.severity, l.no, `${rule.message}：${hits.map((h) => h.trim()).join('、')}`, l.raw.trim(), rule.hint));
        });
        break;
      }

      case 'density': {
        let n;
        if (rule.counts_pairs) {
          n = (proseText.match(/\*\*[^*\n]+\*\*/g) || []).length;
        } else {
          n = proseText.split(rule.pattern).length - 1;
        }
        const d = per10k(n);
        if (totalCjk >= 300 && d > rule.per_10k_above) {
          findings.push(F(rule.id, rule.severity, 0, `${rule.message}（每萬字 ${d.toFixed(0)} 次，門檻 ${rule.per_10k_above}）`, `共 ${n} 次`, rule.hint));
        }
        break;
      }

      case 'sentence-len': {
        eachProse((l) => {
          for (const s of l.prose.split(/[。！？]/)) {
            const n = cjkCount(s);
            if (n > rule.cjk_above) {
              findings.push(F(rule.id, rule.severity, l.no, `${rule.message}：這句 ${n} 個中文字`, `${s.trim().slice(0, 40)}…`, rule.hint));
            }
          }
        });
        break;
      }

      case 'paragraph': {
        let buf = [];
        const flush = () => {
          if (!buf.length) return;
          const text = buf.map((l) => l.prose).join('');
          const n = text.split(/[。！？]/).filter((s) => cjkCount(s) >= 3).length;
          if (n > rule.sentences_above) {
            findings.push(F(rule.id, rule.severity, buf[0].no, `${rule.message}：這段有 ${n} 句`, `${text.trim().slice(0, 40)}…`, rule.hint));
          }
          buf = [];
        };
        lines.forEach((l) => {
          if (l.kind === 'prose' && l.raw.trim() && !/^\s*[-*>|#\d]/.test(l.raw)) buf.push(l);
          else flush();
        });
        flush();
        break;
      }

      case 'first-person': {
        if (totalCjk < 400) break;
        const n = (proseText.match(/我|你/g) || []).length;
        const d = per10k(n);
        if (d < rule.per_10k_below) {
          findings.push(F(rule.id, rule.severity, 0, `${rule.message}（每萬字 ${d.toFixed(0)} 次，門檻 ${rule.per_10k_below}）`, `我／你 共 ${n} 次`, rule.hint));
        }
        break;
      }

      case 'heading-depth': {
        lines.forEach((l) => {
          if (l.suppressed) return;
          const m = l.kind === 'heading' && l.raw.match(/^\s*(#{1,6})\s/);
          if (m && m[1].length > rule.max) {
            findings.push(F(rule.id, rule.severity, l.no, `${rule.message}：出現 h${m[1].length}`, l.raw.trim(), rule.hint));
          }
        });
        break;
      }

      case 'fence-lang': {
        lines.forEach((l) => {
          if (!l.suppressed && l.kind === 'fence-open' && !l.fenceInfo) {
            findings.push(F(rule.id, rule.severity, l.no, rule.message, l.raw.trim(), rule.hint));
          }
        });
        break;
      }

      case 'table-sep': {
        lines.forEach((l) => {
          if (l.suppressed || l.kind !== 'table') return;
          // 表格行裡的行內 code 可能在示範錯誤寫法，先遮掉再檢查
          const masked = l.raw.replace(/`[^`\n]*`/g, blank);
          if (/\|-{2,}/.test(masked) || /-{2,}\|/.test(masked)) {
            findings.push(F(rule.id, rule.severity, l.no, rule.message, l.raw.trim(), rule.hint));
          }
        });
        break;
      }

      default:
        break;
    }
  }

  // 去重：同一行同一規則同一訊息只留一筆
  const seen = new Set();
  const deduped = findings.filter((f) => {
    const k = `${f.rule}|${f.line}|${f.message}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  const order = { error: 0, warning: 1, info: 2 };
  deduped.sort((a, b) => order[a.severity] - order[b.severity] || a.line - b.line);

  return {
    label: opts.label || '(text)',
    mode,
    findings: deduped,
    stats: {
      cjk: totalCjk,
      quotePer10k: +per10k(proseText.split('「').length - 1).toFixed(1),
      firstPersonPer10k: +per10k((proseText.match(/我|你/g) || []).length).toFixed(1),
      errors: deduped.filter((f) => f.severity === 'error').length,
      warnings: deduped.filter((f) => f.severity === 'warning').length,
      infos: deduped.filter((f) => f.severity === 'info').length,
    },
  };
}

// ── CLI ──────────────────────────────────────────────────────────────────

const MARK = { error: '✖', warning: '▲', info: '·' };

/** 印出人看的報告。 */
function report(results, strict) {
  let bad = false;
  for (const r of results) {
    const { errors, warnings, infos } = r.stats;
    console.log(`\n${r.label}  [${r.mode}]  ${r.stats.cjk} 中文字`);
    if (!r.findings.length) {
      console.log('  ✔ 語氣檢查通過');
    } else {
      for (const f of r.findings) {
        const where = f.line ? `L${f.line}` : '整份';
        console.log(`  ${MARK[f.severity]} ${where}  ${f.message}`);
        if (f.snippet) console.log(`      ${f.snippet}`);
        if (f.hint) console.log(`      → ${f.hint}`);
      }
    }
    console.log(`  小計：error ${errors}／warning ${warnings}／info ${infos}` +
      `　（「」每萬字 ${r.stats.quotePer10k}、我你每萬字 ${r.stats.firstPersonPer10k}）`);
    if (errors || (strict && warnings)) bad = true;
  }
  return bad;
}

/** 讀 stdin。 */
async function readStdin() {
  const chunks = [];
  for await (const c of process.stdin) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function main() {
  let parsed;
  try {
    parsed = parseArgs({
      allowPositionals: true,
      options: {
        mode: { type: 'string', default: 'auto' },
        message: { type: 'string', short: 'm' },
        profile: { type: 'string' },
        strict: { type: 'boolean', default: false },
        json: { type: 'boolean', default: false },
        help: { type: 'boolean', short: 'h', default: false },
      },
    });
  } catch (e) {
    console.error(`用法錯誤：${e.message}`);
    process.exit(2);
  }

  const { values: v, positionals } = parsed;
  if (v.help) {
    console.log(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('*/')[0].replace(/^#!.*\n/, ''));
    process.exit(0);
  }

  let profile;
  try {
    profile = loadProfile(v.profile || DEFAULT_PROFILE);
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }

  const results = [];
  const pickMode = (isFile, file) =>
    v.mode === 'doc' || v.mode === 'chat'
      ? v.mode
      : isFile && /\.mdx?$/i.test(file || '') ? 'doc' : 'chat';

  if (v.message != null) {
    results.push(check(v.message, { profile, mode: pickMode(false), label: '(-m)' }));
  } else if (positionals.length === 1 && positionals[0] === '-') {
    results.push(check(await readStdin(), { profile, mode: pickMode(false), label: '(stdin)' }));
  } else if (positionals.length) {
    for (const f of positionals) {
      if (!existsSync(f)) {
        console.error(`找不到檔案：${f}`);
        process.exit(2);
      }
      results.push(check(readFileSync(f, 'utf8'), { profile, mode: pickMode(true, f), label: f }));
    }
  } else if (!process.stdin.isTTY) {
    results.push(check(await readStdin(), { profile, mode: pickMode(false), label: '(stdin)' }));
  } else {
    console.error('用法：node check-voice.mjs -m "文字" ｜ <file.md> ｜ -   （--help 看說明）');
    process.exit(2);
  }

  if (v.json) {
    console.log(JSON.stringify(results, null, 2));
    const bad = results.some((r) => r.stats.errors || (v.strict && r.stats.warnings));
    process.exit(bad ? 1 : 0);
  }

  process.exit(report(results, v.strict) ? 1 : 0);
}

if (import.meta.url === pathToFileURLSafe(process.argv[1])) {
  main();
}

/** process.argv[1] → file URL，供「是否被直接執行」判斷。 */
function pathToFileURLSafe(p) {
  if (!p) return '';
  try {
    return new URL(`file://${path.resolve(p)}`).href;
  } catch {
    return '';
  }
}
