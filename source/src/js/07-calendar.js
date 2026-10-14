/* ===== Calendar: the month, and the day you tap underneath it ===== */
const calDay = () => (isYmd(route.sub) ? route.sub : today());
VIEWS.calendar = () => {
  const D = data(), t = today(), sel = calDay();
  const m0 = parseYmd(sel.slice(0, 7) + '-01'), y = m0.getFullYear(), mo = m0.getMonth();
  const first = ymd(m0), last = ymd(new Date(y, mo + 1, 0));
  const start = addDays(first, -parseYmd(first).getDay()); // weeks start on Sunday
  const end = addDays(last, 6 - parseYmd(last).getDay());
  const dows = [...Array(7)].map((_, i) => `<span>${parseYmd(addDays(start, i)).toLocaleDateString(undefined, { weekday: 'narrow' })}</span>`).join('');
  let cells = '';
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const ev = eventsOn(D, d).length, tk = D.tasks.filter((x) => x.date === d || (x.done && x.doneDate === d && !x.date));
    const openN = tk.filter((x) => !x.done).length, doneN = tk.filter((x) => x.done).length, nt = notesOn(D, d).length;
    const dots = [ev ? '<i class="dot ev"></i>' : '', openN ? '<i class="dot task"></i>' : '', doneN ? '<i class="dot done"></i>' : '', nt ? '<i class="dot jr"></i>' : ''].join('');
    const label = [fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric' }), ev && plural(ev, 'event'), openN && plural(openN, 'open task'), doneN && `${doneN} done`].filter(Boolean).join(', ');
    cells += `<button class="day${d.slice(0, 7) !== sel.slice(0, 7) ? ' out' : ''}${d === t ? ' today' : ''}" data-action="cal-pick" data-date="${d}" aria-pressed="${d === sel}" aria-label="${esc(label)}"><span class="day-n">${parseYmd(d).getDate()}</span><span class="dots">${dots}</span></button>`;
  }
  const shift = (n) => { const d = new Date(y, mo + n, 1); const want = Math.min(parseYmd(sel).getDate(), new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()); d.setDate(want); return ymd(d); };
  const right = `${sel.slice(0, 7) !== t.slice(0, 7) ? `<button class="pill mr-1" data-action="nav" data-to="calendar" data-sub="${t}">Today</button>` : ''}
    <button class="icon-btn" data-action="nav" data-to="calendar" data-sub="${shift(-1)}" aria-label="Previous month">${icon('left')}</button><button class="icon-btn" data-action="nav" data-to="calendar" data-sub="${shift(1)}" aria-label="Next month">${icon('right')}</button>`;
  return header(m0.toLocaleDateString(undefined, { month: 'long' }), String(y), right)
    + `<section class="card cal mt-1 !px-2"><div class="cal-grid dows" aria-hidden="true">${dows}</div><div class="cal-grid days" id="cal-grid">${cells}</div>
      <p class="legend px-2" aria-hidden="true"><span><i class="dot ev"></i>Event</span><span><i class="dot task"></i>To do</span><span><i class="dot done"></i>Done</span><span><i class="dot jr"></i>Note</span></p></section>`
    + dayAgenda(D, sel, t) + fab(sel);
};
function dayAgenda(D, d, t) {
  const events = eventsOn(D, d), tasks = tasksOn(D, d).sort((a, b) => Number(a.done) - Number(b.done) || byCreated(a, b));
  const habits = D.habits.filter((h) => habitDone(h, d)), notes = notesOn(D, d);
  const rel = relDate(d, t), title = ['Today', 'Tomorrow', 'Yesterday'].includes(rel) ? `${rel}, ${fmtDate(d, { month: 'short', day: 'numeric' })}` : fmtDate(d, { weekday: 'long', month: 'short', day: 'numeric' });
  return `<section class="agenda mt-6">${sectionH(esc(title),
      `<div class="flex gap-1.5"><button class="pill" data-action="note-new" data-date="${d}">${icon('plus')}Note</button><button class="pill" data-action="event-new" data-date="${d}">${icon('plus')}Event</button></div>`)}
    ${events.length ? `<div class="card mt-2 !py-1">${events.map(eventRow).join('')}</div>` : ''}
    <div class="mt-3">${addTaskForm(d, 'add-cal', 'Add a task for this day')}</div>
    ${tasks.length ? `<div class="card mt-3 !py-1">${tasks.map((x) => taskRow(x, t, { showDate: false })).join('')}</div>` : ''}
    ${habits.length ? `<p class="line-note mt-3 text-sm text-muted">Habits kept: ${habits.map((h) => esc(h.title)).join(', ')}</p>` : ''}
    ${notes.map((n) => `<button class="journal-peek mt-3 flex w-full items-center gap-3 rounded-2xl bg-raised p-3 text-left" data-action="note-open" data-id="${n.id}"><span class="face grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-sunk text-muted">${icon('notes')}</span><span class="min-w-0 flex-1 truncate font-medium">${esc(trunc(n.title || String(n.body || '').split('\n')[0], 80)) || 'Note'}</span></button>`).join('')}
  </section>`;
}
A['cal-pick'] = (el) => go('calendar', el.dataset.date);

/* Swipe the month left or right. */
(() => {
  let x0 = null, y0 = null;
  document.addEventListener('touchstart', (e) => { if (e.target.closest('#cal-grid')) { x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; } else x0 = null; }, { passive: true });
  document.addEventListener('touchend', (e) => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) < 60 || Math.abs(dy) > Math.abs(dx) * 0.7) return;
    const s = calDay(), d = parseYmd(s.slice(0, 7) + '-01');
    d.setMonth(d.getMonth() + (dx < 0 ? 1 : -1));
    go('calendar', ymd(d));
  }, { passive: true });
})();
