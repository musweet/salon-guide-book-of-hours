const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(repo, 'dist', 'index.dev.html'), 'utf8');
const dataText = fs.readFileSync(path.join(repo, 'dist', 'data.json'), 'utf8');
const appJs = fs.readFileSync(path.join(repo, 'dist', 'app.js'), 'utf8');
const dataJs = fs.readFileSync(path.join(repo, 'dist', 'data.js'), 'utf8');

const regs = {};
function mkEl(tag) {
  return {
    tagName: tag, _html: '', _text: '', _val: '', className: '', dataset: {}, style: {}, checked: false,
    _children: [],
    set innerHTML(v) { this._html = String(v); this._children = []; },
    get innerHTML() { return this._html; },
    set textContent(v) { this._text = String(v); },
    get textContent() { return this._text; },
    set value(v) { this._val = String(v); },
    get value() { return this._val || ''; },
    appendChild(c) { this._children.push(c); return c; },
    querySelector() { return null; },
    querySelectorAll() { return []; },
    classList: { _s: new Set(), add(x) { this._s.add(x); }, remove(x) { this._s.delete(x); }, toggle(x, f) { f ? this._s.add(x) : this._s.delete(x); }, contains(x) { return this._s.has(x); } },
    addEventListener() {}, onclick: null, oninput: null, onchange: null
  };
}
function get(s) {
  if (!s.startsWith('#')) return null;
  if (!regs[s]) regs[s] = mkEl('div');
  return regs[s];
}
global.document = {
  getElementById(id) {
    if (id === 'data') {
      const e = mkEl('div');
      e._text = dataText;
      return e;
    }
    return get('#' + id);
  },
  querySelector(s) { return get(s); },
  querySelectorAll() { return []; },
  createElement(t) { return mkEl(t); },
  addEventListener() {}
};
global.DATA = JSON.parse(dataText);
global.window = { alert: m => { console.log('    [alert] ' + String(m).replace(/\n/g, ' / ')); } };
global.alert = function (m) { return global.window.alert(m); };

let passed = 0, failed = 0;
function ok(name, cond) {
  if (cond) { passed += 1; console.log('✓ ' + name); }
  else { failed += 1; console.log('✗ ' + name); }
}

try {
  eval(dataJs + '\n' + appJs + `
    ok('DATA is loaded', typeof DATA === 'object' && DATA && Array.isArray(DATA.FOODS));
    ok('has 28 visitors', Array.isArray(DATA.visitors) && DATA.visitors.length === 28);
    ok('renders salons', typeof renderSalon === 'function' && document.getElementById('salons').innerHTML.includes('野餐'));
    ok('renders visitors', typeof renderVisitors === 'function' && document.getElementById('visitors').innerHTML.includes('阿格狄斯提斯'));
    ok('renders orders', typeof renderOrders === 'function' && document.getElementById('order').innerHTML.includes('登记已有库存'));
    ok('renders inventory', typeof renderInventory === 'function' && document.getElementById('inv').innerHTML.includes('不消耗'));
    ok('renders table', typeof renderTable === 'function' && document.getElementById('table').innerHTML.includes('菜品'));
    ok('renders menu', typeof renderMenu === 'function' && document.getElementById('view-menu').innerHTML.includes('满足度'));
    ok('renders drinks', typeof renderDrinks === 'function' && document.getElementById('view-drinks').innerHTML.includes('饮品'));
    ok('renders teaching', typeof renderTeaching === 'function' && document.getElementById('teach').innerHTML.includes('教诲'));
    ok('renders ref', typeof renderRef === 'function' && document.getElementById('view-ref').innerHTML.includes('性相'));
    ok('renders notes', typeof renderNotes === 'function' && document.getElementById('notes').innerHTML.includes('工具不消耗'));
  `);
  console.log(`\n通过 ${passed} / 失败 ${failed}`);
} catch (e) {
  console.log('!!! JS 运行崩溃:', e.message);
  console.log(e.stack.split('\n').slice(0, 8).join('\n'));
  process.exit(1);
}
