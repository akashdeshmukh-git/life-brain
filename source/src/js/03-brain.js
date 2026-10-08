/* ===== Local Brain: evidence-based detection over stored data. Pure functions of D. ===== */
const Brain = (LB.Brain = {});
function data() {
  const by = {};
  TYPES.forEach((t) => (by[t] = []));
  for (const r of S.records.values()) if (by[r.type]) by[r.type].push(r);
  return {
    areas: by.area, aims: by.aim, goals: by.goal, projects: by.project, tasks: by.task, habits: by.habit,
    events: by.event, experiments: by.experiment, memories: by.memory, insights: by.insight, profile: S.profile,
    days: by.day, rules: by.rule, weeks: by.week,
  };
}
LB.data = data;
const SEV = { high: 0, medium: 1, low: 2 };
const confLabel = (c) => (c < 0.35 ? 'low' : c < 0.6 ? 'medium' : 'high');
const capConf = (c) => clamp(c, 0.05, 0.85); // never certain

Brain.capMin = (D) => Math.round(clamp(Number(D.profile.capacityHours) || 6, 0.5, 18) * 60);
Brain.evMinutes = (e) => {
  if (e.allDay) return 0;
  const s = toMin(e.start), en = toMin(e.end);
  if (s == null) return 0;
  return en == null || en <= s ? 60 : en - s;
};
/* Tasks with no estimate count as 30 minutes of load. ponytail: flat default, use per-person median once calibration has data. */
const est = (t) => Number(t.estimateMin) > 0 ? Number(t.estimateMin) : 30;
Brain.dayLoad = (D, date, t = today()) => {
  const events = D.events.filter((e) => e.date === date);
  const tasks = date >= t
    ? D.tasks.filter((x) => x.plannedDate === date && (x.status === 'open' || x.doneDate === date))
    : D.tasks.filter((x) => (x.plans || []).includes(date));
  const eventMin = events.reduce((s, e) => s + Brain.evMinutes(e), 0);
  const taskMin = tasks.reduce((s, x) => s + est(x), 0);
  const cap = Brain.capMin(D);
  return { date, events, tasks, eventMin, taskMin, total: eventMin + taskMin, cap, ratio: cap ? (eventMin + taskMin) / cap : 0, unestimated: tasks.filter((x) => !(Number(x.estimateMin) > 0)).length };
};
Brain.overlaps = (events) => {
  const timed = events.filter((e) => !e.allDay && toMin(e.start) != null).map((e) => ({ e, s: toMin(e.start), en: toMin(e.end) > toMin(e.start) ? toMin(e.end) : toMin(e.start) + 60 }));
  const out = [];
  for (let i = 0; i < timed.length; i++) for (let j = i + 1; j < timed.length; j++) {
    const a = timed[i], b = timed[j];
    if (a.e.date === b.e.date && a.s < b.en && b.s < a.en) out.push([a.e, b.e]);
  }
  return out;
};
Brain.calibration = (D) => {
  const done = D.tasks.filter((x) => x.status === 'done' && Number(x.estimateMin) > 0 && Number(x.actualMin) > 0);
  const ratios = done.map((x) => Number(x.actualMin) / Number(x.estimateMin));
  return { n: ratios.length, median: median(ratios), ratios, doneTotal: D.tasks.filter((x) => x.status === 'done').length, tasks: done };
};
/* Plan-keeping per week: each date a task was planned for is one promise; kept if done that day. */
Brain.weekly = (D, t = today(), weeks = 4) => {
  const ws = weekStart(t), out = [];
  for (let w = weeks - 1; w >= 0; w--) {
    const start = addDays(ws, -7 * w), end = addDays(start, 6);
    let planned = 0, kept = 0;
    for (const x of D.tasks) for (const d of x.plans || []) {
      if (d < start || d > end || d > t) continue;
      if (d === t && x.status === 'open') continue; // today is still in play
      planned++;
      if (x.status === 'done' && x.doneDate === d) kept++;
    }
    out.push({ start, planned, kept, rate: planned ? kept / planned : null });
  }
  return out;
};
Brain.goalOf = (D, x) => {
  if (x.goalId) return D.goals.find((g) => g.id === x.goalId) || null;
  const p = x.projectId && D.projects.find((q) => q.id === x.projectId);
  return p && p.goalId ? D.goals.find((g) => g.id === p.goalId) || null : null;
};
/* "Why this matters": walk task → project → goal → aim → area. */
Brain.chain = (D, x) => {
  const p = (x.projectId && D.projects.find((q) => q.id === x.projectId)) || null;
  const g = Brain.goalOf(D, x);
  const aim = (g && g.aimId && D.aims.find((a) => a.id === g.aimId)) || null;
  // A task's line comes from its goal's area; a line picked on the task itself is used when the goal has none.
  const area = (g && D.areas.find((a) => a.id === (g.areaId || (aim && aim.areaId)))) || (x.areaId && D.areas.find((a) => a.id === x.areaId)) || null;
  const areaLabel = area ? `${area.emoji || ''} ${area.name}`.trim() : '';
  // head: the most meaningful "for": goal first, else project. rest: what it ladders up to.
  const headLabel = g ? g.title : p ? p.title : '';
  const rest = [g && p ? p.title : '', aim && aim.title, areaLabel].filter(Boolean);
  return { project: p, goal: g, aim, area, head: headLabel, rest, parts: [p && p.title, g && g.title, aim && aim.title, areaLabel].filter(Boolean), linked: !!(p || g) };
};
Brain.score = (D, x, t = today()) => {
  let s = (4 - (Number(x.priority) || 2)) * 10;
  const g = Brain.goalOf(D, x);
  if (g && g.status === 'active') s += 8;
  if (g && isYmd(g.due)) { const d = daysBetween(t, g.due); if (d >= 0 && d <= 14) s += 6; }
  if (isYmd(x.plannedDate) && x.plannedDate < t) s += Math.min(15, daysBetween(x.plannedDate, t) * 3);
  if (x.plannedDate === t) s += 12;
  s += Math.min(8, (x.deferrals || 0) * 2);
  return s;
};

function delayedHypotheses(D, x, t) {
  let c1 = 0.2, c2 = 0.2, c3 = 0.15;
  const e1 = [], e2 = [], e3 = [];
  if (!x.firstStep) { e1.push('No first step is written down.'); c1 += 0.25; } else { e1.push(`A first step exists ("${trunc(x.firstStep, 60)}"), which weakens this.`); c1 -= 0.1; }
  if (!(Number(x.estimateMin) > 0)) { e1.push('There is no time estimate.'); c1 += 0.1; }
  else if (Number(x.estimateMin) >= 90) { e1.push(`It is estimated at ${fmtMin(x.estimateMin)}, a large block.`); c1 += 0.2; }
  const ch = Brain.chain(D, x);
  if (!ch.linked) { e2.push('It is not linked to any project or goal.'); c2 += 0.25; }
  else if (ch.goal && ch.goal.status !== 'active') { e2.push(`Its goal is marked ${ch.goal.status}.`); c2 += 0.25; }
  else { e2.push('It is linked to an active goal, which weakens this.'); c2 -= 0.05; }
  if (Number(x.priority) >= 3) { e2.push('It is marked low priority.'); c2 += 0.15; }
  const past = (x.plans || []).filter((d) => d < t);
  const heavy = past.filter((d) => Brain.dayLoad(D, d, t).ratio > 1);
  if (past.length) {
    e3.push(`${heavy.length} of the ${plural(past.length, 'day')} it was planned for ${heavy.length === 1 ? 'was' : 'were'} over capacity.`);
    c3 += 0.45 * (heavy.length / past.length);
  } else e3.push('No past planning days are recorded, so this cannot be checked yet.');
  return [
    { label: 'H1', text: 'The task is too big or unclear to start.', evidence: e1, confidence: capConf(c1) },
    { label: 'H2', text: 'It is not actually important right now.', evidence: e2, confidence: capConf(c2) },
    { label: 'H3', text: 'The days it was planned for had no room for it.', evidence: e3, confidence: capConf(c3) },
  ];
}

Brain.analyze = (D, t = today()) => {
  const F = [];
  const add = (f) => F.push(f);
  const open = D.tasks.filter((x) => x.status === 'open');
  const cal = Brain.calibration(D);

  // 1. Tasks without projects or goals
  const orphans = open.filter((x) => !x.projectId && !x.goalId);
  if (orphans.length) add({
    id: 'orphans', kind: 'structure', severity: orphans.length >= 5 ? 'medium' : 'low',
    title: `${plural(orphans.length, 'open task')} ${orphans.length === 1 ? 'is' : 'are'} not connected to a project or goal`,
    summary: 'Unconnected tasks can be fine (errands), but they are easy to keep doing without knowing why.',
    evidence: orphans.slice(0, 5).map((x) => x.title), items: orphans.map((x) => x.id), route: 'life-tasks',
  });
  // 2. Projects without goals
  for (const p of D.projects.filter((p) => p.status === 'active' && !p.goalId)) add({
    id: 'proj-nogoal:' + p.id, kind: 'structure', severity: 'medium',
    title: `Project "${p.title}" has no goal`, summary: 'Without a goal there is no finish line to judge the project against.',
    evidence: [`${plural(open.filter((x) => x.projectId === p.id).length, 'open task')} in it.`], items: [p.id], route: 'life-projects',
  });
  // 3. Goals disconnected from direction
  for (const g of D.goals.filter((g) => g.status === 'active' && !g.aimId && !g.areaId)) add({
    id: 'goal-disc:' + g.id, kind: 'structure', severity: 'medium',
    title: `Goal "${g.title}" is not linked to a life area or long-term aim`,
    summary: 'It may still matter, but nothing records how it serves your direction.', evidence: [], items: [g.id], route: 'life-goals',
  });
  // 3b. Active goals with nothing moving toward them
  for (const g of D.goals.filter((g) => g.status === 'active')) {
    const projIds = D.projects.filter((p) => p.goalId === g.id && p.status === 'active').map((p) => p.id);
    const moving = open.some((x) => x.goalId === g.id || projIds.includes(x.projectId));
    if (!moving) add({
      id: 'goal-idle:' + g.id, kind: 'structure', severity: 'low',
      title: `Nothing is planned toward "${g.title}"`, summary: 'There are no open tasks or active projects for this goal.',
      evidence: [], items: [g.id], route: 'life-goals',
    });
  }
  // 4. Conflicting commitments (next 14 days)
  const soon = D.events.filter((e) => isYmd(e.date) && e.date >= t && e.date <= addDays(t, 14));
  for (const [a, b] of Brain.overlaps(soon)) add({
    id: `conflict:${a.id}:${b.id}`, kind: 'conflict', severity: 'high',
    title: `"${a.title}" overlaps "${b.title}"`, summary: `${fmtDate(a.date)}: ${a.start}–${a.end || '?'} and ${b.start}–${b.end || '?'}.`,
    evidence: [], items: [a.id, b.id], route: 'calendar',
  });
  // 5. Overload in the next 7 days
  const loads = [...Array(7)].map((_, i) => Brain.dayLoad(D, addDays(t, i), t));
  const over = loads.filter((l) => l.ratio > 1), tight = loads.filter((l) => l.ratio > 0.85 && l.ratio <= 1);
  if (over.length || tight.length >= 3) {
    const evShare = over.length ? over.reduce((s, l) => s + l.eventMin, 0) / Math.max(1, over.reduce((s, l) => s + l.total, 0)) : 0;
    const h1e = [], h2e = [], h3e = [];
    let c1 = 0.15, c2 = 0.15, c3 = 0.15;
    if (cal.n >= 3) { h1e.push(`Finished tasks took ${cal.median.toFixed(1)}× their estimate (median of ${cal.n}).`); if (cal.median > 1.2) c1 += 0.4; else { c1 -= 0.05; h1e.push('Estimates are roughly right, which weakens this.'); } }
    else h1e.push(`Only ${plural(cal.n, 'finished task')} ${cal.n === 1 ? 'has' : 'have'} both an estimate and an actual time, too few to judge.`);
    const unest = over.reduce((s, l) => s + l.unestimated, 0);
    if (unest) { h1e.push(`${plural(unest, 'planned task')} on those days ${unest === 1 ? 'has' : 'have'} no estimate (counted as 30m).`); c1 += 0.05; }
    h2e.push(`Calendar events are ${pct(evShare)} of the load on the overloaded days.`);
    if (evShare > 0.5) c2 += 0.35;
    const planOnBusy = over.filter((l) => l.eventMin > l.cap * 0.5 && l.taskMin > 0).length;
    h3e.push(`${plural(planOnBusy, 'overloaded day')} had tasks planned on top of a calendar more than half full.`);
    if (planOnBusy) c3 += 0.3;
    add({
      id: 'overload:' + weekStart(t), kind: 'overload', severity: over.length ? 'high' : 'medium',
      title: over.length ? `${plural(over.length, 'day')} in the next week ${over.length === 1 ? 'is' : 'are'} over capacity` : 'The next week is running close to capacity',
      summary: `Capacity is set to ${fmtMin(Brain.capMin(D))} a day. Sustainable planning stays under about 80%.`,
      evidence: [...over, ...tight].sort((a, b) => a.date.localeCompare(b.date)).map((l) => `${fmtDate(l.date)}: ${fmtMin(l.total)} planned (${pct(l.ratio)})`),
      items: [], route: 'calendar',
      hypotheses: [
        { label: 'H1', text: 'Estimates are too optimistic, so plans look lighter than they are.', evidence: h1e, confidence: capConf(c1) },
        { label: 'H2', text: 'Too many commitments with other people were accepted.', evidence: h2e, confidence: capConf(c2) },
        { label: 'H3', text: 'Tasks are planned without checking the calendar first.', evidence: h3e, confidence: capConf(c3) },
      ],
      wouldChange: ['Recording actual times on the next few tasks would test H1.', 'If moving one meeting frees the day and tasks still slip, H2 weakens.', 'Planning only after looking at the calendar for a week tests H3.'],
      suggest: { title: 'Plan to 80% of capacity', hypothesis: 'If I plan no more than 80% of my daily capacity, I will finish more of what I plan.', intervention: `For 7 days, stop adding tasks once a day reaches ${fmtMin(Math.round(Brain.capMin(D) * 0.8))}.`, measurement: 'Share of planned tasks done on the planned day (Home → Trajectory).' },
    });
  }
  // 6. Repeatedly delayed tasks
  for (const x of open.filter((x) => (x.deferrals || 0) >= 3).sort((a, b) => b.deferrals - a.deferrals).slice(0, 5)) add({
    id: 'delayed:' + x.id, kind: 'delay', severity: x.deferrals >= 5 ? 'high' : 'medium',
    title: `"${x.title}" has been moved ${x.deferrals} times`, summary: 'A task that keeps moving is telling you something. Here are three competing explanations.',
    evidence: [`Planned for: ${(x.plans || []).map((d) => fmtDate(d, { month: 'short', day: 'numeric' })).join(', ') || 'no dates recorded'}`], items: [x.id], route: 'today',
    hypotheses: delayedHypotheses(D, x, t),
    wouldChange: ['If you write a 10-minute first step and it still slips, H1 weakens.', 'If dropping it costs nothing after a week, H2 was right.', 'Placing it on a light day tests H3.'],
    suggest: { title: `Unstick "${trunc(x.title, 40)}"`, hypothesis: 'If the first step is tiny and the day has room, I will start this task.', intervention: 'Write a 10-minute first step and plan it on a day under 80% load.', measurement: 'Did I start it on the planned day? (yes/no)' },
  });
  // 6b. Abandoned tasks clustering in one project
  const recentAb = D.tasks.filter((x) => x.status === 'abandoned' && isYmd(x.statusDate) && daysBetween(x.statusDate, t) <= 30);
  const byProj = {};
  recentAb.forEach((x) => { if (x.projectId) byProj[x.projectId] = (byProj[x.projectId] || 0) + 1; });
  for (const [pid, n] of Object.entries(byProj)) if (n >= 3) {
    const p = D.projects.find((q) => q.id === pid);
    add({ id: 'abandon:' + pid, kind: 'delay', severity: 'medium', title: `${n} tasks in "${p ? p.title : 'a project'}" were abandoned this month`, summary: 'Repeated abandoning can mean the plan for this project no longer fits.', evidence: recentAb.filter((x) => x.projectId === pid).map((x) => `${x.title}${x.abandonedReason ? ': ' + x.abandonedReason : ''}`), items: [pid], route: 'life-projects' });
  }
  // 7. Estimated vs actual duration
  if (cal.n >= 3 && (cal.median > 1.3 || cal.median < 0.7)) {
    const slow = cal.median > 1;
    const projMed = {};
    cal.tasks.forEach((x) => { const k = x.projectId || '_none'; (projMed[k] = projMed[k] || []).push(Number(x.actualMin) / Number(x.estimateMin)); });
    const worst = Object.entries(projMed).filter(([, r]) => r.length >= 2).map(([k, r]) => [k, median(r)]).sort((a, b) => b[1] - a[1])[0];
    const roundEst = cal.tasks.filter((x) => Number(x.actualMin) % 15 === 0).length / cal.n;
    add({
      id: 'calibration', kind: 'calibration', severity: 'medium',
      title: slow ? `Tasks take ${cal.median.toFixed(1)}× longer than planned` : `Tasks take ${pct(cal.median)} of the planned time`,
      summary: `Median across ${plural(cal.n, 'finished task')} with both an estimate and an actual time.`,
      evidence: cal.tasks.slice(-5).map((x) => `${x.title}: planned ${fmtMin(x.estimateMin)}, took ${fmtMin(x.actualMin)}`), items: [],
      hypotheses: [
        { label: 'H1', text: slow ? 'Estimates leave out setup, switching and interruptions.' : 'Estimates include generous padding.', evidence: [`The pattern holds across ${plural(Object.keys(projMed).length, 'project group')}.`], confidence: capConf(0.3 + Math.min(0.3, cal.n * 0.04)) },
        { label: 'H2', text: 'One kind of work is mis-estimated and pulls the median.', evidence: worst ? [`Tasks in ${worst[0] === '_none' ? 'no project' : `"${(D.projects.find((p) => p.id === worst[0]) || {}).title || 'a project'}"`} run ${worst[1].toFixed(1)}×.`] : ['Not enough tasks per project to compare.'], confidence: capConf(worst && Math.abs(worst[1] - cal.median) > 0.3 ? 0.45 : 0.2) },
        { label: 'H3', text: 'Actual times are recorded roughly, so the gap is partly noise.', evidence: [`${pct(roundEst)} of actual times are round quarter-hours.`, cal.n < 8 ? `Only ${cal.n} data points.` : `${cal.n} data points.`], confidence: capConf(0.15 + (roundEst > 0.8 ? 0.2 : 0) + (cal.n < 8 ? 0.15 : 0)) },
      ],
      wouldChange: ['Ten more tasks with honest actual times would settle H3.', 'If multiplying estimates by the median makes days land on time, H1 holds.'],
      suggest: { title: 'Calibrated estimates', hypothesis: `If I multiply my estimates by ${cal.median.toFixed(1)}, my days will end closer to plan.`, intervention: `For two weeks, multiply each new estimate by ${cal.median.toFixed(1)}.`, measurement: 'Share of planned tasks done on the planned day.' },
    });
  } else if (cal.doneTotal >= 4 && cal.n < 3) add({
    id: 'missing-actuals', kind: 'evidence', severity: 'low', uncertain: true,
    title: 'Not enough reality data to check your estimates',
    summary: `${plural(cal.doneTotal, 'task')} finished, but only ${cal.n} ${cal.n === 1 ? 'has' : 'have'} both an estimate and an actual time.`,
    evidence: ['When finishing a task, enter how long it really took.'], items: [], route: 'today',
  });
  // 8. Plans that repeatedly fail
  const wk = Brain.weekly(D, t, 3).slice(-2);
  const planned = wk.reduce((s, w) => s + w.planned, 0), kept = wk.reduce((s, w) => s + w.kept, 0);
  if (planned >= 5 && kept / planned < 0.5) {
    const abandoned = D.tasks.filter((x) => ['abandoned', 'skipped'].includes(x.status) && isYmd(x.statusDate) && daysBetween(x.statusDate, t) <= 14).length;
    const farAhead = D.tasks.filter((x) => (x.plans || []).length && isYmd(x.createdAt?.slice(0, 10)) && daysBetween(x.createdAt.slice(0, 10), x.plans[0]) > 3).length;
    const pastLoads = [...Array(14)].map((_, i) => Brain.dayLoad(D, addDays(t, -14 + i), t)).filter((l) => l.total > 0);
    const avgRatio = pastLoads.length ? pastLoads.reduce((s, l) => s + l.ratio, 0) / pastLoads.length : 0;
    add({
      id: 'failing-plans:' + weekStart(t), kind: 'plans', severity: 'high',
      title: `Only ${pct(kept / planned)} of planned tasks were done on the planned day`,
      summary: `Over the last two weeks: ${kept} kept out of ${planned} planned.`, evidence: wk.map((w) => `Week of ${fmtDate(w.start, { month: 'short', day: 'numeric' })}: ${w.kept}/${w.planned}`), items: [], route: 'today',
      hypotheses: [
        { label: 'H1', text: 'Days are planned beyond capacity.', evidence: [pastLoads.length ? `Average planned load was ${pct(avgRatio)} of capacity.` : 'No load data for past days.'], confidence: capConf(0.15 + (avgRatio > 1 ? 0.45 : avgRatio > 0.85 ? 0.25 : 0)) },
        { label: 'H2', text: 'Plans are made too far ahead and not revisited.', evidence: [`${plural(farAhead, 'task')} were planned more than 3 days after being created.`], confidence: capConf(0.15 + Math.min(0.35, farAhead * 0.07)) },
        { label: 'H3', text: 'Priorities shift during the week.', evidence: [`${plural(abandoned, 'task')} skipped or abandoned in the last two weeks.`], confidence: capConf(0.15 + Math.min(0.4, abandoned * 0.1)) },
      ],
      wouldChange: ['A week of planning only three must-dos per day tests H1.', 'Planning each evening for the next day only tests H2.'],
      suggest: { title: 'Three must-dos', hypothesis: 'If I plan only three must-do tasks per day, I will keep most of my plans.', intervention: 'For 7 days, plan at most three tasks per day; everything else stays unplanned.', measurement: 'Plans kept per day (0–3).' },
    });
  }
  // 9. Missing evidence in experiments
  for (const e of D.experiments.filter((e) => e.status === 'running')) {
    const obs = (e.observations || []).map((o) => o.date).filter(isYmd).sort();
    const last = obs[obs.length - 1] || (isYmd(e.startDate) ? e.startDate : null);
    if (last && daysBetween(last, t) >= 3) add({
      id: `exp-noevidence:${e.id}:${last}`, kind: 'evidence', severity: 'medium', uncertain: true,
      title: `Experiment "${e.title}" has no observations for ${plural(daysBetween(last, t), 'day')}`,
      summary: 'Without observations, the experiment cannot tell you anything.', evidence: [`${plural(obs.length, 'observation')} so far.`], items: [e.id], route: 'experiments',
    });
    if (isYmd(e.endDate) && e.endDate < t) add({
      id: 'exp-due:' + e.id, kind: 'evidence', severity: 'low', title: `Experiment "${e.title}" passed its end date`,
      summary: 'Record the outcome and what you learned, or extend it.', evidence: [], items: [e.id], route: 'experiments',
    });
  }
  // 10. Stalled projects
  for (const p of D.projects.filter((p) => p.status === 'active')) {
    const ts = D.tasks.filter((x) => x.projectId === p.id);
    const lastDone = ts.filter((x) => x.status === 'done' && isYmd(x.doneDate)).map((x) => x.doneDate).sort().pop();
    const created = (p.createdAt || '').slice(0, 10);
    const ref = lastDone || (isYmd(created) ? created : null);
    if (ref && daysBetween(ref, t) >= 14 && !ts.some((x) => x.status === 'open')) add({
      id: 'stalled:' + p.id, kind: 'structure', severity: 'low', title: `Project "${p.title}" has stalled`,
      summary: lastDone ? `Nothing finished since ${fmtDate(lastDone)} and no open tasks.` : 'No tasks yet, and it was created two weeks ago or more.', evidence: [], items: [p.id], route: 'life-projects',
    });
  }
  // 11. Habits slipping
  for (const h of D.habits) {
    const target = clamp(Number(h.perWeek) || 7, 1, 7);
    const days = [...Array(14)].map((_, i) => addDays(t, -13 + i));
    const done = days.filter((d) => h.log && h.log[d]).length;
    const createdDays = isYmd((h.createdAt || '').slice(0, 10)) ? daysBetween(h.createdAt.slice(0, 10), t) : 99;
    if (createdDays >= 7 && done < target * 2 * 0.5) add({
      id: 'habit-slip:' + h.id + ':' + weekStart(t), kind: 'habit', severity: 'low',
      title: `${h.emoji || ''} ${h.title}: ${done} of ${target * 2} in two weeks`.trim(), summary: 'Below half the target. The target may be too high, or the habit needs a better cue.', evidence: [], items: [h.id], route: 'life-habits',
    });
  }
  return F.sort((a, b) => SEV[a.severity] - SEV[b.severity]);
};

/* What the user decided about each finding. */
Brain.verdict = (D, fid) => D.insights.find((i) => i.findingId === fid) || null;
Brain.active = (D, t) => Brain.analyze(D, t).filter((f) => { const v = Brain.verdict(D, f.id); return !v || v.status !== 'rejected'; });

/* Local retrieval: what your own records say about a question. */
Brain.recall = (D, q, limit = 6) => {
  const words = String(q || '').toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) || [];
  if (!words.length) return [];
  const stop = new Set(['the', 'and', 'for', 'should', 'with', 'what', 'that', 'this', 'have', 'from', 'how', 'why', 'can', 'not', 'are', 'was', 'you', 'your']);
  const keys = [...new Set(words.filter((w) => !stop.has(w)))];
  const pool = [
    ...D.memories.map((m) => ({ r: m, text: `${m.title} ${m.body || ''} ${m.why || ''}`, label: MEM_KINDS[m.kind] || 'Note' })),
    ...D.experiments.map((e) => ({ r: e, text: `${e.title} ${e.hypothesis || ''} ${e.outcome || ''} ${e.learning || ''}`, label: 'Experiment' })),
    ...D.tasks.filter((x) => x.outcomeNote).map((x) => ({ r: x, text: `${x.title} ${x.outcomeNote}`, label: 'Task outcome' })),
  ];
  return pool.map((p) => {
    const tx = p.text.toLowerCase();
    return { ...p, score: keys.reduce((s, k) => s + (tx.includes(k) ? 1 : 0), 0) };
  }).filter((p) => p.score > 0).sort((a, b) => b.score - a.score).slice(0, limit);
};
const MEM_KINDS = { tried: 'What I tried', worked: 'What worked', failed: 'What failed', decision: 'Decision', lesson: 'Lesson', pattern: 'Recurring pattern' };

/* Decision matrix: weighted scores, ranking, and the smallest weight change that would flip the winner. */
Brain.decide = (options, criteria, scores) => {
  const total = (o, ws) => criteria.reduce((s, c, ci) => s + (ws[ci] || 0) * (Number(scores[o]?.[ci]) || 0), 0);
  const weights = criteria.map((c) => Number(c.weight) || 1);
  const ranked = options.map((o, oi) => ({ option: o, index: oi, total: total(oi, weights) })).sort((a, b) => b.total - a.total);
  let flip = null;
  if (ranked.length > 1) {
    for (let ci = 0; ci < criteria.length && !flip; ci++) for (const d of [1, -1, 2, -2]) {
      const w = weights.slice(); w[ci] = clamp(w[ci] + d, 0, 5);
      if (w[ci] === weights[ci]) continue;
      const best = options.map((o, oi) => [oi, total(oi, w)]).sort((a, b) => b[1] - a[1])[0];
      if (best[0] !== ranked[0].index && best[1] > total(ranked[0].index, w)) { flip = { criterion: criteria[ci].name, from: weights[ci], to: w[ci], winner: options[best[0]] }; break; }
    }
  }
  return { ranked, flip, margin: ranked.length > 1 ? ranked[0].total - ranked[1].total : null };
};

/* ===== What to do next, and what you're not seeing ===== */
const SKIP_REASONS = { time: 'No time today', unclear: 'Not clear what to do', mood: 'Don’t feel like it', waiting: 'Waiting on something', gone: 'Doesn’t matter anymore' };
LB.SKIP_REASONS = SKIP_REASONS;
const areaOf = (D, x) => Brain.chain(D, x).area;
const putOffCount = (x) => Math.max(x.deferrals || 0, (x.skips || []).length);

/* One recommendation with the reasons behind it, in plain words. */
/* Every open, non-snoozed task, scored and explained. Shared by the recommendation and the planner. */
Brain.ranked = (D, t = today()) => {
  const open = D.tasks.filter((x) => x.status === 'open' && !(isYmd(x.snoozedUntil) && x.snoozedUntil > t));
  const topValue = String((D.profile.values || [])[0] || '').toLowerCase();
  const L = Brain.dayLoad(D, t, t);
  return open.map((x) => {
    const r = [];
    let s = Brain.score(D, x, t);
    const ch = Brain.chain(D, x), g = ch.goal, est = Number(x.estimateMin) || 0;
    if (x.pinned === t) { s += 100; r.push([20, 'You chose it for now']); }
    if (x.plannedDate === t) r.push([12, 'You planned it for today']);
    if (isYmd(x.plannedDate) && x.plannedDate < t) r.push([10, `It was meant for ${fmtDate(x.plannedDate, { weekday: 'long' })} and slipped`]);
    if (g && isYmd(g.due)) { const dd = daysBetween(t, g.due); if (dd >= 0 && dd <= 14) r.push([9, `“${g.title}” is due in ${plural(dd, 'day')}`]); }
    if (ch.area && topValue && ch.area.name.toLowerCase() === topValue) { s += 6; r.push([8, `It serves ${ch.area.name}, your top value`]); }
    if (putOffCount(x) >= 3) r.push([7, `You’ve put it off ${putOffCount(x)} times; finishing it ends the drag`]);
    if (est > 0 && est <= 20) { s += L.ratio > 0.85 ? 6 : 2; r.push([L.ratio > 0.85 ? 8 : 4, `It takes only ${fmtMin(est)}${L.ratio > 0.85 ? ', and today is already full' : ''}`]); }
    if (Number(x.priority) === 1) r.push([6, 'You marked it high priority']);
    if (!ch.linked) s -= 3;
    if ((x.skips || []).some((k) => k.date === t)) s -= 40; // you already said "not now" today
    return { x, s, why: r.sort((a, b) => b[0] - a[0]).map((p) => p[1]) };
  }).sort((a, b) => b.s - a.s);
};
Brain.next = (D, t = today()) => {
  const scored = Brain.ranked(D, t);
  if (!scored.length) return null;
  const top = scored[0], x = top.x;
  const unclear = (x.skips || []).filter((k) => k.reason === 'unclear').length;
  const rest = scored.slice(1, 4).map((p) => p.x);
  // A task that keeps slipping and has no first step isn't the real next action. Defining it is.
  if (!x.firstStep && x.pinned !== t && (unclear >= 2 || (putOffCount(x) >= 3 && !(Number(x.estimateMin) > 0 && Number(x.estimateMin) <= 30)))) {
    return { kind: 'define', task: x, title: `Decide the first step for “${x.title}”`, minutes: 2, rest,
      why: [unclear >= 2 ? `You skipped it ${unclear} times because it wasn’t clear what to do` : `It has slipped ${putOffCount(x)} times and has no first step`, 'Two minutes now makes it something you can start'] };
  }
  return { kind: 'task', task: x, title: x.title, minutes: Number(x.estimateMin) || null, rest, why: top.why.slice(0, 2).length ? top.why.slice(0, 2) : ['It’s the most useful open task right now'] };
};

/* Blind spots: things your own records show that are easy to miss or ignore. Each comes with one action. */
Brain.blindSpots = (D, t = today()) => {
  const out = [], since = addDays(t, -14);
  const doneRecent = D.tasks.filter((x) => x.status === 'done' && isYmd(x.doneDate) && x.doneDate >= since);
  // 1. Values you say matter that nothing serves
  (D.profile.values || []).slice(0, 4).forEach((v, i) => {
    const area = D.areas.find((a) => a.name.trim().toLowerCase() === String(v).trim().toLowerCase());
    if (!area) return;
    const goals = D.goals.filter((g) => g.status === 'active' && (g.areaId === area.id || D.aims.some((a) => a.id === g.aimId && a.areaId === area.id)));
    const served = doneRecent.filter((x) => (areaOf(D, x) || {}).id === area.id).length;
    const habitDays = D.habits.filter((h) => h.areaId === area.id).reduce((s, h) => s + Object.keys(h.log || {}).filter((d) => d >= since && d <= t).length, 0);
    if (served || habitDays) return;
    out.push({ id: `neglect:${area.id}:${weekStart(t)}`, weight: 10 - i, kind: 'neglect',
      title: goals.length ? `${v} is #${i + 1} on your list, but nothing you did in two weeks served it` : `You rank ${v} #${i + 1}, but nothing in your plans is for it`,
      evidence: goals.length ? `${plural(goals.length, 'goal')} in ${area.name}. Tasks finished for it: 0. Habit days: 0.` : `No goals, tasks or habits are linked to ${area.name}.`,
      action: { label: goals.length ? 'Add one small step' : 'Set a goal for it', act: goals.length ? 'add-step' : 'add-goal', area: area.id, goal: (goals[0] || {}).id || '' } });
  });
  // 2. Tasks you keep avoiding, and the reason you give
  const FIX = { unclear: ['Write the first step', 'define'], time: ['Make it a 15-minute task', 'shrink'], mood: ['Do 5 minutes of it today', 'five'], waiting: ['Note what you’re waiting for', 'waiting'], gone: ['Let it go', 'drop'] };
  D.tasks.filter((x) => x.status === 'open' && putOffCount(x) >= 3).sort((a, b) => putOffCount(b) - putOffCount(a)).slice(0, 2).forEach((x) => {
    const counts = {};
    (x.skips || []).forEach((k) => (counts[k.reason] = (counts[k.reason] || 0) + 1));
    const [reason, n] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] || [];
    const fix = FIX[reason] || (x.firstStep ? FIX.mood : FIX.unclear);
    out.push({ id: `avoid:${x.id}:${putOffCount(x)}`, weight: 9, kind: 'avoid', title: `You keep putting off “${x.title}”`,
      evidence: reason ? `Put off ${putOffCount(x)} times. The reason you give most: “${SKIP_REASONS[reason]}” (${n}×).` : `Moved ${putOffCount(x)} times, no reason recorded.`,
      action: { label: fix[0], act: fix[1], task: x.id } });
  });
  // 3. Plans you don't keep. Closed days are the best evidence; task history is the fallback.
  const closed = Loop.rate(Loop.reviewed(D, since, t));
  const wk = Brain.weekly(D, t, 2);
  const [planned, kept, src] = closed.days >= 3 ? [closed.planned, closed.kept, `over ${plural(closed.days, 'closed day')}`] : [wk.reduce((s, w) => s + w.planned, 0), wk.reduce((s, w) => s + w.kept, 0), 'over two weeks'];
  if (planned >= 5 && kept / planned < 0.6) out.push({ id: 'overplan:' + weekStart(t), weight: 8, kind: 'overplan',
    title: `You finish about ${pct(kept / planned)} of what you plan for a day`, evidence: `${kept} of ${planned} planned tasks were done on the day, ${src}. Plans you can keep are more useful than plans you can’t.`,
    action: closed.days >= 3 ? { label: 'See why', act: 'week' } : { label: 'See what’s planned today', act: 'go-tasks' } });
  // 4. Time optimism, unless a rule already corrects for it
  const cal = Brain.calibration(D), estRule = Loop.policies(D, t).estimate, k = estRule ? Number(estRule.value) || 1 : 1;
  if (cal.n >= 3 && cal.median > 1.3 * k) out.push({ id: 'optimism:' + weekStart(t), weight: 7, kind: 'optimism',
    title: k > 1 ? `Even with your × ${k} rule, things take longer: ${cal.median.toFixed(1)}× your estimate` : `Things take you ${cal.median.toFixed(1)}× longer than you expect`,
    evidence: `Median across ${plural(cal.n, 'finished task')} with planned and real times.`,
    action: { label: 'Show the evidence', act: 'finding', finding: 'calibration' } });
  // 5. Goals that stopped moving
  for (const g of D.goals.filter((g) => g.status === 'active')) {
    const ids = new Set([g.id, ...D.projects.filter((p) => p.goalId === g.id).map((p) => p.id)]);
    const ts = D.tasks.filter((x) => ids.has(x.goalId) || ids.has(x.projectId));
    const last = ts.filter((x) => x.status === 'done' && isYmd(x.doneDate)).map((x) => x.doneDate).sort().pop();
    const created = (g.createdAt || '').slice(0, 10);
    const ref = last || (isYmd(created) ? created : null);
    if (ref && daysBetween(ref, t) >= 21) out.push({ id: `stale:${g.id}:${weekStart(t)}`, weight: 6, kind: 'stale',
      title: `“${g.title}” hasn’t moved in ${Math.floor(daysBetween(ref, t) / 7)} weeks`, evidence: last ? `Last task finished ${fmtDate(last)}.` : 'Nothing has been done toward it yet.',
      action: { label: 'Still want it?', act: 'goal-check', goal: g.id } });
  }
  return out.sort((a, b) => b.weight - a.weight);
};
