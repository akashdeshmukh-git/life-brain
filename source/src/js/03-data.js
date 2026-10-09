/* ===== The data, in the shapes the screens need ===== */
const byTitle = (a, b) => String(a.title || '').localeCompare(String(b.title || ''));
const byCreated = (a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''));
function data() {
  return {
    tasks: all('task'), events: all('event'), notes: all('note'), habits: all('habit').filter((h) => !h.archived), goals: all('goal'),
  };
}
LB.data = data;

/* Tasks */
const isOverdue = (x, t = today()) => !x.done && isYmd(x.date) && x.date < t;
const tasksOn = (D, date) => D.tasks.filter((x) => x.date === date || (x.done && x.doneDate === date && !x.date)).sort(byCreated);
const doneOn = (D, date) => D.tasks.filter((x) => x.done && x.doneDate === date);
const eventsOn = (D, date) => D.events.filter((e) => e.date === date).sort((a, b) => (a.time || '').localeCompare(b.time || '') || byTitle(a, b));

/* Notes written on a given day (by when they were first saved) */
/* A note belongs to the day you pick for it; older notes fall back to the (local) day they were written. */
const noteDay = (n) => (isYmd(n.date) ? n.date : n.createdAt && !Number.isNaN(Date.parse(n.createdAt)) ? ymd(new Date(n.createdAt)) : '');
const notesOn = (D, date) => D.notes.filter((n) => noteDay(n) === date);

/* Habits */
const habitDone = (h, date) => !!(h.log && h.log[date]);
function habitStreak(h, t = today()) {
  let d = habitDone(h, t) ? t : addDays(t, -1), n = 0;
  while (habitDone(h, d)) { n++; d = addDays(d, -1); }
  return n;
}
const habitCount = (h, from, to) => Object.keys(h.log || {}).filter((d) => h.log[d] && d >= from && d <= to).length;

/* Goals: a number you're counting toward, like 12 books */
const goalNow = (g) => Object.values(g.log || {}).reduce((a, b) => a + (Number(b) || 0), 0);
const goalIsNumber = (g) => Number(g.target) > 0;
const goalDone = (g) => (goalIsNumber(g) ? goalNow(g) >= Number(g.target) : !!g.done);
const goalSteps = (D, g) => D.tasks.filter((x) => x.goalId === g.id);
const goalHabits = (D, g) => D.habits.filter((h) => h.goalId === g.id);
const goalPct = (g, D = data()) => {
  if (goalIsNumber(g)) return clamp(goalNow(g) / Number(g.target), 0, 1);
  if (g.done) return 1;
  const st = goalSteps(D, g);
  return st.length ? st.filter((x) => x.done).length / st.length : 0;
};
const activeGoals = (D) => D.goals.filter((g) => !goalDone(g));
const localDay = (iso) => (iso && !Number.isNaN(Date.parse(iso)) ? ymd(new Date(iso)) : '');

/* ---- Where a goal stands: last time anything moved it, and whether the current pace makes the deadline. ---- */
function goalStatus(D, g, t = today()) {
  const steps = goalSteps(D, g), habits = goalHabits(D, g), from = addDays(t, -27);
  const dates = [...steps.filter((x) => x.done && x.doneDate).map((x) => x.doneDate), ...habits.flatMap((h) => Object.keys(h.log || {})), ...Object.keys(g.log || {}).filter((d) => Number(g.log[d]) > 0)].filter((d) => d <= t).sort();
  const last = dates[dates.length - 1] || '', born = localDay(g.createdAt) || t;
  const idle = daysBetween(last || born, t);
  const open = steps.filter((x) => !x.done), doneRecent = steps.filter((x) => x.done && x.doneDate >= from && x.doneDate <= t).length;
  const daysLeft = g.by ? daysBetween(t, g.by) : null;
  let eta = '', rate = 0, remaining = 0;
  if (goalIsNumber(g)) {
    remaining = Number(g.target) - goalNow(g);
    rate = Object.entries(g.log || {}).filter(([d]) => d >= from && d <= t).reduce((a, [, v]) => a + (Number(v) || 0), 0) / 28;
  } else { remaining = open.length; rate = doneRecent / 28; }
  if (remaining > 0 && rate > 0) eta = addDays(t, Math.ceil(remaining / rate));
  const perWeekNeed = daysLeft && daysLeft > 0 && remaining > 0 ? Math.ceil((remaining / daysLeft) * 7) : 0, perWeekNow = Math.round(rate * 7 * 10) / 10;
  let state = 'on-track';
  if (goalDone(g)) state = 'done';
  else if (!goalIsNumber(g) && !open.length) state = 'no-steps';
  else if (idle >= 10 && (last || daysBetween(born, t) >= 10)) state = 'stalled';
  else if (g.by && ((eta && eta > g.by) || (daysLeft != null && daysLeft < 0))) state = 'behind';
  else if (!last) state = 'new';
  return { state, last, idle, open, steps, habits, eta, daysLeft, remaining, perWeekNeed, perWeekNow };
}
const GOAL_WORDS = { done: 'Done', 'no-steps': 'Needs a next step', stalled: 'Stalled', behind: 'Behind', new: 'Just started', 'on-track': 'On track' };

/* ---- Where your effort went: finished tasks in the last 4 weeks, by goal ---- */
function direction(D, t = today()) {
  const from = addDays(t, -27), done = D.tasks.filter((x) => x.done && isYmd(x.doneDate) && x.doneDate >= from && x.doneDate <= t);
  const ids = new Set(D.goals.map((g) => g.id)), by = {};
  let none = 0;
  for (const x of done) { if (x.goalId && ids.has(x.goalId)) by[x.goalId] = (by[x.goalId] || 0) + 1; else none++; }
  const parts = D.goals.map((g) => ({ g, n: by[g.id] || 0 })).filter((p) => p.n || !goalDone(p.g)).sort((a, b) => b.n - a.n);
  return { total: done.length, parts, none };
}
function headingLine(D, t = today()) {
  const dir = direction(D, t), st = activeGoals(D).map((g) => ({ g, s: goalStatus(D, g, t) }));
  const behind = st.find((x) => x.s.state === 'behind');
  if (behind) return behind.s.eta ? `At this pace “${behind.g.title}” lands ${fmtDate(behind.s.eta, { month: 'short', day: 'numeric' })}, after your ${fmtDate(behind.g.by, { month: 'short', day: 'numeric' })} deadline.` : `“${behind.g.title}” is past its deadline.`;
  const stalled = st.filter((x) => x.s.state === 'stalled').sort((a, b) => b.s.idle - a.s.idle)[0];
  if (stalled) return `“${stalled.g.title}” hasn’t moved in ${stalled.s.idle} days.`;
  if (dir.total >= 4 && dir.none / dir.total >= 0.6) return `${Math.round((dir.none / dir.total) * 100)}% of what you finished in 4 weeks wasn’t toward any goal.`;
  const empty = st.find((x) => x.s.state === 'no-steps');
  if (empty) return `“${empty.g.title}” has no next step yet.`;
  const top = dir.parts[0];
  if (top && top.n) return `Most of your effort went to “${top.g.title}”, and nothing is off track.`;
  return dir.total ? 'Nothing you finished lately was tied to a goal yet.' : 'Tick tasks off as you go, and this shows where your effort really goes.';
}

/* ---- Patterns: what your own records show that's easy to miss. Plain sentences, only with enough data. ---- */
function patterns(D = data(), t = today()) {
  const out = [];
  // 2. A habit that slipped this week
  for (const h of D.habits) {
    const before = habitCount(h, addDays(t, -13), addDays(t, -7)), now = habitCount(h, addDays(t, -6), t);
    if (before >= 4 && now <= before - 3) out.push({ id: 'slip-' + h.id, text: `“${h.title}” slipped: ${plural(now, 'day')} this week, down from ${before}.` });
  }
  // 3. A task that keeps getting pushed
  const pushed = D.tasks.filter((x) => !x.done && (x.moved || 0) >= 3).sort((a, b) => b.moved - a.moved)[0];
  if (pushed) out.push({ id: 'moved-' + pushed.id, text: `“${pushed.title}” has been moved ${pushed.moved} times. Make it smaller, or let it go?` });
  // 4. Which weekday you get things done
  const from = addDays(t, -56), done = D.tasks.filter((x) => x.done && isYmd(x.doneDate) && x.doneDate >= from && x.doneDate <= t);
  if (done.length >= 15) {
    const first = done.reduce((m, x) => (x.doneDate < m ? x.doneDate : m), t);
    const per = [0, 0, 0, 0, 0, 0, 0], days = [0, 0, 0, 0, 0, 0, 0];
    for (let d = first; d <= t; d = addDays(d, 1)) days[parseYmd(d).getDay()]++;
    done.forEach((x) => per[parseYmd(x.doneDate).getDay()]++);
    const avg = per.map((n, w) => ({ w, v: days[w] ? n / days[w] : 0 })).filter((x) => days[x.w] >= 2);
    if (avg.length >= 5) {
      avg.sort((a, b) => b.v - a.v);
      const best = avg[0], worst = avg[avg.length - 1];
      if (best.v >= 1 && best.v >= worst.v * 2) out.push({ id: 'weekday', text: `You finish the most on ${weekdayName(best.w)}s and the least on ${weekdayName(worst.w)}s.` });
    }
  }
  // 5. The overdue pile
  const over = D.tasks.filter((x) => isOverdue(x, t)).length;
  if (over >= 5) out.push({ id: 'overdue', text: `${over} tasks are overdue. Move or delete the ones that don’t matter any more.` });
  return out.slice(0, 4);
}
LB.patterns = patterns;

/* The week at a glance, for Progress */
function weekStats(D = data(), t = today()) {
  const from = addDays(t, -6), days = [...Array(7)].map((_, i) => addDays(from, i));
  const perDay = days.map((d) => ({ d, n: doneOn(D, d).length }));
  // Count each habit only from the day it was added, so a new habit doesn't start at 14%.
  const since = (h) => { const c = String(h.createdAt || '').slice(0, 10), first = Object.keys(h.log || {}).sort()[0] || t; const s = [isYmd(c) ? c : t, first].sort()[0]; return s > from ? s : from; };
  const hDays = D.habits.reduce((n, h) => n + daysBetween(since(h), t) + 1, 0), hDone = D.habits.reduce((n, h) => n + habitCount(h, from, t), 0);
  return {
    perDay, tasks: perDay.reduce((s, x) => s + x.n, 0),
    habitRate: hDays ? hDone / hDays : null,
    overdue: D.tasks.filter((x) => isOverdue(x, t)).length,
  };
}
