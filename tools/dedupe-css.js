// 删除 CSS 里"选择器+块体"完全相同的重复定义，保留首次出现。
// 重要：只删完全相同的。像 .stock-item{gap:5px;padding:4px 8px} 这种只改
// 部分属性的"补丁式"定义必须保留——它依赖前一个 .stock-item 的完整定义，
// 删了会导致 padding/gap 等回退到默认值。
const fs = require('fs');
const p = process.argv[2] || 'src/styles.css';
const src = fs.readFileSync(p, 'utf8');

// 按 { } 切块，记录每块的起始位置
const blocks = [];
let i = 0;
while (i < src.length) {
  const b = src.indexOf('{', i);
  if (b < 0) break;
  const s = src.lastIndexOf(' ', b);
  // 选择器从上一个 '}' 或文件开头之后开始
  const prev = src.lastIndexOf('}', b);
  const selStart = (prev < 0 ? 0 : prev + 1);
  // 跳过注释
  let selEnd = b;
  let depth = 0;
  for (let k = b; k < src.length; k++) {
    if (src[k] === '{') depth++;
    else if (src[k] === '}') { depth--; if (depth === 0) { selEnd = k + 1; break; } }
  }
  const sel = src.slice(selStart, b).trim();
  const body = src.slice(b, selEnd);
  if (sel && body) blocks.push({ sel, body, start: selStart, end: selEnd, norm: body.replace(/\s+/g, '') });
  i = selEnd;
}

const seen = new Map();
const toDel = [];
for (const blk of blocks) {
  const key = blk.sel + '||' + blk.norm;
  if (seen.has(key)) toDel.push(blk);
  else seen.set(key, blk.start);
}

if (!toDel.length) { console.log('没有完全相同的重复块'); process.exit(0); }

// 从后往前删，避免位置偏移
let out = src;
for (const blk of toDel.sort((a, b) => b.start - a.start)) {
  // 连同它前面紧邻的注释一起删（"/* 工具独立栏 */" 这种重复注释）
  let start = blk.start;
  const before = src.slice(0, start);
  const cm = before.match(/\/\*[\s\S]*?\*\/\s*$/);
  if (cm) start = start - cm[0].length;
  out = out.slice(0, start) + out.slice(blk.end);
}

fs.writeFileSync(p, out, 'utf8');
console.log('删除 ' + toDel.length + ' 个完全相同的重复定义：');
toDel.forEach(b => console.log('  ' + b.sel + '  (' + (b.body.replace(/\s+/g, '').length) + ' 字符)'));
const before = src.split('\n').length, after = out.split('\n').length;
console.log('styles.css: ' + before + ' 行 → ' + after + ' 行');
