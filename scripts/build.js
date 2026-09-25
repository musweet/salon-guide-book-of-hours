const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const src = path.join(root, 'src');
const dist = path.join(root, 'dist');
fs.mkdirSync(dist, { recursive: true });

const html = fs.readFileSync(path.join(src, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(src, 'styles.css'), 'utf8');
const appJs = fs.readFileSync(path.join(src, 'app.js'), 'utf8');
const dataJs = fs.readFileSync(path.join(src, 'data.js'), 'utf8');
const dataText = fs.readFileSync(path.join(src, 'data.json'), 'utf8');

// Dev split: external files, with JSON embedded for the browser loader.
const devHtml = html.replace('__DATA__', dataText);

// Single-file build for offline use and GitHub Pages.
// [^\r\n]* 而不是 \n：模板行尾可能是 CRLF（正式版 body 就是 CRLF），写死 \n 会静默不替换，
// 导致 dist/index.html 仍残留外部 <script src>、变成半离线产物。
const single = devHtml
  .replace(/<link rel="stylesheet" href="\.\/styles\.css">/, '<style>\n' + css + '\n</style>')
  .replace(/<script src="\.\/data\.js"><\/script>\s*<script src="\.\/app\.js"><\/script>/, '<script>\n' + dataJs + '\n</script>\n<script>\n' + appJs + '\n</script>');

fs.writeFileSync(path.join(dist, 'index.html'), single, 'utf8');
fs.writeFileSync(path.join(dist, 'index.dev.html'), devHtml, 'utf8');
fs.copyFileSync(path.join(src, 'styles.css'), path.join(dist, 'styles.css'));
fs.copyFileSync(path.join(src, 'app.js'), path.join(dist, 'app.js'));
fs.copyFileSync(path.join(src, 'data.js'), path.join(dist, 'data.js'));
fs.copyFileSync(path.join(src, 'data.json'), path.join(dist, 'data.json'));

console.log('Built dist/index.html and dist/index.dev.html.');
