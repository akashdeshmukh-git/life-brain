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
const goalPct = (g) => clamp(goalNow(g) / (Number(g.target) || 1), 0, 1);

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
