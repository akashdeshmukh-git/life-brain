/* ===== Now: one thing to do, and what you're not seeing ===== */
let skipOpen = null; // the task whose "why not now?" reasons are showing
F['quick-add'] = async (form, v) => {
  const title = String(v.title || '').trim();
  if (!title) { toast('Type something first.', 'bad'); return; }
  const r = await put({ type: 'task', title, status: 'open', priority: '2', plans: [], deferrals: 0, skips: [] });
  toast('Added', '', { action: 'Undo', onAction: async () => { await del(r.id); toast('Removed'); } });
};
A['skip-open'] = (el) => { skipOpen = skipOpen === el.dataset.id ? null : el.dataset.id; render(); };
A.skip = async (el) => {
  const x = get(el.dataset.id), reason = el.dataset.reason, t = today();
  if (!x || !SKIP_REASONS[reason]) return;
  skipOpen = null;
  const skips = [...(x.skips || []), { date: t, reason }];
  let rec, msg;
  if (reason === 'gone') { rec = { ...x, skips, status: 'abandoned', statusDate: t, abandonedReason: SKIP_REASONS.gone }; msg = 'Let go. It stays in your records.'; }
  else if (reason === 'waiting') { rec = { ...x, skips, snoozedUntil: addDays(t, 3), pinned: '' }; msg = 'Hidden for 3 days.'; }
  else { rec = applyTaskPlan(x, { ...x, skips, plannedDate: addDays(t, 1), pinned: '' }); msg = reason === 'unclear' ? 'Moved to tomorrow. Next time the Brain will ask for a first step.' : 'Moved to tomorrow.'; }
  await put(rec);
  toast(msg, '', { action: 'Undo', onAction: async () => { await put(x); toast('Undone'); } });
};
A.pin = async (el) => {
  const x = get(el.dataset.id), t = today();
  if (!x) return;
  for (const o of all('task')) if (o.pinned === t && o.id !== x.id) await put({ ...o, pinned: '' });
  await put({ ...x, pinned: t });
  window.scrollTo({ top: 0, behavior: reduceMotion() ? 'auto' : 'smooth' });
};
A['spot-dismiss'] = async (el) => {
  const r = await put({ type: 'insight', findingId: el.dataset.id, title: el.dataset.title, status: 'rejected', note: '', at: today() });
  toast('Hidden. It comes back if things change.', '', { action: 'Undo', onAction: async () => { await del(r.id); } });
};
A['spot-act'] = async (el) => {
  const d = el.dataset, t = today(), x = d.task ? get(d.task) : null;
  const undo = (old, msg, day) => toast(msg, '', { action: 'Undo', onAction: async () => { await put(old); if (day) await put(day); toast('Undone'); } });
  switch (d.act) {
    case 'define': return x && firstStepSheet(x);
    case 'shrink': if (!x) return; await put({ ...applyTaskPlan(x, { ...x, plannedDate: t }), estimateMin: 15 }); return undo(x, 'Now a 15-minute task, planned for today.', await addToPlan(x.id, t));
    case 'five': if (!x) return; await put({ ...applyTaskPlan(x, { ...x, plannedDate: t }), pinned: t }); return undo(x, 'It’s up next. Five minutes counts.', await addToPlan(x.id, t));
    case 'waiting': return x && waitingSheet(x);
    case 'drop': if (!x) return; await put({ ...x, status: 'abandoned', statusDate: t, abandonedReason: SKIP_REASONS.gone }); return undo(x, 'Let go.');
    case 'add-step': return editSheet('task', null, { goalId: d.goal, estimateMin: 15, plannedDate: addDays(t, 1), priority: '2' });
    case 'add-goal': return editSheet('goal', null, { areaId: d.area, status: 'active' });
    case 'go-tasks': return go('today');
    case 'week': return openWeek();
    case 'finding': return A.finding({ dataset: { id: d.finding } });
    case 'goal-check': return goalCheckSheet(get(d.goal));
  }
};
function firstStepSheet(x) {
  openSheet({ title: 'First step', body: `<form class="form" data-form="first-step" data-id="${x.id}"><p><b>${esc(x.title)}</b></p>
    ${fieldHTML(['firstStep', 'What could you start in under two minutes?', 'text', { req: 1, max: 200, ph: 'Open the file and write one sentence' }], x.firstStep || '')}
    <p class="err" data-form-error></p><div class="form-actions"><button type="button" class="btn" data-action="sheet-close">Cancel</button><button class="btn primary">Save</button></div></form>` });
}
F['first-step'] = async (form, v) => {
  const x = get(form.dataset.id), step = String(v.firstStep || '').trim();
  if (!x) throw new Error('That task no longer exists.');
  if (!step) throw new Error('Write one small, concrete step.');
  await put({ ...x, firstStep: step });
  closeSheet();
  toast('Saved. Now it’s something you can start.');
};
function waitingSheet(x) {
  openSheet({ title: 'Waiting on something', body: `<form class="form" data-form="waiting" data-id="${x.id}"><p><b>${esc(x.title)}</b></p>
    ${fieldHTML(['waitingOn', 'What are you waiting for?', 'text', { req: 1, max: 200, ph: 'Reply from the editor' }], x.waitingOn || '')}
    ${fieldHTML(['days', 'Hide it until', 'select', { options: [['1', 'Tomorrow'], ['3', 'In 3 days'], ['7', 'Next week']], def: '3' }], '3')}
    <p class="err" data-form-error></p><div class="form-actions"><button type="button" class="btn" data-action="sheet-close">Cancel</button><button class="btn primary">Save</button></div></form>` });
}
F.waiting = async (form, v) => {
  const x = get(form.dataset.id), t = today(), what = String(v.waitingOn || '').trim();
  if (!x) throw new Error('That task no longer exists.');
  if (!what) throw new Error('Say what you’re waiting for, so future you knows.');
  await put({ ...x, waitingOn: what, snoozedUntil: addDays(t, Number(v.days) || 3), skips: [...(x.skips || []), { date: t, reason: 'waiting' }], pinned: '' });
  closeSheet();
  toast('Hidden until then. It’ll come back on its own.');
};
function goalCheckSheet(g) {
  if (!g) return;
  openSheet({ title: 'Still want this?', body: `<p class="lead" style="font-size:1.2rem">${esc(g.title)}</p><p class="small muted" style="margin-top:6px">Goals that sit untouched quietly cost attention. Decide, and the Brain stops asking.</p>
    <div class="stack section"><button class="btn primary block" data-action="goal-keep" data-id="${g.id}">Yes: add one small step</button><button class="btn block" data-action="goal-status" data-id="${g.id}" data-status="paused">Pause it for now</button><button class="btn block danger" data-action="goal-status" data-id="${g.id}" data-status="dropped">Drop it</button></div>` });
}
A['goal-keep'] = (el) => editSheet('task', null, { goalId: el.dataset.id, estimateMin: 15, plannedDate: addDays(today(), 1), priority: '2' });
A['goal-status'] = async (el) => {
  const g = get(el.dataset.id);
  if (!g) return;
  await put({ ...g, status: el.dataset.status });
  closeSheet();
  toast(el.dataset.status === 'paused' ? 'Paused' : 'Dropped', '', { action: 'Undo', onAction: async () => { await put(g); toast('Undone'); } });
};
