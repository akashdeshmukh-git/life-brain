/* ===== UI core: theming, router, actions, sheets, forms ===== */
/* Highlight colours: the live row, the current tab, what you've picked. f: the fill; o: text on it;
   iw/ib: the colour as text on white and on black. Yellow is Day Board's restrained highlight. */
const ACCENTS = {
  blue: { name: 'Blue', f: '#2850ad', o: '#ffffff', iw: '#2850ad', ib: '#7fa6f0' },
  red: { name: 'Red', f: '#ee352e', o: '#ffffff', iw: '#c4221b', ib: '#ff7a72' },
  yellow: { name: 'Yellow', f: '#fccc0a', o: '#111111', iw: '#7a5d00', ib: '#fccc0a' },
  green: { name: 'Green', f: '#6cbe45', o: '#111111', iw: '#2f6e14', ib: '#8fd16b' },
  purple: { name: 'Purple', f: '#b933ad', o: '#ffffff', iw: '#9c2492', ib: '#e07ad6' },
  pink: { name: 'Pink', f: '#f4a9be', o: '#111111', iw: '#a8386a', ib: '#f4a9be' },
  orange: { name: 'Orange', f: '#ff6319', o: '#111111', iw: '#b23e00', ib: '#ff8a50' },
};
LB.ACCENTS = ACCENTS;
function applyTheme() {
  const root = document.documentElement;
  const mode = S.settings.mode || (matchMedia('(prefers-color-scheme: dark)').matches ? 'black' : 'white');
  const a = ACCENTS[S.settings.accent] || ACCENTS.yellow;
  if (root.dataset.mode && root.dataset.mode !== mode && !reduceMotion()) { // ease light↔dark, no brightness jump
    root.classList.add('theming');
    setTimeout(() => root.classList.remove('theming'), 400);
  }
  root.dataset.mode = mode;
  root.style.setProperty('--accent-fill', a.f); root.style.setProperty('--on-accent-fill', a.o);
  root.style.setProperty('--ink-w', a.iw); root.style.setProperty('--ink-b', a.ib);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.content = '#000000'; // the status bar becomes the top of the black sign
}

/* ---- Routing ---- */
const NAV = [
  { id: 'home', label: 'Board', icon: 'board', tab: true },
  { id: 'today', label: 'Tasks', icon: 'tasks', tab: true },
  { id: 'lines', label: 'Lines', icon: 'lines', tab: true },
  { id: 'brain', label: 'Brain', icon: 'brain', tab: true },
  { id: 'memory', label: 'Memory', icon: 'book' },
  { id: 'life', label: 'Life Model', icon: 'life' },
  { id: 'experiments', label: 'Experiments', icon: 'flask' },
  { id: 'review', label: 'Review', icon: 'chart' },
  { id: 'settings', label: 'Settings', icon: 'gear' },
];
const VIEWS = {};
const route = { name: 'home', sub: '' };
LB.route = route;
function parseHash() {
  let h = '';
  try { h = decodeURIComponent((location.hash || '').slice(1)); } catch (_) {}
  const [name, ...rest] = h.split('-');
  return VIEWS[name] ? { name, sub: rest.join('-') } : { name: 'home', sub: '' };
}
function go(name, sub = '') {
  route.name = VIEWS[name] ? name : 'home';
  route.sub = sub;
  const h = '#' + route.name + (sub ? '-' + sub : '');
  try { if (location.hash !== h) history.replaceState(null, '', h); } catch (_) { try { location.hash = h; } catch (__) {} }
  render(true);
}
LB.go = go;
function renderNav() {
  const cur = route.name;
  const inMore = !NAV.find((n) => n.id === cur)?.tab;
  $('#tabbar').innerHTML = NAV.filter((n) => n.tab).map((n) => `<button class="tab" data-action="nav" data-to="${n.id}" ${n.id === cur ? 'aria-current="page"' : ''}>${icon(n.icon)}<span>${n.label}</span></button>`).join('')
    + `<button class="tab" data-action="more" ${inMore ? 'aria-current="page"' : ''}>${icon('more')}<span>More</span></button>`;
  $('#side').innerHTML = `<div class="brand"><img class="brand-mark" src="${LB.LOGO}" alt="" width="34" height="34">Life Brain</div>`
    + NAV.map((n, i) => (i === 4 || i === 8 ? '<div class="side-sep"></div>' : '') + `<button class="side-link" data-action="nav" data-to="${n.id}" ${n.id === cur ? 'aria-current="page"' : ''}>${icon(n.icon)}${n.label}</button>`).join('');
}
let lastRoute = '';
function render(focus) {
  applyTheme();
  renderNav();
  const view = $('#view');
  const key = route.name + '/' + route.sub;
  const scroll = key === lastRoute ? window.scrollY : 0;
  const warn = S.storage === 'unavailable' ? '<div class="banner" role="alert"><span><b>Not saving.</b> This browser blocks storage, so changes last only until you close the page. Export a backup from Settings → Data.</span></div>'
    : S.storage === 'error' ? '<div class="banner" role="alert"><span><b>A save failed.</b> Recent changes may not be stored. Export a backup from Settings → Data now.</span></div>' : '';
  try {
    view.innerHTML = warn + VIEWS[route.name](route.sub); noNativeValidation(view);
    const sign = $('.page-head', view); if (sign && view.firstElementChild !== sign) view.prepend(sign); // the station sign always comes first
  }
  catch (e) { console.error(e); view.innerHTML = `<div class="empty"><strong>This screen hit an error.</strong> Your data is safe. ${esc(e.message)}</div>`; }
  if (key !== lastRoute) { view.style.animation = 'none'; void view.offsetWidth; view.style.animation = ''; }
  lastRoute = key;
  const tb = $('#topbar');
  if (tb) tb.textContent = ($('.page-title', view) || {}).textContent || '';
  window.scrollTo(0, scroll);
  if (focus) view.focus({ preventScroll: true });
}
LB.render = render;

/* ---- Actions & forms (event delegation; every data-action must exist in A) ---- */
const A = (LB.A = {});
const F = (LB.F = {});
document.addEventListener('click', (ev) => {
  const el = ev.target.closest('[data-action]');
  if (!el || el.disabled) return;
  const fn = A[el.dataset.action];
  if (!fn) { console.error('Unknown action', el.dataset.action); toast('That control is not wired up yet.', 'bad'); return; }
  ev.preventDefault();
  settle(() => fn(el, ev)).catch((e) => { logIfBug(e); toast(e.message || 'Something went wrong.', 'bad'); });
});
/* Run a handler so sync throws and async rejections are handled the same way. */
const settle = (f) => { try { return Promise.resolve(f()); } catch (e) { return Promise.reject(e); } };
const logIfBug = (e) => { if (!(e instanceof Error) || e instanceof TypeError || e instanceof ReferenceError || e instanceof SyntaxError) console.error(e); };
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
/* Validation is ours, with readable messages in the page, not the browser's bubbles. */
const noNativeValidation = (root) => $$('form', root).forEach((f) => (f.noValidate = true));
A.nav = (el) => { closeSheet(); go(el.dataset.to, el.dataset.sub || ''); };
A.more = () => openSheet({ title: 'More', body: `<div class="list">${NAV.filter((n) => !n.tab).map((n) => `<button class="item" data-action="nav" data-to="${n.id}"><span class="item-emoji">${icon(n.icon)}</span><span class="item-main"><span class="item-title">${n.label}</span></span>${icon('right')}</button>`).join('')}</div>` });
A['sheet-close'] = () => closeSheet();

/* ---- Toast ---- */
let toastTimer;
/* Toasts confirm completed actions; an optional action (Undo) makes slips forgivable. */
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
  t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), opts.action || tone === 'bad' ? 6000 : 2600);
  if (tone === 'bad') haptic('error');
}
/* Haptics only for meaningful moments (success, error); silently absent where unsupported. */
function haptic(kind) { try { if (navigator.vibrate) navigator.vibrate(kind === 'error' ? [12, 60, 12] : 10); } catch (_) {} }
LB.toast = toast;
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); }
  catch (_) { toast('Copy is blocked here. Select the text and copy it manually.', 'bad'); }
}

/* ---- Sheets ---- */
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

/* Inline validation: say what is wrong next to the field, as soon as it is wrong. */
function validateField(el) {
  const field = el.closest('.field');
  if (!field || !el.willValidate) return true;
  const label = (($('span', field) || {}).textContent || 'This field').trim();
  const vs = el.validity;
  let msg = '';
  if (vs.valueMissing && el.dataset.touched) msg = `${label} is required.`;
  else if (vs.badInput) msg = el.type === 'number' ? 'Enter a number.' : 'Enter a valid value.';
  else if (vs.rangeUnderflow || vs.rangeOverflow) msg = `Use a value from ${el.min} to ${el.max}.`;
  let note = $('.err-inline', field);
  if (msg) {
    if (!note) { note = document.createElement('small'); note.className = 'err-inline'; note.id = (el.id || 'f' + Math.random().toString(36).slice(2)) + '-err'; note.setAttribute('role', 'alert'); field.append(note); }
    note.textContent = msg;
    el.setAttribute('aria-invalid', 'true');
    el.setAttribute('aria-describedby', note.id);
    return false;
  }
  if (note) note.remove();
  el.removeAttribute('aria-invalid');
  el.removeAttribute('aria-describedby');
  return true;
}
document.addEventListener('input', (ev) => {
  const el = ev.target;
  if (!el.matches || !el.matches('.field input, .field textarea, .field select')) return;
  el.dataset.touched = '1';
  if (el.getAttribute('aria-invalid') === 'true' || el.type === 'number') validateField(el);
});
document.addEventListener('focusout', (ev) => { const el = ev.target; if (el.matches && el.matches('.field input, .field textarea, .field select')) validateField(el); });

/* Collapse the large title into the translucent bar once it scrolls away. */
let scrollQueued = false;
window.addEventListener('scroll', () => {
  if (scrollQueued) return;
  scrollQueued = true;
  requestAnimationFrame(() => { scrollQueued = false; document.documentElement.classList.toggle('scrolled', window.scrollY > 56); });
}, { passive: true });
/* In-page confirmation (native confirm() is unavailable in some hosts). */
function confirmSheet({ title, text, confirmLabel = 'Confirm', danger = false, requireText = '' }) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    openSheet({ title, body: `<form class="form" data-form="confirm"><p>${text}</p>
      ${requireText ? `<label class="field"><span>Type ${esc(requireText)} to confirm</span><input name="confirm" autocomplete="off" autocapitalize="characters"></label>` : ''}
      <p class="err" data-form-error></p>
      <div class="form-actions"><button type="button" class="btn" data-action="sheet-close">Cancel</button><button class="btn ${danger ? 'danger solid' : 'primary'}">${esc(confirmLabel)}</button></div></form>`,
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

/* ---- Form helpers ---- */
const fieldHTML = (f, val) => {
  const [name, label, kind = 'text', o = {}] = f;
  const id = 'f-' + name;
  const req = o.req ? 'required' : '';
  const hint = o.hint ? `<small>${esc(o.hint)}</small>` : '';
  if (kind === 'area') return `<label class="field" for="${id}"><span>${label}</span><textarea id="${id}" name="${name}" maxlength="${o.max || 4000}" ${req} placeholder="${esc(o.ph || '')}">${esc(val)}</textarea>${hint}</label>`;
  if (kind === 'select') return `<label class="field" for="${id}"><span>${label}</span><select id="${id}" name="${name}" ${req}>${o.options.map(([v, l]) => `<option value="${esc(v)}" ${String(val ?? o.def ?? '') === String(v) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>${hint}</label>`;
  if (kind.startsWith('ref:')) {
    const t = kind.slice(4);
    const opts = all(t).sort((a, b) => (a.title || a.name || '').localeCompare(b.title || b.name || ''));
    return `<label class="field" for="${id}"><span>${label}</span><select id="${id}" name="${name}"><option value="">None</option>${opts.map((r) => `<option value="${r.id}" ${val === r.id ? 'selected' : ''}>${esc((r.emoji ? r.emoji + ' ' : '') + (r.title || r.name))}</option>`).join('')}</select>${hint}</label>`;
  }
  if (kind === 'check') return `<label class="check"><input type="checkbox" id="${id}" name="${name}" ${val ? 'checked' : ''}> ${label}</label>`;
  const type = { number: 'number', date: 'date', time: 'time' }[kind] || 'text';
  const extra = type === 'number' ? `inputmode="numeric" min="${o.min ?? 0}" max="${o.maxNum ?? 100000}" step="${o.step || 1}"` : `maxlength="${o.max || 200}"`;
  return `<label class="field" for="${id}"><span>${label}</span><input id="${id}" type="${type}" name="${name}" value="${esc(val ?? '')}" ${req} ${extra} placeholder="${esc(o.ph || '')}" autocomplete="off">${hint}</label>`;
};

/* Entity definitions drive generic create/edit sheets. */
const STATUS = {
  goal: [['active', 'Active'], ['paused', 'Paused'], ['done', 'Done'], ['dropped', 'Dropped']],
  project: [['active', 'Active'], ['paused', 'Paused'], ['done', 'Done'], ['dropped', 'Dropped']],
  experiment: [['planned', 'Planned'], ['running', 'Running'], ['done', 'Done'], ['abandoned', 'Abandoned']],
};
const ENT = {
  area: { label: 'Life area', fields: [['emoji', 'Emoji', 'text', { max: 8, ph: '🌱', hint: 'Use your keyboard’s emoji picker.' }], ['name', 'Name', 'text', { req: 1, ph: 'Health' }], ['note', 'What this area means to you', 'area']] },
  aim: { label: 'Long-term aim', fields: [['title', 'Aim', 'text', { req: 1, ph: 'Stay strong into my 60s' }], ['areaId', 'Life area', 'ref:area'], ['note', 'Why it matters', 'area']] },
  goal: { label: 'Goal', fields: [['title', 'Goal', 'text', { req: 1 }], ['aimId', 'Long-term aim', 'ref:aim'], ['areaId', 'Life area', 'ref:area'], ['measure', 'How you’ll know it’s done', 'text'], ['due', 'Target date', 'date'], ['status', 'Status', 'select', { options: STATUS.goal, def: 'active' }], ['why', 'Why this goal', 'area']] },
  project: { label: 'Project', fields: [['title', 'Project', 'text', { req: 1 }], ['goalId', 'Goal', 'ref:goal'], ['status', 'Status', 'select', { options: STATUS.project, def: 'active' }], ['note', 'Notes', 'area']] },
  task: { label: 'Task', fields: [['title', 'Task', 'text', { req: 1 }], ['projectId', 'Project', 'ref:project'], ['goalId', 'Goal (if no project)', 'ref:goal'],
    ['priority', 'Priority', 'select', { options: [['1', 'High'], ['2', 'Medium'], ['3', 'Low']], def: '2' }], ['estimateMin', 'Estimate (minutes)', 'number', { maxNum: 1440, step: 5 }],
    ['plannedDate', 'Planned for', 'date'], ['firstStep', 'First step', 'text', { ph: 'Open the doc and write one sentence' }], ['context', 'Context', 'text', { ph: 'At desk, needs laptop' }], ['why', 'Why it matters', 'area']] },
  habit: { label: 'Habit', fields: [['emoji', 'Emoji', 'text', { max: 8, ph: '🚶' }], ['title', 'Habit', 'text', { req: 1 }], ['areaId', 'Life area', 'ref:area'], ['perWeek', 'Target days per week', 'number', { min: 1, maxNum: 7 }]] },
  event: { label: 'Event', fields: [['title', 'Event', 'text', { req: 1 }], ['date', 'Date', 'date', { req: 1 }], ['allDay', 'All day', 'check'], ['start', 'Starts', 'time'], ['end', 'Ends', 'time'], ['location', 'Location', 'text'], ['notes', 'Notes', 'area']] },
  experiment: { label: 'Experiment', fields: [['title', 'Name', 'text', { req: 1 }], ['hypothesis', 'Hypothesis', 'area', { req: 1, ph: 'If I…, then…' }], ['intervention', 'Intervention (what you’ll do)', 'area'], ['measurement', 'Measurement (what you’ll record)', 'text'], ['startDate', 'Start', 'date'], ['endDate', 'End', 'date'], ['status', 'Status', 'select', { options: STATUS.experiment, def: 'planned' }]] },
  memory: { label: 'Memory', fields: [['kind', 'Kind', 'select', { options: Object.entries(MEM_KINDS), def: 'lesson' }], ['title', 'Title', 'text', { req: 1 }], ['body', 'Details', 'area'], ['why', 'Why (for decisions)', 'area'], ['date', 'Date', 'date']] },
};
LB.ENT = ENT;
function fieldsLayout(fields, rec) {
  const out = [];
  for (let i = 0; i < fields.length; i++) {
    const f = fields[i], n = fields[i + 1];
    const small = (x) => x && ['number', 'date', 'time', 'select'].includes(x[2]) || (x && x[2] && x[2].startsWith('ref:'));
    if (small(f) && small(n)) { out.push(`<div class="form-row">${fieldHTML(f, rec[f[0]])}${fieldHTML(n, rec[n[0]])}</div>`); i++; }
    else out.push(fieldHTML(f, rec[f[0]]));
  }
  return out.join('');
}
function editSheet(type, id, defaults = {}) {
  const def = ENT[type];
  const rec = id ? get(id) : { ...defaults };
  if (id && !rec) { toast('That item no longer exists.', 'bad'); return; }
  openSheet({ title: (id ? 'Edit ' : 'New ') + def.label.toLowerCase(), body: `<form class="form" data-form="entity" data-type="${type}" data-id="${id || ''}" novalidate>
    ${fieldsLayout(def.fields, rec)}
    <p class="err" data-form-error></p>
    <div class="form-actions">${id ? `<button type="button" class="btn danger" data-action="delete" data-id="${id}">Delete</button><span class="spacer"></span>` : ''}<button type="button" class="btn" data-action="sheet-close">Cancel</button><button class="btn primary">${id ? 'Save' : 'Add'}</button></div></form>`,
  });
}
LB.editSheet = editSheet;
function readEntity(type, v, form) {
  const out = {};
  for (const [name, label, kind = 'text', o = {}] of ENT[type].fields) {
    let x = v[name];
    if (kind === 'check') x = !!form.elements[name]?.checked;
    else if (kind === 'number') x = x === '' || x == null ? null : Number(x);
    else x = String(x ?? '').trim();
    if (o.req && (x === '' || x == null)) throw new Error(`${label} is required.`);
    if (kind === 'number' && x != null && (!Number.isFinite(x) || x < (o.min ?? 0) || x > (o.maxNum ?? 100000))) throw new Error(`${label} must be between ${o.min ?? 0} and ${o.maxNum ?? 100000}.`);
    if (kind === 'date' && x && !isYmd(x)) throw new Error(`${label} must be a valid date.`);
    if (kind === 'time' && x && toMin(x) == null) throw new Error(`${label} must be a valid time.`);
    out[name] = x;
  }
  return out;
}
F.entity = async (form, v) => {
  const type = form.dataset.type, id = form.dataset.id;
  const vals = readEntity(type, v, form);
  if (type === 'event') {
    if (!vals.allDay && vals.start && vals.end && toMin(vals.end) <= toMin(vals.start)) throw new Error('The event must end after it starts.');
    if (vals.allDay) { vals.start = ''; vals.end = ''; }
  }
  if (type === 'experiment' && vals.startDate && vals.endDate && vals.endDate < vals.startDate) throw new Error('The end date must be after the start date.');
  const old = id ? get(id) : null;
  let rec = { ...(old || { type }), ...vals, type };
  if (type === 'task') rec = applyTaskPlan(old, rec);
  if (type === 'task' && !old) rec.status = 'open';
  if (type === 'habit' && !old) rec.log = {};
  if (type === 'experiment' && !old) rec.observations = [];
  if (type === 'task' && rec.projectId && rec.goalId) { const p = get(rec.projectId); if (p && p.goalId === rec.goalId) rec.goalId = ''; }
  await put(rec);
  if (S.storage === 'ok') requestPersistence();
  closeSheet();
  toast(old ? 'Saved' : `${ENT[type].label} added`);
};
/* Plan history: every date a task is planned for is kept; moving it later counts as a deferral. */
function applyTaskPlan(old, rec) {
  const plans = [...((old && old.plans) || [])];
  const prev = old ? old.plannedDate : '';
  if (rec.plannedDate && rec.plannedDate !== prev) {
    if (!plans.includes(rec.plannedDate)) plans.push(rec.plannedDate);
    if (prev && rec.plannedDate > prev && (!old || old.status === 'open')) rec.deferrals = (old.deferrals || 0) + 1;
  }
  rec.plans = plans;
  rec.deferrals = rec.deferrals || (old && old.deferrals) || 0;
  return rec;
}
LB.applyTaskPlan = applyTaskPlan;
A.add = (el) => editSheet(el.dataset.type, null, { ...el.dataset.date ? { date: el.dataset.date, plannedDate: el.dataset.date } : {}, ...(el.dataset.preset ? JSON.parse(el.dataset.preset) : {}) });
A.edit = (el) => editSheet(get(el.dataset.id)?.type, el.dataset.id);
/* Deleting is immediate and forgiving: Undo brings back the item and every link to it. */
A.delete = async (el) => {
  const r = get(el.dataset.id);
  if (!r) return;
  const links = [];
  for (const x of S.records.values()) for (const k of ['areaId', 'aimId', 'goalId', 'projectId']) if (x[k] === r.id) links.push([x.id, k]);
  closeSheet();
  await del(r.id);
  toast(`Deleted “${trunc(r.title || r.name, 36)}”`, '', { action: 'Undo', onAction: async () => {
    await put(r);
    for (const [id, k] of links) { const x = get(id); if (x) await put({ ...x, [k]: r.id }); }
    toast('Restored');
  } });
};
