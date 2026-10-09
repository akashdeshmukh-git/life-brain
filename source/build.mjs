// Build: concatenate src/js (sorted) and src/style.css into dist/pwa, a self-contained installable web app.
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = (p) => readFileSync(p, 'utf8');
const b64 = (p) => readFileSync(p).toString('base64');
const BUILD = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})/, '$1-');
// Inter (SIL OFL), inlined so the app needs no network for fonts.
const css = `@font-face { font-family: "Fraunces"; font-weight: 600; font-style: normal; font-display: swap; src: url(data:font/woff2;base64,${b64('src/fonts/Fraunces-600.woff2')}) format("woff2"); }\n@font-face { font-family: "Inter"; font-weight: 100 900; font-style: normal; font-display: swap; src: url(data:font/woff2;base64,${b64('src/fonts/Inter-Variable.woff2')}) format("woff2"); }\n` + read('src/style.css');
const body = read('src/body.html');
const files = readdirSync('src/js').filter((f) => f.endsWith('.js')).sort();
const LOGO = 'data:image/png;base64,' + b64('src/logo.png');
const js = 'window.LB_PWA = true;\n' + files.map((f, i) => read('src/js/' + f) + (i === 0 ? `\nLB.BUILD = '${BUILD}';\nLB.LOGO = '${LOGO}';\n` : '')).join('\n');
if (js.includes('</script')) throw new Error('JS contains a closing script tag');
const hash = createHash('sha256').update(js).digest('base64');
const csp = [
  "default-src 'self'", `script-src 'self' 'sha256-${hash}'`, "style-src 'self' 'unsafe-inline'",
  "font-src 'self' data:", "img-src 'self' data:", "connect-src 'self' https: http://localhost:* http://127.0.0.1:*",
  "manifest-src 'self'", "worker-src 'self'", "base-uri 'none'", "form-action 'none'", "object-src 'none'",
].join('; ');
mkdirSync('dist/pwa', { recursive: true });
writeFileSync('dist/pwa/index.html', `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer">
<title>Life Brain</title>
<meta name="description" content="Tasks, calendar, notes, journal, habits and goals in one simple app. Kept on your phone.">
<meta name="theme-color" content="#ffffff">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="favicon.png" type="image/png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-capable" content="yes">
<style>
${css}
</style>
</head>
<body>
${body}
<script>${js}</script>
</body>
</html>
`);
writeFileSync('dist/pwa/sw.js', read('pwa/sw.js').replace('__BUILD__', BUILD));
for (const f of ['manifest.webmanifest', 'favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) if (existsSync('pwa/' + f)) copyFileSync('pwa/' + f, 'dist/pwa/' + f);
console.log('built', BUILD, (js.length / 1024).toFixed(0) + 'KB js');
