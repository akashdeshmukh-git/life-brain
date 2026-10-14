/* ===== Home: a 30-second glance. One line about the day, the day drawn as a line, then the few things you can
   act on right here: tick today's tasks and habits, see where your goals stand, apply a fix. Built only from
   what's in the app. It observes and hands over: no orders, no pep talk, no scolding. ===== */
const DAY_START = 6 * 60, DAY_END = 24 * 60;
const toMins = (t) => { if (!/^\d{1,2}:\d{2}$/.test(t || '')) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
/* Timed events as [start, end] minutes; no end time means an hour. */
const spans = (events) => events.map((e) => { const s = toMins(e.time); if (s == null) return null; let en = toMins(e.end); if (en == null || en <= s) en = Math.min(s + 60, DAY_END); return { e, s, en }; }).filter(Boolean).sort((a, b) => a.s - b.s);
const tTime = (m) => fmtTime(`${Math.floor(m / 60) % 24}:${pad(m % 60)}`);
const joinAnd = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
const quoted = (s) => `“${trunc(s, 48)}”`;

function dayShape(sp) {
  const total = sp.reduce((n, x) => n + (x.en - x.s), 0);
  if (sp.length >= 4 || total >= 300) return 'heavy';
  if (!sp.length || (sp.length === 1 && total <= 60)) return 'open';
  return 'normal';
}
/* The one thing that's been waiting longest: most moved, then oldest overdue, then oldest open. */
function waitingTask(D, t) {
  const open = D.tasks.filter((x) => !x.done && (!x.date || x.date <= t));
  return open.sort((a, b) => (b.moved || 0) - (a.moved || 0) || String(a.date || '9').localeCompare(String(b.date || '9')) || byCreated(a, b))[0] || null;
}
function headline(D, t, sp, shape) {
  const nm = String(S.settings.name || '').trim(), n = nm ? `, ${esc(nm)}` : '';
  const near = D.goals.find((g) => goalIsNumber(g) && Number(g.target) - goalNow(g) === 1);
  if (near) return `One more and ${esc(quoted(near.title))} is done${n}.`;
  if (shape === 'open') {
    const w = waitingTask(D, t);
    return `The whole day is yours${n}.${w ? ` Room for ${esc(quoted(w.title))}.` : ''}`;
  }
  const first = sp[0].s, last = sp[sp.length - 1].en;
  if (shape === 'heavy') return last <= 19 * 60 ? `A steady climb until ${tTime(last)}${n}, then the day opens up.` : `A full day${n}, from ${tTime(first)} to ${tTime(last)}.`;
  if (last <= 12 * 60) return `A busy morning${n}, then the rest of the day is yours.`;
  if (first >= 12 * 60) return `The morning is yours${n}. Things start at ${tTime(first)}.`;
  return `${sp.length === 2 ? 'Two' : sp.length === 3 ? 'Three' : sp.length} things on the calendar${n}, with room in between.`;
}

/* The drawing: one stroke, elevation = load. A calm day is nearly still water. The "now" mark carries the
   logo's gradient: the one place on Home it appears. */
function terrain(sp, shape, t, nowMin, isToday) {
  const wide = window.innerWidth >= 640, W = wide ? 840 : 420, H = wide ? 150 : 112, BASE_Y = H - 24; // drawn at the phone's own shape, so dots stay round
  const xOf = (m) => 14 + ((clamp(m, DAY_START, DAY_END) - DAY_START) / (DAY_END - DAY_START)) * (W - 28);
  const scale = { heavy: 0.62, normal: 0.44, open: 0.28 }[shape] * (H - 36);
  const load = (m) => sp.reduce((v, x) => { const ramp = 75; if (m < x.s - ramp || m > x.en + ramp) return v; const k = m < x.s ? (m - (x.s - ramp)) / ramp : m > x.en ? ((x.en + ramp) - m) / ramp : 1; return v + (0.5 - 0.5 * Math.cos(Math.PI * k)); }, 0);
  const pts = [];
  for (let m = DAY_START; m <= DAY_END; m += 6) {
    const ripple = Math.sin(m / 23) * 1.6 + Math.sin(m / 9) * 0.6; // still water, not a flat ruler
    pts.push([xOf(m), BASE_Y - Math.min(load(m), 1.7) * scale + ripple]);
  }
  const yAt = (m) => { const x = xOf(m); let best = pts[0]; for (const p of pts) if (Math.abs(p[0] - x) < Math.abs(best[0] - x)) best = p; return best[1]; };
  const d = 'M' + pts.map((p) => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L');
  let marks = '';
  sp.forEach((x, i) => {
    const mid = (x.s + x.en) / 2, r = clamp(5 + (x.en - x.s) / 30, 5, wide ? 13 : 9);
    const overlap = sp.some((y, j) => j !== i && y.s < x.en && x.s < y.en);
    marks += `<circle cx="${xOf(mid).toFixed(1)}" cy="${(yAt(mid)).toFixed(1)}" r="${r.toFixed(1)}" class="${overlap ? 'hollow' : 'dot'}"><title>${esc(x.e.title)}</title></circle>`;
  });
  // A sun over the next open stretch of the day, a moon over a late finish.
  const parts = [[0, 12 * 60], [12 * 60, 17 * 60], [17 * 60, DAY_END]];
  let sun = false;
  parts.forEach(([from, to], i) => {
    const cx = W / 6 + (i * W) / 3, busy = sp.some((x) => x.s < to && x.en > from);
    if (!busy && !sun && (!isToday || nowMin < to)) {
      sun = true;
      marks += `<g class="motif" transform="translate(${cx} 22)"><circle r="8"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((g) => `<line x1="0" y1="-12.5" x2="0" y2="-16.5" transform="rotate(${g})"/>`).join('')}</g>`;
    } else if (i === 2 && sp.some((x) => x.en >= 21 * 60)) {
      marks += `<path class="motif" d="M${cx + 6} 12 a12 12 0 1 0 0 22 a9 9 0 1 1 0 -22z"/>`;
    }
  });
  if (isToday && nowMin >= DAY_START && nowMin <= DAY_END) {
    const nx = xOf(nowMin).toFixed(1), ny = yAt(nowMin).toFixed(1);
    marks += `<circle class="halo" cx="${nx}" cy="${ny}" r="13" fill="url(#lb-grad)"/><circle class="now" cx="${nx}" cy="${ny}" r="6.5" fill="url(#lb-grad)"><title>Now</title></circle>`;
  }
  const hours = [9, 12, 15, 18, 21].map((h) => `<text x="${xOf(h * 60).toFixed(1)}" y="${H - 3}" text-anchor="middle" class="fill-muted text-[11px] font-medium">${esc(fmtTime(`${h}:00`).replace(':00', ''))}</text>`).join('');
  return `<svg class="terrain" viewBox="0 0 ${W} ${H}" role="img" aria-label="The day drawn as a line: higher where the calendar is fuller"><defs><linearGradient id="lb-grad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7856fe"/><stop offset=".55" stop-color="#cb53fa"/><stop offset="1" stop-color="#ff7ada"/></linearGradient></defs><path d="${d}" class="ridge"/>${marks}${hours}</svg>`;
}

/* Today's events as a strip of chips, so the times are readable without opening anything. */
function eventStrip(D, t, nowMin) {
  const evs = eventsOn(D, t);
  if (!evs.length) return '';
  return `<div class="ev-strip mt-3" role="group" aria-label="Today’s events">${evs.map((e) => {
    const s = toMins(e.time), en = toMins(e.end) ?? (s == null ? null : s + 60), past = en != null && en <= nowMin;
    return `<button class="ev-chip${past ? ' past' : ''}" data-action="event-edit" data-id="${e.id}"><b>${e.time ? esc(fmtTime(e.time)) : 'All day'}</b><span>${esc(e.title)}</span></button>`;
  }).join('')}</div>`;
}

/* Today, ready to tick: overdue first, then today's, then habits. The rest lives on Today. */
function todaySection(D, t) {
  const over = D.tasks.filter((x) => isOverdue(x, t)).sort((a, b) => a.date.localeCompare(b.date) || byCreated(a, b));
  const todays = D.tasks.filter((x) => !x.done && x.date === t).sort(byCreated);
  const list = [...over, ...todays], shown = list.slice(0, 5), more = list.length - shown.length;
  const habits = D.habits.slice().sort(byCreated);
  const left = list.length + habits.filter((h) => !habitDone(h, t)).length;
  return `<section class="mt-7" id="home-today">
    <div class="sec-h"><h2>Today</h2><button class="link" data-action="nav" data-to="today">${left ? `${left} to do` : 'All tasks'}</button></div>
    <div class="card mt-1 !py-1">
      ${shown.map((x) => taskRow(x, t)).join('') || '<p class="calm py-3 text-[15px] text-muted">Nothing due today. Tap + to add something.</p>'}
      ${more ? `<button class="fold border-t border-line" data-action="nav" data-to="today">${icon('down')}${plural(more, 'more task')} on Today</button>` : ''}
    </div>
    ${habits.length ? `<div class="habits mt-3">${habits.map((h) => habitChip(h, t)).join('')}</div>` : ''}
  </section>`;
}

/* What's next: tomorrow's events and notes left for today or tomorrow. */
function comingUp(D, t) {
  const tm = addDays(t, 1), rows = [];
  const written = (n) => (n.createdAt && !Number.isNaN(Date.parse(n.createdAt)) ? ymd(new Date(n.createdAt)) : '');
  const noteName = (n) => n.title || trunc(String(n.body || '').split('\n')[0], 60) || 'Note';
  const row = (action, id, when, title, text) => `<button class="soon-row" data-action="${action}" data-id="${id}"><span class="soon-when">${when}</span><span class="min-w-0 flex-1"><b class="block font-semibold break-words">${esc(title)}</b><span class="block text-sm text-muted">${text}</span></span></button>`;
  D.notes.filter((n) => noteDay(n) === t && written(n) < t).slice(0, 2).forEach((n) => rows.push(row('note-open', n.id, 'Today', noteName(n), 'A note you left for today')));
  eventsOn(D, tm).slice(0, 3).forEach((e) => rows.push(row('event-edit', e.id, e.time ? esc(fmtTime(e.time)) : 'All day', e.title, `Tomorrow${e.note ? `. ${esc(trunc(e.note.split('\n')[0], 90))}` : ''}`)));
  D.notes.filter((n) => noteDay(n) === tm).slice(0, 2).forEach((n) => rows.push(row('note-open', n.id, 'Tomorrow', noteName(n), 'A note for tomorrow')));
  return rows.length ? `<section class="mt-7" id="coming-up"><div class="sec-h"><h2>Coming up</h2></div><div class="card mt-1 !py-1">${rows.join('')}</div></section>` : '';
}

/* What's already done, in a few quiet lines. */
function doneLines(D, t) {
  const y = addDays(t, -1), out = [];
  const doneT = doneOn(D, t), doneY = doneOn(D, y), keptY = D.habits.filter((h) => habitDone(h, y));
  const names = (xs) => esc(joinAnd(xs.slice(0, 3).map((x) => quoted(x.title)))) + (xs.length > 3 ? ' and more' : '');
  if (doneT.length) out.push(`${plural(doneT.length, 'task')} done today: ${names(doneT)}.`);
  if (doneY.length) out.push(`${plural(doneY.length, 'task')} done yesterday: ${names(doneY)}.`);
  if (keptY.length) out.push(`${keptY.length === 1 ? 'A habit' : plural(keptY.length, 'habit')} kept yesterday: ${esc(joinAnd(keptY.slice(0, 3).map((h) => h.title)))}${keptY.length === 1 && habitStreak(keptY[0], y) > 1 ? `, ${habitStreak(keptY[0], y)} days in a row` : ''}.`);
  D.goals.filter((g) => (goalIsNumber(g) ? goalNow(g) >= Number(g.target) && Object.keys(g.log || {}).some((d) => d >= addDays(t, -6)) : g.done && g.doneDate >= addDays(t, -6))).slice(0, 1).forEach((g) => out.push(`${esc(g.title)}: reached this week.`));
  return out.length ? `<section class="mt-7" id="home-done"><div class="sec-h"><h2>Already done</h2></div><ul class="mt-1 flex flex-col gap-1.5 text-[15px] text-muted">${out.slice(0, 4).map((l) => `<li>${l}</li>`).join('')}</ul></section>` : '';
}

VIEWS.home = () => {
  const D = data(), t = today(), now = LB.now(), nowMin = now.getHours() * 60 + now.getMinutes();
  const sp = spans(eventsOn(D, t)), shape = dayShape(sp);
  const ai = AUTO.busy ? `<p class="ai-line mt-4 flex items-center gap-2 text-muted" id="ai-busy"><span class="ai-mark animate-spin">${icon('spark')}</span>Your AI is working on ${esc(AUTO.busy)}…</p>`
    : homeLine() ? `<div class="ai-line mt-4 flex items-start gap-2" id="home-line"><p class="flex-1 pt-0.5">${esc(homeLine())}</p><button class="icon-btn -my-2 !h-10 !w-10" data-action="home-ai" aria-label="Ask again about today"><span class="ai-mark">${icon('spark')}</span></button></div>`
    : `<button class="pill ai-today mt-4" data-action="home-ai"><span class="ai-mark !h-5 !w-5">${icon('spark')}</span>What matters today?</button>`;
  return `<div class="brief">
    <div class="top !pb-0">${menuBtn()}<p class="daydate flex-1 text-[15px] font-medium text-muted">${esc(fmtDate(t, { weekday: 'long', month: 'long', day: 'numeric' }))}</p></div>
    <h1 class="headline mt-2">${headline(D, t, sp, shape)}</h1>
    ${ai}
    <div class="mt-4">${terrain(sp, shape, t, nowMin, true)}</div>
    ${eventStrip(D, t, nowMin)}
    ${headingSection(D, t)}
    ${fixesSection(D, t)}
    ${todaySection(D, t)}
    ${comingUp(D, t)}
    ${doneLines(D, t)}
    ${fab()}</div>`;
};
let homeResize;
window.addEventListener('resize', () => { clearTimeout(homeResize); homeResize = setTimeout(() => { if (route.name === 'home' && !SH.open) render(false); }, 200); });
