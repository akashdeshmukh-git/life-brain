/* ===== Where you're heading, and fixes. The brain part of Life Brain: it compares what you do with what you
   said you want, and turns what it sees into one-tap changes. Worked out on the phone, from your own records. ===== */
const HEAD_COLORS = ['rgb(var(--brand))', 'rgb(var(--ink))', '#cb53fa', '#14a38b', '#f59e0b'];
function headingSection(D, t) {
  const act = activeGoals(D);
  if (!D.goals.length) {
    return `<section class="card mt-7" id="heading"><h2 class="font-display text-[19px] font-semibold tracking-tight">Where you’re heading</h2>
      <p class="heading-line mt-1 text-[15px] text-muted">Tell your brain what you want. With a goal or two, Home shows whether your days are heading there, and suggests fixes when they aren’t.</p>
      <button class="btn primary mt-4" data-action="goal-new">${icon('plus')}Add a goal</button></section>`;
  }
  const dir = direction(D, t), parts = dir.parts.filter((p) => !goalDone(p.g) || p.n).slice(0, 5);
  const color = (i) => HEAD_COLORS[i % HEAD_COLORS.length];
  const bar = dir.total ? `<div class="hbar mt-4" role="img" aria-label="${esc(parts.map((p) => `${p.g.title}: ${p.n}`).concat(`No goal: ${dir.none}`).join(', '))}">${parts.filter((p) => p.n).map((p) => `<i style="width:${(p.n / dir.total) * 100}%;background:${color(parts.indexOf(p))}"></i>`).join('')}${dir.none ? `<i class="none" style="width:${(dir.none / dir.total) * 100}%"></i>` : ''}</div>` : '';
  const rows = act.slice(0, 3).map((g) => {
    const s = goalStatus(D, g, t), i = parts.findIndex((p) => p.g.id === g.id), n = i >= 0 ? parts[i].n : 0;
    return `<li><button class="hrow-goal" data-action="goal-open" data-id="${g.id}"><span class="hdot" style="background:${i >= 0 && n ? color(i) : 'rgb(var(--line))'}"></span><span class="hname"><b>${esc(g.title)}</b><small class="state-${s.state}">${esc(goalStateText(g, s))}</small></span><span class="hnum">${n}</span></button></li>`;
  }).join('');
  return `<section class="card mt-7" id="heading"><div class="flex items-center justify-between gap-2"><h2 class="font-display text-[19px] font-semibold tracking-tight">Where you’re heading</h2><button class="link -my-2" data-action="goal-new">${icon('plus')}Goal</button></div>
    <p class="heading-line mt-1 font-display text-[18px] leading-snug" id="heading-line">${esc(headingLine(D, t))}</p>
    ${bar}${dir.total ? '<p class="mt-2 text-[13px] text-muted">Tasks finished in the last 4 weeks, by goal</p>' : ''}
    <ol class="hlist mt-2">${rows}${dir.total ? `<li><div class="hrow-goal"><span class="hdot none"></span><span class="hname"><b>No goal</b><small>Tasks not tied to any goal</small></span><span class="hnum">${dir.none}</span></div></li>` : ''}</ol>
    ${act.length > 3 ? `<button class="link" data-action="nav" data-to="goals">All ${act.length} goals</button>` : ''}</section>`;
}

/* ---- Fixes: specific changes, each one tap with Undo, or a ✦ that asks your AI to do the thinking ---- */
const FIXES = new Map();
function computeFixes(D, t) {
  const out = [], hasAI = AI.provider() !== 'none', tm = addDays(t, 1), snooze = S.settings.fixSnooze || {};
  for (const g of activeGoals(D)) {
    const s = goalStatus(D, g, t);
    if (s.state === 'no-steps') out.push({ id: 'steps-' + g.id, title: `“${g.title}” has no next step`, text: 'A goal moves when there’s a concrete next thing to do.', label: hasAI ? '✦ Plan steps' : 'Add a step', run: () => (hasAI ? A['goal-steps']({ dataset: { id: g.id } }) : goalDetail(g)) });
    else if (s.state === 'stalled' && s.open.length && !s.open.some((x) => x.date && x.date >= t && x.date <= tm)) { // already on for today or tomorrow: nothing to fix
      const step = s.open.slice().sort((a, b) => (a.date || '9').localeCompare(b.date || '9') || byCreated(a, b))[0];
      out.push({ id: 'stall-' + g.id + '-' + t, title: `Get “${g.title}” moving`, text: `Nothing in ${s.idle} days. Put “${step.title}” on tomorrow?`, label: 'Put it on tomorrow', apply: async (rec) => { const x = get(step.id); if (x) await rec.update({ ...x, date: tm, moved: (x.moved || 0) + (x.date && x.date < tm ? 1 : 0) }); return `“${trunc(step.title, 30)}” is on tomorrow`; } });
    } else if (s.state === 'behind') out.push({ id: 'behind-' + g.id + '-' + weekStart(t), title: `“${g.title}” is behind`, text: s.perWeekNeed ? `It needs about ${plural(s.perWeekNeed, 'step')} a week to make ${fmtDate(g.by, { month: 'short', day: 'numeric' })}; lately ${s.perWeekNow}.` : 'At this pace it misses its date.', label: hasAI ? '✦ Plan my week' : 'Open goal', run: () => (hasAI ? A['plan-week']() : goalDetail(g)) });
  }
  // Overplanning: more on today than you usually finish in a day
  const cap = capacity(D, t), todays = D.tasks.filter((x) => !x.done && x.date === t);
  if (cap >= 0.5 && todays.length > Math.ceil(cap * 1.5) + 1) {
    const keep = Math.max(1, Math.round(cap)), extra = todays.filter((x) => !x.goalId).sort((a, b) => byCreated(b, a)).slice(0, todays.length - keep); // newest loose tasks go first
    if (extra.length) out.push({ id: 'lighten-' + t, title: 'Today is fuller than your usual day', text: `You finish about ${Math.round(cap * 10) / 10} a day and today has ${todays.length}. Tasks tied to goals stay.`, label: `Move ${extra.length} to later this week`, apply: async (rec) => { for (const [i, x] of extra.entries()) { const y = get(x.id); if (y) await rec.update({ ...y, date: addDays(t, 1 + (i % 6)), moved: (y.moved || 0) + 1 }); } return `Moved ${plural(extra.length, 'task')}`; } });
  }
  // A task that keeps getting pushed
  const pushed = D.tasks.filter((x) => !x.done && (x.moved || 0) >= 3).sort((a, b) => b.moved - a.moved)[0];
  if (pushed) out.push({ id: 'split-' + pushed.id, title: `“${trunc(pushed.title, 40)}” keeps getting moved`, text: `Moved ${pushed.moved} times. Smaller steps usually get done.`, label: hasAI ? '✦ Break it down' : 'Open it', run: () => (hasAI ? A['task-break']({ dataset: { id: pushed.id } }) : taskSheet(pushed)) });
  // Work that isn't tied to anything you said you want
  const loose = D.tasks.filter((x) => !x.done && !x.goalId), act = activeGoals(D);
  if (hasAI && act.length && loose.length >= 3) out.push({ id: 'link-' + t, title: `${plural(loose.length, 'open task')} aren’t tied to a goal`, text: 'Tie them, and Where you’re heading becomes accurate.', label: '✦ Tie to goals', run: () => A['goal-link']() });
  // Sunday or Monday: the weekly look back, once a week, when the AI is set up
  const wd = parseYmd(t).getDay(), lb = S.settings.lookBack;
  // Sunday and Monday share one id (Monday's date), so Not now holds for both days
  if ((wd === 0 || wd === 1) && hasAI && S.records.size >= 10 && (!lb || lb < addDays(t, -5))) out.push({ id: 'lookback-' + (wd === 0 ? addDays(t, 1) : t), title: 'Weekly look back', text: 'A short look at what got done and what slipped this week, written by your AI.', label: '✦ Write it', run: () => A['look-back']() });
  // Everything lives only on this phone, so a backup file is the one safety net against a cleared browser
  const last = S.lastExport ? daysBetween(S.lastExport.slice(0, 10), t) : null;
  if (S.records.size >= 15 && (last == null || last >= 30)) out.push({ id: 'backup', title: 'Save a backup file', text: `Everything lives only on this phone. ${last == null ? 'No backup file has been saved yet.' : `The last one was saved ${last} days ago.`}`, label: 'Save backup', run: () => A.export() });
  return out.filter((f) => !(snooze[f.id] && snooze[f.id] >= t)).slice(0, 5);
}
/* Fixes sit side by side: swipe through them. Suggestions your AI prepared by itself come first. */
function fixesSection(D, t) {
  const pend = pendingItems(), fixes = computeFixes(D, t);
  FIXES.clear(); fixes.forEach((f) => FIXES.set(f.id, f));
  const n = pend.length + fixes.length;
  if (!n) return '';
  const mark = `<span class="ai-mark">${icon('spark')}</span>`;
  const card = (title, text, btns, attrs = '', ai = false) => `<div class="fix-card" ${attrs}><div class="flex items-start gap-2">${ai ? mark : ''}<div class="fix-title min-w-0 flex-1">${title}</div></div><p class="fix-text">${text}</p><div class="fix-btns">${btns}</div></div>`;
  return `<section class="mt-7" id="fixes"><div class="sec-h"><h2>Fixes for you</h2>${n > 1 ? `<span class="text-sm text-muted">Swipe for ${n - 1} more</span>` : ''}</div>
    <div class="fix-strip mt-1">
    ${pend.map((it) => card(`<button class="bi-title text-left font-semibold" ${it.attrs}>${esc(it.title.replace(/^✦\s*/, ''))}</button>`, it.text, `<button class="btn sm primary" ${it.attrs}>Open</button><button class="btn sm ghost text-muted" data-action="pending-dismiss" ${it.attrs.match(/data-id="[^"]*"/)[0]}>Not now</button>`, '', true)).join('')}
    ${fixes.map((f) => card(esc(f.title), esc(f.text), `<button class="btn sm primary" data-action="fix-apply" data-fix="${esc(f.id)}">${esc(f.label)}</button><button class="btn sm ghost text-muted" data-action="fix-dismiss" data-fix="${esc(f.id)}">Not now</button>`, `data-fix="${esc(f.id)}"`, f.label.startsWith('✦'))).join('')}
    </div></section>`;
}
A['fix-apply'] = async (el) => {
  const f = FIXES.get(el.dataset.fix);
  if (!f) return;
  if (f.run) { f.run(); return; }
  const undo = [], rec = {
    async create(r) { const x = await put(r, { quiet: true }); undo.push(() => del(x.id)); return x; },
    async update(r) { const old = get(r.id); await put(r, { quiet: true }); if (old) undo.push(() => put(old)); },
    async remove(id) { const old = get(id); if (!old) return; await del(id); undo.push(() => put(old)); },
  };
  const msg = await f.apply(rec);
  emit();
  haptic();
  toast(msg || 'Done', '', { action: 'Undo', onAction: async () => { for (const u of undo.reverse()) await u(); } });
};
A['fix-dismiss'] = async (el) => { // hidden for a week; old entries are dropped so the list stays small
  const t = today(), keep = Object.entries(S.settings.fixSnooze || {}).filter(([, d]) => isYmd(d) && d >= t);
  await saveSettings({ fixSnooze: { ...Object.fromEntries(keep), [el.dataset.fix]: addDays(t, 7) } });
};

/* ---- AI: plan the next steps for a goal ---- */
const GOALSTEPS_PROMPT = `Plan the next concrete steps toward one goal. Reply with JSON only, in this shape:
{"steps":[{"title":"...","date":"YYYY-MM-DD or empty"}]}
Rules:
- 3 to 6 steps in the order they should be done. The first one is small enough to start today.
- Each step takes under about two hours. Titles start with a verb. No emoji.
- Spread dates from today, at a pace the person can keep (they finish about the number of tasks per day given). Never after the goal's deadline.
- Don't repeat steps they already have.`;
A['goal-steps'] = (el) => {
  const g = get(el.dataset.id), t = today();
  if (!g) return;
  aiTool({ title: 'Plan steps', intro: `Your AI is planning the next steps for <b>${esc(g.title)}</b>. Nothing is added until you tap Add.`, system: GOALSTEPS_PROMPT,
    request: () => {
      const D = data(), s = goalStatus(D, g, t);
      return `Today is ${fmtDate(t, { weekday: 'long' })}, ${t}. They finish about ${capacity(D, t)} tasks a day.\n\nGoal: ${g.title}\nWhy: ${g.why || '(not given)'}\nDeadline: ${g.by || 'none'}\n${goalIsNumber(g) ? `Progress: ${goalNow(g)} of ${g.target} ${g.unit}\n` : ''}\nOpen steps:\n${s.open.map((x) => `- ${x.title}${x.date ? ' (' + x.date + ')' : ''}`).join('\n') || '(none)'}\nDone steps:\n${s.steps.filter((x) => x.done).slice(-10).map((x) => `- ${x.title}`).join('\n') || '(none)'}`;
    },
    onAnswer: (text, out) => {
      const j = pullJSON(text), have = new Set(goalSteps(data(), g).map((x) => x.title.toLowerCase()));
      const rows = (Array.isArray(j.steps) ? j.steps : []).slice(0, 8).map((s) => ({ on: true, title: String((s && s.title) || '').trim().slice(0, 200), date: day(s && s.date) })).filter((s) => s.title && !have.has(s.title.toLowerCase()));
      rows.forEach((s) => { if (s.date && s.date < t) s.date = t; if (g.by && s.date > g.by) s.date = g.by; });
      showReview(out, rows, (s, i) => `<div class="org-top"><input class="org-title" data-rev="title" data-i="${i}" value="${esc(s.title)}" maxlength="200" aria-label="Step"></div><div class="org-when">${dateField(i, s.date)}${s.date ? `<span class="small muted">${esc(relDate(s.date))}</span>` : ''}</div>`,
        async (sel, rec) => { const add = sel.filter((r) => r.title.trim()); for (const s of add) await rec.create({ type: 'task', title: s.title.trim(), date: day(s.date), done: false, doneDate: '', note: '', moved: 0, goalId: g.id }); return `Added ${plural(add.length, 'step')} to “${trunc(g.title, 30)}”`; }, 'Add');
    } });
};

/* ---- AI: tie open tasks to goals ---- */
const LINK_PROMPT = `Tie a person's open tasks to their goals. You get their goals (id, title, why) and their open tasks that have no goal (id, title). Reply with JSON only, in this shape:
{"links":[{"task":"task id","goal":"goal id or empty"}]}
Only tie a task when it clearly moves that goal forward. Otherwise leave goal empty. Only use the ids given.`;
A['goal-link'] = () => {
  const t = today(), D = data(), goals = activeGoals(D), loose = D.tasks.filter((x) => !x.done && !x.goalId).slice(0, 60);
  if (!goals.length) { goalForm(null); return; }
  if (!loose.length) { toast('Every open task already has a goal.'); return; }
  aiTool({ title: 'Tie tasks to goals', intro: 'Your AI matches your open tasks to your goals. Nothing changes until you tap Apply.', system: LINK_PROMPT,
    request: () => `## Goals\n${goals.map((g) => `${g.id} | ${g.title}${g.why ? ' | why: ' + trunc(g.why, 120) : ''}`).join('\n')}\n\n## Open tasks without a goal\n${loose.map((x) => `${x.id} | ${x.title}`).join('\n')}`,
    onAnswer: (text, out) => {
      const j = pullJSON(text), ids = new Set(goals.map((g) => g.id)), rows = [];
      for (const l of Array.isArray(j.links) ? j.links : []) {
        const x = l && get(String(l.task)); if (!x || x.type !== 'task' || x.done || x.goalId || rows.some((r) => r.id === x.id)) continue;
        const gid = ids.has(String(l.goal)) ? String(l.goal) : '';
        if (gid) rows.push({ on: true, id: x.id, title: x.title, goalId: gid });
      }
      showReview(out, rows, (r, i) => `<span class="rev-note">${esc(r.title)}</span><div class="org-when"><select data-rev="goalId" data-i="${i}" aria-label="Goal">${goals.map((g) => `<option value="${g.id}" ${g.id === r.goalId ? 'selected' : ''}>${esc(g.title)}</option>`).join('')}<option value="" ${r.goalId ? '' : 'selected'}>No goal</option></select></div>`,
        async (sel, rec) => { let n = 0; for (const r of sel) { const x = get(r.id); if (x && r.goalId) { await rec.update({ ...x, goalId: r.goalId }); n++; } } return `Tied ${plural(n, 'task')} to goals`; }, 'Apply');
    } });
};
