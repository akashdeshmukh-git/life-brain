/* ===== Month: a record of your days, not an appointment book. Each day shows a dot per task in its line's
   colour: filled if it happened, a ring if it didn't, a faint ring if it's still planned. Tap a day for detail. ===== */
const month = { line: '' }; // optional line filter
const monthKey = () => (/^\d{4}-\d{2}$/.test(route.sub) ? route.sub : today().slice(0, 7));
/* Everything a day holds: planned tasks with what became of them, unplanned finishes, events. */
function dayRecord(D, date, t = today()) {
  const rec = Loop.day(D, date), items = [];
  const task = (id) => D.tasks.find((x) => x.id === id);
  const planned = rec && (rec.plannedIds || []).length ? rec.plannedIds : null;
  if (planned && (rec.reviewedAt || date >= t)) {
    for (const id of planned) {
      const x = task(id); if (!x) continue;
      const miss = (rec.missed || []).find((m) => m.id === id);
      const state = rec.reviewedAt ? ((rec.kept || []).includes(id) ? 'kept' : 'missed') : x.status === 'done' && x.doneDate === date ? 'kept' : 'planned';
      items.push({ x, state, reason: miss && miss.reason });
    }
  } else if (date >= t) {
    D.tasks.filter((x) => x.status === 'open' && x.plannedDate === date).forEach((x) => items.push({ x, state: 'planned' }));
  }
  D.tasks.filter((x) => x.status === 'done' && x.doneDate === date && !items.some((i) => i.x.id === x.id)).forEach((x) => items.push({ x, state: 'extra' }));
  const events = D.events.filter((e) => e.date === date);
  const closed = !!(rec && rec.reviewedAt && !rec.unknown && (rec.plannedIds || []).length);
  return { rec, items, events, closed, unknown: !!(rec && rec.unknown), open: !!(planned && !rec.reviewedAt && date < t) };
}
/* Which weekdays your plans hold up on, once there are at least two closed days of each to compare. */
function weekdayPattern(D, t = today()) {
  const by = {};
  for (const d of Loop.reviewed(D, addDays(t, -56), t)) {
    const w = parseYmd(d.date).getDay();
    (by[w] = by[w] || { planned: 0, kept: 0, days: 0 }).days++;
    by[w].planned += d.plannedIds.length; by[w].kept += (d.kept || []).length;
  }
  const rows = Object.entries(by).filter(([, v]) => v.days >= 2 && v.planned).map(([w, v]) => ({ w: Number(w), rate: v.kept / v.planned }));
  if (rows.length < 2) return null;
  rows.sort((a, b) => b.rate - a.rate);
  const best = rows[0], worst = rows[rows.length - 1];
  if (best.rate - worst.rate < 0.2) return null;
  const name = (w) => new Date(2024, 0, 7 + w).toLocaleDateString(undefined, { weekday: 'long' }); // 7 Jan 2024 was a Sunday
  return `Your plans hold up best on ${name(best.w)}s (${pct(best.rate)} kept) and worst on ${name(worst.w)}s (${pct(worst.rate)}).`;
}

VIEWS.month = () => {
  const D = data(), t = today(), key = monthKey(), first = key + '-01';
  const m0 = parseYmd(first), y = m0.getFullYear();
  const start = weekStart(first), lastDay = ymd(new Date(y, m0.getMonth() + 1, 0));
  const end = addDays(weekStart(lastDay), 6);
  const lines = Lines.all(D).map((a) => Lines.of(D, a));
  const show = (it) => !month.line || (Lines.forTask(D, it.x) || {}).id === month.line;
  const dows = [...Array(7)].map((_, i) => parseYmd(addDays(start, i)).toLocaleDateString(undefined, { weekday: 'narrow' }));
  let cells = '', planned = 0, kept = 0;
  const perLine = {};
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const R = dayRecord(D, d, t), inMonth = d.slice(0, 7) === key;
    const items = R.items.filter(show);
    if (inMonth && R.closed) for (const it of items) if (it.state === 'kept' || it.state === 'missed') {
      planned++; if (it.state === 'kept') kept++;
      const L = Lines.forTask(D, it.x), k = L ? L.id : '';
      (perLine[k] = perLine[k] || { L, planned: 0, kept: 0 }).planned++; if (it.state === 'kept') perLine[k].kept++;
    }
    const k = items.filter((i) => i.state === 'kept').length, p = items.filter((i) => i.state === 'kept' || i.state === 'missed').length;
    const dots = items.slice(0, 8).map((it) => { const L = Lines.forTask(D, it.x); return `<i class="mdot ${it.state}"${L ? ` style="--l:${L.hex}"` : ''}></i>`; }).join('');
    const label = [fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric' }), R.closed ? `kept ${k} of ${p}` : R.unknown ? 'not remembered' : R.open ? 'not closed yet' : items.length ? plural(items.length, 'task') : 'nothing recorded'].join(', ');
    cells += `<button class="mday${inMonth ? '' : ' out'}${d === t ? ' today' : ''}${R.closed && p && k === p ? ' all' : ''}" data-action="month-day" data-date="${d}" aria-label="${esc(label)}">
      <span class="mday-n">${parseYmd(d).getDate()}</span><span class="mday-dots">${dots}${items.length > 8 ? '<b>+</b>' : ''}</span>
      ${R.closed && p ? `<span class="mday-score">${k}/${p}</span>` : R.unknown ? '<span class="mday-score">?</span>' : R.open ? '<span class="mday-score open">close</span>' : ''}
      ${R.events.length ? `<span class="mday-ev">${R.events.length}</span>` : ''}</button>`;
  }
  const shift = (n) => { const d = new Date(y, m0.getMonth() + n, 1); return ymd(d).slice(0, 7); };
  const pattern = weekdayPattern(D, t);
  const lineRows = Object.values(perLine).sort((a, b) => b.planned - a.planned);
  const head = `<header class="page-head">${exampleStrip()}<div class="head-row"><div class="sign-main"><h1 class="page-title">${m0.toLocaleDateString(undefined, { month: 'long' })}</h1><div class="eyebrow">${y}</div></div>
      <div class="page-actions"><button class="icon-btn round" data-action="nav" data-to="month" data-sub="${shift(-1)}" aria-label="Previous month">${icon('left')}</button><button class="icon-btn round" data-action="nav" data-to="month" data-sub="${shift(1)}" aria-label="Next month">${icon('right')}</button></div></div>
    <div class="line-row">${lines.map((L) => `<button class="line-btn${month.line && month.line !== L.id ? ' dim' : ''}" data-action="month-line" data-id="${L.id}" aria-pressed="${month.line === L.id}" aria-label="Show only the ${esc(L.name)} line">${lineBullet(L)}</button>`).join('')}
      ${key !== t.slice(0, 7) ? `<button class="pill" data-action="nav" data-to="month" data-sub="${t.slice(0, 7)}">Today</button>` : month.line ? `<button class="pill" data-action="month-line" data-id="">All lines</button>` : ''}</div>
    <div class="mgrid mdows" aria-hidden="true">${dows.map((w) => `<span>${w}</span>`).join('')}</div></header>`;
  return head + `<div class="mgrid" role="grid" aria-label="${esc(m0.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }))}">${cells}</div>
    <p class="mlegend xs muted"><span><i class="mdot kept"></i>Happened</span><span><i class="mdot missed"></i>Didn’t happen</span><span><i class="mdot planned"></i>Planned</span><span><i class="mdot extra"></i>Done, not planned</span></p>`
    + section(`${m0.toLocaleDateString(undefined, { month: 'long' })}${month.line ? ', ' + esc((lines.find((L) => L.id === month.line) || {}).name || '') : ''}`, planned
      ? `<div class="list"><div class="item"><span class="item-main"><span class="item-title">Kept ${kept} of ${plural(planned, 'planned task')}</span><span class="item-meta">On the days you closed this month</span><div class="meter" style="margin-top:6px"><i style="width:${Math.round((kept / planned) * 100)}%"></i></div></span><b class="num">${pct(kept / planned)}</b></div>
        ${month.line ? '' : lineRows.map((r) => `<div class="item">${lineBullet(r.L, 'sm')}<span class="item-main"><span class="item-title">${esc(r.L ? r.L.name : 'No line')}</span><span class="item-meta">Kept ${r.kept} of ${r.planned}</span></span><b class="num">${pct(r.kept / r.planned)}</b></div>`).join('')}</div>`
      : '<div class="empty">No closed days in this month yet. Close a day on the Board and it shows up here.</div>')
    + (pattern ? `<p class="small" style="margin-top:12px">${esc(pattern)}</p>` : '');
};
A['month-line'] = (el) => { month.line = month.line === el.dataset.id ? '' : el.dataset.id; render(); };

/* A day up close: what was planned, what became of each, and the line it was for. */
A['month-day'] = (el) => {
  const D = data(), date = el.dataset.date, t = today(), R = dayRecord(D, date, t);
  const word = { kept: 'Happened', missed: 'Didn’t happen', planned: 'Planned', extra: 'Done, not planned' };
  const status = R.closed ? `Closed. Kept ${R.items.filter((i) => i.state === 'kept').length} of ${R.items.filter((i) => i.state !== 'extra').length}.`
    : R.unknown ? 'You marked this day as not remembered, so it’s left out of your numbers.'
    : R.open ? 'Planned, but not closed yet.' : date > t ? 'Still ahead.' : date === t ? 'Today.' : R.items.length ? 'No plan was made for this day.' : 'Nothing was recorded on this day.';
  openSheet({ title: fmtDate(date, { weekday: 'long', month: 'long', day: 'numeric' }), body: `<p class="small muted">${status}</p>
    ${R.items.length ? `<div class="list" style="margin-top:12px">${R.items.map((it) => { const L = Lines.forTask(D, it.x); return `<button class="item" data-action="edit" data-id="${it.x.id}">${lineBullet(L, 'sm')}<span class="item-main"><span class="item-title">${esc(it.x.title)}</span><span class="item-meta">${word[it.state]}${it.reason ? ': ' + esc(SKIP_REASONS[it.reason] || it.reason) : ''}${L ? ' · ' + esc(L.name) : ''}${it.x.actualMin && it.state !== 'planned' ? ' · took ' + fmtMin(it.x.actualMin) : ''}</span></span></button>`; }).join('')}</div>` : ''}
    ${R.events.length ? section('Events', `<div class="list">${R.events.map((e) => `<button class="item" data-action="edit" data-id="${e.id}"><span class="item-main"><span class="item-title">${esc(e.title)}</span><span class="item-meta">${e.allDay ? 'All day' : esc([e.start, e.end].filter(Boolean).join('–'))}</span></span></button>`).join('')}</div>`) : ''}
    ${R.rec && R.rec.note ? `<p class="small" style="margin-top:12px">Note: ${esc(R.rec.note)}</p>` : ''}
    <div class="form-actions" style="margin-top:18px">${R.open ? `<button class="btn primary" data-action="close-open" data-date="${date}">Close this day</button>` : ''}
      ${date === t ? '<button class="btn primary" data-action="nav" data-to="home">Open the board</button>' : ''}
      ${date >= t ? `<button class="btn" data-action="add" data-type="task" data-date="${date}">Add a task for this day</button>` : ''}</div>` });
};
