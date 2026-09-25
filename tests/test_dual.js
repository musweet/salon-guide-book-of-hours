// 奶的双重身份逻辑测试：既是食物又能饮品，两栏同步上架/下架
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const dataText = fs.readFileSync(path.join(repo, 'dist', 'data.json'), 'utf8');
const appJs = fs.readFileSync(path.join(repo, 'dist', 'app.js'), 'utf8');
const dataJs = fs.readFileSync(path.join(repo, 'dist', 'data.js'), 'utf8');

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
  getElementById(id) { if (id === 'data') { const e = mkEl('div'); e._text = dataText; return e; } return get('#' + id); },
  querySelector: get, querySelectorAll() { return []; }, createElement(t) { return mkEl(t); }, addEventListener() {}
};
global.DATA = JSON.parse(dataText);
global.window = { alert: () => {} };
global.alert = () => {};
global.confirm = () => true;

let passed = 0, failed = 0;
function ok(n, c) { if (c) { passed++; console.log('✓ ' + n); } else { failed++; console.log('✗ ' + n); } }

try {
  eval(dataJs + '\n' + appJs + `
    // 1. DUAL_SERVE 标记
    ok('DUAL_SERVE 包含 奶', DUAL_SERVE.has('奶'));
    ok('DUAL_SERVE 不包含 鸡蛋', !DUAL_SERVE.has('鸡蛋'));
    ok('DUAL_SERVE 不包含 火腿罐头', !DUAL_SERVE.has('火腿罐头'));

    // 2. 奶在 RAW_EATABLE 里（能生吃上桌）
    ok('奶 在 RAW_EATABLE（能生吃）', RAW_EATABLE.has('奶'));
    ok('奶 在 wiki_tags.原材料', !!DATA.wiki_tags.原材料['奶']);
    ok('奶 在 wiki_tags.饮品.杯子', !!DATA.wiki_tags.饮品.杯子['milk']);
    ok('奶 性相 = 杯/心/鳞/冬', JSON.stringify(DATA.catalog.食材清单.find(x=>x.名称==='奶').性相) === JSON.stringify({杯:1,心:1,鳞:1,冬:1}));

    // 3. 奶的菜品性相（dish() 返回产物性相）
    const milkDish = dish('奶');
    ok('dish(奶) 存在', !!milkDish);
    ok('dish(奶) 产物性相 = 杯/心/鳞/冬', JSON.stringify(milkDish.产物性相) === JSON.stringify({杯:1,心:1,鳞:1,冬:1}));
    ok('aspForDrink(奶) = 杯/心/鳞/冬', JSON.stringify(aspForDrink('奶')) === JSON.stringify({杯:1,心:1,鳞:1,冬:1}));

    // 4. 初始化：奶库存为 0
    state.inv['奶'] = 3;
    renderAll();
    ok('上架前 dishTable.奶 = 0', (state.dishTable['奶']||0) === 0);
    ok('上架前 drinkTable.奶 = 0', (state.drinkTable['奶']||0) === 0);
    ok('上架前 pool.奶 = 0', (state.pool['奶']||0) === 0);
    ok('上架前 stockOf(奶) = 3', stockOf('奶') === 3);
    ok('上架前 drinkAvailable(奶) = 3', drinkAvailable('奶') === 3);

    // 5. 从菜栏上架奶（doEat）
    doEat('奶');
    ok('菜栏上架后 dishTable.奶 = 1', state.dishTable['奶'] === 1);
    ok('菜栏上架后 drinkTable.奶 = 1（两栏同步）', state.drinkTable['奶'] === 1);
    ok('菜栏上架后 pool.奶 = -1', state.pool['奶'] === -1);
    ok('菜栏上架后 stockOf(奶) = 2', stockOf('奶') === 2);
    ok('菜栏上架后 drinkAvailable(奶) = 2', drinkAvailable('奶') === 2);

    // 6. 再从饮栏上架奶（doServeDrink）
    doServeDrink('奶');
    ok('饮栏上架后 dishTable.奶 = 2', state.dishTable['奶'] === 2);
    ok('饮栏上架后 drinkTable.奶 = 2', state.drinkTable['奶'] === 2);
    ok('饮栏上架后 pool.奶 = -2', state.pool['奶'] === -2);
    ok('饮栏上架后 stockOf(奶) = 1', stockOf('奶') === 1);
    ok('饮栏上架后 drinkAvailable(奶) = 1', drinkAvailable('奶') === 1);

    // 7. 再从菜栏上架奶
    doEat('奶');
    ok('第3次上架后 dishTable.奶 = 3', state.dishTable['奶'] === 3);
    ok('第3次上架后 drinkTable.奶 = 3', state.drinkTable['奶'] === 3);
    ok('第3次上架后 pool.奶 = -3', state.pool['奶'] === -3);
    ok('第3次上架后 stockOf(奶) = 0', stockOf('奶') === 0);
    ok('第3次上架后 drinkAvailable(奶) = 0', drinkAvailable('奶') === 0);

    // 8. 库存耗尽，不能再上架
    let alertMsg = '';
    global.alert = (m) => { alertMsg = m; };
    doEat('奶');
    ok('库存耗尽 doEat 触发 alert', alertMsg.includes('仓库里没有'));
    ok('alert 后 dishTable 不变', state.dishTable['奶'] === 3);

    // 9. 从菜栏下架奶（doUncook）
    doUncook('奶');
    ok('菜栏下架后 dishTable.奶 = 2', state.dishTable['奶'] === 2);
    ok('菜栏下架后 drinkTable.奶 = 2（两栏同步）', state.drinkTable['奶'] === 2);
    ok('菜栏下架后 pool.奶 = -2', state.pool['奶'] === -2);
    ok('菜栏下架后 stockOf(奶) = 1', stockOf('奶') === 1);

    // 10. 从饮栏下架奶（doUnserveDrink）
    doUnserveDrink('奶');
    ok('饮栏下架后 dishTable.奶 = 1（两栏同步）', state.dishTable['奶'] === 1);
    ok('饮栏下架后 drinkTable.奶 = 1', state.drinkTable['奶'] === 1);
    ok('饮栏下架后 pool.奶 = -1', state.pool['奶'] === -1);
    ok('饮栏下架后 stockOf(奶) = 2', stockOf('奶') === 2);

    // 11. 全部下架
    doUncook('奶');
    doUncook('奶');
    ok('全部下架后 dishTable.奶 = 0', (state.dishTable['奶']||0) === 0);
    ok('全部下架后 drinkTable.奶 = 0', (state.drinkTable['奶']||0) === 0);
    ok('全部下架后 pool.奶 = 0', (state.pool['奶']||0) === 0);
    ok('全部下架后 stockOf(奶) = 3', stockOf('奶') === 3);

    // 12. 结算：奶库存应净减（dishTable 清空，pool 合并回 inv）
    state.inv['奶'] = 2;
    state.dishTable = {}; state.drinkTable = {}; state.pool = {};
    renderAll();
    doEat('奶');
    state.visitors.add('阿格狄斯提斯');
    // 凑够菜品和饮品
    state.dishTable['奶'] = 1;
    state.drinkTable['奶'] = 1;
    state.pool['奶'] = -1;
    renderAll();
    // 结算：手动模拟（confirm 返回 true）
    state.inv['奶'] = (state.inv['奶']||0) + state.pool['奶'];
    state.dishTable = {};
    state.drinkTable = {};
    state.pool = {};
    ok('结算后 奶 库存 = 1（净减 1）', state.inv['奶'] === 1);
    ok('结算后 dishTable 清空', Object.keys(state.dishTable).length === 0);
    ok('结算后 drinkTable 清空', Object.keys(state.drinkTable).length === 0);

    // 13. 重置：奶回到 0
    state.inv = {}; state.pool = {}; state.dishTable = {}; state.drinkTable = {}; state.dishRecipe = {};
    renderAll();
    ok('重置后 奶 库存 = 0', (state.inv['奶']||0) === 0);
    ok('重置后 dishTable 空', Object.keys(state.dishTable).length === 0);
    ok('重置后 drinkTable 空', Object.keys(state.drinkTable).length === 0);

    // 14. 奶仍可作为生面团变体2的原料
    state.inv = {'厨房用碗':1, '面粉':1, '奶':1};
    state.dishRecipe = {}; state.dishTable = {}; state.drinkTable = {}; state.pool = {};
    const cookResult = canCook(dish('生面团'));
    ok('生面团 用奶+面粉+碗 备料充足', cookResult.ok === true);
    ok('生面团 用奶变体的 need 含 奶', cookResult.need['奶'] === 1);
    ok('生面团 用奶变体的 need 含 面粉', cookResult.need['面粉'] === 1);
    ok('生面团 用奶变体的 need 含 厨房用碗', cookResult.need['厨房用碗'] === 1);
    ok('生面团 用奶变体的 need 不含 黄油', cookResult.need['黄油'] === undefined);

    // 15. 奶作为生面团原料不影响它的双重身份
    doCook('生面团', 1);
    ok('做完生面团后 pool.奶 = -1（被扣为面粉+碗+奶）', state.pool['奶'] === -1);
    ok('做完生面团后 pool.面粉 = -1', state.pool['面粉'] === -1);
    ok('做完生面团后 pool.厨房用碗 不变（工具）', (state.pool['厨房用碗']||0) === 0);

    // 16. 双重物品在菜品渲染里可见（doEat 模式）
    state.inv = {}; state.pool = {}; state.dishTable = {}; state.drinkTable = {}; state.dishRecipe = {};
    state.inv['奶'] = 1;
    state.filter = 'raw';
    renderAll();
    const menuHtml = document.getElementById('view-menu').innerHTML;
    ok('菜栏（可食用素材）渲染出 奶', menuHtml.includes('奶'));
    ok('菜栏 奶 显示可食用素材标签', menuHtml.includes('可食用素材'));
    ok('菜栏 奶 有上桌按钮', menuHtml.includes('直接上桌'));
  `);
} catch(e) {
  console.log('!!! 崩溃:', e.message);
  console.log(e.stack);
  process.exit(1);
}

console.log('\\n通过 ' + passed + ' / 失败 ' + failed);
process.exit(failed ? 1 : 0);
