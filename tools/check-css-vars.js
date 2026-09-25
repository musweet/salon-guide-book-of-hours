// 检查 CSS 里 var(--x) 的使用是否都有对应定义。
// 背景：这个项目有 6 处写过 var(--border) 但 :root 从未定义，
// CSS 遇到未定义变量会静默失效（不报错，直接落到默认值），
// 导致 .save-btn / .settle-bar / .needs-panel 的边框变成浏览器默认灰。
// 这类问题没有脚本永远发现不了。
const fs = require('fs');
const path = process.argv[2] || 'src/styles.css';

const css = fs.readFileSync(path, 'utf8');
const defined = new Set([...css.matchAll(/--([\w-]+)\s*:/g)].map(m => m[1]));
const used = new Set([...css.matchAll(/var\(--([\w-]+)\)/g)].map(m => m[1]));
const missing = [...used].filter(v => !defined.has(v));

if (missing.length) {
  console.log('✗ ' + path + ' 找到 ' + missing.length + ' 个未定义 CSS 变量：');
  missing.forEach(v => {
    const lines = [...css.matchAll(new RegExp('var\\(--' + v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\)', 'g'))];
    const ln = lines.map(m => {
      const before = css.slice(0, m.index);
      return css.slice(0, before.length).split('\n').length;
    });
    console.log('    --' + v + '  用于第 ' + [...new Set(ln)].join('、') + ' 行');
  });
  console.log('\nCSS 不会报错，未定义变量直接失效 → 这些位置的边框/背景会落到浏览器默认值。');
  process.exit(1);
}
console.log('✓ ' + path + '  ' + used.size + ' 个变量全部已定义（共 ' + defined.size + ' 个定义）');
