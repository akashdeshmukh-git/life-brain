/* ===== Quick add: the + button. One sheet for a task, event, note, habit or goal: type, tap a chip, Add.
   Date words at the end of what you type still work ("Call mom tomorrow"), and events read a time ("3pm"). ===== */
const QA_KINDS = [['task', 'Task'], ['event', 'Event'], ['note', 'Note'], ['habit', 'Habit'], ['goal', 'Goal']];
const QA_HINT = { task: 'Call mom tomorrow', event: 'Dentist friday 3pm', note: 'Write it down. Organise it later.', habit: 'Walk 20 minutes', goal: 'Finish Paper 2' };
const QA = { kind: 'task', date: '' };
const weekendOf = (t) => { const w = parseYmd(t).getDay(); return w === 6 || w === 0 ? t : addDays(t, 6 - w); };

/* Day chips. The day you came from (a day in Calendar) is picked first; "Other day" opens the date picker. */
function dayChips(name, picked, { none = false } = {}) {
  const t = today(), opts = [[t, 'Today'], [addDays(t, 1), 'Tomorrow'], [weekendOf(t), 'Weekend'], [addDays(t, 7), 'Next week']];
  if (picked && !opts.some(([v]) => v === picked)) opts.unshift([picked, relDate(picked)]);
  if (none) opts.push(['', 'No date']);
  const seen = new Set();
  return `<div class="chips" role="radiogroup" aria-label="Day">${opts.filter(([v]) => (seen.has(v) ? false : seen.add(v))).map(([v, l]) => `<label class="chip"><input type="radio" name="${name}" value="${v}" ${v === picked ? 'checked' : ''}>${esc(l)}</label>`).join('')}
    <label class="chip relative"><input type="date" name="${name}-other" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Other day" data-other="${name}">${icon('calendar')}<span data-other-label="${name}" data-empty="Other day">Other day</span></label></div>`;
}
/* Goal chips: one tap to tie something to a goal. */
function goalChips(current = '') {
  const cur = current && get(current), gs = activeGoals(data()).concat(cur && goalDone(cur) ? [cur] : []);
  if (!gs.length) return '';
  return `<div class="field"><span>Goal</span><div class="chips" role="radiogroup" aria-label="Goal"><label class="chip"><input type="radio" name="goalId" value="" ${current ? '' : 'checked'}>None</label>${gs.map((g) => `<label class="chip"><input type="radio" name="goalId" value="${g.id}" ${g.id === current ? 'checked' : ''}>${icon('goal')}${esc(trunc(g.title, 24))}</label>`).join('')}</div></div>`;
}
function qaExtra(kind) {
  if (kind === 'task') return `<div class="field"><span>When</span>${dayChips('when', QA.date || today(), { none: true })}</div>${goalChips()}`;
  if (kind === 'event') return `<div class="field"><span>When</span>${dayChips('when', QA.date || today())}</div>
    <label class="field"><span>Time <small>(leave empty for all day)</small></span><input type="time" name="time" id="qa-time"></label>`;
  if (kind === 'note') return `<div class="field"><span>For</span>${dayChips('when', QA.date || today())}</div>`;
  if (kind === 'habit') return `<p class="hint">It shows on Home and Today, ready to tick each day.</p>${goalChips()}`;
  return '<p class="hint">Just the name for now. Next you can add its first step; a date and a reason are optional.</p>';
}
A['quick-add'] = (el) => {
  QA.date = (el && el.dataset && isYmd(el.dataset.date) && el.dataset.date) || '';
  QA.kind = (el && el.dataset && QA_KINDS.some(([k]) => k === el.dataset.kind) && el.dataset.kind) || 'task';
  openSheet({ title: 'Add', body: `<form class="form" data-form="quick-add" id="qa-form">
    <div class="kinds" role="radiogroup" aria-label="What to add">${QA_KINDS.map(([k, l]) => `<label class="kind"><input type="radio" name="kind" value="${k}" ${k === QA.kind ? 'checked' : ''}>${l}</label>`).join('')}</div>
    <input id="qa-title" name="title" class="input !text-[18px]" maxlength="300" autocomplete="off" enterkeyhint="done" placeholder="${esc(QA_HINT[QA.kind])}" aria-label="What to add">
    <div id="qa-extra" class="flex flex-col gap-4">${qaExtra(QA.kind)}</div>
    <p class="err" data-form-error></p>
    <div class="sheet-foot"><span class="spacer"></span><button class="btn primary" id="qa-add">Add</button></div></form>`,
  focus: '#qa-title',
  onMount(root) {
    root.addEventListener('change', (ev) => {
      if (ev.target.name === 'kind') { QA.kind = ev.target.value; $('#qa-extra', root).innerHTML = qaExtra(QA.kind); $('#qa-title', root).placeholder = QA_HINT[QA.kind]; }
      otherDayChanged(ev);
    });
  } });
};
/* Picking "Other day" un-picks the day chips and shows the day on the chip. */
function otherDayChanged(ev) {
  const n = ev.target.dataset && ev.target.dataset.other;
  if (n) {
    $$(`input[name="${n}"]`, ev.target.form || document).forEach((r) => (r.checked = false));
    const lab = $(`[data-other-label="${n}"]`, ev.target.form || document);
    if (lab) lab.textContent = ev.target.value ? relDate(ev.target.value) : lab.dataset.empty;
    ev.target.closest('.chip').dataset.on = String(!!ev.target.value);
  } else if (ev.target.type === 'radio' && ev.target.form) {
    const o = $(`input[data-other="${ev.target.name}"]`, ev.target.form);
    if (o && o.value) { o.value = ''; o.closest('.chip').dataset.on = 'false'; const lab = $(`[data-other-label="${ev.target.name}"]`, ev.target.form); if (lab) lab.textContent = lab.dataset.empty; }
  }
}
LB.otherDayChanged = otherDayChanged;
document.addEventListener('click', (ev) => { const o = ev.target.closest && ev.target.closest('input[data-other]'); if (o && o.showPicker) try { o.showPicker(); } catch (_) {} });
const pickedDay = (v, name = 'when') => (isYmd(v[name + '-other']) ? v[name + '-other'] : isYmd(v[name]) ? v[name] : '');
/* "Dentist 3pm", "Call at 9:30", "Standup 09:15": a time at the end becomes the event's time. */
function parseTime(text) {
  const m = text.match(/^(.*?\S)\s+(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/i) || text.match(/^(.*?\S)\s+(?:at\s+)?(\d{1,2}):(\d{2})()$/i);
  if (!m) return null;
  let h = Number(m[2]); const min = Number(m[3] || 0), ap = (m[4] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return { title: m[1].trim(), time: `${pad(h)}:${pad(min)}` };
}
LB.parseTime = parseTime;
F['quick-add'] = async (form, v) => {
  const kind = QA_KINDS.some(([k]) => k === v.kind) ? v.kind : 'task';
  let title = String(v.title || '').trim(), date = pickedDay(v);
  if (!title && kind !== 'note') throw new Error(kind === 'goal' ? 'Say what you want, in a few words.' : 'Type something first.');
  if (kind === 'task') {
    const when = parseWhen(title); if (when) ({ title, date } = when);
    const r = await put({ type: 'task', title, date, done: false, doneDate: '', note: '', moved: 0, goalId: get(v.goalId) ? v.goalId : '' });
    closeSheet(); haptic();
    toast(date ? `Added for ${relDate(date)}` : 'Added to Anytime', '', { action: 'Undo', onAction: () => del(r.id) });
  } else if (kind === 'event') {
    let time = TIME.test(v.time || '') ? v.time : '', saidTime = '', saidDay = '';
    for (let i = 0; i < 2; i++) { // "Dentist 3pm friday" and "Dentist friday 3pm" both work
      const at = !saidTime && parseTime(title); if (at) ({ title, time: saidTime } = at);
      const when = !saidDay && parseWhen(title); if (when && when.date) ({ title, date: saidDay } = when);
    }
    time = time || saidTime; date = saidDay || date;
    if (!date) date = today();
    const r = await put({ type: 'event', title, date, time, end: '', note: '' });
    closeSheet(); haptic();
    toast(`Event added for ${relDate(date)}${time ? ' at ' + fmtTime(time) : ''}`, '', { action: 'Undo', onAction: () => del(r.id) });
  } else if (kind === 'note') {
    newNoteDay = date || today();
    if (!title) { noteSheet(null); return; }
    noteSheet(await put({ type: 'note', title: '', body: title, pinned: false, date: newNoteDay }));
  } else if (kind === 'habit') {
    const r = await put({ type: 'habit', title: title.slice(0, 80), log: {}, goalId: get(v.goalId) ? v.goalId : '' });
    closeSheet(); haptic();
    toast('Habit added', '', { action: 'Undo', onAction: () => del(r.id) });
  } else {
    const g = await put({ type: 'goal', title: title.slice(0, 120), why: '', by: '', target: 0, unit: '', log: {}, done: false, doneDate: '' });
    goalDetail(g);
    toast('Goal added. Now give it a first step.');
  }
};
