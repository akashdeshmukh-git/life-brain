/* ===== Lines: your life areas as subway lines, each with its own letter and colour ===== */
VIEWS.lines = () => {
  const D = data(), t = today(), lines = Lines.all(D).map((a) => Lines.of(D, a));
  const day = Loop.day(D, t);
  const todayIds = day && day.committedAt ? day.plannedIds : D.tasks.filter((x) => x.status === 'open' && x.plannedDate === t).map((x) => x.id);
  const onLine = (id, L) => { const x = D.tasks.find((y) => y.id === id); return !!x && (Lines.forTask(D, x) || {}).id === L.id; };
  const unlined = D.tasks.filter((x) => x.status === 'open' && !Lines.forTask(D, x)).length;
  const rows = lines.map((L) => `<div class="line-item"><button class="line-main" data-action="line-open" data-id="${L.id}">${lineBullet(L)}<span class="line-name">${esc(L.name)}</span><span class="line-count">${todayIds.filter((id) => onLine(id, L)).length} today</span></button>
      <button class="icon-btn plain" data-action="line-edit" data-id="${L.id}" aria-label="Edit the ${esc(L.name)} line">${icon('more')}</button></div>`).join('');
  const kept = lines.map((L) => ({ L, ...Lines.kept(D, L.id, t) })).filter((r) => r.planned);
  return head(fmtDate(t, { weekday: 'short', month: 'short', day: 'numeric' }), 'Lines', `<button class="icon-btn round" data-action="nav" data-to="settings" aria-label="Settings">${icon('gear')}</button>`)
    + (lines.length ? `<div class="lines">${rows}</div>` : '<div class="empty"><strong>No lines yet.</strong> A line is one part of your life, like Work, Health or Family. Every task on it carries its colour.</div>')
    + `<button class="btn block outline" style="margin-top:14px" data-action="line-add">Add line</button>`
    + (unlined ? `<p class="small muted" style="margin-top:10px">${plural(unlined, 'open task')} ${unlined === 1 ? 'isn’t' : 'aren’t'} on any line yet. Link a task to a goal in one of these areas and it rides that line.</p>` : '')
    + section('How each line is doing', kept.length ? `<div class="list">${kept.map(({ L, planned, kept: k }) => `<div class="item">${lineBullet(L, 'sm')}<span class="item-main"><span class="item-title">${esc(L.name)}</span><span class="item-meta">Kept ${k} of ${plural(planned, 'planned task')} in two weeks</span><div class="meter" style="margin-top:6px"><i style="width:${Math.round((k / planned) * 100)}%"></i></div></span><b class="num">${pct(k / planned)}</b></div>`).join('')}</div>`
      : '<div class="empty">Close a few days and this shows which parts of your life get done and which keep slipping.</div>');
};

/* A line up close: its goals, its open tasks, and how well its plans are kept. */
A['line-open'] = (el) => {
  const D = data(), a = get(el.dataset.id), t = today();
  if (!a) return;
  const L = Lines.of(D, a), K = Lines.kept(D, a.id, t);
  const goals = D.goals.filter((g) => (Lines.forGoal(D, g) || {}).id === a.id);
  const tasks = D.tasks.filter((x) => x.status === 'open' && (Lines.forTask(D, x) || {}).id === a.id);
  openSheet({ title: `${a.name} line`, body: `<div class="line-preview">${lineBullet(L, 'lg')}<div><b>${esc(a.name)}</b><div class="eyebrow">Line ${esc(L.code)}</div></div></div>
    <p class="small muted" style="margin-top:10px">${K.planned ? `You kept ${K.kept} of ${plural(K.planned, 'planned task')} on this line in two weeks.` : 'Nothing on this line was planned in the last two weeks.'}</p>
    ${section('Goals', goals.length ? `<div class="list">${goals.map((g) => `<button class="item" data-action="edit" data-id="${g.id}"><span class="item-main"><span class="item-title">${esc(g.title)}</span><span class="item-meta">${esc(g.status || 'active')}${isYmd(g.due) ? ' · due ' + fmtDate(g.due) : ''}</span></span>${icon('right')}</button>`).join('')}</div>` : '<div class="empty">No goals on this line yet.</div>')}
    ${section('Open tasks', tasks.length ? `<div class="list">${tasks.map((x) => `<button class="item" data-action="edit" data-id="${x.id}">${lineBullet(L, 'sm')}<span class="item-main"><span class="item-title">${esc(x.title)}</span><span class="item-meta">${x.plannedDate ? 'Planned ' + fmtDate(x.plannedDate) : 'Not planned'}${x.estimateMin ? ' · ' + fmtMin(x.estimateMin) : ''}</span></span></button>`).join('')}</div>` : '<div class="empty">Nothing open on this line.</div>')}
    <div class="form-actions" style="margin-top:18px"><button class="btn" data-action="line-edit" data-id="${a.id}">Edit line</button><button class="btn primary" data-action="add" data-type="goal" data-preset="${esc(JSON.stringify({ areaId: a.id, status: 'active' }))}">Add a goal</button></div>` });
};
A['line-add'] = () => lineSheet(null);
A['line-edit'] = (el) => lineSheet(get(el.dataset.id));
function lineSheet(a) {
  const D = data();
  const L = a ? Lines.of(D, a) : { code: '', color: LINE_ORDER[D.areas.length % LINE_ORDER.length], ...LINE_COLORS[LINE_ORDER[D.areas.length % LINE_ORDER.length]] };
  openSheet({ title: a ? 'Edit line' : 'New line', body: `<form class="form" data-form="line" data-id="${a ? a.id : ''}">
    <div class="line-preview" id="line-preview">${lineBullet(L, 'lg')}<div><b data-p="name">${esc(a ? a.name : 'New line')}</b><div class="eyebrow" data-p="code">Line ${esc(L.code || '?')}</div></div></div>
    ${fieldHTML(['name', 'Line name', 'text', { req: 1, max: 30, ph: 'Work' }], a ? a.name : '')}
    ${fieldHTML(['code', 'Line code', 'text', { req: 1, max: 2, ph: 'W', hint: 'One or two characters, shown on the bullet.' }], a ? Lines.code(a) : '')}
    <fieldset class="field line-colors"><legend>Colour</legend><div class="swatches">${Object.entries(LINE_COLORS).map(([k, c]) => `<label class="swatch-pick"><input type="radio" name="color" value="${k}" ${L.color === k ? 'checked' : ''}><span style="background:${c.hex}"></span><span class="sr">${c.name}</span></label>`).join('')}</div></fieldset>
    <p class="err" data-form-error></p>
    <button class="btn primary block">Save line</button>
    ${a ? `<button type="button" class="btn ghost danger block" data-action="delete" data-id="${a.id}">Delete line</button>` : ''}</form>`,
  onMount(root) {
    const sync = () => {
      const f = $('form', root), b = $('#line-preview .bullet', root), c = LINE_COLORS[(f.elements.color && f.elements.color.value) || L.color];
      const code = (String(f.elements.code.value).trim() || String(f.elements.name.value).trim()[0] || '?').slice(0, 2).toUpperCase();
      b.textContent = code; b.classList.remove('none'); b.style.setProperty('--l', c.hex); b.style.setProperty('--li', c.ink);
      $('[data-p="name"]', root).textContent = String(f.elements.name.value).trim() || 'New line';
      $('[data-p="code"]', root).textContent = 'Line ' + code;
    };
    root.addEventListener('input', sync); root.addEventListener('change', sync);
  } });
}
F.line = async (form, v) => {
  const name = String(v.name || '').trim(), code = String(v.code || '').trim().toUpperCase(), color = LINE_COLORS[v.color] ? v.color : '';
  if (!name) throw new Error('Give the line a name.');
  if (!code || code.length > 2) throw new Error('The line code is one or two characters.');
  const old = form.dataset.id ? get(form.dataset.id) : null;
  await put({ ...(old || { type: 'area', emoji: '' }), name, code, color });
  closeSheet();
  toast(old ? 'Line saved.' : `${name} line added.`);
};
