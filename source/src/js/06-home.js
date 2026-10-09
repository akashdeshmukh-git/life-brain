/* ===== Home: a 30-second glance at the day. The day drawn as terrain, then what needs you and what's already done.
   Built only from what's in the app. It observes and hands over: no orders, no pep talk, no scolding. ===== */
const DAY_START = 6 * 60, DAY_END = 24 * 60;
const toMins = (t) => { if (!/^\d{1,2}:\d{2}$/.test(t || '')) return null; const [h, m] = t.split(':').map(Number); return h * 60 + m; };
/* Timed events as [start, end] minutes; no end time means an hour. */
const spans = (events) => events.map((e) => { const s = toMins(e.time); if (s == null) return null; let en = toMins(e.end); if (en == null || en <= s) en = Math.min(s + 60, DAY_END); return { e, s, en }; }).filter(Boolean).sort((a, b) => a.s - b.s);
const ACTS = [
  { label: 'Until 12 PM', from: 0, to: 12 * 60, name: 'morning' },
  { label: '12 – 5 PM', from: 12 * 60, to: 17 * 60, name: 'afternoon' },
  { label: '5 PM onward', from: 17 * 60, to: DAY_END, name: 'evening' },
];
const tTime = (m) => fmtTime(`${Math.floor(m / 60) % 24}:${pad(m % 60)}`);
const joinAnd = (xs) => (xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]);
const dueWord = (d, t) => { const r = relDate(d, t); return ['Yesterday', 'Today', 'Tomorrow'].includes(r) ? r.toLowerCase() : r; };
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
  const near = D.goals.find((g) => Number(g.target) - goalNow(g) === 1);
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

/* The drawing: one stroke, elevation = load. A calm day is nearly still water. */
function terrain(sp, shape, t, nowMin, isToday) {
  const wide = window.innerWidth >= 640, W = wide ? 840 : 420, H = wide ? 170 : 130, BASE_Y = H - 30; // drawn at the phone's own shape, so dots stay round
  const xOf = (m) => 20 + ((clamp(m, DAY_START, DAY_END) - DAY_START) / (DAY_END - DAY_START)) * (W - 40);
  const scale = { heavy: 0.6, normal: 0.42, open: 0.28 }[shape] * (H - 40);
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
  let sun = false;
  // At most one motif per act: a sun over open time, a moon over a late finish.
  ACTS.forEach((a, i) => {
    const cx = W / 6 + (i * W) / 3, busy = sp.some((x) => x.s < a.to && x.en > a.from);
    if (!busy && !sun && (!isToday || nowMin < a.to)) {
      sun = true; // one sun, over the next open stretch
      marks += `<g class="motif" transform="translate(${cx} 40)"><circle r="9"/>${[0, 45, 90, 135, 180, 225, 270, 315].map((g) => `<line x1="0" y1="-14" x2="0" y2="-19" transform="rotate(${g})"/>`).join('')}</g>`;
    } else if (i === 2 && sp.some((x) => x.en >= 21 * 60)) {
      marks += `<path class="motif" d="M${cx + 6} 30 a12 12 0 1 0 0 22 a9 9 0 1 1 0 -22z"/>`;
    }
  });
  if (isToday && nowMin >= DAY_START && nowMin <= DAY_END) marks += `<circle class="now" cx="${xOf(nowMin).toFixed(1)}" cy="${yAt(nowMin).toFixed(1)}" r="5"><title>Now</title></circle>`; // the one clay accent
  return `<svg class="terrain" viewBox="0 0 ${W} ${H}" role="img" aria-label="The day drawn as a line: higher where the calendar is fuller"><path d="${d}" class="ridge"/>${marks}</svg>`;
}

function actSentence(a, sp, D, t, used) {
  const here = sp.filter((x) => x.s < a.to && x.en > a.from);
  if (here.length) {
    const parts = here.slice(0, 3).map((x) => `${esc(trunc(x.e.title, 40))} at ${tTime(x.s)}`);
    return joinAnd(parts) + (here.length > 3 ? `, and ${here.length - 3} more` : '') + '.';
  }
  if (!used.task) { const w = waitingTask(D, t); if (w) { used.task = true; return `Clear, with room for ${esc(quoted(w.title))}.`; } }
  if (a.name === 'evening') { const left = D.habits.filter((h) => !habitDone(h, t)); if (left.length) return `Clear. Still to tick: ${esc(joinAnd(left.slice(0, 3).map((h) => h.title)))}.`; }
  return 'Clear.';
}

/* Item: bold title that opens the thing, one sentence. */
const briefItem = (it) => `<li><button class="bi-title" ${it.attrs}>${esc(it.title)}</button><p>${it.text}</p></li>`;
const act = (id, extra = '') => `data-action="${id}" ${extra}`;

function needsAttention(D, t) {
  const out = [...pendingItems()]; // suggestions your AI prepared by itself come first
  const over = D.tasks.filter((x) => isOverdue(x, t)).sort((a, b) => a.date.localeCompare(b.date));
  over.slice(0, 3).forEach((x) => out.push({ title: x.title, attrs: act('task-edit', `data-id="${x.id}"`), text: `Was due ${esc(dueWord(x.date, t))}, still open${(x.moved || 0) >= 2 ? `, moved ${x.moved} times` : ''}.` }));
  if (over.length > 3) out.push({ title: `${over.length - 3} more overdue`, attrs: act('nav', 'data-to="today"'), text: 'On the <u>Today</u> list.' });
  const todays = D.tasks.filter((x) => !x.done && x.date === t).sort(byCreated);
  todays.slice(0, 3).forEach((x) => out.push({ title: x.title, attrs: act('task-edit', `data-id="${x.id}"`), text: `On today’s list${x.note ? `. ${esc(trunc(x.note.split('\n')[0], 80))}` : ''}.`.replace('..', '.') }));
  if (todays.length > 3) out.push({ title: `${todays.length - 3} more for today`, attrs: act('nav', 'data-to="today"'), text: 'On the <u>Today</u> list.' });
  const tm = addDays(t, 1);
  const written = (n) => (n.createdAt && !Number.isNaN(Date.parse(n.createdAt)) ? ymd(new Date(n.createdAt)) : '');
  const noteText = (n) => esc(trunc(String(n.body || '').replace(/\s+/g, ' '), 100));
  D.notes.filter((n) => noteDay(n) === t && written(n) < t).slice(0, 2).forEach((n) => out.push({ title: n.title || trunc(String(n.body || '').split('\n')[0], 60) || 'Note', attrs: act('note-open', `data-id="${n.id}"`), text: `A note you left for today${n.title && n.body ? `: ${noteText(n)}` : '.'}` }));
  D.notes.filter((n) => noteDay(n) === tm).slice(0, 2).forEach((n) => out.push({ title: n.title || trunc(String(n.body || '').split('\n')[0], 60) || 'Note', attrs: act('note-open', `data-id="${n.id}"`), text: `A note for tomorrow${n.title && n.body ? `: ${noteText(n)}` : '.'}` }));
  eventsOn(D, tm).slice(0, 2).forEach((e) => out.push({ title: e.title, attrs: act('event-edit', `data-id="${e.id}"`), text: `Tomorrow${e.time ? ' at ' + esc(fmtTime(e.time)) : ''}${e.note ? `. The note says: ${esc(trunc(e.note.split('\n')[0], 90))}` : ''}.` }));
  // A gentle reminder for habits you usually do: framed as a weekly count, not a streak that can 'break'.
  D.habits.map((h) => ({ h, n: habitCount(h, addDays(t, -7), addDays(t, -1)) })).filter((x) => !habitDone(x.h, t) && x.n >= 3).slice(0, 2).forEach(({ h, n }) => out.push({ title: h.title, attrs: act('nav', 'data-to="today"'), text: `Not ticked yet today. Done ${n} of the last 7 days.` }));
  D.goals.filter((g) => { const left = Number(g.target) - goalNow(g); return left > 0 && left <= 2; }).slice(0, 1).forEach((g) => out.push({ title: g.title, attrs: act('nav', 'data-to="progress"'), text: `${goalNow(g)} of ${esc(g.target)}${g.unit ? ' ' + esc(g.unit) : ''}, ${Number(g.target) - goalNow(g)} to go.` }));
  // Everything lives only on this phone, so a backup file is the one safety net against a cleared browser.
  const n = S.records.size, last = S.lastExport ? daysBetween(S.lastExport.slice(0, 10), t) : null;
  if (n >= 15 && (last == null || last >= 30)) out.push({ title: 'Save a backup file', attrs: act('nav', 'data-to="settings"'), text: `Everything lives only on this phone. ${last == null ? 'No backup file has been saved yet' : `The last backup file was saved ${last} days ago`}; one is a tap away in <u>Settings</u>.` });
  // Sunday or Monday: offer the weekly look back, once a week, when the AI is set up.
  const wd = parseYmd(t).getDay(), lb = S.settings.lookBack;
  if ((wd === 0 || wd === 1) && AI.provider() !== 'none' && S.records.size >= 10 && (!lb || lb < addDays(t, -5))) out.push({ title: 'Weekly look back', attrs: act('look-back'), text: 'A short look at what got done and what slipped this week, written by your AI.' });
  return out.slice(0, 10);
}
function alreadySorted(D, t) {
  const out = [], y = addDays(t, -1);
  const doneT = doneOn(D, t), doneY = doneOn(D, y);
  if (doneT.length) out.push({ title: `${plural(doneT.length, 'task')} done today`, attrs: act('nav', 'data-to="today"'), text: `${esc(joinAnd(doneT.slice(0, 3).map((x) => quoted(x.title))))}${doneT.length > 3 ? ' and more' : ''}.` });
  if (doneY.length) out.push({ title: `${plural(doneY.length, 'task')} done yesterday`, attrs: act('nav', `data-to="calendar" data-sub="${y}"`), text: `${esc(joinAnd(doneY.slice(0, 3).map((x) => quoted(x.title))))}${doneY.length > 3 ? ' and more' : ''}.` });
  const keptY = D.habits.filter((h) => habitDone(h, y));
  if (keptY.length) out.push({ title: `${keptY.length === 1 ? 'A habit' : plural(keptY.length, 'habit')} kept yesterday`, attrs: act('nav', 'data-to="progress"'), text: `${esc(joinAnd(keptY.slice(0, 3).map((h) => h.title)))}${keptY.length === 1 && habitStreak(keptY[0], y) > 1 ? `, ${habitStreak(keptY[0], y)} days in a row` : ''}.` });
  D.goals.filter((g) => goalNow(g) >= Number(g.target) && Object.keys(g.log || {}).some((d) => d >= addDays(t, -6))).slice(0, 1).forEach((g) => out.push({ title: `${g.title}: reached`, attrs: act('nav', 'data-to="progress"'), text: `${goalNow(g)} of ${esc(g.target)}${g.unit ? ' ' + esc(g.unit) : ''}, in the last week.` }));
  return out.slice(0, 4);
}

VIEWS.home = () => {
  const D = data(), t = today(), now = LB.now(), nowMin = now.getHours() * 60 + now.getMinutes();
  const sp = spans(eventsOn(D, t)), shape = dayShape(sp);
  const used = {};
  const need = needsAttention(D, t), done = alreadySorted(D, t);
  const shown = need.map((it) => (it.attrs.match(/data-id="([^"]+)"/) || [])[1]).filter(Boolean);
  const pats = patterns(D, t).filter((p) => !shown.some((id) => p.id === 'moved-' + id)).slice(0, 2); // don't say the same thing twice
  const dateLine = `${fmtDate(t, { weekday: 'long' })} · ${fmtDate(t, { month: 'long', day: 'numeric' })} ${t.slice(0, 4)}`;
  const part = nowMin < 12 * 60 ? 'this morning' : nowMin < 17 * 60 ? 'this afternoon' : 'this evening';
  const list = (title, items, cls) => items.length ? `<section class="blist ${cls}"><h2>${title}</h2><ol>${items.map(briefItem).join('')}</ol></section>` : '';
  return `<div class="brief">
    <div class="brief-top"><div class="brief-in">
      <div class="brief-head">${menuBtn()}<p class="daydate">${esc(dateLine)}</p></div>
      <h1 class="headline">${headline(D, t, sp, shape)}</h1>
      ${AUTO.busy ? `<p class="ai-busy" id="ai-busy">${icon('spark')}Your AI is working on ${esc(AUTO.busy)}…</p>` : homeLine() ? `<p class="ai-line" id="home-line">${esc(homeLine())} <button class="link" data-action="home-ai" aria-label="Ask again about today">${icon('spark')}</button></p>` : `<button class="link ai-today" data-action="home-ai">${icon('spark')}What matters today?</button>`}
      ${terrain(sp, shape, t, nowMin, true)}
      <div class="acts">${ACTS.map((a) => `<div class="act${nowMin >= a.to ? ' past' : ''}"><b>${a.label}</b><p>${actSentence(a, sp, D, t, used)}</p></div>`).join('')}</div>
    </div></div>
    <div class="brief-bottom"><div class="brief-in">
      ${need.length || done.length ? list('Needs attention', need, 'need') + list('Already sorted', done, 'done') : `<p class="calm">Nothing needs you ${part}.</p>`}
      ${pats.length ? `<section class="blist know"><h2>Worth knowing</h2><ol>${pats.map((p) => `<li><p class="solo">${esc(p.text)}</p></li>`).join('')}</ol></section>` : ''}
    </div></div></div>`;
};
let homeResize;
window.addEventListener('resize', () => { clearTimeout(homeResize); homeResize = setTimeout(() => { if (route.name === 'home' && !SH.open) render(false); }, 200); });
