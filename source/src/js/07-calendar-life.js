/* ===== Calendar ===== */
const cal = { month: null, sel: null, mode: 'month' };
VIEWS.calendar = () => {
  const D = data(), t = today();
  cal.month = cal.month || t.slice(0, 7);
  cal.sel = cal.sel || t;
  const loadCls = (r) => (r > 1 ? 'bad' : r > 0.8 ? 'warn' : '');
  const weekLoads = [...Array(7)].map((_, i) => Brain.dayLoad(D, addDays(weekStart(t), i), t));
  const wkTotal = weekLoads.reduce((s, l) => s + l.total, 0), wkCap = weekLoads.reduce((s, l) => s + l.cap, 0);
  const overDays = weekLoads.filter((l) => l.ratio > 1).length;
  const conflicts = Brain.overlaps(D.events.filter((e) => isYmd(e.date) && e.date >= t));
  const conflictIds = new Set(conflicts.flat().map((e) => e.id));
  const dayPanel = (d) => {
    const L = Brain.dayLoad(D, d, t);
    const evs = L.events.slice().sort((a, b) => (a.start || '').localeCompare(b.start || ''));
    return `<div class="split" style="margin-top:4px"><h3 style="font-size:17px;font-weight:600">${fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric' })}</h3><button class="btn sm primary" data-action="add" data-type="event" data-date="${d}">${icon('plus')}Event</button></div>
      <div class="meter ${loadCls(L.ratio)}" style="margin-top:10px"><i style="width:${Math.min(100, L.ratio * 100)}%"></i><span class="mark" style="left:80%"></span></div>
      <p class="xs muted" style="margin-top:6px">${fmtMin(L.total)} of ${fmtMin(L.cap)} capacity · ${fmtMin(L.eventMin)} events · ${fmtMin(L.taskMin)} tasks</p>
      <div class="list" style="margin-top:10px">${evs.map((e) => `<button class="item" data-action="edit" data-id="${e.id}"><span class="num muted small" style="width:92px;flex:none">${e.allDay ? 'All day' : esc(e.start || '—') + (e.end ? '–' + esc(e.end) : '')}</span><span class="item-main"><span class="item-title">${esc(e.title)}</span>${e.location || e.notes ? `<span class="item-meta">${esc([e.location, trunc(e.notes, 80)].filter(Boolean).join(' · '))}</span>` : ''}</span>${conflictIds.has(e.id) ? '<span class="tag bad">Overlaps</span>' : ''}</button>`).join('')}
      ${L.tasks.map((x) => `<button class="item" data-action="edit" data-id="${x.id}"><span class="num muted small" style="width:92px;flex:none">Task</span><span class="item-main"><span class="item-title">${esc(x.title)}</span><span class="item-meta">${x.status === 'done' ? 'Done' : x.estimateMin ? fmtMin(x.estimateMin) : 'No estimate'}</span></span></button>`).join('')}
      ${!evs.length && !L.tasks.length ? '<div class="empty" style="margin-top:10px">Nothing on this day.</div>' : ''}</div>`;
  };
  let body;
  if (cal.mode === 'month') {
    const first = parseYmd(cal.month + '-01');
    const start = weekStart(ymd(first));
    const last = new Date(first.getFullYear(), first.getMonth() + 1, 0);
    const cells = Math.ceil((daysBetween(start, ymd(last)) + 1) / 7) * 7;
    body = `<div class="cal" role="grid">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => `<div class="dow">${d}</div>`).join('')}
      ${[...Array(cells)].map((_, i) => {
        const d = addDays(start, i), L = Brain.dayLoad(D, d, t);
        return `<button class="day ${d.slice(0, 7) !== cal.month ? 'out' : ''} ${d === t ? 'today' : ''}" data-action="cal-select" data-date="${d}" aria-pressed="${d === cal.sel}" aria-label="${fmtDate(d, { weekday: 'long', month: 'long', day: 'numeric' })}, ${plural(L.events.length, 'event')}, ${pct(L.ratio)} of capacity">
          <span class="dn">${Number(d.slice(8))}</span><span class="dots">${L.events.slice(0, 3).map(() => '<i></i>').join('')}</span>
          ${L.total ? `<span class="load ${loadCls(L.ratio)}"><i style="width:${Math.min(100, L.ratio * 100)}%"></i></span>` : ''}</button>`;
      }).join('')}</div>
      <div class="section">${dayPanel(cal.sel)}</div>`;
  } else {
    const days = [...Array(30)].map((_, i) => addDays(t, i)).map((d) => ({ d, L: Brain.dayLoad(D, d, t) })).filter(({ L }) => L.events.length || L.tasks.length);
    body = days.length ? days.map(({ d, L }) => `<div class="agenda-day"><h3>${d === t ? 'Today' : fmtDate(d, { weekday: 'long', month: 'short', day: 'numeric' })}${L.ratio > 1 ? '<span class="tag bad">Over capacity</span>' : L.ratio > 0.8 ? '<span class="tag warn">Tight</span>' : ''}</h3><div class="list">
      ${L.events.slice().sort((a, b) => (a.start || '').localeCompare(b.start || '')).map((e) => `<button class="item" data-action="edit" data-id="${e.id}"><span class="num muted small" style="width:92px;flex:none">${e.allDay ? 'All day' : esc(e.start || '—') + (e.end ? '–' + esc(e.end) : '')}</span><span class="item-main"><span class="item-title">${esc(e.title)}</span>${e.location ? `<span class="item-meta">${esc(e.location)}</span>` : ''}</span>${conflictIds.has(e.id) ? '<span class="tag bad">Overlaps</span>' : ''}</button>`).join('')}
      ${L.tasks.map((x) => `<button class="item" data-action="edit" data-id="${x.id}"><span class="num muted small" style="width:92px;flex:none">Task</span><span class="item-main"><span class="item-title">${esc(x.title)}</span></span></button>`).join('')}</div></div>`).join('')
      : '<div class="empty">Nothing in the next 30 days.</div>';
  }
  const m = parseYmd(cal.month + '-01');
  return head(`This week: ${fmtMin(wkTotal)} of ${fmtMin(wkCap)}${overDays ? ` · ${plural(overDays, 'day')} over` : ''}`, 'Calendar', `<button class="btn primary" data-action="add" data-type="event" data-date="${cal.sel}">${icon('plus')}Event</button>`)
    + `<div class="split" style="margin-bottom:14px"><div class="seg" role="group" aria-label="View"><button data-action="cal-mode" data-mode="month" aria-pressed="${cal.mode === 'month'}">Month</button><button data-action="cal-mode" data-mode="agenda" aria-pressed="${cal.mode === 'agenda'}">Agenda</button></div>
      ${conflicts.length ? `<span class="tag bad">${plural(conflicts.length, 'overlap')}</span>` : ''}</div>`
    + (cal.mode === 'month' ? `<div class="cal-head"><button class="icon-btn" data-action="cal-shift" data-n="-1" aria-label="Previous month">${icon('left')}</button><h2>${m.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2><div class="cluster"><button class="btn sm" data-action="cal-today">Today</button><button class="icon-btn" data-action="cal-shift" data-n="1" aria-label="Next month">${icon('right')}</button></div></div>` : '')
    + body;
};
A['cal-select'] = (el) => { cal.sel = el.dataset.date; if (el.dataset.date.slice(0, 7) !== cal.month) cal.month = el.dataset.date.slice(0, 7); render(); };
A['cal-shift'] = (el) => { const d = parseYmd(cal.month + '-01'); d.setMonth(d.getMonth() + Number(el.dataset.n)); cal.month = ymd(d).slice(0, 7); render(); };
A['cal-today'] = () => { cal.month = today().slice(0, 7); cal.sel = today(); render(); };
A['cal-mode'] = (el) => { cal.mode = el.dataset.mode; render(); };

/* ===== Life Model ===== */
const LIFE_TABS = [['direction', 'Direction'], ['areas', 'Areas'], ['aims', 'Aims'], ['goals', 'Goals'], ['projects', 'Projects'], ['tasks', 'Tasks'], ['habits', 'Habits']];
let taskFilter = 'open';
VIEWS.life = (sub) => {
  const tab = LIFE_TABS.find(([k]) => k === sub) ? sub : 'direction';
  const D = data(), t = today();
  const chips = `<div class="chips" style="margin-bottom:6px">${LIFE_TABS.map(([k, l]) => `<button class="chip" data-action="nav" data-to="life" data-sub="${k}" aria-pressed="${k === tab}">${l}</button>`).join('')}</div>`;
  const addBtn = (type, label) => `<button class="btn primary" data-action="add" data-type="${type}">${icon('plus')}${label}</button>`;
  const name = (id) => { const r = get(id); return r ? (r.emoji ? r.emoji + ' ' : '') + (r.title || r.name) : ''; };
  let body = '', action = '';
  if (tab === 'direction') {
    const p = D.profile;
    const unAims = D.goals.filter((g) => g.status === 'active' && !g.aimId && !g.areaId).length;
    const unProj = D.projects.filter((x) => x.status === 'active' && !x.goalId).length;
    const unTasks = D.tasks.filter((x) => x.status === 'open' && !x.projectId && !x.goalId).length;
    body = `<form class="form section" data-form="profile">
        ${fieldHTML(['identity', 'Who I am becoming', 'area', { ph: 'Someone who…' }], p.identity)}
        ${fieldHTML(['direction', 'Desired direction', 'area', { ph: 'Where I want my life to head over the next few years' }], p.direction)}
        ${fieldHTML(['priorities', 'Current priorities', 'area', { ph: 'What gets my time first this season' }], p.priorities)}
        ${fieldHTML(['capacityHours', 'Realistic focused hours per day', 'number', { min: 0.5, maxNum: 18, step: 0.5, hint: 'Used to detect overload. Include meetings. Most people sustain 4–7.' }], p.capacityHours)}
        <p class="err" data-form-error></p><div class="form-actions"><button class="btn primary">Save direction</button></div></form>`
      + section('Values, in order', `<div class="list">${p.values.map((v, i) => `<div class="item"><span class="num muted" style="width:20px">${i + 1}</span><span class="item-main item-title">${esc(v)}</span>
          <button class="icon-btn plain" data-action="value-move" data-i="${i}" data-d="-1" aria-label="Move up" ${i === 0 ? 'disabled' : ''}>${icon('up')}</button><button class="icon-btn plain" data-action="value-move" data-i="${i}" data-d="1" aria-label="Move down" ${i === p.values.length - 1 ? 'disabled' : ''}>${icon('down')}</button><button class="icon-btn plain" data-action="value-del" data-i="${i}" aria-label="Remove">${icon('close')}</button></div>`).join('')}</div>
        <form class="cluster" data-form="value-add" style="margin-top:10px;flex-wrap:nowrap"><input class="input" name="value" maxlength="60" placeholder="Add a value, e.g. Health" aria-label="New value" style="flex:1;min-width:0"><button class="btn">Add</button></form>`)
      + section('How it connects', `<div class="list">${D.areas.map((a) => {
          const aims = D.aims.filter((x) => x.areaId === a.id), goals = D.goals.filter((g) => g.areaId === a.id || aims.some((x) => x.id === g.aimId));
          return `<div class="item"><span class="item-emoji">${esc(a.emoji || '•')}</span><span class="item-main"><span class="item-title">${esc(a.name)}</span><span class="item-meta">${plural(aims.length, 'aim')} · ${plural(goals.length, 'goal')} · ${plural(D.projects.filter((x) => goals.some((g) => g.id === x.goalId)).length, 'project')}</span></span></div>`;
        }).join('') || '<div class="empty">Add life areas to see how your goals connect.</div>'}</div>
        ${unAims + unProj + unTasks ? `<p class="small muted" style="margin-top:10px">Not connected yet: ${[unAims && plural(unAims, 'goal'), unProj && plural(unProj, 'project'), unTasks && plural(unTasks, 'task')].filter(Boolean).join(', ')}.</p>` : ''}`);
  } else if (tab === 'areas') {
    action = addBtn('area', 'Area');
    body = list(D.areas, (a) => `<button class="item" data-action="edit" data-id="${a.id}"><span class="item-emoji">${esc(a.emoji || '•')}</span><span class="item-main"><span class="item-title">${esc(a.name)}</span><span class="item-meta">${plural(D.aims.filter((x) => x.areaId === a.id).length, 'aim')} · ${plural(D.goals.filter((g) => g.areaId === a.id).length, 'goal')} · ${plural(D.habits.filter((h) => h.areaId === a.id).length, 'habit')}</span></span></button>`, 'No life areas yet. Areas are the big parts of life: health, work, people, learning.');
  } else if (tab === 'aims') {
    action = addBtn('aim', 'Aim');
    body = list(D.aims, (a) => `<button class="item" data-action="edit" data-id="${a.id}"><span class="item-main"><span class="item-title">${esc(a.title)}</span><span class="item-meta">${a.areaId ? esc(name(a.areaId)) : 'No area'} · ${plural(D.goals.filter((g) => g.aimId === a.id).length, 'goal')}</span></span></button>`, 'Long-term aims are where you want to be in years, not weeks.');
  } else if (tab === 'goals') {
    action = addBtn('goal', 'Goal');
    body = list(D.goals.slice().sort((a, b) => (a.status === 'active' ? 0 : 1) - (b.status === 'active' ? 0 : 1)), (g) => {
      const projIds = D.projects.filter((x) => x.goalId === g.id).map((x) => x.id);
      const ts = D.tasks.filter((x) => x.goalId === g.id || projIds.includes(x.projectId));
      const dn = ts.filter((x) => x.status === 'done').length;
      return `<button class="item" data-action="edit" data-id="${g.id}"><span class="item-main"><span class="item-title">${esc(g.title)}</span><span class="item-meta">${[g.aimId && name(g.aimId), g.areaId && name(g.areaId), g.due && 'due ' + fmtDate(g.due), ts.length && `${dn}/${ts.length} tasks done`].filter(Boolean).map(esc).join(' · ') || 'No details'}</span></span>
        ${g.status !== 'active' ? `<span class="tag">${esc(g.status)}</span>` : !g.aimId && !g.areaId ? '<span class="tag warn">Not linked</span>' : ''}</button>`;
    }, 'Goals are concrete outcomes with a finish line.');
  } else if (tab === 'projects') {
    action = addBtn('project', 'Project');
    body = list(D.projects, (x) => {
      const ts = D.tasks.filter((y) => y.projectId === x.id);
      return `<button class="item" data-action="edit" data-id="${x.id}"><span class="item-main"><span class="item-title">${esc(x.title)}</span><span class="item-meta">${x.goalId ? esc(name(x.goalId)) : 'No goal'} · ${ts.filter((y) => y.status === 'open').length} open · ${ts.filter((y) => y.status === 'done').length} done</span></span>
        ${x.status !== 'active' ? `<span class="tag">${esc(x.status)}</span>` : !x.goalId ? '<span class="tag warn">No goal</span>' : ''}</button>`;
    }, 'Projects group tasks toward a goal.');
  } else if (tab === 'tasks') {
    action = addBtn('task', 'Task');
    const shown = D.tasks.filter((x) => taskFilter === 'all' || (taskFilter === 'open' ? x.status === 'open' : x.status !== 'open')).sort((a, b) => Brain.score(D, b, t) - Brain.score(D, a, t));
    body = `<div class="chips section">${[['open', 'Open'], ['closed', 'Done & let go'], ['all', 'All']].map(([k, l]) => `<button class="chip" data-action="task-filter" data-f="${k}" aria-pressed="${taskFilter === k}">${l}</button>`).join('')}</div>`
      + list(shown, (x) => `<button class="item" data-action="edit" data-id="${x.id}"><span class="item-main"><span class="item-title">${esc(x.title)}</span><span class="item-meta">${[x.projectId && name(x.projectId), !x.projectId && x.goalId && name(x.goalId), x.plannedDate && fmtDate(x.plannedDate), x.estimateMin && fmtMin(x.estimateMin)].filter(Boolean).map(esc).join(' · ') || 'Unplanned'}</span></span>
        ${x.status === 'done' ? '<span class="tag good">Done</span>' : x.status === 'abandoned' ? '<span class="tag">Let go</span>' : !x.projectId && !x.goalId ? '<span class="tag">Unlinked</span>' : ''}</button>`, 'No tasks here.');
  } else if (tab === 'habits') {
    action = addBtn('habit', 'Habit');
    const days = [...Array(7)].map((_, i) => addDays(t, i - 6));
    body = list(D.habits, (h) => `<div class="item"><span class="item-emoji">${esc(h.emoji || '•')}</span><span class="item-main"><button class="btn ghost sm" style="padding:0;min-height:0" data-action="edit" data-id="${h.id}"><span class="item-title">${esc(h.title)}</span></button>
        <span class="item-meta">${days.filter((d) => h.log && h.log[d]).length}/7 this week · target ${h.perWeek || 7}/wk</span>
        <span class="cluster" style="margin-top:8px;gap:5px">${days.map((d) => `<button class="chip" style="height:30px;padding:0 9px" data-action="habit-toggle" data-id="${h.id}" data-date="${d}" aria-pressed="${!!(h.log && h.log[d])}" aria-label="${fmtDate(d, { weekday: 'long' })}">${fmtDate(d, { weekday: 'narrow' })}</button>`).join('')}</span></span></div>`, 'Habits are small repeated actions. Track them by tapping days.');
  }
  return head('Life Model', LIFE_TABS.find(([k]) => k === tab)[1], action) + chips + body;
};
function list(items, row, emptyText) {
  return items.length ? `<div class="list section">${items.map(row).join('')}</div>` : `<div class="empty section">${esc(emptyText)}</div>`;
}
A['task-filter'] = (el) => { taskFilter = el.dataset.f; render(); };
F.profile = async (form, v) => {
  const cap = Number(v.capacityHours);
  if (!Number.isFinite(cap) || cap < 0.5 || cap > 18) throw new Error('Hours per day must be between 0.5 and 18.');
  await saveProfile({ identity: String(v.identity || '').trim(), direction: String(v.direction || '').trim(), priorities: String(v.priorities || '').trim(), capacityHours: cap });
  toast('Direction saved');
};
F['value-add'] = async (form, v) => {
  const val = String(v.value || '').trim();
  if (!val) return;
  if (S.profile.values.some((x) => x.toLowerCase() === val.toLowerCase())) { toast('That value is already listed.', 'bad'); return; }
  await saveProfile({ values: [...S.profile.values, val] });
};
A['value-move'] = async (el) => {
  const i = Number(el.dataset.i), j = i + Number(el.dataset.d), v = [...S.profile.values];
  if (j < 0 || j >= v.length) return;
  [v[i], v[j]] = [v[j], v[i]];
  await saveProfile({ values: v });
};
A['value-del'] = async (el) => { await saveProfile({ values: S.profile.values.filter((_, i) => i !== Number(el.dataset.i)) }); };
