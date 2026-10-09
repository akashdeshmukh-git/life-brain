/* ===== Goals: what you want, why, by when, and the steps that get you there. The rest of the app measures
   everything you do against these, so this is where the brain learns what matters to you. ===== */
const GOAL_EXAMPLES = [
  { title: 'Finish Paper 2', why: 'Get it out before the conference', by: 'month' },
  { title: 'Read books', target: 12, unit: 'books', by: 'year' },
  { title: 'Get fit', why: 'More energy for long work days' },
  { title: 'Run 5 km', target: 5, unit: 'km' },
];
const byWhen = (k, t = today()) => (k === 'month' ? addDays(t, 30) : k === 'year' ? `${t.slice(0, 4)}-12-31` : k === 'quarter' ? addDays(t, 90) : '');
const goalLine = (D, g, t) => {
  const s = goalStatus(D, g, t);
  const left = g.by ? (s.daysLeft >= 0 ? `by ${fmtDate(g.by, { month: 'short', day: 'numeric' })} · ${plural(s.daysLeft, 'day')} left` : `was due ${fmtDate(g.by, { month: 'short', day: 'numeric' })}`) : 'No deadline';
  const prog = goalIsNumber(g) ? `${goalNow(g)} of ${g.target}${g.unit ? ' ' + g.unit : ''}` : `${s.steps.filter((x) => x.done).length} of ${plural(s.steps.length, 'step')} done`;
  return { s, left, prog };
};
/* One line per goal for the AI: what, why, where it stands */
const goalForAI = (D, g, t) => { const { s, left, prog } = goalLine(D, g, t); return `${g.title}${g.why ? ` (why: ${trunc(g.why.replace(/\s+/g, ' '), 160)})` : ''} | ${prog} | ${left} | ${goalStateText(g, s)} | ${plural(s.open.length, 'open step')}`; };
const goalStateText = (g, s) => (s.state === 'stalled' ? `Stalled · nothing in ${s.idle} days`
  : s.state === 'behind' ? (s.eta ? `Behind · at this pace ${fmtDate(s.eta, { month: 'short', day: 'numeric' })}` : 'Behind · past its date')
  : s.state === 'no-steps' ? 'Needs a next step'
  : s.state === 'on-track' && s.eta ? `On track · about ${fmtDate(s.eta, { month: 'short', day: 'numeric' })}` : GOAL_WORDS[s.state]);

VIEWS.goals = () => {
  const D = data(), t = today(), act = activeGoals(D), done = D.goals.filter(goalDone);
  const card = (g) => {
    const { s, left, prog } = goalLine(D, g, t);
    return `<div class="gcard state-${s.state}"><button class="gcard-main" data-action="goal-open" data-id="${g.id}">
        <b class="gtitle">${esc(g.title)}</b><span class="gmeta">${esc(left)} · ${esc(prog)}</span>
        <span class="meter"><i style="width:${Math.round(goalPct(g, D) * 100)}%"></i></span>
        <span class="gstate">${esc(goalStateText(g, s))}</span></button>
      ${goalIsNumber(g) && !goalDone(g) ? `<button class="icon-btn plus" data-action="goal-inc" data-id="${g.id}" aria-label="Add 1 to ${esc(g.title)}">+1</button>` : ''}</div>`;
  };
  if (!D.goals.length) {
    return header('Goals', 'What you want, and whether you’re getting there', `<button class="pill" data-action="goal-new">${icon('plus')}Goal</button>`)
      + `<section class="card goal-empty"><p>A goal is something you want, with or without a deadline. Tie tasks and habits to it, and Home shows whether your days are really heading there.</p>
        <button class="btn primary block" data-action="goal-new">${icon('plus')}Add your first goal</button>
        <p class="mini-label">Or start from one of these</p>
        <div class="chips">${GOAL_EXAMPLES.map((e, i) => `<button class="chip" data-action="goal-example" data-i="${i}">${esc(e.title)}</button>`).join('')}</div></section>`;
  }
  return header('Goals', `${plural(act.length, 'active goal')}`, `<button class="pill" data-action="goal-new">${icon('plus')}Goal</button>`)
    + `<section class="card">${act.map(card).join('') || '<p class="empty-line">Every goal is done. Add the next one.</p>'}</section>`
    + (done.length ? `<section class="card"><button class="fold" data-action="fold" data-k="goalsDone" aria-expanded="${!!ui.goalsDone}">${icon('down')}Done <span class="count">${done.length}</span></button>${ui.goalsDone ? done.map(card).join('') : ''}</section>` : '');
};

/* ---- One goal up close: where it stands, its steps, its habits ---- */
A['goal-open'] = (el) => goalDetail(get(el.dataset.id));
function goalDetail(g) {
  if (!g) return;
  ui.goalOpen = g.id;
  const D = data(), t = today(), { s, left, prog } = goalLine(D, g, t);
  const open = s.steps.filter((x) => !x.done).sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || byCreated(a, b)), doneSteps = s.steps.filter((x) => x.done);
  const why = s.state === 'behind' && s.perWeekNeed ? `To make the date, about ${plural(s.perWeekNeed, 'step')} a week; lately ${s.perWeekNow}.` : s.state === 'stalled' ? `Nothing has moved it since ${s.last ? fmtDate(s.last, { month: 'short', day: 'numeric' }) : 'you added it'}.` : '';
  openSheet({ title: g.title, body: `${g.why ? `<p class="gwhy">${esc(g.why)}</p>` : ''}
    <p class="small">${esc(left)} · ${esc(prog)}</p>
    <p class="gstate big state-${s.state}">${esc(goalStateText(g, s))}${why ? `<br><span class="small">${esc(why)}</span>` : ''}</p>
    ${goalIsNumber(g) ? `<div class="row-end" style="justify-content:flex-start"><button class="btn" data-action="goal-inc" data-id="${g.id}">+1 ${esc(g.unit || '')}</button></div>` : ''}
    <div class="sec-h"><h2>Steps</h2>${AI.provider() !== 'none' ? `<button class="link" data-action="goal-steps" data-id="${g.id}">${icon('spark')}Plan steps</button>` : ''}</div>
    <form class="add-row" data-form="goal-step" data-goal="${g.id}"><span class="add-ic">${icon('plus')}</span><input id="goal-step-in" name="title" placeholder="Add a step (try “… tomorrow”)" maxlength="300" autocomplete="off" enterkeyhint="done" aria-label="Add a step"></form>
    <div id="goal-steps">${open.map((x) => taskRow(x, t, { showGoal: false })).join('')}${doneSteps.length ? `<p class="small muted">${plural(doneSteps.length, 'step')} done</p>` : ''}</div>
    ${s.habits.length ? `<div class="sec-h"><h2>Habits for this goal</h2></div><p class="small">${s.habits.map((h) => esc(h.title)).join(', ')}</p>` : ''}
    <div class="row-end"><button class="btn" data-action="goal-edit" data-id="${g.id}">Edit</button>
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
  openSheet({ title: g ? 'Edit goal' : 'New goal', body: `<form class="form" data-form="goal" data-id="${g ? g.id : ''}">
    <label class="field"><span>What do you want?</span><input name="title" value="${esc(r.title)}" maxlength="120" required autocomplete="off" placeholder="Finish Paper 2"></label>
    <label class="field"><span>Why does it matter? <small>(optional)</small></span><textarea name="why" rows="2" maxlength="1000" placeholder="Helps the AI give you better advice">${esc(r.why || '')}</textarea></label>
    <label class="field"><span>By when? <small>(optional)</small></span><input type="date" name="by" id="goal-by" value="${esc(r.by || '')}"></label>
    <div class="chips"><button type="button" class="chip" data-action="goal-by" data-v="${byWhen('month', t)}">In a month</button><button type="button" class="chip" data-action="goal-by" data-v="${byWhen('quarter', t)}">In 3 months</button><button type="button" class="chip" data-action="goal-by" data-v="${byWhen('year', t)}">End of year</button><button type="button" class="chip" data-action="goal-by" data-v="">No date</button></div>
    <div class="two"><label class="field"><span>Counting something? <small>(optional)</small></span><input name="target" type="number" inputmode="numeric" min="0" max="100000" value="${Number(r.target) > 0 ? esc(r.target) : ''}" placeholder="12"></label>
      <label class="field"><span>Of what</span><input name="unit" value="${esc(r.unit || '')}" maxlength="20" placeholder="books"></label></div>
    ${g && goalIsNumber(g) ? `<label class="field"><span>So far</span><input name="now" type="number" inputmode="numeric" min="0" max="100000" value="${goalNow(g)}"></label>` : ''}
    <p class="hint">Without a number, a goal is finished by its steps: the tasks you tie to it.</p>
    <p class="err" data-form-error></p>
    <div class="row-end">${g ? `<button type="button" class="btn danger" data-action="delete" data-id="${g.id}">Delete</button><span class="spacer"></span>` : ''}<button class="btn primary">${g ? 'Save' : 'Add goal'}</button></div></form>` });
}
A['goal-by'] = (el) => { const f = $('#goal-by'); if (f) f.value = el.dataset.v; };
F.goal = async (form, v) => {
  const title = String(v.title || '').trim(), target = v.target === '' || v.target == null ? 0 : Number(v.target);
  if (!title) throw new Error('Say what you want, in a few words.');
  if (!Number.isFinite(target) || target < 0) throw new Error('Leave the number empty, or use 1 or more.');
  const old = get(form.dataset.id), log = { ...((old && old.log) || {}) };
  if (old && v.now !== undefined && v.now !== '') { // a correction is logged today, so the history still adds up
    const diff = Math.round(Number(v.now)) - goalNow(old);
    if (Number.isFinite(diff) && diff) log[today()] = (Number(log[today()]) || 0) + diff;
  }
  const g = await put({ ...(old || { type: 'goal', done: false, doneDate: '' }), title, why: String(v.why || '').trim(), by: isYmd(v.by) ? v.by : '', target: Math.round(target), unit: String(v.unit || '').trim(), log });
  goalDetail(g); // straight to the next thing: its first step
  if (!old) toast('Goal added. Now give it a first step.');
};

/* A goal picker for tasks and habits */
const goalSelect = (current) => {
  const gs = activeGoals(data()).concat(current && get(current) && goalDone(get(current)) ? [get(current)] : []);
  if (!gs.length) return '';
  return `<label class="field"><span>Goal <small>(what it moves forward)</small></span><select name="goalId"><option value="">No goal</option>${gs.map((g) => `<option value="${g.id}" ${g.id === current ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}</select></label>`;
};
LB.goalSelect = goalSelect;
