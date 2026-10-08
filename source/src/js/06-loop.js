/* ===== Board: the day as a subway departures board, after Day Board. Plan it in the morning, start and finish
   tasks as you go, close the day in the evening, review once a week. ===== */
const pad2 = (n) => String(n).padStart(2, '0');
const nowMin = () => { const d = LB.now(); return d.getHours() * 60 + d.getMinutes(); };
const clockAt = (min) => { const m = ((Math.round(min) % 1440) + 1440) % 1440; return new Date(2000, 0, 1, Math.floor(m / 60), m % 60).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }); };
const startFor = (date) => (date === today() ? nowMin() : 9 * 60); // a plan for tomorrow starts at 09:00
/* The big number on the right: minutes under an hour, H:MM over it, its unit in small caps underneath. */
const bigTime = (m, left) => (m < 60 ? [String(Math.max(0, Math.round(m))), left ? 'min left' : 'min'] : [`${Math.floor(m / 60)}:${pad2(Math.round(m % 60))}`, left ? 'hr left' : 'hr']);
const depTime = ([n, unit], sr, cls = '') => `<span class="dep-time ${cls}"><span class="sr">${sr}</span><b aria-hidden="true">${n}</b><small aria-hidden="true">${unit}</small></span>`;
const finishText = (end) => (end >= 1440 ? '<b class="warn-text">Runs past midnight</b>' : `done around ${clockAt(end)}`);
const isLive = (x, t) => x.status === 'open' && x.plannedDate === t && x.startedDate === t && !!x.startedAt;
const elapsedMin = (x) => Math.max(0, (LB.now() - Date.parse(x.startedAt)) / 60000);
const doneOn = (D, id, date) => { const x = D.tasks.find((y) => y.id === id); return !!x && x.status === 'done' && x.doneDate === date; };

VIEWS.home = () => {
  const D = data(), t = today(), hour = LB.now().getHours();
  const pending = D.days.filter((d) => d.date < t && d.committedAt && !d.reviewedAt && (d.plannedIds || []).length).sort((a, b) => b.date.localeCompare(a.date))[0];
  const day = Loop.day(D, t);
  let B;
  if (pending) B = { cols: ['Reality first', ''], html: `<section class="next board"><div class="board-msg"><b class="msg-title">Close ${fmtDate(pending.date, { weekday: 'long' })}</b>
      <p class="muted">You planned ${plural(pending.plannedIds.length, 'task')} and haven’t said what happened yet. It takes 30 seconds, and it’s the step everything else learns from.</p>
      <div class="task-actions"><button class="btn primary" data-action="close-open" data-date="${pending.date}">Close ${fmtDate(pending.date, { weekday: 'long' })}</button><button class="btn ghost" data-action="close-skip" data-date="${pending.date}">I don’t remember</button></div></div></section>` };
  else if (!day || !day.committedAt) B = planBoard(D, t, 'today');
  else if (!day.reviewedAt) B = todayBoard(D, day, t, hour);
  else {
    const tom = Loop.day(D, addDays(t, 1));
    B = closedBoard(D, day);
    B.html += tom && tom.committedAt ? `<p class="small muted" style="margin:12px 0 0">Tomorrow is planned: ${plural(tom.plannedIds.length, 'task')}.</p>` : `<div class="section">${boardCols(planBoard(D, addDays(t, 1), 'tomorrow'))}</div>`;
  }
  const weekly = !pending && Loop.weekDue(D, t) ? (() => { const W = Loop.week(D, t); return `<section class="notice weekly section"><span class="diamond" aria-hidden="true"></span><div class="notice-main"><div class="label">Weekly review, 5 minutes</div>
      <b class="spot-title">You kept ${W.rate == null ? '—' : pct(W.rate)} of what you planned this week</b><p class="small muted">${W.kept} of ${W.planned} planned tasks. See why, and choose one change to test next week.</p>
      <div class="task-actions"><button class="btn sm primary" data-action="week-open">Start review</button></div></div></section>`; })() : '';
  const inPlan = new Set(day && day.committedAt ? day.plannedIds : !pending && !(day && day.reviewedAt) ? Loop.propose(D, t).items.filter((i) => i.selected).map((i) => i.x.id) : []);
  const spots = Brain.blindSpots(D, t).filter((s) => (Brain.verdict(D, s.id) || {}).status !== 'rejected' && !(s.action.task && inPlan.has(s.action.task))).slice(0, 3);
  const spotsHTML = spots.length ? `<div class="notices">${spots.map((s) => `<article class="spot notice"><span class="diamond" aria-hidden="true"></span><div class="notice-main"><b class="spot-title">${esc(s.title)}</b><p class="small muted">${esc(s.evidence)}</p>
      <div class="task-actions"><button class="btn sm primary" data-action="spot-act" data-act="${s.action.act}" data-task="${s.action.task || ''}" data-goal="${s.action.goal || ''}" data-area="${s.action.area || ''}" data-finding="${esc(s.action.finding || '')}">${esc(s.action.label)}</button>
      <button class="btn sm ghost" data-action="spot-dismiss" data-id="${esc(s.id)}" data-title="${esc(s.title)}">Not useful</button></div></div></article>`).join('')}</div>`
    : '<div class="empty">Nothing stands out yet. Each day you close shows the Brain a little more.</div>';
  return boardHead(D, t, spots.length, B.cols) + B.html + weekly
    + `<div id="notices">${section('What you’re not seeing', spotsHTML, navLink('brain', 'More'))}</div>`
    + section('Add', `<form class="cluster" data-form="quick-add" style="flex-wrap:nowrap"><input class="input" name="title" placeholder="Something to do…" maxlength="200" aria-label="New task" autocomplete="off" style="flex:1;min-width:0"><button class="btn primary" aria-label="Add">${icon('plus')}</button></form>
      <p class="xs muted" style="margin:6px 0 0 2px">Unsorted is fine. It shows up in the next plan if it matters.</p>`);
};
/* The black sign at the top: the date, your lines, notices, and the board's column labels. */
function boardHead(D, t, notices, cols) {
  const lines = Lines.all(D).map((a) => Lines.of(D, a));
  return `<header class="page-head board-top">${exampleStrip()}
    <div class="head-row"><h1 class="page-title">${fmtDate(t, { weekday: 'long', month: 'short', day: 'numeric' })}</h1><button class="icon-btn round" data-action="nav" data-to="settings" aria-label="Settings">${icon('gear')}</button></div>
    ${offlineTag() ? `<div class="eyebrow">${offlineTag()}</div>` : ''}
    <div class="line-row">${lines.map((L) => `<button class="line-btn" data-action="line-open" data-id="${L.id}" aria-label="${esc(L.name)} line">${lineBullet(L)}</button>`).join('')}
      ${notices ? `<button class="pill" data-action="notices-jump"><span class="diamond" aria-hidden="true"></span>${plural(notices, 'notice')}</button>` : ''}</div>
    <div class="board-cols"><span>${cols[0]}</span><span>${cols[1]}</span></div></header>`;
}
const boardCols = (B) => `<div class="board-cols inline"><span>${B.cols[0]}</span><span>${B.cols[1]}</span></div>${B.html}`;
A['notices-jump'] = () => { const n = $('#notices'); if (n) n.scrollIntoView({ behavior: reduceMotion() ? 'auto' : 'smooth', block: 'start' }); };

function ruleTags(pol) {
  const e = Object.entries(pol);
  return e.length ? `<div class="cluster">${e.map(([k, v]) => `<span class="tag accent">${v.from === 'experiment' ? 'Testing' : 'Rule'}: ${esc(POLICIES[k].label(v.value))}</span>`).join('')}</div>` : '';
}
/* The morning plan: each row's bullet is its switch. Ticked rows get a departure time, in order from now. */
function planBoard(D, date, which) {
  const P = Loop.propose(D, date);
  const label = which === 'tomorrow' ? 'Plan tomorrow' : 'Plan today';
  // Changing a plan you already made: keep what you picked, and what's already done stays in it.
  const prev = Loop.day(D, date), doneIds = prev ? prev.plannedIds.filter((id) => doneOn(D, id, date)) : [];
  if (prev && prev.plannedIds.length) P.items = P.items.map((i) => ({ ...i, selected: prev.plannedIds.includes(i.x.id) }));
  const doneNote = doneIds.length ? `<p class="small muted">Already done, stays in the plan: ${doneIds.map((id) => esc(D.tasks.find((x) => x.id === id).title)).join(', ')}.</p>` : '';
  if (!P.items.length && !doneIds.length) return { cols: [label, ''], html: `<section class="next board"><div class="board-msg"><b class="next-title msg-title">Nothing to plan</b><p class="muted">Add what’s on your mind below. It will be suggested here.</p></div></section>` };
  const k = P.pol.estimate ? Number(P.pol.estimate.value) : 1;
  // Ticked tasks plus a few alternatives stay in view; the rest fold away.
  const lastSel = P.items.reduce((m, it, i) => (it.selected ? i : m), -1), shown = Math.min(P.items.length, Math.max(lastSel + 1, P.items.filter((it) => it.selected).length) + 3);
  const start = startFor(date);
  let clock = start;
  const rows = P.items.map(({ x, minutes, selected, tooBig, overDay, needsStep }, i) => {
    const unclear = (x.skips || []).filter((s) => s.reason === 'unclear').length;
    const askStep = needsStep || (!x.firstStep && unclear >= 2);
    const ch = Brain.chain(D, x), at = selected ? clock : null;
    if (selected) clock += minutes;
    const more = i === shown ? `</div><details class="disclosure plan-more"><summary>${plural(P.items.length - shown, 'more option')}</summary><div class="plan-list">` : '';
    return `${more}<label class="dep plan-row"><input type="checkbox" class="pick" name="sel" value="${x.id}" data-min="${minutes}" ${selected ? 'checked' : ''}>${lineBullet(Lines.forTask(D, x))}
      <span class="dep-main"><span class="item-title">${esc(x.title)}</span>
      ${planMeta([ch.linked ? esc(ch.head) : '', tooBig ? '<b class="warn-text">Longer than your rule allows</b>' : overDay ? '<b class="warn-text">Bigger than your usual day</b>' : '', (x.deferrals || 0) >= 3 ? `Put off ${x.deferrals} times${unclear >= 2 ? `, ${unclear} as unclear` : ''}` : ''])}
      <span class="dep-at" data-at data-m="${at ?? ''}">${at == null ? '—' : clockAt(at)}</span>
      ${askStep ? `<input class="input" name="fs_${x.id}" aria-label="First step for ${esc(x.title)}" placeholder="${needsStep ? 'First step (your rule asks for one)' : 'Write a first step'}" maxlength="200" value="${esc(x.firstStep || '')}">` : x.firstStep ? `<span class="item-meta">Start with: ${esc(x.firstStep)}</span>` : ''}</span>
      ${depTime(bigTime(minutes), 'takes about ' + fmtMin(minutes))}</label>`;
  }).join('');
  return { cols: [label, 'Takes'], html: `<section class="next board"><form data-form="commit-plan" data-date="${date}" class="stack" style="gap:.7rem">
    <p class="small muted board-intro">Sized to what you really get done: about <b class="num">${fmtMin(P.budget.minutes)}</b> of planned work a day${P.budget.from === 'history' ? `, the median of your last ${plural(P.budget.n, 'closed day')}` : ', from your settings until you’ve closed 3 days'}.${k !== 1 ? ` Estimates are multiplied by ${k}.` : ''} Tap a bullet to add or remove a task.</p>
    ${ruleTags(P.pol)}${doneNote}
    <div class="plan-list deps">${rows}</div>${shown < P.items.length ? '</details>' : ''}
    <p class="small" id="plan-total" data-budget="${P.budget.minutes}" data-start="${start}">${planTotalText(P.items.filter((i) => i.selected).reduce((s, i) => s + i.minutes, 0), P.items.filter((i) => i.selected).length, P.budget.minutes, start)}</p>
    <p class="err" data-form-error></p>
    <div class="task-actions"><button class="btn primary block">Commit plan</button></div></form></section>` };
}
const planMeta = (parts) => { const p = parts.filter(Boolean); return p.length ? `<span class="item-meta">${p.join('. ')}</span>` : ''; };
const planTotalText = (m, n, budget, start) => `${plural(n, 'task')}, about ${fmtMin(m)}${n ? `, ${finishText(start + m)}` : ''}.${m > budget ? ` <b class="warn-text">${fmtMin(m - budget)} more than you usually manage.</b>` : ''}`;
/* Ticking a task re-times the board: departures follow in order from the first. */
document.addEventListener('change', (ev) => {
  const form = ev.target.closest && ev.target.closest('form[data-form="commit-plan"]');
  if (!form || ev.target.name !== 'sel') return;
  const out = $('#plan-total', form), start = Number(out.dataset.start);
  let clock = start;
  $$('.plan-row', form).forEach((row) => {
    const box = $('[name="sel"]', row), at = $('[data-at]', row);
    if (box.checked) { at.textContent = clockAt(clock); at.dataset.m = clock; clock += Number(box.dataset.min); }
    else { at.textContent = '—'; at.dataset.m = ''; }
  });
  out.innerHTML = planTotalText(clock - start, $$('[name="sel"]:checked', form).length, Number(out.dataset.budget), start);
});
F['commit-plan'] = async (form) => {
  const D = data(), date = form.dataset.date, pol = Loop.policies(D), old = Loop.day(D, date);
  const doneIds = old ? old.plannedIds.filter((id) => doneOn(D, id, date)) : [];
  const ids = [...doneIds, ...$$('[name="sel"]:checked', form).map((i) => i.value).filter((id) => !doneIds.includes(id))];
  if (!ids.length) throw new Error('Pick at least one task, or add one below.');
  if (pol.cap && ids.length > Number(pol.cap.value)) throw new Error(`Your ${pol.cap.from === 'experiment' ? 'experiment' : 'rule'} says at most ${pol.cap.value} tasks. Untick one, or change the rule in Memory → Rules.`);
  for (const id of ids.filter((i) => !doneIds.includes(i))) {
    const x = get(id), step = String((form.elements['fs_' + id] || {}).value || '').trim();
    if (pol.firstStep && !x.firstStep && !step) throw new Error(`Write a first step for “${x.title}”. Your ${pol.firstStep.from === 'experiment' ? 'experiment' : 'rule'} asks for one.`);
    if (pol.maxSize && Loop.minutes(x, pol) > Number(pol.maxSize.value)) throw new Error(`“${x.title}” is longer than ${fmtMin(pol.maxSize.value)}. Split it, or shrink its estimate, first.`);
  }
  let minutes = 0;
  for (const id of ids) {
    const x = get(id), step = String((form.elements['fs_' + id] || {}).value || '').trim();
    minutes += Loop.minutes(x, pol);
    if (!doneIds.includes(id)) await put({ ...applyTaskPlan(x, { ...x, plannedDate: date }), firstStep: step || x.firstStep || '' });
  }
  for (const x of all('task')) if (x.status === 'open' && x.plannedDate === date && !ids.includes(x.id)) await put({ ...x, plannedDate: '' });
  await put({ ...(old || {}), type: 'day', date, plannedIds: ids, minutes, committedAt: new Date().toISOString(), kept: [], missed: [], extras: [] });
  haptic('success');
  toast(`Plan set: ${plural(ids.length, 'task')}.`);
};

/* The day as departures: what's live, what's next and when it leaves, and how long until each one. */
function todayBoard(D, day, t, hour) {
  const tasks = day.plannedIds.map((id) => D.tasks.find((x) => x.id === id)).filter(Boolean);
  const isDone = (x) => x.status === 'done' && x.doneDate === t;
  const moved = (x) => !isDone(x) && (x.status !== 'open' || x.plannedDate !== t);
  const pol = Loop.policies(D), now = nowMin();
  const live = tasks.find((x) => isLive(x, t));
  const nextTask = live || tasks.find((x) => !isDone(x) && !moved(x));
  const done = tasks.filter(isDone).length;
  let clock = live ? Math.max(now, now - elapsedMin(live) + Loop.minutes(live, pol)) : now;
  const rows = tasks.map((x) => {
    const skip = (x.skips || []).find((s) => s.date === t), m = Loop.minutes(x, pol), L = Lines.forTask(D, x), ch = Brain.chain(D, x);
    const st = isDone(x) ? 'done' : moved(x) ? 'late' : x === live ? 'live' : x === nextTask ? 'next' : 'on';
    let right, at, extra = '';
    if (st === 'live') {
      const el = elapsedMin(x), left = m - el;
      right = left >= 0 ? depTime(bigTime(left, true), `${Math.round(left)} minutes left`) : depTime([`+${Math.round(-left)}`, 'min over'], `${Math.round(-left)} minutes over`, 'over');
      at = `Started ${clockAt(now - el)}`;
      extra = `<span class="dep-progress" style="--p:${Math.min(100, Math.round((el / Math.max(1, m)) * 100))}%" aria-hidden="true"></span>`;
    } else if (st === 'next' || st === 'on') {
      const until = clock - now;
      right = until < 1 ? depTime(['Now', 'ready'], 'ready now') : depTime(bigTime(until), `starts in ${fmtMin(Math.round(until))}`);
      at = clockAt(clock);
      clock += m;
    } else if (st === 'done') { right = depTime(['✓', 'done'], 'done'); at = x.actualMin ? `Took ${fmtMin(x.actualMin)}` : 'Done'; }
    else { right = depTime(['—', 'later'], 'moved'); at = `Not today${skip ? ': ' + esc(SKIP_REASONS[skip.reason]) : ''}`; }
    const tag = st === 'live' ? '<span class="live-tag">Live</span>' : st === 'next' ? '<span class="next-tag">Next</span>' : '';
    return `<button class="dep plan-row tickable ${st}${st === 'done' ? ' done' : ''}${st === 'late' ? ' moved' : ''}${st === 'next' || st === 'live' ? ' is-next' : ''}" data-action="plan-tick" data-id="${x.id}" role="checkbox" aria-checked="${isDone(x)}" ${st === 'late' ? 'disabled' : ''}>
      ${lineBullet(L)}<span class="dep-main">${tag}<span class="item-title">${esc(x.title)}</span>${ch.linked && st !== 'late' ? `<span class="item-meta">${esc(ch.head)}</span>` : ''}<span class="dep-at">${at}</span></span>${right}${extra}</button>`;
  }).join('');
  const left = tasks.filter((x) => !isDone(x) && !moved(x)).length;
  const ctl = nextTask ? `<div class="now-next">
      <div class="task-actions">${live ? `<button class="btn primary" data-action="plan-tick" data-id="${live.id}">${icon('check')}Done</button>` : `<button class="btn primary" data-action="task-start" data-id="${nextTask.id}">Start: ${esc(trunc(nextTask.title, 28))}</button>`}
        <button class="btn" data-action="skip-open" data-id="${nextTask.id}" aria-expanded="${skipOpen === nextTask.id}">Not now</button></div>
      ${nextTask.firstStep ? `<p class="small muted">Start with: ${esc(nextTask.firstStep)}</p>` : ''}
      ${skipOpen === nextTask.id ? `<div class="reasons" role="group" aria-label="Why not now?"><div class="cluster">${Object.entries(SKIP_REASONS).map(([k, l]) => `<button class="chip" data-action="skip" data-id="${nextTask.id}" data-reason="${k}">${esc(l)}</button>`).join('')}</div></div>` : ''}</div>` : '';
  return { cols: ['Departures', 'Time'], html: `<section class="next board"><div class="board-status"><span>${done} of ${tasks.length} done today</span><span>${left ? `${plural(left, 'task')} to go, ${finishText(clock)}` : 'Nothing left to go'}</span></div>
    <div class="plan-list deps">${rows}</div>${ctl}
    <p class="xs muted">Tap a task when it’s done. Start one to see its time count down.</p>
    <div class="task-actions"><button class="btn ${hour >= 17 || !nextTask ? 'primary' : ''}" data-action="close-open" data-date="${t}">Close the day</button><button class="btn ghost" data-action="plan-edit" data-date="${t}">Change plan</button></div></section>` };
}
function closedBoard(D, day) {
  const missed = day.missed || [], reasons = {};
  missed.forEach((m) => (reasons[m.reason] = (reasons[m.reason] || 0) + 1));
  return { cols: ['Today is closed', ''], html: `<section class="next board"><div class="board-msg"><b class="msg-title">Kept ${(day.kept || []).length} of ${day.plannedIds.length}</b>
    <p class="muted">${missed.length ? 'Missed because: ' + Object.entries(reasons).map(([r, n]) => `${esc(SKIP_REASONS[r] || r)}${n > 1 ? ` (${n})` : ''}`).join(', ') + '.' : 'Everything you planned happened.'}${(day.extras || []).length ? ` Also did ${plural(day.extras.length, 'unplanned task')}.` : ''}</p></div></section>` };
}
/* Start makes a task live: its time counts down, and finishing it records how long it really took. */
A['task-start'] = async (el) => {
  const x = get(el.dataset.id), t = today();
  if (!x) return;
  for (const y of all('task')) if (y.id !== x.id && isLive(y, t)) await put({ ...y, startedAt: '', startedDate: '' }); // one live task at a time
  await put({ ...x, startedAt: LB.now().toISOString(), startedDate: t });
  haptic('light');
  toast(`Started “${trunc(x.title, 32)}”.`);
};
A['plan-tick'] = async (el) => {
  const x = get(el.dataset.id), t = today();
  if (!x) return;
  if (x.status === 'done' && x.doneDate === t) await put({ ...x, status: 'open', doneDate: '' });
  else {
    const timed = isLive(x, t) && !(Number(x.actualMin) > 0) ? { actualMin: Math.max(5, round5(elapsedMin(x))) } : {};
    await put({ ...x, ...timed, status: 'done', doneDate: t, outcome: x.outcome || 'as_planned' });
    haptic('success');
  }
};
/* Something you chose to do today joins today's committed plan, so it counts as planned. */
async function addToPlan(id, date) {
  const d = Loop.day(data(), date);
  if (!d || !d.committedAt || d.reviewedAt || d.plannedIds.includes(id)) return null;
  await put({ ...d, plannedIds: [...d.plannedIds, id] });
  return d; // the version before, for Undo
}
A['plan-edit'] = async (el) => {
  const d = Loop.day(data(), el.dataset.date);
  if (!d) return;
  await put({ ...d, committedAt: '' });
  toast('Change the plan, then commit it again.');
};

/* A day you can't recall is marked unknown: it's left out of every rate instead of guessed. */
A['close-skip'] = async (el) => {
  const D = data(), d = Loop.day(D, el.dataset.date), t = today();
  if (!d) return;
  const kept = d.plannedIds.filter((id) => doneOn(D, id, d.date));
  for (const id of d.plannedIds) { const x = get(id); if (x && x.status === 'open' && x.plannedDate <= d.date) await put(applyTaskPlan(x, { ...x, plannedDate: t })); }
  await put({ ...d, reviewedAt: new Date().toISOString(), unknown: true, kept, missed: [] });
  toast('Left out of your patterns. Unfinished tasks moved to today.');
};

/* Close the day: for each planned task, done or not, and why. The whole Reality step. */
A['close-open'] = (el) => openClose(el.dataset.date);
function openClose(date) {
  const D = data(), d = Loop.day(D, date), t = today();
  if (!d) return;
  const tasks = d.plannedIds.map((id) => D.tasks.find((x) => x.id === id)).filter(Boolean);
  const nextDay = date < t ? t : addDays(t, 1);
  const extras = D.tasks.filter((x) => x.status === 'done' && x.doneDate === date && !d.plannedIds.includes(x.id));
  const pol = Loop.policies(D);
  const chip = (name, value, label, checked) => `<label class="choice"><input type="radio" name="${name}" value="${value}" ${checked ? 'checked' : ''}><span>${label}</span></label>`;
  openSheet({ title: `Close ${date === t ? 'today' : fmtDate(date, { weekday: 'long' })}`, body: `<form class="form" data-form="close-day" data-date="${date}">
    <p class="small muted">What actually happened? Reality, not intention. About 30 seconds.</p>
    ${tasks.map((x) => {
      const done = x.status === 'done' && x.doneDate === date, skip = (x.skips || []).find((s) => s.date === date), e = Loop.minutes(x, pol);
      return `<fieldset class="review-row" data-row="${x.id}"><legend class="item-title">${esc(x.title)}</legend>
        <div class="cluster">${chip('st_' + x.id, 'done', 'Done', done)}${chip('st_' + x.id, 'missed', 'Didn’t happen', !done)}</div>
        <div data-when="done" ${done ? '' : 'hidden'}><div class="xs muted" style="margin:6px 0 4px">Took about (optional)</div><div class="cluster">${chip('k_' + x.id, '', 'Skip', true)}${chip('k_' + x.id, '1', fmtMin(e), false)}${chip('k_' + x.id, '1.5', fmtMin(round5(e * 1.5)), false)}${chip('k_' + x.id, '2', fmtMin(round5(e * 2)), false)}</div></div>
        <div data-when="missed" ${done ? 'hidden' : ''}><div class="xs muted" style="margin:6px 0 4px">Why?</div><div class="cluster">${Object.entries(SKIP_REASONS).map(([k, l]) => chip('r_' + x.id, k, esc(l), skip && skip.reason === k)).join('')}</div>
          <div class="xs muted" style="margin:8px 0 4px">Then</div><div class="cluster">${chip('n_' + x.id, 'next', `Move to ${nextDay === t ? 'today' : 'tomorrow'}`, true)}${chip('n_' + x.id, 'drop', 'Let it go', false)}</div></div></fieldset>`;
    }).join('')}
    ${extras.length ? `<p class="small">Also done, not planned: ${extras.map((x) => esc(x.title)).join(', ')}.</p>` : ''}
    ${pol.askEarly ? fieldHTML(['ask', 'Anything to ask someone for, so you’re not blocked tomorrow?', 'text', { max: 200, ph: 'Ask Sam for the data file' }], '') : ''}
    ${fieldHTML(['note', 'One line worth remembering (optional)', 'text', { max: 240, ph: 'Mornings went better without email' }], '')}
    <p class="err" data-form-error></p>
    <div class="form-actions"><button type="button" class="btn" data-action="sheet-close">Later</button><button class="btn primary">Close the day</button></div></form>`,
  onMount(root) {
    root.addEventListener('change', (ev) => {
      if (!ev.target.name || !ev.target.name.startsWith('st_')) return;
      const row = ev.target.closest('.review-row');
      $$('[data-when]', row).forEach((b) => (b.hidden = b.dataset.when !== ev.target.value));
    });
  } });
}
LB.openClose = openClose;
F['close-day'] = async (form, v) => {
  const D = data(), date = form.dataset.date, d = Loop.day(D, date), t = today(), pol = Loop.policies(D);
  if (!d) throw new Error('That day has no plan.');
  const nextDay = date < t ? t : addDays(t, 1);
  const rows = d.plannedIds.map((id) => D.tasks.find((x) => x.id === id)).filter(Boolean);
  for (const x of rows) if (v['st_' + x.id] === 'missed' && !SKIP_REASONS[v['r_' + x.id]]) throw new Error(`Pick why “${x.title}” didn’t happen. One tap.`);
  const kept = [], missed = [];
  for (const x of rows) {
    if (v['st_' + x.id] === 'done') {
      const k = Number(v['k_' + x.id]);
      await put({ ...x, status: 'done', doneDate: x.status === 'done' && x.doneDate ? x.doneDate : date, outcome: x.outcome || 'as_planned', ...(k ? { actualMin: round5(Loop.minutes(x, pol) * k) } : {}) }); // the chips are multiples of the planned time
      kept.push(x.id);
    } else {
      const reason = v['r_' + x.id];
      const skips = (x.skips || []).some((s) => s.date === date) ? (x.skips || []).map((s) => (s.date === date ? { ...s, reason } : s)) : [...(x.skips || []), { date, reason }];
      const base = { ...x, status: 'open', doneDate: '', skips };
      if (v['n_' + x.id] === 'drop' || reason === 'gone') await put({ ...base, status: 'abandoned', statusDate: date, abandonedReason: SKIP_REASONS[reason] });
      else await put(applyTaskPlan(x, { ...base, plannedDate: nextDay }));
      missed.push({ id: x.id, reason });
    }
  }
  const extras = D.tasks.filter((x) => x.status === 'done' && x.doneDate === date && !d.plannedIds.includes(x.id)).map((x) => x.id);
  const note = String(v.note || '').trim(), ask = String(v.ask || '').trim();
  if (ask) await put({ type: 'task', title: 'Ask: ' + ask, status: 'open', priority: '1', estimateMin: 10, plannedDate: nextDay, plans: [nextDay], deferrals: 0, skips: [] });
  if (note) await put({ type: 'memory', kind: 'lesson', title: trunc(note, 90), body: note, date });
  await put({ ...d, reviewedAt: new Date().toISOString(), kept, missed, extras, note });
  closeSheet();
  haptic('success');
  toast(`Closed. Kept ${kept.length} of ${rows.length}.`);
};

/* Weekly review: the gap, the reasons, the running experiment's verdict, and one change to try. */
A['week-open'] = () => openWeek();
function openWeek() {
  const D = data(), t = today(), W = Loop.week(D, t);
  const reasons = Object.entries(W.reasons).sort((a, b) => b[1] - a[1]);
  const maxN = reasons.length ? reasons[0][1] : 1;
  const running = D.experiments.filter((e) => e.status === 'running' && e.policy);
  const sug = running.length ? [] : Loop.suggest(D, t);
  const rules = D.rules.filter((r) => r.active !== false);
  openSheet({ title: 'Weekly review', body: `
    <div class="kpis"><div class="kpi"><b>${W.rate == null ? '—' : pct(W.rate)}</b><span>Plans kept</span></div><div class="kpi"><b>${W.prevRate == null ? '—' : pct(W.prevRate)}</b><span>Week before</span></div><div class="kpi"><b>${W.extras}</b><span>Unplanned done</span></div></div>
    <p class="small muted" style="margin-top:8px">${W.kept} of ${W.planned} planned tasks happened on the day you planned them, over ${plural(W.days, 'closed day')}.</p>
    ${section('Why plans didn’t happen', reasons.length ? `<div class="stack" style="gap:.4rem">${reasons.map(([r, n]) => `<div><div class="split small"><span>${esc(SKIP_REASONS[r] || r)}</span><span class="num muted">${n}</span></div><div class="meter" style="margin-top:4px"><i style="width:${Math.round((n / maxN) * 100)}%"></i></div></div>`).join('')}</div>` : '<div class="empty">No misses recorded this week.</div>')}
    ${running.length ? section('Your experiment', running.map((e) => { const ev = Loop.evaluate(D, e, t); return `<div class="card"><b>${esc(e.title)}</b><p class="small muted" style="margin-top:2px">${esc(Loop.policyLabel(e.policy))}</p><p class="small" style="margin-top:8px">${esc(ev.text)}</p>
        <div class="form-actions">${ev.ready ? `<button class="btn sm" data-action="exp-drop" data-id="${e.id}">Drop it</button><button class="btn sm" data-action="exp-extend" data-id="${e.id}">Another week</button><button class="btn sm primary" data-action="exp-keep" data-id="${e.id}">Keep as a rule</button>` : '<span class="xs muted">Keep going. It changes your plans until it’s judged.</span>'}</div></div>`; }).join(''))
      : section('One change to test next week', sug.length ? `<div class="card"><b>${esc(sug[0].label)}</b><p class="small muted" style="margin-top:4px">${esc(sug[0].because)}</p><p class="small" style="margin-top:8px">Hypothesis: ${esc(sug[0].hypothesis)}</p>
          <p class="xs muted" style="margin-top:6px">For 7 days your plans will follow this. Then it’s compared with the two weeks before.</p>
          <div class="form-actions"><button class="btn sm primary" data-action="exp-policy" data-kind="${sug[0].kind}" data-value="${esc(String(sug[0].value))}">Start this experiment</button></div></div>
          ${sug.slice(1).map((s) => `<div class="item" style="padding-inline:0"><span class="item-main"><span class="item-title">${esc(s.label)}</span><span class="item-meta">${esc(s.because)}</span></span><button class="btn sm" data-action="exp-policy" data-kind="${s.kind}" data-value="${esc(String(s.value))}">Try this</button></div>`).join('')}`
        : '<div class="empty">No clear pattern yet. Keep closing your days; reasons need to repeat before they mean anything.</div>')}
    ${section('Your rules', rules.length ? `<div class="list">${rules.map((r) => `<div class="item"><span class="item-main"><span class="item-title">${esc(r.title)}</span><span class="item-meta">${esc(r.evidence || '')}</span></span></div>`).join('')}</div>` : '<div class="empty">None yet. Experiments that work become rules here, and your plans follow them.</div>')}
    <div class="form-actions section"><button class="btn primary" data-action="week-done">Finish review</button></div>` });
}
LB.openWeek = openWeek;
const recordWeek = async () => { const D = data(), t = today(); if (!D.weeks.some((w) => w.date === t)) await put({ type: 'week', date: t, ...Loop.week(D, t) }); };
A['week-done'] = async () => { await recordWeek(); closeSheet(); toast('Review done. See you next week.'); };
A['exp-policy'] = async (el) => {
  const kind = el.dataset.kind, P = POLICIES[kind], t = today(), D = data();
  if (!P) return;
  const value = el.dataset.value === 'true' ? true : Number(el.dataset.value);
  await put({ type: 'experiment', title: P.name, hypothesis: P.hyp(value), intervention: P.label(value), measurement: 'Share of planned tasks kept, compared with the two weeks before',
    policy: { kind, value }, startDate: t, endDate: addDays(t, 6), status: 'running', observations: [], baseline: Loop.rate(Loop.reviewed(D, addDays(t, -14), addDays(t, -1))) });
  await recordWeek();
  closeSheet();
  toast('Experiment started. Your next plans follow it.');
};
A['exp-keep'] = async (el) => {
  const e = get(el.dataset.id), t = today();
  if (!e) return;
  const ev = Loop.evaluate(data(), e, t), label = Loop.policyLabel(e.policy);
  await put({ type: 'rule', title: label, policy: e.policy, since: t, source: e.id, evidence: ev.text, active: true });
  await put({ ...e, status: 'done', endDate: t, outcome: ev.text, learning: `${label} works for me.`, adaptation: 'Now a standing rule that shapes every plan.' });
  await put({ type: 'memory', kind: 'worked', title: label, body: ev.text, date: t, links: [e.id] });
  toast('Kept. It’s a rule now.');
  el.dataset.from === 'exp' ? closeSheet() : openWeek();
};
A['exp-drop'] = async (el) => {
  const e = get(el.dataset.id), t = today();
  if (!e) return;
  const ev = Loop.evaluate(data(), e, t), label = Loop.policyLabel(e.policy);
  await put({ ...e, status: 'done', endDate: t, outcome: ev.text, learning: `${label} didn’t help.`, adaptation: 'Dropped.' });
  await put({ type: 'memory', kind: 'failed', title: label, body: ev.text, date: t, links: [e.id] });
  toast('Dropped. It’s remembered as tried.');
  el.dataset.from === 'exp' ? closeSheet() : openWeek();
};
A['exp-extend'] = async (el) => {
  const e = get(el.dataset.id), t = today();
  if (!e) return;
  await put({ ...e, endDate: addDays(isYmd(e.endDate) && e.endDate > t ? e.endDate : t, 7) });
  toast('One more week.');
  el.dataset.from === 'exp' ? openExperiment(e.id) : openWeek();
};
A['rule-toggle'] = async (el) => {
  const r = get(el.dataset.id);
  if (!r) return;
  await put({ ...r, active: r.active === false });
  toast(r.active === false ? 'Rule on. Plans follow it again.' : 'Rule paused.');
};
