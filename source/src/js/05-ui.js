/* ===== UI core: theme, tabs, screens, taps, sheets, toasts ===== */
/* One colour for ticks, the current tab and buttons. light/dark: the colour on white and on black. */
const ACCENTS = {
  blue: { name: 'Blue', light: '#1a73e8', dark: '#8ab4f8' },
  green: { name: 'Green', light: '#188038', dark: '#81c995' },
  purple: { name: 'Purple', light: '#9334e6', dark: '#c58af9' },
  red: { name: 'Red', light: '#d93025', dark: '#f28b82' },
  orange: { name: 'Orange', light: '#c26401', dark: '#fcad70' },
  yellow: { name: 'Yellow', light: '#a48100', dark: '#fdd663' },
};
LB.ACCENTS = ACCENTS;
const isDark = () => S.settings.theme === 'dark' || (S.settings.theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
function applyTheme() {
  const root = document.documentElement, dark = isDark(), a = ACCENTS[S.settings.accent] || ACCENTS.blue;
  root.dataset.theme = dark ? 'dark' : 'light';
  root.style.setProperty('--accent', dark ? a.dark : a.light);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = dark ? '#000000' : '#ffffff';
}
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme()); } catch (_) {}

/* ---- Screens ---- */
const TABS = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'today', label: 'Today', icon: 'today' },
  { id: 'calendar', label: 'Calendar', icon: 'calendar' },
  { id: 'notes', label: 'Notes', icon: 'notes' },
  { id: 'progress', label: 'Progress', icon: 'progress' },
];
const VIEWS = {};
const route = { name: 'home', sub: '' };
LB.route = route;
function parseHash() {
  let h = '';
  try { h = decodeURIComponent((location.hash || '').slice(1)); } catch (_) {}
  const i = h.indexOf('-'), name = i < 0 ? h : h.slice(0, i), sub = i < 0 ? '' : h.slice(i + 1);
  return VIEWS[name] ? { name, sub } : { name: 'home', sub: '' };
}
function go(name, sub = '') {
  route.name = VIEWS[name] ? name : 'home';
  route.sub = sub;
  const h = '#' + route.name + (sub ? '-' + sub : '');
  try { if (location.hash !== h) history.replaceState(null, '', h); } catch (_) {}
  render(true);
}
LB.go = go;
function renderNav() {
  const cur = route.name === 'settings' ? '' : route.name;
  $('#tabbar').innerHTML = TABS.map((n) => `<button class="tab" data-action="nav" data-to="${n.id}" ${n.id === cur ? 'aria-current="page"' : ''}><span class="tab-ic">${icon(n.icon)}</span><span>${n.label}</span></button>`).join('');
}
/* The top of every screen: big title, a small line under it, settings on the right. */
const header = (title, sub = '', right = '') => `<header class="top"><div class="top-text"><h1>${esc(title)}</h1>${sub ? `<p class="top-sub">${sub}</p>` : ''}</div>
  <div class="top-right">${right}<button class="icon-btn" data-action="nav" data-to="settings" aria-label="Settings">${icon('gear')}</button></div></header>`;
let lastKey = '';
function render(focus) {
  applyTheme();
  renderNav();
  const view = $('#view'), key = route.name + '/' + route.sub;
  const keep = key === lastKey ? window.scrollY : 0;
  const active = document.activeElement, activeId = active && view.contains(active) && active.id;
  const caret = activeId && 'selectionStart' in active ? [active.selectionStart, active.selectionEnd] : null;
  const warn = S.storage === 'unavailable' ? '<div class="banner" role="alert"><b>Not saving.</b> This browser blocks storage, so changes are lost when you close it.</div>'
    : S.storage === 'error' ? '<div class="banner" role="alert"><b>A save failed.</b> Export a backup from Settings now.</div>' : '';
  // Half-typed text in a box the screen doesn't own (a key, a title) must survive a redraw.
  const typed = key === lastKey ? $$('input[id]:not([type=checkbox]):not([type=file]):not([type=radio]), textarea[id]', view).map((el) => [el.id, el.value]) : [];
  try { view.innerHTML = warn + VIEWS[route.name](route.sub);
    for (const [id, v] of typed) { const el = $('#' + CSS.escape(id), view); if (el && !el.value && v) { el.value = v; if (el.dataset.live === 'ai-key') el.dispatchEvent(new Event('input', { bubbles: true })); } } $$('form', view).forEach((f) => (f.noValidate = true)); }
  catch (e) { console.error(e); view.innerHTML = `<div class="empty">This screen hit an error. Your data is safe.<br><small>${esc(e.message)}</small></div>`; }
  lastKey = key;
  window.scrollTo(0, keep);
  const back = activeId && $('#' + CSS.escape(activeId), view);
  if (back) { back.focus({ preventScroll: true }); if (caret) try { back.setSelectionRange(caret[0], caret[1]); } catch (_) {} } // typing survives a redraw
  else if (focus) view.focus({ preventScroll: true });
}
LB.render = render;

/* ---- Taps and forms: data-action → A, form[data-form] → F ---- */
const A = (LB.A = {});
const F = (LB.F = {});
const settle = (f) => { try { return Promise.resolve(f()); } catch (e) { return Promise.reject(e); } };
const logIfBug = (e) => { if (!(e instanceof Error) || e instanceof TypeError || e instanceof ReferenceError || e instanceof SyntaxError) console.error(e); };
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = A[el.dataset.action];
  if (!fn) { console.error('Unknown action', el.dataset.action); return; }
  if (el.tagName !== 'INPUT') ev.preventDefault();
  settle(() => fn(el, ev)).catch((e) => { logIfBug(e); toast(e.message || 'Something went wrong.', 'bad'); });
});
document.addEventListener('submit', (ev) => {
  const form = ev.target.closest('form[data-form]');
  if (!form) return;
  ev.preventDefault();
  const fn = F[form.dataset.form];
  if (!fn) { console.error('Unknown form', form.dataset.form); return; }
  const errEl = $('.err[data-form-error]', form);
  if (errEl) errEl.textContent = '';
  settle(() => fn(form, Object.fromEntries(new FormData(form)))).catch((e) => {
    logIfBug(e);
    if (errEl) errEl.textContent = e.message || 'Could not save.'; else toast(e.message || 'Could not save.', 'bad');
  });
});
A.nav = (el) => { closeSheet(); go(el.dataset.to, el.dataset.sub || ''); };
A['sheet-close'] = () => closeSheet();

/* ---- Toast, with an optional Undo ---- */
let toastTimer;
function toast(msg, tone = '', opts = {}) {
  const t = $('#toast');
  if (!t) return;
  t.className = tone; t.hidden = false; t.textContent = '';
  const span = document.createElement('span');
  span.textContent = msg;
  t.append(span);
  if (opts.action) {
    const b = document.createElement('button');
    b.type = 'button'; b.id = 'toast-action'; b.textContent = opts.action;
    b.addEventListener('click', () => { t.hidden = true; clearTimeout(toastTimer); settle(opts.onAction).catch((e) => toast(e.message, 'bad')); });
    t.append(b);
  }
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), opts.action || tone === 'bad' ? 5000 : 2400);
  if (tone === 'bad') haptic('error');
}
function haptic(kind) { try { if (navigator.vibrate) navigator.vibrate(kind === 'error' ? [12, 60, 12] : 8); } catch (_) {} }
LB.toast = toast;
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch (_) { toast('Copy is blocked here. Select the text and copy it.', 'bad'); }
}

/* ---- Sheets as physical cards ----
   Springs use Apple's two parameters (damping ratio, response in seconds). Opening from a tap is
   critically damped; releasing a drag hands the finger's velocity to the spring and may bounce a little.
   A flick is projected forward to decide close vs. return. Past the top, the sheet rubber-bands.
   Any animation can be grabbed mid-flight; motion always starts from the live on-screen value. */
const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const isDialog = () => matchMedia('(min-width: 720px)').matches;
const coarse = () => matchMedia('(pointer: coarse)').matches;
function springTo(s, to, { damping = 1, response = 0.35 } = {}, apply, done) {
  cancelAnimationFrame(s.raf);
  const k = (2 * Math.PI / response) ** 2, c = (4 * Math.PI * damping) / response;
  let last = performance.now();
  const step = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    const n = Math.max(1, Math.ceil(dt / 0.004)), h = dt / n;
    for (let i = 0; i < n; i++) { const a = -k * (s.x - to) - c * s.v; s.v += a * h; s.x += s.v * h; }
    const settled = Math.abs(s.x - to) < s.eps && Math.abs(s.v) < s.eps * 20;
    if (settled) { s.x = to; s.v = 0; }
    apply(s.x);
    if (settled) { s.raf = 0; if (done) done(); } else s.raf = requestAnimationFrame(step);
  };
  s.raf = requestAnimationFrame(step);
}
const projectMomentum = (v, d = 0.998) => ((v / 1000) * d) / (1 - d);
const rubberband = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));
LB.physics = { springTo, projectMomentum, rubberband };

const SH = { open: false, closing: false, dialog: false, x: 0, v: 0, raf: 0, eps: 0.5, h: 600, wrap: null, sheet: null, scrim: null, lastFocus: null };
LB.SH = SH;
function sheetApply(x) {
  if (!SH.sheet) return;
  if (SH.dialog) {
    const p = clamp(x, 0, 1.05);
    SH.sheet.style.opacity = clamp(p, 0, 1);
    SH.sheet.style.transform = `scale(${0.95 + 0.05 * p})`;
    SH.scrim.style.opacity = clamp(p, 0, 1);
  } else {
    SH.sheet.style.transform = `translate3d(0, ${x}px, 0)`;
    SH.scrim.style.opacity = clamp(1 - x / SH.h, 0, 1);
  }
}
function focusFirstIn(sheet) {
  // On touch screens, don't pop the keyboard up uninvited; focus the title for screen readers instead.
  const first = !coarse() && $('.sheet-body input:not([type=hidden]):not([type=checkbox]):not([readonly]), .sheet-body textarea:not([readonly]), .sheet-body select', sheet);
  (first || $('.sheet-head h2', sheet)).focus({ preventScroll: true });
}
function openSheet({ title, body, onMount, wide }) {
  if (SH.open && !SH.closing && SH.sheet) { // already up: change the content in place, keep position
    $('.sheet-head h2', SH.sheet).textContent = title;
    SH.wrap.setAttribute('aria-label', title);
    SH.sheet.style.maxWidth = wide ? '47.5rem' : '';
    $('.sheet-body', SH.sheet).innerHTML = body;
    noNativeValidation(SH.sheet);
    if (onMount) onMount(SH.sheet);
    focusFirstIn(SH.sheet);
    return SH.sheet;
  }
  cancelAnimationFrame(SH.raf);
  if (!SH.open) SH.lastFocus = document.activeElement;
  const root = $('#sheet-root');
  root.innerHTML = `<div class="sheet-wrap" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="sheet-scrim" data-action="sheet-close"></div>
    <div class="sheet" ${wide ? 'style="max-width:47.5rem"' : ''}><div class="sheet-top"><div class="sheet-grab" aria-hidden="true"></div><div class="sheet-head"><h2 tabindex="-1">${esc(title)}</h2><button class="icon-btn" data-action="sheet-close" aria-label="Close">${icon('close')}</button></div></div><div class="sheet-body">${body}</div></div></div>`;
  Object.assign(SH, { open: true, closing: false, dialog: isDialog(), wrap: $('.sheet-wrap', root), sheet: $('.sheet', root), scrim: $('.sheet-scrim', root) });
  document.body.style.overflow = 'hidden';
  noNativeValidation(SH.sheet);
  if (onMount) onMount(SH.sheet);
  if (reduceMotion()) { // a gentle cross-fade instead of movement
    SH.sheet.style.transform = 'none'; SH.sheet.style.opacity = '1'; SH.scrim.style.opacity = '1';
    SH.wrap.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 180, easing: 'ease-out' });
  } else if (SH.dialog) {
    Object.assign(SH, { x: 0, v: 0, eps: 0.002 });
    sheetApply(0);
    springTo(SH, 1, { damping: 1, response: 0.3 }, sheetApply);
  } else {
    SH.h = SH.sheet.offsetHeight || 600;
    Object.assign(SH, { x: SH.h, v: 0, eps: 0.5 });
    sheetApply(SH.x);
    springTo(SH, 0, { damping: 1, response: 0.35 }, sheetApply);
    bindSheetDrag();
  }
  focusFirstIn(SH.sheet);
  return SH.sheet;
}
function closeSheet(velocity = 0) {
  if (!SH.open || SH.closing) return;
  SH.closing = true;
  const sheet = SH.sheet;
  const finish = () => {
    if (SH.sheet !== sheet) return; // a new sheet replaced this one mid-close
    $('#sheet-root').innerHTML = '';
    Object.assign(SH, { open: false, closing: false, sheet: null, wrap: null, scrim: null });
    document.body.style.overflow = '';
    if (SH.lastFocus && document.contains(SH.lastFocus)) SH.lastFocus.focus({ preventScroll: true });
    emit(); // anything saved quietly while the sheet was open now shows on the screen
  };
  if (reduceMotion()) { SH.wrap.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'ease-in', fill: 'forwards' }).onfinish = finish; return; }
  if (SH.dialog) { SH.eps = 0.002; springTo(SH, 0, { damping: 1, response: 0.25 }, sheetApply, finish); return; }
  SH.h = sheet.offsetHeight || SH.h;
  SH.v = velocity; SH.eps = 0.5;
  springTo(SH, SH.h + 24, { damping: 1, response: 0.3 }, sheetApply, finish); // leaves the way it came
}
LB.closeSheet = closeSheet;
function bindSheetDrag() {
  const top = $('.sheet-top', SH.sheet), sheet = SH.sheet;
  top.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.target.closest('button') || SH.sheet !== sheet) return;
    cancelAnimationFrame(SH.raf); // caught mid-flight: continue from where it is now
    SH.closing = false;
    const startY = e.clientY, startX = SH.x, hist = [{ y: e.clientY, t: e.timeStamp }];
    let dragging = false;
    try { top.setPointerCapture(e.pointerId); } catch (_) {}
    const move = (m) => {
      const dy = m.clientY - startY;
      if (!dragging && Math.abs(dy) < 6) return; // a little hysteresis before committing
      dragging = true;
      let x = startX + dy;
      if (x < 0) x = -rubberband(-x, SH.h); // resist past the top instead of stopping dead
      SH.x = x;
      sheetApply(x);
      hist.push({ y: m.clientY, t: m.timeStamp });
      while (hist.length > 2 && m.timeStamp - hist[0].t > 100) hist.shift();
    };
    const up = () => {
      top.removeEventListener('pointermove', move); top.removeEventListener('pointerup', up); top.removeEventListener('pointercancel', up);
      const a = hist[0], b = hist[hist.length - 1], dt = (b.t - a.t) / 1000;
      const v = dt > 0 ? (b.y - a.y) / dt : 0;
      SH.h = sheet.offsetHeight || SH.h;
      if (dragging && SH.x + projectMomentum(v) > SH.h * 0.45) closeSheet(v);
      else { SH.v = v; springTo(SH, 0, { damping: dragging && Math.abs(v) > 300 ? 0.8 : 1, response: 0.3 }, sheetApply); }
    };
    top.addEventListener('pointermove', move); top.addEventListener('pointerup', up); top.addEventListener('pointercancel', up);
  });
}
document.addEventListener('keydown', (ev) => {
  if (!SH.open || !SH.sheet) return;
  if (ev.key === 'Escape') { closeSheet(); return; }
  if (ev.key !== 'Tab') return; // keep keyboard focus inside the sheet
  const f = $$('button, [href], input, select, textarea, summary', SH.sheet).filter((el) => !el.disabled && el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (ev.shiftKey && (document.activeElement === first || !SH.sheet.contains(document.activeElement))) { last.focus(); ev.preventDefault(); }
  else if (!ev.shiftKey && document.activeElement === last) { first.focus(); ev.preventDefault(); }
});


const noNativeValidation = (root) => $$('form', root).forEach((f) => (f.noValidate = true));
document.addEventListener('keydown', (ev) => {
  if (!SH.open || !SH.sheet) return;
  if (ev.key === 'Escape') { closeSheet(); return; }
  if (ev.key !== 'Tab') return; // keep keyboard focus inside the sheet
  const f = $$('button, [href], input, select, textarea, summary', SH.sheet).filter((el) => !el.disabled && el.offsetParent !== null);
  if (!f.length) return;
  const first = f[0], last = f[f.length - 1];
  if (ev.shiftKey && (document.activeElement === first || !SH.sheet.contains(document.activeElement))) { last.focus(); ev.preventDefault(); }
  else if (!ev.shiftKey && document.activeElement === last) { first.focus(); ev.preventDefault(); }
});
/* In-page confirmation (native confirm() is unavailable in some hosts). */
function confirmSheet({ title, text, confirmLabel = 'Confirm', danger = false, requireText = '' }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    openSheet({ title, body: `<form class="form" data-form="confirm"><p>${text}</p>
      ${requireText ? `<label class="field"><span>Type ${esc(requireText)} to confirm</span><input name="confirm" autocomplete="off" autocapitalize="characters"></label>` : ''}
      <p class="err" data-form-error></p>
      <div class="row-end"><button type="button" class="btn" data-action="sheet-close">Cancel</button><button class="btn ${danger ? 'danger solid' : 'primary'}">${esc(confirmLabel)}</button></div></form>`,
    onMount(root) {
      F.confirm = (form, v) => {
        if (requireText && String(v.confirm || '').trim().toUpperCase() !== requireText) throw new Error(`Type ${requireText} exactly to continue.`);
        finish(true); closeSheet();
      };
      new MutationObserver((_, obs) => { if (!document.contains(root)) { obs.disconnect(); finish(false); } }).observe($('#sheet-root'), { childList: true });
    } });
  });
}
F.confirm = () => {};
