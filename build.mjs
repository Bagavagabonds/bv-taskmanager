// Build: compiles src/app.jsx and inlines it into src/index.html → index.html (what GitHub Pages serves).
// Run: node build.mjs   (needs Node; fetches esbuild via npx on first run)
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Classic runtime (React.createElement, no imports) so the UMD React globals keep working, like Babel standalone did.
const js = execSync('npx --yes esbuild@0.24.2 src/app.jsx --loader:.jsx=jsx --jsx=transform --target=es2017 --charset=utf8 --log-level=warning',
  { encoding: 'utf8' })
  .replace(/\r\n/g, '\n');
if (/<\/script/i.test(js)) throw new Error('compiled JS contains "</script" — it would end the inline block early');

// CSP pins the inline block by hash, so the hash must be over these exact bytes (index.html is kept LF via .gitattributes).
const hash = 'sha256-' + createHash('sha256').update(js, 'utf8').digest('base64');
const tpl = readFileSync('src/index.html', 'utf8').replace(/\r\n/g, '\n');
for (const mark of ['/*HASH*/', '<script>/*APP*/</script>'])
  if (tpl.split(mark).length !== 2) throw new Error(`template must contain ${mark} exactly once`);
const html = tpl.replace('/*HASH*/', hash).replace('<script>/*APP*/</script>', () => `<script>${js}</script>`);
writeFileSync('index.html', html);
console.log(`index.html written (${(html.length / 1024).toFixed(0)} KB, script ${hash})`);
