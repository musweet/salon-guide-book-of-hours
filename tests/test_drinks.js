// 饮品逻辑切换的功能验证：确认 app.js 真的从 wiki_tags.饮品 驱动
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const dataText = fs.readFileSync(path.join(repo, 'dist', 'data.json'), 'utf8');
const appJs = fs.readFileSync(path.join(repo, 'dist', 'app.js'), 'utf8');
const dataJs = fs.readFileSync(path.join(repo, 'dist', 'data.js'), 'utf8');

// 极简 DOM 桩（复用 test_html.js 的最小形态）
const regs = {};
function mkEl(t) {
  return { tagName: t, _html: '', _text: '', _val: '', className: '', dataset: {}, style: {},
    set innerHTML(v){ this._html=String(v); }, get innerHTML(){ return this._html; },
    set textContent(v){ this._text=String(v); }, get textContent(){ return this._text; },
    set value(v){ this._val=String(v); }, get value(){ return this._val||''; },
    appendChild(c){ return c; }, querySelector(){ return null; }, querySelectorAll(){ return []; },
    classList: { _s:new Set(), add(x){ this._s.add(x); }, remove(x){ this._s.delete(x); }, contains(x){ return this._s.has(x); } },
    addEventListener(){}, onclick:null, oninput:null, onchange:null };
}
function get(s) { if (!s.startsWith('#')) return null; if (!regs[s]) regs[s] = mkEl('div'); return regs[s]; }
global.document = {
  getElementById(id) {
    if (id === 'data') { const e = mkEl('div'); e._text = dataText; return e; }
    return get('#' + id);
  },
  querySelector: get, querySelectorAll() { return []; }, createElement(t) { return mkEl(t); }, addEventListener() {}
};
global.DATA = JSON.parse(dataText);
global.window = { alert: () => {} };
global.alert = () => {};

let passed = 0, failed = 0;
function ok(n, c) { if (c) { passed++; console.log('✓ ' + n); } else { failed++; console.log('✗ ' + n); } }

try {
  eval(dataJs + '\n' + appJs + `
    // 1. 维基饮品模型已加载
    ok('wiki_tags.饮品 存在', typeof DATA.wiki_tags.饮品 === 'object');
    ok('容器 48 个', Object.keys(DATA.wiki_tags.饮品.容器).length === 48);
    ok('杯子 36 个', Object.keys(DATA.wiki_tags.饮品.杯子).length === 36);
    ok('类别 6 组', DATA.wiki_tags.饮品.类别.length === 6);

    // 2. DRINK_BIG 包含维基全部 48 个容器
    ok('DRINK_BIG 48 个容器', DRINK_BIG.length === 48);
    // 3. DRINK_SMALL_ARR 含杯子名
    ok('DRINK_SMALL_ARR 含 伊苏产雅文邑（一杯）', DRINK_SMALL_ARR.includes('伊苏产雅文邑（一杯）'));
    ok('DRINK_SMALL_ARR 含 圣觪石圣餐', DRINK_SMALL_ARR.includes('圣\u89da石圣餐'));
    ok('DRINK_SMALL_ARR 含 淘气蒸馏釜', DRINK_SMALL_ARR.includes('淘气蒸馏釜'));
    ok('DRINK_BIG 含 黑刺李杜松子酒（一瓶） 是容器不是杯', DRINK_BIG.some(b=>b.名称==='黑刺李杜松子酒（一瓶）'));

    // 4. 分装链（DRINK_BASE）：杯名 -> 所有能产出该杯的容器
    const b1 = bigOfDrinks('伊苏产雅文邑（一杯）');
    ok('雅文邑一杯 反查 3 个容器', b1.length === 3);
    ok('雅文邑一杯 含 一瓶', b1.some(b=>b.名称==='伊苏产雅文邑（一瓶）'));
    ok('雅文邑一杯 含 近满', b1.some(b=>b.名称==='伊苏产雅文邑（近满）'));
    ok('雅文邑一杯 含 近空', b1.some(b=>b.名称==='伊苏产雅文邑（近空）'));
    // 比例正确
    const ratio = {};
    b1.forEach(b => ratio[b.名称] = b.比例);
    ok('雅文邑 一瓶=3杯', ratio['伊苏产雅文邑（一瓶）'] === 3);
    ok('雅文邑 近满=2杯', ratio['伊苏产雅文邑（近满）'] === 2);
    ok('雅文邑 近空=1杯', ratio['伊苏产雅文邑（近空）'] === 1);

    // 5. 含酒精（从维基 aspects.intoxicating）
    ok('雅文邑 含酒精', isAlcohol('伊苏产雅文邑（一杯）') === true);
    ok('浓甜阿萨姆茶 不含酒精', isAlcohol('浓甜阿萨姆茶（一杯）') === false);
    ok('岛上井水 不含酒精', isAlcohol('岛上井水（一杯）') === false);

    // 6. 性相（从维基杯子准则）
    const a1 = aspForDrink('圣\u89da石圣餐');
    ok('圣\u89da石圣餐 有准则', a1 && Object.keys(a1).length > 0);
    ok('圣\u89da石圣餐 杯=6', a1['杯'] === 6);
    const a2 = aspForDrink('伊苏产雅文邑（一杯）');
    ok('雅文邑一杯 有准则', a2 && Object.keys(a2).length > 0);

    // 7. 涩果酒（维基「涩果酒（整瓶）」→ 项目「涩果酒」，直接上架，不是容器）
    ok('DRINK_SMALL_ARR 含 涩果酒', DRINK_SMALL_ARR.includes('涩果酒'));
    ok('涩果酒 没有容器分装（直接上架）', bigOfDrinks('涩果酒').length === 0);

    // 9. 库存登记候选包含饮品分组（stockItems 被 renderOrders 调用）
    renderOrders();
    const odHtml = document.getElementById('order').innerHTML;
    ok('库存登记含 饮品 · 茶', odHtml.includes('饮品 · 茶'));
    ok('库存登记含 饮品 · 酒', odHtml.includes('饮品 · 酒'));
    ok('库存登记含 饮品 · 咖啡', odHtml.includes('饮品 · 咖啡'));

    // 10. 饮品视图渲染
    renderDrinks();
    const drHtml = document.getElementById('view-drinks').innerHTML;
    ok('饮品视图含 雅文邑', drHtml.includes('雅文邑'));
    ok('饮品视图含 浓甜阿萨姆茶', drHtml.includes('浓甜阿萨姆茶'));
  `);
  console.log('\\n通过 ' + passed + ' / 失败 ' + failed);
  if (failed) process.exit(1);
} catch (e) {
  console.log('!!! 崩溃:', e.message);
  console.log(e.stack.split('\\n').slice(0, 8).join('\\n'));
  process.exit(1);
}
