/* ===== Today: today's tasks and habit ticks ===== */
const ui = { anytime: true, done: false };

/* One task row. The circle ticks it; the rest opens it. On a phone, swipe right to tick it off, left for tomorrow. */
function taskRow(x, t = today(), { showDate = true, showGoal = true, compact = false } = {}) {
  const over = isOverdue(x, t);
  const gl = showGoal && x.goalId && get(x.goalId);
  const tags = [
    showDate && over ? `<span class="tag late">Due ${esc(relDate(x.date, t).replace(/^(Yesterday)$/, 'yesterday'))}</span>` : '',
    showDate && !over && isYmd(x.date) && x.date > t ? `<span class="tag">${esc(relDate(x.date, t))}</span>` : '',
    gl ? `<span class="tag tgoal">${icon('goal')}<span class="truncate">${esc(trunc(gl.title, compact ? 16 : 28))}</span></span>` : '',
    x.note && !gl ? '<span class="tag">Note</span>' : '',
  ].filter(Boolean);
  const circle = `<button class="circle" data-action="task-toggle" data-id="${x.id}" role="checkbox" aria-checked="${!!x.done}" aria-label="${x.done ? 'Mark not done' : 'Mark done'}: ${esc(x.title)}">${icon('check')}</button>`;
  const main = compact // one line: the title, and the one tag that matters most on the right
    ? `<button class="task-main !flex-row items-center !gap-2" data-action="task-edit" data-id="${x.id}"><span class="task-title min-w-0 flex-1 truncate">${esc(x.title)}</span>${tags[0] ? `<span class="shrink-0">${tags[0]}</span>` : ''}</button>`
    : `<button class="task-main" data-action="task-edit" data-id="${x.id}"><span class="task-title">${esc(x.title)}</span>${tags.length ? `<span class="task-meta">${tags.join('')}</span>` : ''}</button>`;
  return `<div class="task${compact ? ' compact' : ''}${x.done ? ' done' : ''}" data-task="${x.id}">
    <div class="task-swipe" aria-hidden="true"><span>${icon('check')}Done</span><span>Tomorrow</span></div>
    <div class="task-face">${circle}${main}</div></div>`;
}
const addTaskForm = (date, id, ph = 'Add a task', parse = false) => `<form class="add-row" data-form="task-add" data-date="${date}"${parse ? ' data-parse="1"' : ''}><span class="add-ic">${icon('plus')}</span>
  <input id="${id}" name="title" placeholder="${esc(ph)}" maxlength="300" autocomplete="off" enterkeyhint="done" aria-label="${esc(ph)}"></form>`;
const eventRow = (e) => `<button class="event" data-action="event-edit" data-id="${e.id}"><span class="event-time">${e.time ? esc(fmtTime(e.time)) : 'All day'}</span><span class="event-title">${esc(e.title)}</span></button>`;
const sectionH = (title, right = '') => `<div class="sec-h"><h2>${title}</h2>${right}</div>`;
const habitChip = (h, d) => { const on = habitDone(h, d), n = habitStreak(h, d); return `<button class="habit" data-action="habit-toggle" data-id="${h.id}" data-date="${d}" aria-pressed="${on}"><span class="habit-tick">${icon('check')}</span>${esc(h.title)}${n >= 2 ? `<span class="streak" title="${n} days in a row" aria-label="${n} days in a row">${n}</span>` : ''}</button>`; };

VIEWS.today = () => {
  const D = data(), t = today();
  const events = eventsOn(D, t);
  const open = D.tasks.filter((x) => !x.done && isYmd(x.date) && x.date <= t).sort((a, b) => a.date.localeCompare(b.date) || byCreated(a, b));
  const anytime = D.tasks.filter((x) => !x.done && !x.date).sort(byCreated);
  const done = doneOn(D, t).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const overdue = open.filter((x) => x.date < t).length;
  return header('Today', esc(fmtDate(t, { weekday: 'long', month: 'long', day: 'numeric' })), `<button class="pill ai-pill" data-action="plan-week"><span class="ai-mark !h-5 !w-5">${icon('spark')}</span>Plan week</button>`)
    + (events.length ? `<section class="card mb-4 !py-1">${events.map(eventRow).join('')}</section>` : '')
    + addTaskForm(t, 'add-today', 'Add a task (try “… tomorrow”)', true)
    + (overdue ? `<div class="mt-4 flex flex-wrap items-center gap-2 rounded-2xl bg-warn-bg px-4 py-2.5 text-warn" id="overdue-bar"><b class="mr-auto text-[15px] font-semibold">${plural(overdue, 'overdue task')}</b>
        <button class="btn sm bg-raised text-ink" data-action="overdue-sort"><span class="ai-mark !h-5 !w-5">${icon('spark')}</span>Sort out</button><button class="btn sm bg-raised text-ink" data-action="overdue-today">Move to today</button></div>` : '')
    + `<section class="card tasks mt-4 !py-1">
      ${(ui.allOpen ? open : open.slice(0, 40)).map((x) => taskRow(x, t)).join('')}
      ${open.length > 40 && !ui.allOpen ? `<button class="fold" data-action="fold" data-k="allOpen" aria-expanded="false">${icon('down')}Show ${open.length - 40} more</button>` : ''}
      ${!open.length && !anytime.length && !done.length ? '<p class="empty-line py-3">Nothing for today. Type above to add a task.</p>' : ''}
      ${anytime.length ? `<button class="fold${open.length ? ' border-t border-line' : ''}" data-action="fold" data-k="anytime" aria-expanded="${ui.anytime}">${icon('down')}Anytime <span class="count">${anytime.length}</span></button>${ui.anytime ? anytime.map((x) => taskRow(x, t)).join('') : ''}` : ''}
      ${done.length ? `<button class="fold${open.length || anytime.length ? ' border-t border-line' : ''}" data-action="fold" data-k="done" aria-expanded="${ui.done}">${icon('down')}Done <span class="count">${done.length}</span></button>${ui.done ? done.map((x) => taskRow(x, t)).join('') : ''}` : ''}
    </section>`
    + `<section class="mt-7">${sectionH('Habits', D.habits.length ? '<button class="link" data-action="nav" data-to="progress">History</button>' : '')}
      <div class="habits mt-1">${D.habits.sort(byCreated).map((h) => habitChip(h, t)).join('')}
        <button class="habit add" data-action="habit-new" aria-label="Add a habit">${icon('plus')}${D.habits.length ? '' : 'Add a habit'}</button></div></section>`
    + fab(t);
};

A.fold = (el) => { ui[el.dataset.k] = !ui[el.dataset.k]; render(); };

/* ---- Tasks ---- */
/* Quick add understands a date word at the end, so "Call mom tomorrow" needs one step, not five. */
const WEEKDAYS = { sunday: 0, mon: 1, monday: 1, tue: 2, tues: 2, tuesday: 2, wed: 3, wednesday: 3, thu: 4, thur: 4, thurs: 4, thursday: 4, fri: 5, friday: 5, saturday: 6 }; // not "sun" or "sat": too often ordinary words
function parseWhen(text, t = today()) {
  const m = text.match(/^(.*?\S)\s+(?:(?:on|by)\s+)?(today|tonight|tomorrow|tmrw|tmr|next week|anytime|someday|[a-z]+)$/i);
  if (!m) return null;
  const w = m[2].toLowerCase();
  let date;
  if (w === 'today' || w === 'tonight') date = t;
  else if (['tomorrow', 'tmrw', 'tmr'].includes(w)) date = addDays(t, 1);
  else if (w === 'next week') date = addDays(t, 7);
  else if (w === 'anytime' || w === 'someday') date = '';
  else if (w in WEEKDAYS) { const d = (WEEKDAYS[w] - parseYmd(t).getDay() + 7) % 7 || 7; date = addDays(t, d); }
  else return null;
  return { title: m[1].trim(), date };
}
LB.parseWhen = parseWhen;
F['task-add'] = async (form, v) => {
  let title = String(v.title || '').trim(), date = form.dataset.date || '';
  if (!title) return;
  const inp = $('input', form);
  if (inp) inp.value = '';
  const when = form.dataset.parse ? parseWhen(title) : null;
  if (when) ({ title, date } = when);
  const r = await put({ type: 'task', title, date, done: false, doneDate: '', note: '', moved: 0 });
  haptic();
  if (when && date !== today()) toast(date ? `Added for ${relDate(date)}` : 'Added to Anytime', '', { action: 'Undo', onAction: () => del(r.id) });
};
A['task-toggle'] = async (el) => {
  const x = get(el.dataset.id);
  if (!x) return;
  const was = { done: x.done, doneDate: x.doneDate }, t = today();
  const row = !x.done && !reduceMotion() && $$(`.task[data-task="${CSS.escape(x.id)}"]`).find((r) => r.offsetParent);
  if (row) { // the tick: the circle fills with a little pop, the title strikes through, the row slides off
    if (row.classList.contains('ticking')) return;
    haptic(); row.classList.add('ticking');
    await new Promise((r) => setTimeout(r, 380));
  } else if (!x.done) haptic();
  await put({ ...x, done: !x.done, doneDate: x.done ? '' : t });
  if (SH.open && $('#goal-steps') && ui.goalOpen) LB.goalDetail(get(ui.goalOpen)); // ticked from inside a goal
  if (x.done) return;
  const left = data().tasks.filter((y) => !y.done && isYmd(y.date) && y.date <= t).length;
  const doneToday = doneOn(data(), t).length;
  toast(left ? 'Done' : `That’s everything for today. ${plural(doneToday, 'task')} done.`, '', { action: 'Undo', onAction: () => put({ ...get(x.id), ...was }) });
  if (!left) haptic('win');
};
/* Push a task to tomorrow: the swipe left, and the Tomorrow chip's shortcut. */
async function toTomorrow(x) {
  const t = today(), tm = addDays(t, 1), was = { date: x.date, moved: x.moved || 0 };
  await put({ ...x, date: tm, moved: (x.moved || 0) + (isYmd(x.date) && x.date <= t ? 1 : 0) });
  haptic();
  toast(`“${trunc(x.title, 28)}” moved to tomorrow`, '', { action: 'Undo', onAction: () => put({ ...get(x.id), ...was }) });
}
A['overdue-today'] = async () => {
  const t = today(), list = data().tasks.filter((x) => isOverdue(x, t));
  for (const x of list) await put({ ...x, date: t, moved: (x.moved || 0) + 1 }, { quiet: true });
  emit();
  toast(`${plural(list.length, 'task')} moved to today`);
};
A['task-edit'] = (el) => taskSheet(get(el.dataset.id));
A['task-new'] = (el) => taskSheet(null, el.dataset.date || '');
function taskSheet(x, date = '') {
  const r = x || { title: '', date, note: '' };
  openSheet({ title: x ? 'Task' : 'New task', body: `<form class="form" data-form="task" data-id="${x ? x.id : ''}">
    <input name="title" class="note-title" value="${esc(r.title)}" maxlength="300" required autocomplete="off" placeholder="What needs doing?" aria-label="Task">
    <div class="field"><span>When</span>${dayChips('date', r.date || '', { none: true })}</div>
    ${goalChips(r.goalId || '')}
    <label class="field"><span>Note</span><textarea name="note" rows="3" maxlength="4000" placeholder="Why, or what you need for it">${esc(r.note || '')}</textarea></label>
    <p class="err" data-form-error></p>
    <div class="sheet-foot">${x ? `<button type="button" class="btn icon-only danger" data-action="delete" data-id="${x.id}" aria-label="Delete task">${icon('trash')}</button>${x.done ? '' : `<button type="button" class="btn" data-action="task-break" data-id="${x.id}"><span class="ai-mark !h-5 !w-5">${icon('spark')}</span>Break down</button>`}` : ''}<span class="spacer"></span><button class="btn primary">Save</button></div></form>`,
  onMount(root) { root.addEventListener('change', otherDayChanged); } });
}
F.task = async (form, v) => {
  const title = String(v.title || '').trim(), date = pickedDay(v, 'date');
  if (!title) throw new Error('Give the task a name.');
  const old = get(form.dataset.id);
  const later = old && isYmd(old.date) && (!date || date > old.date) && old.date <= today(); // pushed back once it was due
  await put({ ...(old || { type: 'task', done: false, doneDate: '', moved: 0 }), title, date, note: String(v.note || '').trim(), goalId: v.goalId !== undefined ? (get(v.goalId) ? v.goalId : '') : (old && old.goalId) || '', moved: (old && old.moved || 0) + (later && !old.done ? 1 : 0) });
  closeSheet();
};
/* Delete anything, with Undo. */
A.delete = async (el) => {
  const r = get(el.dataset.id);
  if (!r) return;
  closeSheet();
  await del(r.id);
  const name = { task: 'Task', event: 'Event', note: 'Note', habit: 'Habit', goal: 'Goal' }[r.type] || 'Item';
  toast(`${name} deleted`, '', { action: 'Undo', onAction: () => put(r) });
};

/* Swipe a task row: right ticks it off, left moves it to tomorrow. Touch only; the buttons do the same. */
(() => {
  let st = null, swallow = 0;
  const reset = (row) => { const f = $('.task-face', row), b = $('.task-swipe', row); if (!f) return; f.style.transition = 'transform .25s cubic-bezier(.2,.8,.2,1)'; f.style.transform = ''; if (b) b.style.opacity = '0'; };
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const row = e.target.closest('.task[data-task]');
    st = row && $('.task-face', row) && !row.classList.contains('done') && !SH.open ? { row, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: 0, on: false } : null;
  }, { passive: true });
  document.addEventListener('pointermove', (e) => {
    if (!st || e.pointerId !== st.id) return; // one finger at a time
    const dx = e.clientX - st.x0, dy = e.clientY - st.y0;
    if (!st.on) { if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) { st = null; return; } if (Math.abs(dx) < 14) return; st.on = true; }
    st.dx = dx;
    const f = $('.task-face', st.row), b = $('.task-swipe', st.row);
    f.style.transition = 'none'; f.style.transform = `translateX(${dx}px)`;
    b.style.opacity = String(clamp(Math.abs(dx) / 90, 0, 1));
    b.style.background = dx > 0 ? 'rgb(var(--brand))' : 'rgb(var(--warn-bg))';
    b.style.color = dx > 0 ? 'rgb(var(--on-brand))' : 'rgb(var(--warn))';
    b.style.justifyContent = dx > 0 ? 'flex-start' : 'flex-end';
    b.children[0].style.display = dx > 0 ? '' : 'none'; b.children[1].style.display = dx > 0 ? 'none' : '';
  }, { passive: true });
  const end = (e) => {
    if (!st || e.pointerId !== st.id) return;
    const { row, dx, on } = st; st = null;
    if (!on) return;
    swallow = Date.now();
    const x = get(row.dataset.task);
    if (Math.abs(dx) < 90 || !x) { reset(row); return; }
    const f = $('.task-face', row);
    f.style.transition = 'transform .2s ease-out'; f.style.transform = `translateX(${dx > 0 ? '100%' : '-100%'})`;
    setTimeout(() => settle(() => (dx > 0 ? A['task-toggle']({ dataset: { id: x.id } }) : toTomorrow(x))).catch((err) => toast(err.message, 'bad')), 160);
  };
  document.addEventListener('pointerup', end, { passive: true });
  document.addEventListener('pointercancel', () => { if (st) { reset(st.row); st = null; } }, { passive: true });
  document.addEventListener('click', (e) => { if (Date.now() - swallow < 400 && e.target.closest('.task[data-task]')) { e.stopPropagation(); e.preventDefault(); } }, true); // a swipe is not a tap
})();

/* ---- Events ---- */
A['event-edit'] = (el) => eventSheet(get(el.dataset.id));
A['event-new'] = (el) => eventSheet(null, el.dataset.date || today());
function eventSheet(e, date = today()) {
  const r = e || { title: '', date, time: '', note: '' };
  openSheet({ title: e ? 'Event' : 'New event', body: `<form class="form" data-form="event" data-id="${e ? e.id : ''}">
    <input name="title" class="note-title" value="${esc(r.title)}" maxlength="300" required autocomplete="off" placeholder="What’s happening?" aria-label="Event">
    <div class="field"><span>When</span>${dayChips('date', r.date)}</div>
    <div class="grid grid-cols-2 gap-3"><label class="field"><span>Starts</span><input type="time" name="time" value="${esc(r.time || '')}"></label>
      <label class="field"><span>Ends <small>(optional)</small></span><input type="time" name="end" value="${esc(r.end || '')}"></label></div>
    <label class="field"><span>Note</span><textarea name="note" rows="2" maxlength="4000">${esc(r.note || '')}</textarea></label>
    <p class="err" data-form-error></p>
    <div class="sheet-foot">${e ? `<button type="button" class="btn icon-only danger" data-action="delete" data-id="${e.id}" aria-label="Delete event">${icon('trash')}</button>` : ''}<span class="spacer"></span><button class="btn primary">Save</button></div></form>`,
  onMount(root) { root.addEventListener('change', otherDayChanged); } });
}
F.event = async (form, v) => {
  const title = String(v.title || '').trim(), date = pickedDay(v, 'date');
  if (!title) throw new Error('Give the event a name.');
  if (!isYmd(date)) throw new Error('Pick a day.');
  const old = get(form.dataset.id);
  await put({ ...(old || { type: 'event' }), title, date, time: /^\d{1,2}:\d{2}$/.test(v.time || '') ? v.time : '', end: /^\d{1,2}:\d{2}$/.test(v.end || '') && /^\d{1,2}:\d{2}$/.test(v.time || '') ? v.end : '', note: String(v.note || '').trim() });
  closeSheet();
};

/* ---- Habits ---- */
A['habit-toggle'] = async (el) => {
  const h = get(el.dataset.id), d = el.dataset.date;
  if (!h || !isYmd(d)) return;
  const log = { ...(h.log || {}) };
  if (log[d]) delete log[d]; else { log[d] = true; haptic(); }
  await put({ ...h, log });
  if (log[d] && !reduceMotion()) { const c = $(`.habit[data-id="${CSS.escape(h.id)}"]`); if (c) c.classList.add('popping'); } // the redraw kept the chip; let it pop
  if (SH.open && $('#goal-steps') && ui.goalOpen) LB.goalDetail(get(ui.goalOpen)); // ticked from inside a goal
};
A['habit-new'] = () => habitSheet(null);
A['habit-edit'] = (el) => habitSheet(get(el.dataset.id));
function habitSheet(h) {
  openSheet({ title: h ? 'Habit' : 'New habit', body: `<form class="form" data-form="habit" data-id="${h ? h.id : ''}">
    <input name="title" class="note-title" value="${esc(h ? h.title : '')}" maxlength="80" required autocomplete="off" placeholder="Walk 20 minutes" aria-label="Habit">
    ${goalChips(h ? h.goalId || '' : '')}
    <p class="err" data-form-error></p>
    <div class="sheet-foot">${h ? `<button type="button" class="btn icon-only danger" data-action="delete" data-id="${h.id}" aria-label="Delete habit">${icon('trash')}</button>` : ''}<span class="spacer"></span><button class="btn primary">Save</button></div></form>` });
}
F.habit = async (form, v) => {
  const title = String(v.title || '').trim();
  if (!title) throw new Error('Give the habit a name.');
  const old = get(form.dataset.id);
  await put({ ...(old || { type: 'habit', log: {} }), title, goalId: v.goalId !== undefined ? (get(v.goalId) ? v.goalId : '') : (old && old.goalId) || '' });
  closeSheet();
};
