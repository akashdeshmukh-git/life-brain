// Build: concatenate src into two outputs. dist/artifact/index.html (Claude-hosted) and dist/pwa/ (self-host).
import { readFileSync, writeFileSync, mkdirSync, readdirSync, copyFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const read = (p) => readFileSync(p, 'utf8');
// Neurath X is a licensed font: never bundled. The self-hosted build loads it from fonts/ if you add the files;
// both builds use it if it is installed on the device.
const face = (w, name, files) => `@font-face { font-family: "Neurath X"; font-weight: ${w}; font-style: normal; font-display: swap; src: local("Neurath X ${name}"), local("NeurathX-${name.replace(' ', '')}")${files ? `, url("fonts/NeurathX-${name.replace(' ', '')}.woff2") format("woff2")` : ''}; }`;
const fontFaces = (files) => [[400, 'Regular'], [600, 'SemiBold'], [700, 'Bold']].map(([w, n]) => face(w, n, files)).join('\n');
const now = new Date();
const BUILD = now.toISOString().slice(0, 16).replace(/[-:T]/g, '').replace(/^(\d{8})/, '$1-');
// Inter (SIL OFL), a free Helvetica-style face for the subway-signage look, inlined so both builds work offline
// with no requests. The variable file carries weight and optical size, so big titles get Inter's display cut.
const b64 = (p) => readFileSync(p).toString('base64');
const bundled = `@font-face { font-family: "Inter"; font-weight: 100 900; font-style: normal; font-display: swap; src: url(data:font/woff2;base64,${b64('src/fonts/Inter-Variable.woff2')}) format("woff2"); }`;
const baseCss = bundled + '\n' + read('src/style.css');
const css = fontFaces(false) + '\n' + baseCss;
const pwaCss = fontFaces(true) + '\n' + baseCss;
const body = read('src/body.html');
const files = readdirSync('src/js').filter((f) => f.endsWith('.js')).sort();
const LOGO = 'data:image/png;base64,' + b64('src/logo.png');
const js = files.map((f, i) => read('src/js/' + f) + (i === 0 ? `\nLB.BUILD = '${BUILD}';\nLB.LOGO = '${LOGO}';\n` : '')).join('\n');
if (js.includes('</script')) throw new Error('JS contains a closing script tag');

// Claude-hosted artifact: content only; the host adds doctype/head/body.
mkdirSync('dist/artifact', { recursive: true });
writeFileSync('dist/artifact/index.html', `<title>Life Brain</title>\n<meta name="theme-color" content="#000000">\n<style>\n${css}\n</style>\n${body}\n<script>\n${js}\n</script>\n`);

// Self-hosted PWA: full document with a strict CSP (the one inline script is pinned by hash).
const pwaJs = `window.LB_PWA = true;\n${js}`;
const hash = createHash('sha256').update(pwaJs).digest('base64');
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
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta http-equiv="Content-Security-Policy" content="${csp}">
<meta name="referrer" content="no-referrer">
<title>Life Brain</title>
<meta name="description" content="Plan your day to what you really get done, record what actually happened, and learn from the gap.">
<meta name="theme-color" content="#000000">
<link rel="manifest" href="manifest.webmanifest">
<link rel="icon" href="favicon.png" type="image/png">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<style>
${pwaCss}
</style>
</head>
<body>
${body}
<script>${pwaJs}</script>
</body>
</html>
`);
writeFileSync('dist/pwa/sw.js', read('pwa/sw.js').replace('__BUILD__', BUILD));
for (const f of ['manifest.webmanifest', 'favicon.png', 'apple-touch-icon.png', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png']) if (existsSync('pwa/' + f)) copyFileSync('pwa/' + f, 'dist/pwa/' + f);
console.log('built', BUILD, (js.length / 1024).toFixed(0) + 'KB js');
