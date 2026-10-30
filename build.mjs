// Build: compiles src/app.jsx and inlines it into src/index.html → index.html (what GitHub Pages serves).
// Run: node build.mjs                 → index.html, talks to the live backend (PROD_API below)
//      node build.mjs next <apiUrl>   → next/index.html, a test copy with its own storage keys and backend
// Needs Node; fetches esbuild via npx on first run.
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

// Apps Script web app URL for the real sheet (backend/DEPLOY.md). Public identifier, not a secret.
const PROD_API = '';

const [mode, testApi] = process.argv.slice(2);
const next = mode === 'next';
const api = next ? testApi : PROD_API;
if (!/^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/.test(api || '') && !(next && api?.startsWith('https://')))
  throw new Error(next ? 'usage: node build.mjs next <apiUrl>' : 'PROD_API in build.mjs must be the Apps Script /exec URL');

// Classic runtime (React.createElement, no imports) so the UMD React globals keep working, like Babel standalone did.
let js = execSync('npx --yes esbuild@0.24.2 src/app.jsx --loader:.jsx=jsx --jsx=transform --target=es2017 --charset=utf8 --log-level=warning',
  { encoding: 'utf8' })
  .replace(/\r\n/g, '\n');
if (js.split(/\bAPI_URL\b/).length !== 2) throw new Error('expected API_URL exactly once in src/app.jsx');
js = js.replace(/\bAPI_URL\b/, JSON.stringify(api));
// Test copy shares the live origin, so give it its own localStorage keys (else its tasks could leak into the live sheet).
if (next) js = js.replace(/(['"`])bvb_/g, '$1bvbnext_');
if (/<\/script/i.test(js)) throw new Error('compiled JS contains "</script" — it would end the inline block early');

// CSP pins the inline block by hash, so the hash must be over these exact bytes (index.html is kept LF via .gitattributes).
const hash = 'sha256-' + createHash('sha256').update(js, 'utf8').digest('base64');
const tpl = readFileSync('src/index.html', 'utf8').replace(/\r\n/g, '\n');
for (const mark of ['/*HASH*/', '<script>/*APP*/</script>'])
  if (tpl.split(mark).length !== 2) throw new Error(`template must contain ${mark} exactly once`);
let html = tpl.replace('/*HASH*/', hash).replace('<script>/*APP*/</script>', () => `<script>${js}</script>`);
if (next) html = html.replace('<title>', '<title>[TEST] ');
const out = next ? 'next/index.html' : 'index.html';
if (next) mkdirSync('next', { recursive: true });
writeFileSync(out, html);
console.log(`${out} written (${(html.length / 1024).toFixed(0)} KB, script ${hash}, api ${api})`);
