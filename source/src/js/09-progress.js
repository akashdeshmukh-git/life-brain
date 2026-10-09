/* ===== Progress: the week, streaks, goals, patterns, and AI ===== */
VIEWS.progress = () => {
  const D = data(), t = today(), w = weekStats(D, t), pats = patterns(D, t);
  const max = Math.max(1, ...w.perDay.map((x) => x.n));
  const stat = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
  const grid28 = (h) => [...Array(28)].map((_, i) => { const d = addDays(t, i - 27); return `<i class="${habitDone(h, d) ? 'on' : ''}${d === t ? ' now' : ''}" title="${esc(fmtDate(d))}"></i>`; }).join('');
  return header('Progress', 'Last 7 days')
    + `<section class="card"><div class="stats">${stat(w.tasks, 'tasks done')}${stat(w.habitRate == null ? '–' : Math.round(w.habitRate * 100) + '%', 'habits kept')}${stat(`${w.journalDays}/7`, 'journal days')}${stat(w.mood == null ? '–' : moodFace(Math.round(w.mood)), 'mood')}</div>
      <div class="bars" aria-label="Tasks done each day">${w.perDay.map((x) => `<div class="bar"><small>${x.n || ''}</small><i style="height:${Math.round((x.n / max) * 72)}px" class="${x.n ? '' : 'zero'}"></i><span>${esc(parseYmd(x.d).toLocaleDateString(undefined, { weekday: 'narrow' }))}</span></div>`).join('')}</div></section>`
    + `<section class="card">${sectionH('What you might be missing')}
      ${pats.length ? `<ul class="pats">${pats.map((p) => `<li>${esc(p.text)}</li>`).join('')}</ul>` : '<p class="empty-line">Patterns show up here after a week or two of use.</p>'}
      <button class="btn block ai-btn" data-action="ask-ai">${icon('spark')}Ask AI what it sees</button></section>`
    + `<section class="card">${sectionH('Habits', '<button class="link" data-action="habit-new">Add</button>')}
      ${D.habits.length ? D.habits.sort(byCreated).map((h) => { const s = habitStreak(h, t); return `<button class="hrow" data-action="habit-edit" data-id="${h.id}"><span class="hrow-top"><b>${esc(h.title)}</b><span class="muted">${s ? `${plural(s, 'day')} streak` : 'No streak'} · ${habitCount(h, addDays(t, -27), t)}/28</span></span><span class="h28">${grid28(h)}</span></button>`; }).join('')
        : '<p class="empty-line">No habits yet.</p>'}</section>`
    + `<section class="card">${sectionH('Goals', '<button class="link" data-action="goal-new">Add</button>')}
      ${D.goals.length ? D.goals.sort(byCreated).map((g) => { const n = goalNow(g), done = n >= Number(g.target); return `<div class="goal${done ? ' done' : ''}"><button class="goal-main" data-action="goal-edit" data-id="${g.id}"><span class="goal-top"><b>${esc(g.title)}</b><span class="muted">${n} / ${esc(g.target)}${g.unit ? ' ' + esc(g.unit) : ''}</span></span><span class="meter"><i style="width:${Math.round(goalPct(g) * 100)}%"></i></span></button>
          <button class="icon-btn plus" data-action="goal-inc" data-id="${g.id}" aria-label="Add 1 to ${esc(g.title)}">${done ? icon('check') : '+1'}</button></div>`; }).join('')
        : '<p class="empty-line">Something to count toward, like 12 books or 30 runs.</p>'}</section>`;
};
A['ask-ai'] = () => askAI();

/* ---- Goals ---- */
A['goal-new'] = () => goalSheet(null);
A['goal-edit'] = (el) => goalSheet(get(el.dataset.id));
function goalSheet(g) {
  openSheet({ title: g ? 'Goal' : 'New goal', body: `<form class="form" data-form="goal" data-id="${g ? g.id : ''}">
    <label class="field"><span>Goal</span><input name="title" value="${esc(g ? g.title : '')}" maxlength="120" required autocomplete="off" placeholder="Read books"></label>
    <div class="two"><label class="field"><span>Target</span><input name="target" type="number" inputmode="numeric" min="1" max="100000" value="${esc(g ? g.target : '')}" required placeholder="12"></label>
      <label class="field"><span>Unit</span><input name="unit" value="${esc(g ? g.unit || '' : '')}" maxlength="20" placeholder="books"></label></div>
    ${g ? `<label class="field"><span>So far</span><input name="now" type="number" inputmode="numeric" min="0" max="100000" value="${goalNow(g)}"></label>` : ''}
    <p class="err" data-form-error></p>
    <div class="row-end">${g ? `<button type="button" class="btn danger" data-action="delete" data-id="${g.id}">Delete</button><span class="spacer"></span>` : ''}<button class="btn primary">Save</button></div></form>` });
}
F.goal = async (form, v) => {
  const title = String(v.title || '').trim(), target = Number(v.target);
  if (!title) throw new Error('Give the goal a name.');
  if (!Number.isFinite(target) || target < 1) throw new Error('The target is a number, 1 or more.');
  const old = get(form.dataset.id), log = { ...((old && old.log) || {}) };
  if (old && v.now !== undefined && v.now !== '') { // a correction is logged today, so the history still adds up
    const diff = Math.round(Number(v.now)) - goalNow(old);
    if (Number.isFinite(diff) && diff) log[today()] = (Number(log[today()]) || 0) + diff;
  }
  await put({ ...(old || { type: 'goal' }), title, target: Math.round(target), unit: String(v.unit || '').trim(), log });
  closeSheet();
};
A['goal-inc'] = async (el) => {
  const g = get(el.dataset.id);
  if (!g) return;
  const t = today(), log = { ...(g.log || {}) };
  log[t] = (Number(log[t]) || 0) + 1;
  await put({ ...g, log });
  haptic();
  if (goalNow({ log }) === Number(g.target)) toast(`Goal reached: ${g.title}`);
};
