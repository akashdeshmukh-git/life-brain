/* ===== Goals: what you want, why, by when, and the steps that get you there. The rest of the app measures
   everything you do against these, so this is where the brain learns what matters to you. ===== */
const GOAL_EXAMPLES = [
  { title: 'Finish Paper 2', why: 'Get it out before the conference', by: 'month' },
  { title: 'Read books', target: 12, unit: 'books', by: 'year' },
  { title: 'Get fit', why: 'More energy for long work days' },
  { title: 'Run 5 km', target: 5, unit: 'km' },
];
const byWhen = (k, t = today()) => (k === 'month' ? addDays(t, 30) : k === 'year' ? `${t.slice(0, 4)}-12-31` : k === 'quarter' ? addDays(t, 90) : '');
const md = (d) => fmtDate(d, { month: 'short', day: 'numeric' });
const goalLine = (D, g, t) => {
  const s = goalStatus(D, g, t);
  const left = g.by ? (s.daysLeft >= 0 ? `By ${md(g.by)}, ${plural(s.daysLeft, 'day')} left` : `Was due ${md(g.by)}`) : 'No deadline';
  const prog = goalIsNumber(g) ? `${goalNow(g)} of ${g.target}${g.unit ? ' ' + g.unit : ''}` : `${s.steps.filter((x) => x.done).length} of ${plural(s.steps.length, 'step')} done`;
  return { s, left, prog };
};
/* One line per goal for the AI: what, why, where it stands */
const goalForAI = (D, g, t) => { const { s, left, prog } = goalLine(D, g, t); return `${g.title}${g.why ? ` (why: ${trunc(g.why.replace(/\s+/g, ' '), 160)})` : ''} | ${prog} | ${left} | ${goalStateText(g, s)} | ${plural(s.open.length, 'open step')}`; };
/* The state in a word, and the detail behind it: "Behind", "at this pace Nov 25". */
const goalDetailText = (g, s) => (s.state === 'stalled' ? `nothing in ${s.idle} days`
  : s.state === 'behind' ? (s.eta ? `at this pace ${md(s.eta)}` : 'past its date')
  : s.state === 'on-track' && s.eta ? `about ${md(s.eta)}` : '');
const goalStateText = (g, s) => { const d = goalDetailText(g, s); return GOAL_WORDS[s.state] + (d ? ', ' + d : ''); };

VIEWS.goals = () => {
  const D = data(), t = today(), act = activeGoals(D), done = D.goals.filter(goalDone);
  const card = (g) => {
    const { s, left, prog } = goalLine(D, g, t), d = goalDetailText(g, s);
    return `<div class="gcard state-${s.state}"><button class="gcard-main" data-action="goal-open" data-id="${g.id}">
        <span class="flex items-start justify-between gap-3"><b class="gtitle">${esc(g.title)}</b><span class="state-pill state-${s.state} mt-0.5">${esc(GOAL_WORDS[s.state])}</span></span>
        <span class="meter mt-1"><i style="width:${Math.round(goalPct(g, D) * 100)}%"></i></span>
        <span class="flex flex-wrap justify-between gap-x-3 gap-y-0.5"><span class="gmeta font-semibold text-ink">${esc(prog)}</span><span class="gmeta">${esc(left)}</span></span>
        ${d ? `<span class="gstate text-sm text-muted">${esc(d[0].toUpperCase() + d.slice(1))}</span>` : ''}</button>
      ${goalIsNumber(g) && !goalDone(g) ? `<button class="plus" data-action="goal-inc" data-id="${g.id}" aria-label="Add 1 to ${esc(g.title)}">+1</button>` : ''}</div>`;
  };
  if (!D.goals.length) {
    return header('Goals', 'What you want, and whether you’re getting there')
      + `<section class="card goal-empty mt-2"><p class="font-display text-[19px] leading-snug">A goal is something you want, with or without a deadline.</p>
        <p class="mt-2 text-[15px] text-muted">Tie tasks and habits to it, and Home shows whether your days are really heading there.</p>
        <button class="btn primary mt-5 w-full" data-action="goal-new">${icon('plus')}Add your first goal</button>
        <p class="mb-2 mt-6 text-sm font-semibold text-muted">Or start from one of these</p>
        <div class="chips">${GOAL_EXAMPLES.map((e, i) => `<button class="chip" data-action="goal-example" data-i="${i}">${esc(e.title)}</button>`).join('')}</div></section>`
      + `<button class="fab" data-action="goal-new" aria-label="Add a goal">${icon('plus')}</button>`;
  }
  return header('Goals', `${plural(act.length, 'active goal')}`)
    + `<section class="mt-2">${act.map(card).join('') || '<p class="empty-line">Every goal is done. Add the next one.</p>'}</section>`
    + (done.length ? `<section class="mt-6"><button class="fold" data-action="fold" data-k="goalsDone" aria-expanded="${!!ui.goalsDone}">${icon('down')}Done <span class="count">${done.length}</span></button>${ui.goalsDone ? done.map(card).join('') : ''}</section>` : '')
    + `<button class="fab" data-action="goal-new" aria-label="Add a goal">${icon('plus')}</button>`;
};

/* ---- One goal up close: where it stands, its steps, its habits ---- */
A['goal-open'] = (el) => goalDetail(get(el.dataset.id));
function goalDetail(g) {
  if (!g) return;
  ui.goalOpen = g.id;
  const D = data(), t = today(), { s, left, prog } = goalLine(D, g, t), d = goalDetailText(g, s);
  const open = s.steps.filter((x) => !x.done).sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || byCreated(a, b)), doneSteps = s.steps.filter((x) => x.done);
  const why = s.state === 'behind' && s.perWeekNeed ? `To make the date, about ${plural(s.perWeekNeed, 'step')} a week; lately ${s.perWeekNow}.` : s.state === 'stalled' ? `Nothing has moved it since ${s.last ? md(s.last) : 'you added it'}.` : '';
  openSheet({ title: g.title, body: `${g.why ? `<p class="gwhy">${esc(g.why)}</p>` : ''}
    <div class="gstate big state-${s.state} mt-3 flex flex-wrap items-center gap-2"><span class="state-pill state-${s.state}">${esc(GOAL_WORDS[s.state])}</span>${d ? `<span class="text-sm font-medium">${esc(d[0].toUpperCase() + d.slice(1))}</span>` : ''}</div>
    ${why ? `<p class="mt-2 text-sm text-muted">${esc(why)}</p>` : ''}
    <div class="state-${s.state} mt-4"><span class="meter"><i style="width:${Math.round(goalPct(g, D) * 100)}%"></i></span>
      <p class="mt-2 flex flex-wrap justify-between gap-x-3 text-sm"><span class="font-semibold">${esc(prog)}</span><span class="text-muted">${esc(left)}</span></p></div>
    ${goalIsNumber(g) ? `<button class="btn mt-4" data-action="goal-inc" data-id="${g.id}">+1 ${esc(g.unit || '')}</button>` : ''}
    <div class="sec-h mt-5"><h2>Steps</h2>${AI.provider() !== 'none' ? `<button class="link" data-action="goal-steps" data-id="${g.id}"><span class="ai-mark !h-5 !w-5">${icon('spark')}</span>Plan steps</button>` : ''}</div>
    <form class="add-row mt-1" data-form="goal-step" data-goal="${g.id}"><span class="add-ic">${icon('plus')}</span><input id="goal-step-in" name="title" placeholder="Add a step (try “… tomorrow”)" maxlength="300" autocomplete="off" enterkeyhint="done" aria-label="Add a step"></form>
    <div id="goal-steps" class="mt-1">${open.map((x) => taskRow(x, t, { showGoal: false })).join('')}${doneSteps.length ? `<p class="py-2 text-sm text-muted">${plural(doneSteps.length, 'step')} done</p>` : ''}</div>
    ${s.habits.length ? `<div class="sec-h mt-3"><h2>Habits for this goal</h2></div><div class="habits">${s.habits.map((h) => habitChip(h, t)).join('')}</div>` : ''}
    <div class="sheet-foot"><button class="btn" data-action="goal-edit" data-id="${g.id}">Edit</button>
      ${goalIsNumber(g) ? '' : `<button class="btn" data-action="goal-done" data-id="${g.id}">${g.done ? 'Reopen' : 'Mark done'}</button>`}
      <span class="spacer"></span><button class="btn primary" data-action="sheet-close">Done</button></div>` });
}
LB.goalDetail = goalDetail;
F['goal-step'] = async (form, v) => {
  const g = get(form.dataset.goal); let title = String(v.title || '').trim(), date = '';
  if (!g || !title) return;
  const when = parseWhen(title); if (when) ({ title, date } = when);
  await put({ type: 'task', title, date, done: false, doneDate: '', note: '', moved: 0, goalId: g.id });
  goalDetail(get(g.id));
  const f = $('#goal-step-in'); if (f) f.focus();
};
A['goal-done'] = async (el) => {
  const g = get(el.dataset.id); if (!g) return;
  await put({ ...g, done: !g.done, doneDate: g.done ? '' : today() });
  if (!g.done) { closeSheet(); toast(`Goal done: ${g.title}`, '', { action: 'Undo', onAction: () => put(g) }); } else goalDetail(get(g.id));
};
A['goal-inc'] = async (el) => {
  const g = get(el.dataset.id);
  if (!g) return;
  const t = today(), log = { ...(g.log || {}) };
  log[t] = (Number(log[t]) || 0) + 1;
  await put({ ...g, log });
  haptic();
  if (goalNow({ log }) === Number(g.target)) toast(`Goal reached: ${g.title}`);
  if (SH.open && $('.gstate.big')) goalDetail(get(g.id));
};

/* ---- Adding and editing a goal: four plain questions, only the first is needed ---- */
A['goal-new'] = () => goalForm(null);
A['goal-edit'] = (el) => goalForm(get(el.dataset.id));
A['goal-example'] = (el) => { const e = GOAL_EXAMPLES[Number(el.dataset.i)]; goalForm(null, { ...e, by: byWhen(e.by) }); };
function goalForm(g, preset = {}) {
  const r = g || { title: '', why: '', by: '', target: 0, unit: '', ...preset }, t = today();
  const opts = [[byWhen('month', t), 'In a month'], [byWhen('quarter', t), 'In 3 months'], [byWhen('year', t), 'End of year'], ['', 'No date']];
  if (r.by && !opts.some(([v]) => v === r.by)) opts.unshift([r.by, md(r.by)]);
  openSheet({ title: g ? 'Edit goal' : 'New goal', body: `<form class="form" data-form="goal" data-id="${g ? g.id : ''}">
    <input name="title" class="note-title" value="${esc(r.title)}" maxlength="120" required autocomplete="off" placeholder="What do you want?" aria-label="What do you want?">
    <label class="field"><span>Why does it matter? <small>(optional)</small></span><textarea name="why" rows="2" maxlength="1000" placeholder="Helps the AI give you better advice">${esc(r.why || '')}</textarea></label>
    <div class="field"><span>By when? <small>(optional)</small></span><div class="chips" role="radiogroup" aria-label="By when">${opts.map(([v, l]) => `<label class="chip"><input type="radio" name="by" value="${v}" ${v === (r.by || '') ? 'checked' : ''}>${esc(l)}</label>`).join('')}
      <label class="chip relative"><input type="date" name="by-other" id="goal-by" class="absolute inset-0 h-full w-full cursor-pointer opacity-0" aria-label="Other date" data-other="by">${icon('calendar')}<span data-other-label="by" data-empty="Other date">Other date</span></label></div></div>
    <div class="grid grid-cols-2 gap-3"><label class="field"><span>Counting something? <small>(optional)</small></span><input name="target" type="number" inputmode="numeric" min="0" max="100000" value="${Number(r.target) > 0 ? esc(r.target) : ''}" placeholder="12"></label>
      <label class="field"><span>Of what</span><input name="unit" value="${esc(r.unit || '')}" maxlength="20" placeholder="books"></label></div>
    ${g && goalIsNumber(g) ? `<label class="field"><span>So far</span><input name="now" type="number" inputmode="numeric" min="0" max="100000" value="${goalNow(g)}"></label>` : ''}
    <p class="hint">Without a number, a goal is finished by its steps: the tasks you tie to it.</p>
    <p class="err" data-form-error></p>
    <div class="sheet-foot">${g ? `<button type="button" class="btn icon-only danger" data-action="delete" data-id="${g.id}" aria-label="Delete goal">${icon('trash')}</button>` : ''}<span class="spacer"></span><button class="btn primary">${g ? 'Save' : 'Add goal'}</button></div></form>`,
  onMount(root) { root.addEventListener('change', otherDayChanged); } });
}
F.goal = async (form, v) => {
  const title = String(v.title || '').trim(), target = v.target === '' || v.target == null ? 0 : Number(v.target);
  if (!title) throw new Error('Say what you want, in a few words.');
  if (!Number.isFinite(target) || target < 0) throw new Error('Leave the number empty, or use 1 or more.');
  const old = get(form.dataset.id), log = { ...((old && old.log) || {}) };
  if (old && v.now !== undefined && v.now !== '') { // a correction is logged today, so the history still adds up
    const diff = Math.round(Number(v.now)) - goalNow(old);
    if (Number.isFinite(diff) && diff) log[today()] = (Number(log[today()]) || 0) + diff;
  }
  const g = await put({ ...(old || { type: 'goal', done: false, doneDate: '' }), title, why: String(v.why || '').trim(), by: pickedDay(v, 'by'), target: Math.round(target), unit: String(v.unit || '').trim(), log });
  goalDetail(g); // straight to the next thing: its first step
  if (!old) toast('Goal added. Now give it a first step.');
};
