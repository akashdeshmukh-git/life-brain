/* ===== Home / Intelligence Center and Today ===== */
const hasExamples = () => [...S.records.values()].some((r) => r.ex);
/* Every screen opens with a black sign: the thick white rule, the name, and a small-caps line under it. */
const head = (eyebrow, title, actions = '') => `<header class="page-head">${exampleStrip()}<div class="head-row"><div class="sign-main"><h1 class="page-title">${title}</h1>${eyebrow ? `<div class="eyebrow">${eyebrow}</div>` : ''}</div>${actions ? `<div class="page-actions">${actions}</div>` : ''}</div></header>`;
/* Example data shows as a strip above the sign, like a sample day; × clears it. */
const exampleStrip = () => (hasExamples() ? `<div class="banner example-strip"><span>Example data</span><button class="strip-x" data-action="clear-examples" aria-label="Clear examples and start fresh">Clear${icon('close')}</button></div>` : '');
const section = (title, body, link = '') => `<section class="section"><div class="section-h"><h2>${title}</h2>${link}</div>${body}</section>`;
const navLink = (to, label, sub = '') => `<button class="btn ghost sm link" data-action="nav" data-to="${to}" data-sub="${sub}">${label}</button>`;
const sevTag = (s) => `<span class="tag ${s === 'high' ? 'bad' : s === 'medium' ? 'warn' : ''}">${s === 'high' ? 'Needs attention' : s === 'medium' ? 'Worth a look' : 'Minor'}</span>`;
const exampleBanner = () => ''; // shown in the sign as a strip (exampleStrip)
const offlineTag = () => (navigator.onLine === false ? ' <span class="tag">Offline, still saving on this device</span>' : '');

function greeting() {
  const h = LB.now().getHours();
  return h < 5 ? 'Still up' : h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening';
}
function findingRow(f, D) {
  const v = Brain.verdict(D, f.id);
  return `<button class="item" data-action="finding" data-id="${esc(f.id)}"><span class="item-main"><span class="cluster" style="margin-bottom:4px">${sevTag(f.severity)}${f.hypotheses ? '<span class="tag accent">H1 · H2 · H3</span>' : ''}${f.uncertain ? '<span class="tag">Uncertain</span>' : ''}${v && v.status === 'accepted' ? '<span class="tag good">You agreed</span>' : ''}</span>
    <span class="item-title">${esc(f.title)}</span><span class="item-meta">${esc(f.summary)}</span></span>${icon('right')}</button>`;
}

VIEWS.review = () => {
  const D = data(), t = today(), p = D.profile;
  const findings = Brain.active(D, t);
  const open = D.tasks.filter((x) => x.status === 'open');
  const now = open.filter((x) => !x.plannedDate || x.plannedDate <= t).sort((a, b) => Brain.score(D, b, t) - Brain.score(D, a, t)).slice(0, 3);
  const wk = Brain.weekly(D, t, 4);
  const last2 = wk.slice(-2), planned2 = last2.reduce((s, w) => s + w.planned, 0), kept2 = last2.reduce((s, w) => s + w.kept, 0);
  const cal = Brain.calibration(D);
  const doneWeek = D.tasks.filter((x) => x.status === 'done' && isYmd(x.doneDate) && x.doneDate >= weekStart(t)).length;
  const exps = D.experiments.filter((e) => e.status === 'running');
  const upcoming = D.events.filter((e) => isYmd(e.date) && e.date >= t && e.date <= addDays(t, 7)).sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || ''))).slice(0, 5);
  const since = addDays(t, -7);
  const recent = (r, k) => isYmd(r[k]) ? r[k] >= since : (r[k] || '').slice(0, 10) >= since;
  const changes = [
    [D.tasks.filter((x) => x.status === 'done' && recent(x, 'doneDate')).length, 'task finished', 'tasks finished'],
    [D.tasks.filter((x) => x.status === 'abandoned' && recent(x, 'statusDate')).length, 'task let go', 'tasks let go'],
    [D.goals.filter((g) => recent(g, 'createdAt')).length, 'new goal', 'new goals'],
    [D.experiments.filter((e) => e.status === 'done' && recent(e, 'updatedAt')).length, 'experiment concluded', 'experiments concluded'],
    [D.memories.filter((m) => recent(m, 'createdAt')).length, 'lesson or note saved', 'lessons or notes saved'],
    [open.filter((x) => (x.deferrals || 0) >= 3).length, 'task moved 3+ times', 'tasks moved 3+ times'],
  ].filter(([n]) => n > 0);
  const insights = D.insights.filter((i) => i.status === 'accepted').slice(-3).reverse();
  const loopN = {
    Intent: D.goals.filter((g) => g.status === 'active').length,
    Plan: open.filter((x) => x.plannedDate).length,
    Action: D.tasks.filter((x) => x.status === 'done').length,
    Reality: cal.n,
    Diagnosis: findings.length,
    Experiment: exps.length,
    Learning: D.memories.length,
    Adaptation: D.experiments.filter((e) => e.adaptation).length,
  };
  return exampleBanner() + head('Your direction, trajectory and recent changes' + offlineTag(), 'Review')
    + section('Life direction', p.direction
      ? `<p class="lead prose">${esc(p.direction)}</p>${p.values.length ? `<div class="cluster" style="margin-top:12px">${p.values.map((v, i) => `<span class="tag ${i === 0 ? 'accent' : ''}">${i + 1}. ${esc(v)}</span>`).join('')}</div>` : ''}`
      : `<div class="empty"><strong>Set your direction first.</strong> Everything else is judged against it: goals, tasks and the Brain’s advice. <div style="margin-top:10px"><button class="btn primary sm" data-action="nav" data-to="life" data-sub="direction">Write my direction</button></div></div>`, navLink('life', 'Edit', 'direction'))
    + `<div class="section"><div class="loop" aria-label="Your loop">${Object.entries(loopN).map(([k, n], i) => `${i ? '<span class="loop-arrow" aria-hidden="true">→</span>' : ''}<div class="loop-step ${n ? 'lit' : ''}"><b>${n}</b><span>${k}</span></div>`).join('')}</div></div>`
    + section('What matters now', now.length ? `<div class="list">${now.map((x) => { const ch = Brain.chain(D, x); return `<button class="item" data-action="nav" data-to="today"><span class="item-main"><span class="item-title">${esc(x.title)}</span><span class="item-meta">${ch.linked ? 'For ' + esc(ch.head) : 'Not linked to a goal'}${x.plannedDate && x.plannedDate < t ? ' · was planned ' + fmtDate(x.plannedDate) : ''}</span></span>${x.estimateMin ? `<span class="tag num">${fmtMin(x.estimateMin)}</span>` : ''}</button>`; }).join('')}</div>`
      : `<div class="empty">Nothing is due. Plan something in <button class="btn ghost sm" data-action="nav" data-to="today">Today</button></div>`, navLink('today', 'Open Today'))
    + section('Risks and overload', findings.filter((f) => f.severity !== 'low').length ? `<div class="list">${findings.filter((f) => f.severity !== 'low').slice(0, 3).map((f) => findingRow(f, D)).join('')}</div>` : `<div class="empty">No risks detected in your current plans.</div>`, navLink('brain', `All ${findings.length}`))
    + section('Trajectory', `<div class="kpis"><div class="kpi"><b>${planned2 ? pct(kept2 / planned2) : '—'}</b><span>Plans kept, 2 wks</span></div><div class="kpi"><b>${cal.n >= 3 ? cal.median.toFixed(1) + '×' : '—'}</b><span>Actual vs estimate</span></div><div class="kpi"><b>${doneWeek}</b><span>Done this week</span></div></div>
      <div class="bars" style="margin-top:14px" aria-label="Plans kept per week">${wk.map((w) => `<div title="${w.kept}/${w.planned}"><i class="${w.rate == null ? 'none' : ''}" style="height:${w.rate == null ? 3 : Math.max(4, Math.round(w.rate * 40))}px"></i><span>${w.rate == null ? '–' : pct(w.rate)}</span></div>`).join('')}</div>
      <p class="xs muted" style="margin-top:6px">Share of planned tasks done on the planned day, last 4 weeks.${cal.n < 3 ? ' Record actual times when finishing tasks to see estimate accuracy.' : ''}</p>`)
    + section('Important changes · 7 days', changes.length ? `<div class="list">${changes.map(([n, a, b]) => `<div class="item"><span class="num" style="width:28px;text-align:right">${n}</span><span class="item-main">${n === 1 ? a : b}</span></div>`).join('')}</div>` : '<div class="empty">No changes recorded this week.</div>')
    + section('Insights', insights.length || D.memories.some((m) => m.kind === 'lesson') ? `<div class="list">${insights.map((i) => `<div class="item"><span class="item-main"><span class="item-title">${esc(i.title)}</span>${i.note ? `<span class="item-meta">${esc(i.note)}</span>` : ''}</span><span class="tag good">Agreed</span></div>`).join('')}${D.memories.filter((m) => m.kind === 'lesson').slice(-2).reverse().map((m) => `<button class="item" data-action="edit" data-id="${m.id}"><span class="item-main"><span class="item-title">${esc(m.title)}</span><span class="item-meta">Lesson · ${fmtDate(m.date)}</span></span></button>`).join('')}</div>` : '<div class="empty">Insights you agree with in the Brain, and lessons you save, appear here.</div>', navLink('memory', 'Memory'))
    + section('Experiments', exps.length ? `<div class="list">${exps.map((e) => `<button class="item" data-action="exp-open" data-id="${e.id}"><span class="item-main"><span class="item-title">${esc(e.title)}</span><span class="item-meta">${isYmd(e.startDate) ? 'Day ' + (daysBetween(e.startDate, t) + 1) : 'Running'} · ${plural((e.observations || []).length, 'observation')}</span></span>${icon('right')}</button>`).join('')}</div>` : '<div class="empty">No experiments running. The Brain can suggest one.</div>', navLink('experiments', 'All'))
    + (!D.events.length ? '' : section('Upcoming commitments', upcoming.length ? `<div class="list">${upcoming.map((e) => `<button class="item" data-action="edit" data-id="${e.id}"><span class="item-main"><span class="item-title">${esc(e.title)}</span><span class="item-meta">${e.date === t ? 'Today' : fmtDate(e.date)}${e.allDay ? ' · all day' : e.start ? ' · ' + esc(e.start) + (e.end ? '–' + esc(e.end) : '') : ''}${e.location ? ' · ' + esc(e.location) : ''}</span></span></button>`).join('')}</div>` : '<div class="empty">Nothing in the next 7 days.</div>', navLink('calendar', 'Calendar')));
};

/* ---- Today ---- */
function taskCard(x, D, t) {
  const ch = Brain.chain(D, x);
  const pr = { 1: '<span class="tag accent">High</span>', 3: '<span class="tag">Low</span>' }[x.priority] || '';
  const missed = x.status === 'open' && isYmd(x.plannedDate) && x.plannedDate < t ? `<span class="tag warn">Missed ${fmtDate(x.plannedDate, { weekday: 'short' })}</span>` : '';
  const moved = (x.deferrals || 0) >= 2 ? `<span class="tag ${(x.deferrals || 0) >= 3 ? 'warn' : ''}">Moved ${x.deferrals}×</span>` : '';
  return `<article class="task" data-task="${x.id}">
    <div class="task-top">${lineBullet(Lines.forTask(D, x), 'sm')}<div class="task-title">${esc(x.title)}</div>${x.estimateMin ? `<span class="tag num">${fmtMin(x.estimateMin)}</span>` : '<span class="tag">No estimate</span>'}</div>
    ${pr || missed || moved ? `<div class="cluster">${pr}${missed}${moved}</div>` : ''}
    <div class="why">${ch.linked ? `Matters for <b>${esc(ch.head)}</b>${ch.rest.length ? ' · ' + esc(ch.rest.join(' · ')) : ''}` : 'Not linked to any goal yet.'}${x.why ? `<br>${esc(x.why)}` : ''}</div>
    ${x.firstStep ? `<div class="first-step"><span class="xs muted">First step</span><br>${esc(x.firstStep)}</div>` : ''}
    ${x.context ? `<div class="xs muted">Context: ${esc(x.context)}</div>` : ''}
    <div class="task-actions"><button class="btn primary sm" data-action="task-done" data-id="${x.id}">${icon('check')}Done</button>
      ${x.plannedDate === t ? `<button class="btn sm" data-action="task-move" data-id="${x.id}" data-to="${addDays(t, 1)}">Tomorrow</button>` : `<button class="btn sm" data-action="task-move" data-id="${x.id}" data-to="${t}">Do today</button>`}
      <button class="btn sm" data-action="edit" data-id="${x.id}">Edit</button>
      <button class="btn sm ghost" data-action="task-drop" data-id="${x.id}">Let go</button></div>
  </article>`;
}
VIEWS.today = () => {
  const D = data(), t = today();
  const L = Brain.dayLoad(D, t, t);
  const open = D.tasks.filter((x) => x.status === 'open');
  const doNow = open.filter((x) => isYmd(x.plannedDate) && x.plannedDate <= t).sort((a, b) => Brain.score(D, b, t) - Brain.score(D, a, t));
  const could = open.filter((x) => !x.plannedDate).sort((a, b) => Brain.score(D, b, t) - Brain.score(D, a, t)).slice(0, 4);
  const done = D.tasks.filter((x) => x.status === 'done' && x.doneDate === t);
  const events = L.events.slice().sort((a, b) => (a.start || '').localeCompare(b.start || ''));
  const cls = L.ratio > 1 ? 'bad' : L.ratio > 0.8 ? 'warn' : '';
  const remaining = Math.max(0, L.cap - L.total);
  return exampleBanner() + head(fmtDate(t, { weekday: 'long', month: 'long', day: 'numeric' }), 'Tasks', `<button class="btn primary" data-action="add" data-type="task" data-date="${t}">${icon('plus')}Task</button>`)
    + `<section class="section card"><div class="split"><div><b class="num">${fmtMin(L.total)}</b> <span class="muted">planned of ${fmtMin(L.cap)}</span></div>${L.ratio > 1 ? '<span class="tag bad">Over capacity</span>' : L.ratio > 0.8 ? '<span class="tag warn">Tight</span>' : '<span class="tag good">Room to breathe</span>'}</div>
      <div class="meter ${cls}" style="margin-top:10px" role="img" aria-label="${pct(L.ratio)} of capacity"><i style="width:${Math.min(100, L.ratio * 100)}%"></i><span class="mark" style="left:80%" title="80% sustainable"></span></div>
      <p class="xs muted" style="margin-top:8px">${L.eventMin ? fmtMin(L.eventMin) + ' in events · ' : ''}${fmtMin(L.taskMin)} in tasks${L.unestimated ? ` (${L.unestimated} without estimate, counted as 30m)` : ''} · the line marks 80%, a sustainable day. ${L.ratio > 1 ? 'Consider moving something to tomorrow.' : `About ${fmtMin(remaining)} free.`}</p></section>`
    + section('Do next', doNow.length ? `<div class="stack">${doNow.map((x) => taskCard(x, D, t)).join('')}</div>` : `<div class="empty">Nothing planned for today.${could.length ? ' Pick something from below.' : ''}</div>`)
    + (!D.events.length ? '' : section('Commitments', events.length ? `<div class="list">${events.map((e) => `<button class="item" data-action="edit" data-id="${e.id}"><span class="num muted small" style="width:92px;flex:none">${e.allDay ? 'All day' : esc(e.start || '') + (e.end ? '–' + esc(e.end) : '')}</span><span class="item-main"><span class="item-title">${esc(e.title)}</span>${e.location ? `<span class="item-meta">${esc(e.location)}</span>` : ''}</span></button>`).join('')}</div>` : '<div class="empty">No events today.</div>', `<button class="btn ghost sm" data-action="add" data-type="event" data-date="${t}">Add event</button>`))
    + (D.habits.length ? section('Habits', `<div class="cluster">${D.habits.map((h) => `<button class="chip" data-action="habit-toggle" data-id="${h.id}" data-date="${t}" aria-pressed="${!!(h.log && h.log[t])}">${esc(h.emoji || '')} ${esc(h.title)}</button>`).join('')}</div>`) : '')
    + section('Reality so far', done.length ? `<div class="list">${done.map((x) => `<div class="item"><span class="item-main"><span class="item-title">${esc(x.title)}</span><span class="item-meta num">planned ${x.estimateMin ? fmtMin(x.estimateMin) : '—'} · took ${x.actualMin ? fmtMin(x.actualMin) : 'not recorded'}${x.outcome ? ' · ' + esc(OUTCOMES[x.outcome] || x.outcome) : ''}</span>${x.outcomeNote ? `<span class="item-meta">${esc(x.outcomeNote)}</span>` : ''}</span><button class="btn sm ghost" data-action="task-reopen" data-id="${x.id}">Undo</button></div>`).join('')}</div>` : '<div class="empty">Finished tasks show here with planned time next to actual time.</div>')
    + section('Could also do', could.length ? `<div class="list">${could.map((x) => `<div class="item"><span class="item-main"><span class="item-title">${esc(x.title)}</span><span class="item-meta">${Brain.chain(D, x).linked ? 'For ' + esc(Brain.chain(D, x).head) : 'Unlinked'}${x.estimateMin ? ' · ' + fmtMin(x.estimateMin) : ''}</span></span><button class="btn sm" data-action="task-move" data-id="${x.id}" data-to="${t}">Plan today</button></div>`).join('')}</div>` : '<div class="empty">No unplanned tasks waiting.</div>')
    + section('Quick add', `<form class="cluster" data-form="quick-task" style="flex-wrap:nowrap"><input class="input" name="title" placeholder="Add a task for today" maxlength="200" aria-label="Task" style="flex:1;min-width:0"><input class="input num" name="estimateMin" type="number" min="0" max="1440" step="5" placeholder="min" aria-label="Estimate in minutes" style="width:84px;flex:none"><button class="btn primary" aria-label="Add task">${icon('plus')}</button></form>`);
};
const OUTCOMES = { as_planned: 'Went as planned', partly: 'Partly done', different: 'Turned out differently' };
F['quick-task'] = async (form, v) => {
  const title = String(v.title || '').trim();
  if (!title) { toast('Type a task first.', 'bad'); return; }
  const n = v.estimateMin === '' ? null : Number(v.estimateMin);
  if (n != null && (!Number.isFinite(n) || n < 0 || n > 1440)) { toast('Estimate must be 0–1440 minutes.', 'bad'); return; }
  await put({ type: 'task', title, estimateMin: n, plannedDate: today(), plans: [today()], deferrals: 0, status: 'open', priority: '2' });
  toast('Task added for today');
};
A['task-move'] = async (el) => {
  const x = get(el.dataset.id);
  if (!x) return;
  await put(applyTaskPlan(x, { ...x, plannedDate: el.dataset.to }));
  toast(el.dataset.to === today() ? 'Planned for today' : `Moved to ${fmtDate(el.dataset.to)}`);
};
A['task-done'] = (el) => {
  const x = get(el.dataset.id);
  if (!x) return;
  openSheet({ title: 'Record what happened', body: `<form class="form" data-form="task-done" data-id="${x.id}">
    <p><b>${esc(x.title)}</b><br><span class="small muted">Planned: ${x.estimateMin ? fmtMin(x.estimateMin) : 'no estimate'}${x.plannedDate ? ' on ' + fmtDate(x.plannedDate) : ''}</span></p>
    <div class="form-row">${fieldHTML(['actualMin', 'Actual time (minutes)', 'number', { maxNum: 1440, step: 5, hint: 'Your best honest guess is fine.' }], '')}${fieldHTML(['outcome', 'Outcome', 'select', { options: Object.entries(OUTCOMES), def: 'as_planned' }], 'as_planned')}</div>
    ${fieldHTML(['outcomeNote', 'What happened? (optional)', 'area', { ph: 'It took longer because…' }], '')}
    <label class="check"><input type="checkbox" name="lesson"> Save this note as a lesson in Memory</label>
    <p class="err" data-form-error></p>
    <div class="form-actions"><button type="button" class="btn" data-action="sheet-close">Cancel</button><button class="btn primary">Mark done</button></div></form>` });
};
F['task-done'] = async (form, v) => {
  const x = get(form.dataset.id);
  if (!x) throw new Error('That task no longer exists.');
  const actual = v.actualMin === '' ? null : Number(v.actualMin);
  if (actual != null && (!Number.isFinite(actual) || actual < 0 || actual > 1440)) throw new Error('Actual time must be 0–1440 minutes.');
  const note = String(v.outcomeNote || '').trim();
  await put({ ...x, status: 'done', doneDate: today(), actualMin: actual, outcome: OUTCOMES[v.outcome] ? v.outcome : 'as_planned', outcomeNote: note });
  if (v.lesson && note) await put({ type: 'memory', kind: 'lesson', title: trunc(note, 80), body: `From “${x.title}”: ${note}`, date: today(), links: [x.id] });
  closeSheet();
  haptic('success');
  toast('Done. Reality recorded.');
};
A['task-reopen'] = async (el) => {
  const x = get(el.dataset.id);
  if (!x) return;
  await put({ ...x, status: 'open', doneDate: '', actualMin: null, outcome: '', outcomeNote: x.outcomeNote || '' });
  toast('Reopened');
};
A['task-drop'] = (el) => {
  const x = get(el.dataset.id);
  if (!x) return;
  openSheet({ title: 'Let this task go?', body: `<form class="form" data-form="task-drop" data-id="${x.id}"><p>“${esc(x.title)}” will be marked abandoned. It stays in your records so the Brain can learn from it.</p>
    ${fieldHTML(['reason', 'Why? (helps the Brain spot patterns)', 'text', { ph: 'No longer matters / blocked / too vague' }], '')}
    <div class="form-actions"><button type="button" class="btn" data-action="sheet-close">Cancel</button><button class="btn primary">Let it go</button></div></form>` });
};
F['task-drop'] = async (form, v) => {
  const x = get(form.dataset.id);
  if (!x) throw new Error('That task no longer exists.');
  await put({ ...x, status: 'abandoned', statusDate: today(), abandonedReason: String(v.reason || '').trim() });
  closeSheet();
  toast('Let go', '', { action: 'Undo', onAction: async () => { await put(x); toast('Back on your list'); } });
};
A['habit-toggle'] = async (el) => {
  const h = get(el.dataset.id);
  if (!h) return;
  const d = el.dataset.date, log = { ...(h.log || {}) };
  if (log[d]) delete log[d]; else log[d] = true;
  await put({ ...h, log });
};
