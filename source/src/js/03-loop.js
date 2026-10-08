/* ===== The loop: plan → reality → gap → experiment → rule =====
   A "day" record is the core object: the day you planned next to the day you actually had.
   Experiments carry a policy that really changes how plans are made while they run.
   Kept experiments become rules; rules shape every future plan. Pure functions of D. */
const Loop = (LB.Loop = {});
const round5 = (m) => Math.max(5, Math.round(m / 5) * 5);
const POLICIES = {
  cap: { name: 'Fewer tasks', label: (v) => `At most ${v} tasks a day`, hyp: (v) => `If I plan at most ${v} tasks a day, I will keep more of my plans.`, reason: 'time' },
  firstStep: { name: 'First steps', label: () => 'Every planned task has a first step', hyp: () => 'If every task I plan has a concrete first step, I will start more of them.', reason: 'unclear' },
  maxSize: { name: 'Smaller tasks', label: (v) => `No planned task longer than ${fmtMin(v)}`, hyp: (v) => `If no planned task is longer than ${fmtMin(v)}, I will put off fewer of them.`, reason: 'mood' },
  estimate: { name: 'Honest estimates', label: (v) => `Estimates × ${v}`, hyp: (v) => `If I plan with my estimates multiplied by ${v}, my days will fit what I can really do.`, reason: 'optimism' },
  askEarly: { name: 'Ask early', label: () => 'Ask for what I need the evening before', hyp: () => 'If I ask for what I need the evening before, I will be blocked less often.', reason: 'waiting' },
  linkedOnly: { name: 'Only what matters', label: () => 'Only plan tasks that serve a goal', hyp: () => 'If I only plan tasks that serve a goal, fewer plans will turn out not to matter.', reason: 'gone' },
};
Loop.POLICIES = POLICIES;
Loop.policyLabel = (p) => (p && POLICIES[p.kind] ? POLICIES[p.kind].label(p.value) : '');
Loop.day = (D, date) => D.days.find((d) => d.date === date) || null;

/* Active policies: standing rules first, a running experiment overrides the same kind. */
Loop.policies = (D, t = today()) => {
  const p = {};
  D.rules.filter((r) => r.active !== false && r.policy && POLICIES[r.policy.kind]).forEach((r) => (p[r.policy.kind] = { value: r.policy.value, from: 'rule', id: r.id }));
  D.experiments.filter((e) => e.status === 'running' && e.policy && POLICIES[e.policy.kind] && (!isYmd(e.startDate) || e.startDate <= t))
    .forEach((e) => (p[e.policy.kind] = { value: e.policy.value, from: 'experiment', id: e.id }));
  return p;
};
Loop.reviewed = (D, from, to) => D.days.filter((d) => d.reviewedAt && !d.unknown && d.date >= from && d.date <= to && (d.plannedIds || []).length).sort((a, b) => a.date.localeCompare(b.date));
Loop.rate = (days) => {
  const planned = days.reduce((s, d) => s + d.plannedIds.length, 0), kept = days.reduce((s, d) => s + (d.kept || []).length, 0);
  return { planned, kept, rate: planned ? kept / planned : null, days: days.length };
};
Loop.reasons = (days) => {
  const c = {};
  days.forEach((d) => (d.missed || []).forEach((m) => { if (m.reason) c[m.reason] = (c[m.reason] || 0) + 1; }));
  return c;
};
/* How much planned work you actually get done on a day: the median of real days, not a wish.
   A kept task counts its real time, or its estimate scaled the way your plans scale it. */
Loop.capacity = (D, t = today()) => {
  const pol = Loop.policies(D, t), real = (x) => (Number(x.actualMin) > 0 ? Number(x.actualMin) : Loop.minutes(x, pol));
  const days = Loop.reviewed(D, addDays(t, -21), addDays(t, -1));
  const mins = days.map((d) => (d.kept || []).reduce((s, id) => { const x = D.tasks.find((y) => y.id === id); return s + (x ? real(x) : 0); }, 0)).filter((m) => m > 0);
  if (mins.length >= 3) return { minutes: round5(median(mins)), from: 'history', n: mins.length };
  return { minutes: round5(Brain.capMin(D) * 0.8), from: 'settings', n: mins.length };
};
Loop.minutes = (x, pol) => round5(est(x) * (pol.estimate ? Number(pol.estimate.value) || 1 : 1));

/* The morning proposal: best tasks first, sized to proven capacity, with every active rule applied. */
Loop.propose = (D, date, t = today()) => {
  const pol = Loop.policies(D, t), cap = pol.cap ? Number(pol.cap.value) : null, budget = Loop.capacity(D, t);
  let ranked = Brain.ranked(D, date).map((r) => r.x);
  if (pol.linkedOnly) ranked = ranked.filter((x) => Brain.chain(D, x).linked);
  const items = [];
  let used = 0, count = 0;
  for (const x of ranked) {
    const minutes = Loop.minutes(x, pol);
    const tooBig = !!pol.maxSize && minutes > Number(pol.maxSize.value);
    const fits = count === 0 || used + minutes <= budget.minutes;
    const selected = !tooBig && fits && (cap == null || count < cap);
    if (selected) { used += minutes; count++; }
    items.push({ x, minutes, selected, tooBig, overDay: minutes > budget.minutes, needsStep: !!pol.firstStep && !x.firstStep });
    if (items.length >= Math.max(7, (cap || 3) + 4)) break;
  }
  return { date, items, budget, used, pol };
};

/* Weekly review is due after a few closed days, about once a week. */
Loop.weekDue = (D, t = today()) => {
  const last = D.weeks.map((w) => w.date).sort().pop();
  return Loop.reviewed(D, addDays(t, -7), t).length >= 3 && (!last || daysBetween(last, t) >= 6);
};
Loop.week = (D, t = today()) => {
  const days = Loop.reviewed(D, addDays(t, -6), t), prev = Loop.reviewed(D, addDays(t, -13), addDays(t, -7));
  return { ...Loop.rate(days), prevRate: Loop.rate(prev).rate, reasons: Loop.reasons(days), extras: days.reduce((s, d) => s + (d.extras || []).length, 0) };
};

/* Judge an experiment against the period before it, honestly. */
Loop.evaluate = (D, e, t = today()) => {
  const start = isYmd(e.startDate) ? e.startDate : t, end = isYmd(e.endDate) && e.endDate < t ? e.endDate : t;
  const during = Loop.rate(Loop.reviewed(D, start, end));
  const base = e.baseline && e.baseline.days ? e.baseline : Loop.rate(Loop.reviewed(D, addDays(start, -14), addDays(start, -1)));
  let verdict = 'early';
  if (during.days >= 5) {
    if (base.rate == null) verdict = 'nobase';
    else { const d = during.rate - base.rate; verdict = d >= 0.1 ? 'better' : d <= -0.1 ? 'worse' : 'same'; }
  }
  const p = (r) => (r == null ? '—' : pct(r));
  const text = {
    early: `${plural(during.days, 'closed day')} so far (${p(during.rate)} of plans kept). Five days are needed to judge.`,
    nobase: `Kept ${p(during.rate)} of plans over ${plural(during.days, 'day')}. There is no earlier data to compare with.`,
    better: `Kept ${p(during.rate)} of plans with it, against ${p(base.rate)} before. That looks like a real improvement.`,
    worse: `Kept ${p(during.rate)} of plans with it, against ${p(base.rate)} before. It made things worse.`,
    same: `Kept ${p(during.rate)} of plans with it, against ${p(base.rate)} before. No clear difference.`,
  }[verdict];
  return { verdict, during, base, text, ready: during.days >= 5 };
};

/* Suggest one experiment that targets the most common reason plans fail. */
Loop.suggest = (D, t = today()) => {
  const pol = Loop.policies(D, t);
  const days = Loop.reviewed(D, addDays(t, -14), t);
  const reasons = Object.entries(Loop.reasons(days)).sort((a, b) => b[1] - a[1]);
  const cal = Brain.calibration(D);
  const value = (kind) => {
    if (kind === 'cap') { const avg = Loop.rate(days).kept / Math.max(1, days.length); return clamp(Math.round(avg) + 1, 2, 5); }
    if (kind === 'maxSize') return 60;
    if (kind === 'estimate') return Math.round((cal.median || 1.5) * 10) / 10;
    return true;
  };
  const out = [];
  for (const [reason, n] of reasons) {
    const kind = Object.keys(POLICIES).find((k) => POLICIES[k].reason === reason);
    if (kind && !pol[kind] && n >= 2) out.push({ kind, value: value(kind), because: `“${SKIP_REASONS[reason]}” was the reason for ${plural(n, 'missed task')} in two weeks.` });
  }
  if (cal.n >= 3 && cal.median > 1.3 && !pol.estimate) out.push({ kind: 'estimate', value: value('estimate'), because: `Finished tasks took ${cal.median.toFixed(1)}× their estimate.` });
  return out.map((s) => ({ ...s, label: POLICIES[s.kind].label(s.value), hypothesis: POLICIES[s.kind].hyp(s.value), name: POLICIES[s.kind].name }));
};
