// 校验 data.json 的结构与交叉一致性。
// 这是这个项目最值钱也最没保护的部分——规则全靠数据，而数据此前没有任何自动校验。
// 典型后果：commit 6f2d31f「修复 RAW_EATABLE_CATS：移除编造的甜点分类」
// 靠的是上线后人工发现，而不是构建时报错。
const fs = require('fs');
const path = process.argv[2] || 'src/data.json';
const d = JSON.parse(fs.readFileSync(path, 'utf8'));

const issues = [];
const warn = (msg) => issues.push({ level: '✗', msg });
const note = (msg) => issues.push({ level: '⚠', msg });
const ok = (n, what) => console.log('  ✓ ' + n + ' ' + what);

console.log('校验数据：' + path);

// 1. 必需顶层字段
const required = ['visitors', 'FOODS', 'recipe_trees', 'aspects', 'catalog', 'salons', 'tools', 'teachings'];
missing0: for (const k of required) {
  if (!d[k]) { warn('缺少必需字段 ' + k); continue; }
  ok(d[k].length !== undefined ? d[k].length + ' 条' : '存在', k);
}
if (issues.length === 0) console.log();

// 2. 菜谱完整性：每道菜必须有配方树
const foodNames = new Set(d.FOODS.map(f => f.名称));
const treeNames = new Set(Object.keys(d.recipe_trees));
const noTree = [...foodNames].filter(n => !treeNames.has(n));
if (noTree.length) warn('FOODS 里有 ' + noTree.length + ' 道菜没有配方树：' + noTree.join('、'));
else ok(foodNames.size, '道菜全部有配方树');
const treeNoFood = [...treeNames].filter(n => !foodNames.has(n));
if (treeNoFood.length) note('配方树里有 ' + treeNoFood.length + ' 项不是可上桌菜品（可能是中间产物）：' + treeNoFood.slice(0, 5).join('、') + (treeNoFood.length > 5 ? '…' : ''));

// 3. 图片引用完整性
const imgSrc = new Set(Object.keys(d.images || {}));
const imgRef = new Set(Object.keys(d.img_map || {}));
const imgMissing = [...imgRef].filter(k => !imgSrc.has(k));
if (imgMissing.length) warn('img_map 引用了 ' + imgMissing.length + ' 张不存在的图片：' + imgMissing.slice(0, 5).join('、'));
else ok(imgSrc.size, '张图片全部可引用');

// 4. 配方原料来源
const ings = new Set((d.catalog.食材清单 || []).map(x => x.名称));
const toolItems = new Set(d.tools && d.tools.不消耗 || []);
const rawSet = new Set();
Object.values(d.recipe_trees).forEach(t => Object.keys(t.原料 || {}).forEach(r => rawSet.add(r)));
const rawMissing = [...rawSet].filter(r => !ings.has(r) && !toolItems.has(r) && !foodNames.has(r));
if (rawMissing.length) note('配方用到 ' + rawMissing.length + ' 个未在任何来源表中出现的原料：' + rawMissing.slice(0, 8).join('、'));
else ok(rawSet.size, '种配方原料全部可溯源');

// 5. 访客偏好性相合法性
// 「无酒」「食」「饮」「无忌口」是访客表里的标记（app.js 里 demandAspects 会显式过滤掉
// '无酒'/'无忌口'），不是 13 种真性相，不应报错；其余才算异常。
const MARKERS = new Set(['无酒', '食', '饮', '无忌口']);
const aspNames = new Set(Object.keys(d.aspects));
const badPref = new Set();
d.visitors.forEach(v => {
  (v.偏好 || []).forEach(p => { if (!aspNames.has(p.性相) && !MARKERS.has(p.性相)) badPref.add(p.性相); });
  (v.喜欢的食物 || []).forEach(p => { if (!aspNames.has(p.性相) && !MARKERS.has(p.性相)) badPref.add(p.性相); });
  (v.喜欢的饮品 || []).forEach(p => { if (!aspNames.has(p.性相) && !MARKERS.has(p.性相)) badPref.add(p.性相); });
});
if (badPref.size) warn('访客偏好里出现 ' + badPref.size + ' 个既非标准性相也非标记的值：' + [...badPref].join('、'));
else ok(d.visitors.length, '位访客偏好全部是标准性相或已知标记');

// 5b. 数据自相矛盾：FOODS 标注有配方数、却没有配方树。
// 已知实例：口水油 —— commit e0a32a3「口水油从菜谱删除」只从 UI 渲染里过滤掉了它，
// 但 FOODS 数据本身没清，仍标着「配方数: 1」却没有配方树。UI 过滤等于掩盖而非修复。
//
// 注：食材清单与 FOODS 有 19 项重叠（生面团、腌蘑菇、打发黄油…），这不是 bug——
// 食材清单里既有中间产物也有维基标注"可直接食用"的可上桌采集品（见 app.js 的
// isIntermediate / RAW_EATABLE 分流），所以不能用"是否在食材清单"来判断误入。
const noTreeButCount = [...foodNames].filter(n => {
  if (treeNames.has(n)) return false;
  const f = d.FOODS.find(x => x.名称 === n);
  return (f && (f.配方数 || (f.变体 && f.变体.length)));
});
if (noTreeButCount.length) warn(noTreeButCount.length + ' 道菜标注有配方却找不到配方树：' + noTreeButCount.join('、') +
  '\n    数据自相矛盾。若在 UI 里被过滤掉，那是掩盖而非修复——应从 FOODS 移除或补上配方树。');
else ok(foodNames.size, '道菜标注与配方树一致');

// 6. 宴会类型
const ban = (d.salons || []).filter(s => s.禁烈酒);
ok(d.salons.length, '种宴会（其中禁烈酒 ' + ban.length + ' 种）');

// 7. 体积提示
const bytes = fs.statSync(path).size;
const imgBytes = JSON.stringify(d.images || {}).length;
if (imgBytes / bytes > 0.5) {
  note('图片占数据 ' + (100 * imgBytes / bytes).toFixed(0) + '%（' + (imgBytes / 1048576).toFixed(2) + 'MB / ' + (bytes / 1048576).toFixed(2) + 'MB）。'
    + 'base64 内嵌会让每次 JSON.parse 读完整 5MB 字符串；建议图片拆成独立文件、img_map 只存文件名。');
}

console.log('\n' + '='.repeat(52));
const bad = issues.filter(i => i.level === '✗');
const notes = issues.filter(i => i.level === '⚠');
if (bad.length === 0) console.log('✓ 结构性错误：0');
else bad.forEach(i => console.log('  ' + i.msg));
if (notes.length) { console.log('\n⚠ 建议关注（不阻断）：'); notes.forEach(i => console.log('  ' + i.msg)); }
else console.log('✓ 无待关注项');
process.exit(bad.length ? 1 : 0);
