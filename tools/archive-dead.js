// 把"定义了但从未被调用"的函数从 app.js 移到 src/dead-code.js。
// 不是删除：保留可恢复性。上个会话的教训就是"改了没回头清理"，
// 直接删死代码风险太高——万一哪天又用上了。
//
// 注意：静态扫描有盲区。doCook / doEat 看起来是死代码，
// 但它们被 L1326 的 `const fn = eatMode ? 'doEat' : 'doCook'` 以字符串形式动态引用，
// 纯文本搜索抓不到，所以必须人工排除。排除名单见 EXCLUDE。
const fs = require('fs');

const EXCLUDE = new Set([
  'doCook',   // L1326 字符串动态引用
  'doEat',    // L1326 字符串动态引用
]);

const DEAD = [
  'thumbS', 'treeNeed', 'bannedCats', 'bannedDrinks', 'matchDemand', 'filterMatch',
  'dishCategory', 'retMat', 'stockHint', 'doLock', 'doUnlock', 'addOrder', 'delOrder',
  'decant', 'addPot', 'dishCount', 'drinkCount', 'isAlcDrink', 'aspKey',
  'renderTeachings', 'bindCollapse',
];

const appPath = 'src/app.js';
const outPath = 'src/dead-code.js';
let app = fs.readFileSync(appPath, 'utf8');
const lines = app.split('\n');
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const removed = [];
const kept = [];
const toRemove = new Map(); // lineIdx -> text

for (const fn of DEAD) {
  const re = new RegExp('\\b' + esc(fn) + '\\b(?!\\s*\\()', 'g');
  const bare = [...app.matchAll(re)];
  // 裸引用（不含定义行、不含调用）
  const defIdx = lines.findIndex(l => l.includes('function ' + fn + '('));
  const realBare = bare.filter(m => {
    const li = app.slice(0, m.index).split('\n').length - 1;
    return li !== defIdx;
  });
  if (realBare.length) {
    console.log('⚠ 跳过 ' + fn + '（发现 ' + realBare.length + ' 处裸引用，非纯死代码）');
    kept.push(fn);
    continue;
  }
  // 提取函数体
  if (defIdx < 0) { console.log('⚠ 找不到 ' + fn + '，跳过'); kept.push(fn); continue; }
  let i = defIdx;
  // 往前收集紧邻的注释块
  let commentStart = i;
  while (commentStart > 0 && /^\s*\/\//.test(lines[commentStart - 1])) commentStart--;
  // 找到函数结束：大括号配对
  let j = i, depth = 0, started = false;
  while (j < lines.length) {
    for (const ch of lines[j]) {
      if (ch === '{') { depth++; started = true; }
      else if (ch === '}') { depth--; if (started && depth === 0) break; }
    }
    if (started && depth === 0) break;
    j++;
  }
  const block = lines.slice(commentStart, j + 1).join('\n');
  toRemove.set(i, block);
  removed.push({ fn, lines: commentStart + 1, to: j + 1, block });
}

if (!removed.length) { console.log('没有可归档的函数'); process.exit(0); }

// 按起始行排序后从后往前删，避免行号错位
const sorted = [...removed].sort((a, b) => b.lines - a.lines);
for (const r of sorted) {
  const end = lines.findIndex((_, k) => k >= r.lines - 1 && lines.slice(k).join('\n').startsWith(r.block.slice(0, 40)));
  // 用文本匹配删除更稳妥
  const idx = app.lastIndexOf(r.block);
  if (idx < 0) { console.log('⚠ 未能定位 ' + r.fn + '，跳过'); continue; }
  const before = app.slice(0, idx);
  app = before + app.slice(idx + r.block.length);
}

fs.writeFileSync(appPath, app, 'utf8');

const header = `// 已归档的死代码：以下函数在 app.js 中定义但从未被调用，从主文件移出。
// 用途：保留可恢复性，而不是直接删除。
//
// 为什么不做成静态分析自动判断？因为有两个"假死"陷阱：
//   1. doCook / doEat 被 \`const fn = eatMode ? 'doEat' : 'doCook'\` 以字符串形式引用，
//      纯文本搜索抓不到，误删会导致"上桌"按钮失效。
//   2. renderTeachings（复数）是 typo，真正用的是 renderTeaching（单数）——
//      这类拼写错误靠人工判断。
//
// 恢复方法：把对应函数粘回 app.js，重新构建即可。
// 本文件不参与构建（不在 index.html 的 script 引用里）。
`;
fs.writeFileSync(outPath, header + '\n' + removed.map(r => '// ---- ' + r.fn + ' (原 L' + r.lines + '-' + r.to + ') ----\n' + r.block + '\n').join('\n'), 'utf8');

console.log('已归档 ' + removed.length + ' 个函数 → ' + outPath);
removed.forEach(r => console.log('  ' + r.fn + '  (原 L' + r.lines + '-' + r.to + ', ' + r.block.split('\n').length + ' 行)'));
if (kept.length) console.log('保留（非纯死代码）：' + kept.join('、'));
console.log('app.js: ' + lines.length + ' 行 → ' + app.split('\n').length + ' 行');
