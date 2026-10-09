/* ===== Today: today's tasks, habit ticks, one journal box ===== */
const ui = { anytime: true, done: false };

/* One task row. The circle ticks it; the rest opens it. */
function taskRow(x, t = today(), { showDate = true } = {}) {
  const over = isOverdue(x, t);
  const meta = [showDate && over ? `<span class="bad">${esc(relDate(x.date, t))}</span>` : '', x.note ? '<span>Note</span>' : ''].filter(Boolean).join(' · ');
  return `<div class="task${x.done ? ' done' : ''}" data-task="${x.id}">
    <button class="circle" data-action="task-toggle" data-id="${x.id}" role="checkbox" aria-checked="${!!x.done}" aria-label="${x.done ? 'Mark not done' : 'Mark done'}: ${esc(x.title)}">${icon('check')}</button>
    <button class="task-main" data-action="task-edit" data-id="${x.id}"><span class="task-title">${esc(x.title)}</span>${meta ? `<span class="task-meta">${meta}</span>` : ''}</button></div>`;
}
const addTaskForm = (date, id, ph = 'Add a task', parse = false) => `<form class="add-row" data-form="task-add" data-date="${date}"${parse ? ' data-parse="1"' : ''}><span class="add-ic">${icon('plus')}</span>
  <input id="${id}" name="title" placeholder="${esc(ph)}" maxlength="300" autocomplete="off" enterkeyhint="done" aria-label="${esc(ph)}"></form>`;
const eventRow = (e) => `<button class="event" data-action="event-edit" data-id="${e.id}"><span class="event-time">${e.time ? esc(fmtTime(e.time)) : 'All day'}</span><span class="event-title">${esc(e.title)}</span></button>`;
const sectionH = (title, right = '') => `<div class="sec-h"><h2>${title}</h2>${right}</div>`;

VIEWS.today = () => {
  const D = data(), t = today();
  const events = eventsOn(D, t);
  const open = D.tasks.filter((x) => !x.done && isYmd(x.date) && x.date <= t).sort((a, b) => a.date.localeCompare(b.date) || byCreated(a, b));
  const anytime = D.tasks.filter((x) => !x.done && !x.date).sort(byCreated);
  const done = doneOn(D, t).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const overdue = open.filter((x) => x.date < t).length;
  const j = journalOn(t) || {};
  return header('Today', esc(fmtDate(t, { weekday: 'long', month: 'long', day: 'numeric' })))
    + (events.length ? `<section class="card">${events.map(eventRow).join('')}</section>` : '')
    + `<section class="card tasks">${addTaskForm(t, 'add-today', 'Add a task (try “… tomorrow”)', true)}
      ${overdue ? `<div class="mini-h"><span>${plural(overdue, 'overdue task')}</span><button class="link" data-action="overdue-today">Move to today</button></div>` : ''}
      ${(ui.allOpen ? open : open.slice(0, 40)).map((x) => taskRow(x, t)).join('')}
      ${open.length > 40 && !ui.allOpen ? `<button class="fold" data-action="fold" data-k="allOpen" aria-expanded="false">${icon('down')}Show ${open.length - 40} more</button>` : ''}
      ${!open.length && !anytime.length && !done.length ? '<p class="empty-line">Nothing for today. Type above to add a task.</p>' : ''}
      ${anytime.length ? `<button class="fold" data-action="fold" data-k="anytime" aria-expanded="${ui.anytime}">${icon('down')}Anytime <span class="count">${anytime.length}</span></button>${ui.anytime ? anytime.map((x) => taskRow(x, t)).join('') : ''}` : ''}
      ${done.length ? `<button class="fold" data-action="fold" data-k="done" aria-expanded="${ui.done}">${icon('down')}Done <span class="count">${done.length}</span></button>${ui.done ? done.map((x) => taskRow(x, t)).join('') : ''}` : ''}
    </section>`
    + `<section class="card">${sectionH('Habits', D.habits.length ? '<button class="link" data-action="nav" data-to="progress">History</button>' : '')}
      <div class="habits">${D.habits.sort(byCreated).map((h) => { const on = habitDone(h, t); return `<button class="habit" data-action="habit-toggle" data-id="${h.id}" data-date="${t}" aria-pressed="${on}"><span class="habit-tick">${icon('check')}</span>${esc(h.title)}</button>`; }).join('')}
        <button class="habit add" data-action="habit-new" aria-label="Add a habit">${icon('plus')}${D.habits.length ? '' : 'Add a habit'}</button></div></section>`
    + `<section class="card">${sectionH('Journal')}${moodRow(t, j.mood)}
      <textarea class="journal" id="journal-${t}" data-journal="${t}" rows="3" placeholder="How was today?" aria-label="Journal for today">${esc(j.text || '')}</textarea></section>`;
};
const moodRow = (date, mood) => `<div class="moods" role="radiogroup" aria-label="Mood">${MOODS.map(([v, f, l]) => `<button class="mood" role="radio" data-action="mood" data-date="${date}" data-v="${v}" aria-checked="${Number(mood) === Number(v)}" aria-label="${l}" title="${l}">${f}</button>`).join('')}</div>`;

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
  const was = { done: x.done, doneDate: x.doneDate };
  await put({ ...x, done: !x.done, doneDate: x.done ? '' : today() });
  if (!x.done) { haptic(); toast('Done', '', { action: 'Undo', onAction: () => put({ ...get(x.id), ...was }) }); }
};
A['overdue-today'] = async () => {
  const t = today(), list = data().tasks.filter((x) => isOverdue(x, t));
  for (const x of list) await put({ ...x, date: t, moved: (x.moved || 0) + 1 }, { quiet: true });
  emit();
  toast(`${plural(list.length, 'task')} moved to today`);
};
A['task-edit'] = (el) => taskSheet(get(el.dataset.id));
A['task-new'] = (el) => taskSheet(null, el.dataset.date || '');
function taskSheet(x, date = '') {
  const t = today(), r = x || { title: '', date, note: '' };
  openSheet({ title: x ? 'Task' : 'New task', body: `<form class="form" data-form="task" data-id="${x ? x.id : ''}">
    <label class="field"><span>Task</span><input name="title" value="${esc(r.title)}" maxlength="300" required autocomplete="off"></label>
    <label class="field"><span>Date</span><input type="date" name="date" id="task-date" value="${esc(r.date || '')}"></label>
    <div class="chips"><button type="button" class="chip" data-action="set-date" data-v="${t}">Today</button><button type="button" class="chip" data-action="set-date" data-v="${addDays(t, 1)}">Tomorrow</button><button type="button" class="chip" data-action="set-date" data-v="${addDays(t, 7)}">Next week</button><button type="button" class="chip" data-action="set-date" data-v="">No date</button></div>
    <label class="field"><span>Note</span><textarea name="note" rows="3" maxlength="4000">${esc(r.note || '')}</textarea></label>
    <p class="err" data-form-error></p>
    <div class="row-end">${x ? `<button type="button" class="btn danger" data-action="delete" data-id="${x.id}">Delete</button><span class="spacer"></span>` : ''}<button class="btn primary">Save</button></div></form>` });
}
A['set-date'] = (el) => { const f = $('#task-date'); if (f) f.value = el.dataset.v; };
F.task = async (form, v) => {
  const title = String(v.title || '').trim(), date = isYmd(v.date) ? v.date : '';
  if (!title) throw new Error('Give the task a name.');
  const old = get(form.dataset.id);
  const later = old && isYmd(old.date) && (!date || date > old.date) && old.date <= today(); // pushed back once it was due
  await put({ ...(old || { type: 'task', done: false, doneDate: '', moved: 0 }), title, date, note: String(v.note || '').trim(), moved: (old && old.moved || 0) + (later && !old.done ? 1 : 0) });
  closeSheet();
};
/* Delete anything, with Undo. */
A.delete = async (el) => {
  const r = get(el.dataset.id);
  if (!r) return;
  closeSheet();
  await del(r.id);
  const name = { task: 'Task', event: 'Event', note: 'Note', journal: 'Journal entry', habit: 'Habit', goal: 'Goal' }[r.type] || 'Item';
  toast(`${name} deleted`, '', { action: 'Undo', onAction: () => put(r) });
};

/* ---- Events ---- */
A['event-edit'] = (el) => eventSheet(get(el.dataset.id));
A['event-new'] = (el) => eventSheet(null, el.dataset.date || today());
function eventSheet(e, date = today()) {
  const r = e || { title: '', date, time: '', note: '' };
  openSheet({ title: e ? 'Event' : 'New event', body: `<form class="form" data-form="event" data-id="${e ? e.id : ''}">
    <label class="field"><span>Event</span><input name="title" value="${esc(r.title)}" maxlength="300" required autocomplete="off"></label>
    <div class="two"><label class="field"><span>Date</span><input type="date" name="date" value="${esc(r.date)}" required></label>
      <label class="field"><span>Starts</span><input type="time" name="time" value="${esc(r.time || '')}"></label></div>
    <label class="field"><span>Ends <small>(optional)</small></span><input type="time" name="end" value="${esc(r.end || '')}"></label>
    <label class="field"><span>Note</span><textarea name="note" rows="2" maxlength="4000">${esc(r.note || '')}</textarea></label>
    <p class="err" data-form-error></p>
    <div class="row-end">${e ? `<button type="button" class="btn danger" data-action="delete" data-id="${e.id}">Delete</button><span class="spacer"></span>` : ''}<button class="btn primary">Save</button></div></form>` });
}
F.event = async (form, v) => {
  const title = String(v.title || '').trim();
  if (!title) throw new Error('Give the event a name.');
  if (!isYmd(v.date)) throw new Error('Pick a date.');
  const old = get(form.dataset.id);
  await put({ ...(old || { type: 'event' }), title, date: v.date, time: /^\d{1,2}:\d{2}$/.test(v.time || '') ? v.time : '', end: /^\d{1,2}:\d{2}$/.test(v.end || '') && /^\d{1,2}:\d{2}$/.test(v.time || '') ? v.end : '', note: String(v.note || '').trim() });
  closeSheet();
};

/* ---- Habits ---- */
A['habit-toggle'] = async (el) => {
  const h = get(el.dataset.id), d = el.dataset.date;
  if (!h || !isYmd(d)) return;
  const log = { ...(h.log || {}) };
  if (log[d]) delete log[d]; else { log[d] = true; haptic(); }
  await put({ ...h, log });
};
A['habit-new'] = () => habitSheet(null);
A['habit-edit'] = (el) => habitSheet(get(el.dataset.id));
function habitSheet(h) {
  openSheet({ title: h ? 'Habit' : 'New habit', body: `<form class="form" data-form="habit" data-id="${h ? h.id : ''}">
    <label class="field"><span>Habit</span><input name="title" value="${esc(h ? h.title : '')}" maxlength="80" required autocomplete="off" placeholder="Walk 20 minutes"></label>
    <p class="err" data-form-error></p>
    <div class="row-end">${h ? `<button type="button" class="btn danger" data-action="delete" data-id="${h.id}">Delete</button><span class="spacer"></span>` : ''}<button class="btn primary">Save</button></div></form>` });
}
F.habit = async (form, v) => {
  const title = String(v.title || '').trim();
  if (!title) throw new Error('Give the habit a name.');
  const old = get(form.dataset.id);
  await put({ ...(old || { type: 'habit', log: {} }), title });
  closeSheet();
};

/* ---- Journal: saved as you type ---- */
async function saveJournal(date, patch) {
  const old = journalOn(date) || { id: journalId(date), type: 'journal', date, text: '', mood: 0 };
  return put({ ...old, ...patch }, { quiet: !('mood' in patch) });
}
document.addEventListener('input', (ev) => {
  const d = ev.target.dataset && ev.target.dataset.journal;
  if (d) saveJournal(d, { text: ev.target.value }).catch((e) => toast(e.message, 'bad'));
});
A.mood = async (el) => {
  const d = el.dataset.date, cur = (journalOn(d) || {}).mood, v = Number(el.dataset.v);
  const ta = $(`[data-journal="${d}"]`);
  await saveJournal(d, { mood: Number(cur) === v ? 0 : v, ...(ta ? { text: ta.value } : {}) });
  if (SH.open) journalSheet(d); // refresh the open sheet
};
function journalSheet(date) {
  const j = journalOn(date) || {};
  openSheet({ title: fmtDate(date, { weekday: 'long', month: 'long', day: 'numeric' }), body: `${moodRow(date, j.mood)}
    <textarea class="journal big" id="journal-sheet" data-journal="${date}" rows="10" placeholder="How was the day?" aria-label="Journal">${esc(j.text || '')}</textarea>
    <div class="row-end">${j.id ? `<button type="button" class="btn danger" data-action="delete" data-id="${j.id}">Delete</button><span class="spacer"></span>` : ''}<button class="btn primary" data-action="sheet-close">Done</button></div>` });
}
A['journal-open'] = (el) => journalSheet(el.dataset.date || today());
