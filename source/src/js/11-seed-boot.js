/* ===== Example data (clearly marked, removable) and boot ===== */
async function seedExamples() {
  const t = today(), d = (n) => addDays(t, n), iso = (s) => s + 'T09:00:00.000Z';
  const [A1, A2, A3, A4, M1, M2, G1, G2, G3, G4, P1, P2, E1] = [...Array(13)].map(() => uid());
  const T = {}; // tasks by key, so the day history below can point at them
  const task = (key, title, o = {}) => (T[key] = { id: uid(), type: 'task', title, status: 'open', priority: '2', plans: [], deferrals: 0, skips: [], createdAt: iso(d(-12)), ...o });
  const done = (key, title, day, o) => task(key, title, { status: 'done', outcome: 'as_planned', doneDate: d(day), plannedDate: d(day), plans: [d(day)], ...o });
  const recs = [
    { id: A1, type: 'area', emoji: '🏃', name: 'Health', code: 'H', color: 'green', createdAt: iso(d(-40)) }, { id: A2, type: 'area', emoji: '🛠️', name: 'Craft', code: 'C', color: 'blue', createdAt: iso(d(-39)) },
    { id: A3, type: 'area', emoji: '🫂', name: 'Relationships', code: 'R', color: 'purple', createdAt: iso(d(-38)) }, { id: A4, type: 'area', emoji: '📚', name: 'Learning', code: 'L', color: 'orange', createdAt: iso(d(-37)) },
    { id: M1, type: 'aim', title: 'Stay strong and well rested for decades', areaId: A1 },
    { id: M2, type: 'aim', title: 'Do work I am proud to put my name on', areaId: A2 },
    { id: G1, type: 'goal', title: 'Sleep 7+ hours on weeknights', aimId: M1, areaId: A1, status: 'active', measure: '5 of 5 weeknights, three weeks running', due: d(30) },
    { id: G2, type: 'goal', title: 'Ship the side project v1', aimId: M2, areaId: A2, status: 'active', measure: 'A public link strangers can use', due: d(12) },
    { id: G3, type: 'goal', title: 'Read 6 books this year', areaId: A4, status: 'active' },
    { id: G4, type: 'goal', title: 'Learn conversational Spanish', status: 'active' },
    { id: P1, type: 'project', title: 'Side project v1', goalId: G2, status: 'active' },
    { id: P2, type: 'project', title: 'Home office cleanup', status: 'active' },
    // Open work. The README keeps getting planned and keeps not happening.
    task('readme', 'Write the project README', { projectId: P1, priority: '1', estimateMin: 120, plannedDate: t, plans: [d(-9), d(-6), d(-3), d(-1), t], deferrals: 4,
      skips: [{ date: d(-9), reason: 'unclear' }, { date: d(-6), reason: 'unclear' }, { date: d(-3), reason: 'unclear' }, { date: d(-1), reason: 'time' }] }),
    task('signup', 'Fix the sign-up form validation', { projectId: P1, priority: '1', estimateMin: 60, firstStep: 'Reproduce the bug with an empty email field', context: 'Laptop, staging site' }),
    task('demo', 'Prepare the Friday demo', { projectId: P1, estimateMin: 90 }),
    task('passport', 'Renew passport', { estimateMin: 30 }),
    task('bank', 'Call the bank about the card', { priority: '3', estimateMin: 15 }),
    task('lamp', 'Order a desk lamp', { projectId: P2, priority: '3', estimateMin: 15 }),
    task('sleep', 'Book a sleep check-up', { goalId: G1, estimateMin: 20, plannedDate: d(1), plans: [d(1)], firstStep: 'Find the clinic’s booking page' }),
    task('read', 'Read 30 pages', { goalId: G3, estimateMin: 30, plannedDate: d(2), plans: [d(-6), d(-2), d(2)], deferrals: 2, skips: [{ date: d(-6), reason: 'time' }, { date: d(-2), reason: 'mood' }] }),
    task('blog', 'Draft the launch blog post', { projectId: P1, estimateMin: 60, plannedDate: d(-4), plans: [d(-4)], status: 'abandoned', statusDate: d(-4), abandonedReason: SKIP_REASONS.gone, skips: [{ date: d(-4), reason: 'gone' }] }),
    // What actually happened, with real times.
    done('pricing', 'Sketch the pricing page', -9, { projectId: P1, estimateMin: 60, actualMin: 90 }),
    done('gymA', 'Gym: full body', -9, { estimateMin: 60, actualMin: 60 }),
    done('hosting', 'Set up hosting', -8, { projectId: P1, estimateMin: 60, actualMin: 110, outcome: 'different', outcomeNote: 'DNS took most of the time' }),
    done('maya', 'Reply to Maya about the weekend', -8, { estimateMin: 10, actualMin: 15 }),
    done('gymB', 'Gym: upper body', -6, { estimateMin: 60, actualMin: 60 }),
    done('landing', 'Design the landing page', -5, { projectId: P1, estimateMin: 90, actualMin: 150, plans: [d(-6), d(-5)], deferrals: 1, skips: [{ date: d(-6), reason: 'time' }] }),
    done('plumber', 'Call the plumber', -4, { estimateMin: 15, actualMin: 20 }),
    done('groceries', 'Weekly groceries', -4, { estimateMin: 45, actualMin: 60 }),
    done('inbox', 'Clear the inbox', -3, { estimateMin: 20, actualMin: 45, plans: [d(-4), d(-3)], deferrals: 1, skips: [{ date: d(-4), reason: 'time' }] }),
    done('deploy', 'Fix the deploy script', -3, { projectId: P1, estimateMin: 30, actualMin: 50 }),
    done('emails', 'Write onboarding emails', -2, { projectId: P1, estimateMin: 45, actualMin: 60 }),
    done('gymC', 'Gym: legs', -2, { estimateMin: 60, actualMin: 60 }),
    done('walk', 'Evening walk with Sam', -1, { goalId: G1, estimateMin: 30, actualMin: 35 }),
    done('analytics', 'Set up analytics', -1, { projectId: P1, estimateMin: 60, actualMin: 90 }),
    { type: 'habit', emoji: '🌙', title: 'Lights out by 23:00', areaId: A1, perWeek: 5, log: { [d(-1)]: true, [d(-4)]: true, [d(-5)]: true, [d(-8)]: true }, createdAt: iso(d(-20)) },
    { type: 'habit', emoji: '🚶', title: 'Walk 30 minutes', areaId: A1, perWeek: 4, log: { [d(-1)]: true, [d(-2)]: true, [d(-3)]: true, [d(-6)]: true, [d(-9)]: true, [d(-10)]: true }, createdAt: iso(d(-20)) },
    { type: 'experiment', title: 'No screens after 22:30', hypothesis: 'If I stop using screens at 22:30, I will fall asleep faster and reach 7 hours more often.', intervention: 'Phone charges in the kitchen from 22:30. Paper book only.', measurement: 'Minutes to fall asleep (rough guess) and hours slept', startDate: d(-6), endDate: d(7), status: 'running',
      observations: [{ id: uid(), date: d(-6), value: '35 min', note: 'Hard to put the phone down' }, { id: uid(), date: d(-5), value: '20 min', note: 'Read 15 pages instead' }] },
    // An earlier loop that closed: an experiment that worked and became a rule every plan now follows.
    { id: E1, type: 'experiment', title: 'Honest estimates', hypothesis: POLICIES.estimate.hyp(1.5), intervention: POLICIES.estimate.label(1.5), measurement: 'Share of planned tasks kept, compared with the two weeks before',
      policy: { kind: 'estimate', value: 1.5 }, startDate: d(-30), endDate: d(-24), status: 'done', observations: [],
      outcome: 'Kept 64% of plans with it, against 41% before. That looks like a real improvement.', learning: 'Estimates × 1.5 works for me.', adaptation: 'Now a standing rule that shapes every plan.' },
    { type: 'rule', title: POLICIES.estimate.label(1.5), policy: { kind: 'estimate', value: 1.5 }, since: d(-24), source: E1, active: true, evidence: 'Kept 64% of plans with it, against 41% before. That looks like a real improvement.' },
    { type: 'memory', kind: 'worked', title: 'Estimates × 1.5', body: 'Kept 64% of plans with it, against 41% before.', date: d(-24), links: [E1] },
    { type: 'memory', kind: 'failed', title: '25-minute focus timers on meeting days', body: 'Too many interruptions; the timer became one more thing to manage.', date: d(-20) },
    { type: 'memory', kind: 'worked', title: 'Planning tomorrow before closing the laptop', body: 'Five minutes at the end of the day made mornings start faster.', date: d(-14) },
    { type: 'memory', kind: 'decision', title: 'Delay the design course until v1 ships', why: 'Shipping is the bottleneck, and the course would compete for the same evening hours.', body: 'Options: start now / after v1', date: d(-10) },
    { type: 'memory', kind: 'lesson', title: 'Writing tasks take about 1.5× my estimate', body: 'Seen on the landing page copy and the onboarding emails.', date: d(-4) },
  ];
  // Eight closed days: what was planned, what happened, and the reason for each miss.
  const history = [
    [-9, ['readme', 'pricing', 'gymA']], [-8, ['hosting', 'maya']], [-6, ['readme', 'landing', 'read', 'gymB']], [-5, ['landing']],
    [-4, ['inbox', 'blog', 'plumber', 'groceries']], [-3, ['readme', 'inbox', 'deploy']], [-2, ['emails', 'read', 'gymC']], [-1, ['readme', 'walk', 'analytics']],
  ];
  for (const [n, keys] of history) {
    const date = d(n), xs = keys.map((k) => T[k]);
    const kept = xs.filter((x) => x.status === 'done' && x.doneDate === date).map((x) => x.id);
    const missed = xs.filter((x) => !kept.includes(x.id)).map((x) => ({ id: x.id, reason: ((x.skips || []).find((s) => s.date === date) || {}).reason || 'time' }));
    recs.push({ type: 'day', date, plannedIds: xs.map((x) => x.id), minutes: xs.reduce((s, x) => s + round5(est(x) * 1.5), 0), committedAt: date + 'T07:30:00.000Z', reviewedAt: date + 'T21:00:00.000Z', kept, missed, extras: [], note: '' });
  }
  const now = new Date().toISOString();
  const full = recs.map((r) => ({ id: r.id || uid(), createdAt: now, updatedAt: now, ...r, ex: true }));
  full.forEach((r) => S.records.set(r.id, r));
  await persist('records', (st) => full.forEach((r) => st.put(r)));
  await saveProfile({ identity: 'Someone who builds carefully and protects their energy', direction: 'Ship meaningful work at a pace I can keep for years, while staying healthy and close to the people I love.', values: ['Health', 'Craft', 'Relationships', 'Learning'], priorities: 'Ship v1 this month. Protect sleep.', capacityHours: 4, ex: true });
  S.seeded = true;
  await setMeta('seeded', true);
}
LB.seedExamples = seedExamples;

function registerSW() {
  LB.swState = 'none';
  if (!window.LB_PWA || !('serviceWorker' in navigator)) return;
  LB.swState = 'pending';
  navigator.serviceWorker.register('sw.js').then((reg) => navigator.serviceWorker.ready).then(() => { LB.swState = 'ready'; if (route.name === 'settings') render(); })
    .catch((e) => { console.warn('Service worker failed', e); LB.swState = 'error'; });
}

async function boot() {
  await dbInit();
  applyTheme();
  if (!S.seeded && S.records.size === 0 && S.storage === 'ok') { try { await seedExamples(); } catch (e) { console.error('Could not add examples', e); } }
  Object.assign(route, parseHash());
  onChange(() => render(false));
  render(false);
  window.addEventListener('hashchange', () => { const r = parseHash(); if (r.name !== route.name || r.sub !== route.sub) { Object.assign(route, r); render(true); } });
  window.addEventListener('online', () => render(false));
  window.addEventListener('offline', () => render(false));
  try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (!S.settings.mode) applyTheme(); }); } catch (_) {}
  AI.detect().then(() => { if (['brain', 'settings'].includes(route.name)) render(false); });
  autoSnapshot().catch(() => {});
  registerSW();
  LB.ready = true;
  document.documentElement.dataset.ready = '1';
}
boot().catch((e) => {
  console.error(e);
  $('#view').innerHTML = `<div class="empty"><strong>Life Brain could not start.</strong> ${esc(e.message || e)}</div>`;
});
