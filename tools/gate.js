// 构建门禁：dist/index.html 必须与正式版 index.html 结构等价，且构建可重复。
//
// 为什么需要这个 gate：上个会话的 split 把 src/index.html 的 body 整个重写成了一套
// 新外壳（.wrap/.topbar/.brand...），CSS 里根本没有这些类 → dist 构建"成功"、
// 测试全过，但浏览器打开后整页样式全丢。当时唯一发现途径是事后人工比对。
//
// 这个 gate 把那次人工比对固化下来：
//   1. 构建两次，MD5 必须一致（确定性）
//   2. dist 的 body 静态 HTML 必须与正式版逐字符一致
//   3. dist 的业务逻辑必须覆盖正式版的全部"活代码"
// 任何一条不满足就 exit 1，直接拦住发布。
const fs = require('fs');
const crypto = require('crypto');

function md5(s) { return crypto.createHash('md5').update(s).digest('hex'); }

// 提取 <body> 到 </body>，剥掉所有 <script> 和 <style>，只留静态 HTML
function staticBody(h) {
  const m = h.match(/<body>([\s\S]*?)<\/body>/);
  if (!m) return null;
  return m[1]
    .replace(/<script\b[\s\S]*?<\/script>/g, '')
    .replace(/<style\b[\s\S]*?<\/style>/g, '');
}

// 取含 renderSalon 的 script 块（排除 data.js）。
// 正式版里这个块还包含 THUMB/RAW_EATABLE_CATS 等 DATA 常量定义，dist 则把数据
// 拆进了 data.js —— 两者的分界点正好是 `const DATA = JSON.parse` 这一行，
// 所以从这一行截断，只保留之后的业务逻辑，才是可比的同一段代码。
function appLogic(h) {
  const blocks = [...h.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => m[1]);
  const app = blocks.find(b => b.includes('function renderSalon'));
  if (!app) return null;
  const a = app.indexOf('const DATA = JSON.parse');
  // 正式版是 CRLF、dist 是 LF，必须先统一行尾，否则后面 split('\n') 会因
  // 尾随 \r 让每一行都匹配失败（实测会误报 1125 行全部缺失）。
  return ((a >= 0 ? app.slice(a) : app)).replace(/\r\n/g, '\n');
}

// 两种函数定义形式都必须覆盖：
//   function foo() {...}   —— 经典形式
//   const foo = (...) => {...}   —— 箭头函数，单行时大括号配对切不出来
// 实测：escAttr 是箭头函数，如果只匹配 function 关键字，它就被完全漏过检查，
// 而它恰好是本次唯一的内容变更——漏检查会让白名单形同虚设。
function defs(code) {
  const lines = code.split('\n');
  const out = [];
  const FN = /^\s*function\s+(\w+)\s*\(/;
  const CT = /^\s*const\s+(\w+)\s*=\s*(?:\([^)]*\)\s*|[A-Za-z_$][\w$]*\s*)?=>/;

  for (let i = 0; i < lines.length; i++) {
    let m = lines[i].match(FN);
    let single = false;
    if (!m) {
      m = lines[i].match(CT);
      single = true; // 箭头函数按单行整体处理
    }
    if (!m) continue;
    const name = m[1];

    if (single) {
      // 箭头函数：从定义行开始，遇到分号结束（含中间可能跨行的情况）
      let j = i, acc = lines[i];
      while (j < lines.length - 1 && !acc.includes(';')) { j++; acc += '\n' + lines[j]; }
      out.push({ name, text: acc, norm: acc.replace(/\s+/g, '') });
      i = j;
      continue;
    }
    // function 形式：大括号配对找边界
    let depth = 0, j = i, seen = false;
    for (; j < lines.length; j++) {
      for (const ch of lines[j]) {
        if (ch === '{') { depth++; seen = true; }
        else if (ch === '}') { depth--; if (seen && depth === 0) break; }
      }
      if (seen && depth === 0) break;
    }
    out.push({ name, text: lines.slice(i, j + 1).join('\n'), norm: lines.slice(i, j + 1).join('\n').replace(/\s+/g, '') });
    i = j;
  }
  return out;
}

const refPath = 'index.html';
if (!fs.existsSync(refPath)) {
  console.log('⚠ 找不到 ' + refPath + '（正式版），跳过 gate');
  process.exit(0);
}

// 已归档的死函数：定义在 src/dead-code.js，不参与构建。
// 它们从未被调用，从 app.js 移出是预期的。
const DEAD_FN = [
  'thumbS', 'treeNeed', 'bannedCats', 'bannedDrinks', 'matchDemand', 'filterMatch',
  'dishCategory', 'retMat', 'stockHint', 'doLock', 'doUnlock', 'addOrder', 'delOrder',
  'decant', 'addPot', 'dishCount', 'drinkCount', 'isAlcDrink', 'aspKey',
  'renderTeachings', 'bindCollapse',
];
const DEAD = new Set(DEAD_FN);

// 已知内容变更：函数名两边都有，但实现不同。必须在白名单里，否则误报。
// escAttr 原本只转义 "，漏了单引号 → 全页 17 处 onclick 都是 onclick="fn('...')"
// 形式，数据里出现撇号（如 "Don't 派"）会截断字符串、按钮静默失效。已补 &#39;。
const KNOWN_DIFF = {
  escAttr: '属性值转义：新增单引号转义 &#39;，修掉 onclick 被撇号截断的 bug',

  // ---- 2026-09-25 饮品逻辑切换到维基数据 ----
  bigOfDrinks: '从手填四张表（DRINK_BIG/HALF/NEAR_FULL/NEAR_EMPTY）改为维基分装链 DRINK_BASE 查询',
  dish: '分类改为读维基 wiki_tags 的 分类列表 字段，移除 RAW_EATABLE_CATS',
  allKnownItems: 'DRINK_BIG 现在是单一数组，DRINK_SMALL 改为 DRINK_SMALL_ARR',
  canServe: 'RAW_EATABLE 由 Array 改 Set，.includes 改 .has',
  doEat: 'RAW_EATABLE 由 Array 改 Set，.includes 改 .has；双重身份物品（奶）上架时两栏同步 +1 + pool 扣减',
  stockItems: '饮品分类登记改用维基 wiki_tags.饮品.类别（DRINK_GROUPDATA）',
  aspForDrink: '杯子性相改为读维基杯子准则（CUP_ASP），移除 CAT.INGREDIENT_ASPECTS',
  renderDrinks: '容器列表改为 DRINK_BIG 单数组；allContainers 不再展开四张表',
  renderMenu: 'RAW_EATABLE 改 Set 后需 Array.from 才能 filter/map',

  // ---- 2026-09-25 奶的双重身份（既是食物又能饮品）----
  doUncook: '双重身份物品（奶）下架时两栏同步 -n + 库存返还，跳过 dishRecipe/副产物/级联逻辑',
  doServeDrink: '双重身份物品（奶）上架时两栏同步 +n + pool 扣减',
  doUnserveDrink: '双重身份物品（奶）下架时两栏同步 -n + 库存返还',
};

const NEW_FN = [
  '_buildDrinks', // 饮品模型构建：从 wiki_tags.饮品 生成容器/杯子/分装链/类别（替代原 6 张手填 catalog 表）
];

const ref = fs.readFileSync(refPath, 'utf8');
const ra = defs(appLogic(ref));

console.log('门禁检查 dist/index.html vs ' + refPath + '（正式版）');

// 1. 确定性：构建两次，MD5 必须一致
require('child_process').execSync('node scripts/build.js', { stdio: 'pipe' });
const a = fs.readFileSync('dist/index.html', 'utf8');
const ma = md5(a);
require('child_process').execSync('node scripts/build.js', { stdio: 'pipe' });
const b = fs.readFileSync('dist/index.html', 'utf8');
const mb = md5(b);
if (ma !== mb) {
  console.log('✗ 构建不确定：两次 MD5 不同（' + ma + ' vs ' + mb + '）');
  process.exit(1);
}
console.log('  ✓ 构建确定（MD5 ' + mb.slice(0, 12) + '）');

// 2. body 结构等价（忽略两端空白：正式版 body 结尾空行数量纯属格式噪声）
const rbT = staticBody(ref).trim();
const dbT = staticBody(b).trim();
if (!rbT || !dbT) {
  console.log('✗ 无法提取 body（缺少 <body> 标签？）');
  process.exit(1);
}
if (rbT !== dbT) {
  console.log('✗ body 静态 HTML 与正式版不一致！');
  console.log('   正式版 ' + rbT.length + ' 字符 / dist ' + dbT.length + ' 字符');
  let i = 0;
  while (i < Math.min(rbT.length, dbT.length) && rbT[i] === dbT[i]) i++;
  console.log('   首个差异在偏移 ' + i + '：正式版 [' + rbT.slice(i, i + 60) + '] / dist [' + dbT.slice(i, i + 60) + ']');
  process.exit(1);
}
console.log('  ✓ body 静态 HTML 与正式版逐字符一致（' + dbT.length + ' 字符，已忽略尾部空白）');

// 3. 业务逻辑：按函数块对比，而不是逐行。逐行比较会把"多行函数里只改了一行"
//    误判成缺失；函数级比较能正确区分「缺失」「修改」「新增」三种情况。
const da = defs(appLogic(b));
const mapA = new Map(ra.map(x => [x.name, x]));
const mapB = new Map(da.map(x => [x.name, x]));

const missing = ra.filter(x => !mapB.has(x.name));          // 正式版有、dist 没有
const changed = ra.filter(x => mapB.has(x.name) && mapB.get(x.name).norm !== x.norm); // 两边都有但内容不同
const added = da.filter(x => !mapA.has(x.name));            // dist 有、正式版没有

const deadMissing = missing.filter(x => DEAD.has(x.name));
const badMissing = missing.filter(x => !DEAD.has(x.name));
if (badMissing.length) {
  console.log('✗ dist 缺失了正式版里并未归档的函数（可能是意外丢失）：');
  badMissing.forEach(x => console.log('   缺失: ' + x.name));
  process.exit(1);
}
console.log('  ✓ 正式版 ' + ra.length + ' 个函数全部有对应（' + deadMissing.length + ' 个已归档至 dead-code.js）');

const unknownAdded = added.filter(x => !NEW_FN.includes(x.name));
if (unknownAdded.length) {
  console.log('✗ dist 里有正式版不存在的未知新增函数：');
  unknownAdded.forEach(x => console.log('   新增: ' + x.name));
  process.exit(1);
}
const unknownChanged = changed.filter(x => !(x.name in KNOWN_DIFF));
if (unknownChanged.length) {
  console.log('✗ dist 里存在未登记的内容变更：');
  unknownChanged.forEach(x => console.log('   变更: ' + x.name + '  ← 若是有意修改，请加入 KNOWN_DIFF'));
  process.exit(1);
}
if (changed.length) console.log('  ✓ 已登记的内容变更 ' + changed.length + ' 处：' + changed.map(x => x.name).join('、'));
if (added.length) console.log('  ✓ 已登记的新增函数 ' + added.length + ' 个：' + added.map(x => x.name).join('、'));

console.log('\n✅ gate 通过，可以发布');
