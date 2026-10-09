/* ===== Progress: the week, habits, patterns, and AI ===== */
VIEWS.progress = () => {
  const D = data(), t = today(), w = weekStats(D, t), pats = patterns(D, t);
  const max = Math.max(1, ...w.perDay.map((x) => x.n));
  const stat = (n, l) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`;
  const grid28 = (h) => [...Array(28)].map((_, i) => { const d = addDays(t, i - 27); return `<i class="${habitDone(h, d) ? 'on' : ''}${d === t ? ' now' : ''}" title="${esc(fmtDate(d))}"></i>`; }).join('');
  return header('Progress', 'Last 7 days')
    + `<section class="card"><div class="stats">${stat(w.tasks, 'tasks done')}${stat(w.habitRate == null ? '–' : Math.round(w.habitRate * 100) + '%', 'habits kept')}${stat(w.overdue, 'overdue now')}</div>
      <div class="bars" aria-label="Tasks done each day">${w.perDay.map((x) => `<div class="bar"><small>${x.n || ''}</small><i style="height:${Math.round((x.n / max) * 72)}px" class="${x.n ? '' : 'zero'}"></i><span>${esc(parseYmd(x.d).toLocaleDateString(undefined, { weekday: 'narrow' }))}</span></div>`).join('')}</div></section>`
    + `<section class="card">${sectionH('What you might be missing')}
      ${pats.length ? `<ul class="pats">${pats.map((p) => `<li>${esc(p.text)}</li>`).join('')}</ul>` : '<p class="empty-line">Patterns show up here after a week or two of use.</p>'}
      <div class="ai-row"><button class="btn ai-btn" data-action="ask-ai">${icon('spark')}Ask AI what it sees</button><button class="btn ai-btn" data-action="look-back">${icon('spark')}Weekly look back</button></div></section>`
    + `<section class="card">${sectionH('Habits', '<button class="link" data-action="habit-new">Add</button>')}
      ${D.habits.length ? D.habits.sort(byCreated).map((h) => { const w = habitCount(h, addDays(t, -6), t); return `<button class="hrow" data-action="habit-edit" data-id="${h.id}"><span class="hrow-top"><b>${esc(h.title)}</b><span class="muted">${w} of last 7 days · ${habitCount(h, addDays(t, -27), t)} of 28</span></span><span class="h28">${grid28(h)}</span></button>`; }).join('')
        : '<p class="empty-line">No habits yet.</p>'}</section>`;
};
A['ask-ai'] = () => askAI();

