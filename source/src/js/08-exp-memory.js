/* ===== Experiments ===== */
VIEWS.experiments = () => {
  const D = data(), t = today();
  const groups = [['running', 'Running'], ['planned', 'Planned'], ['done', 'Concluded'], ['abandoned', 'Abandoned']];
  const row = (e) => {
    const obs = e.observations || [];
    const meta = e.status === 'running' && isYmd(e.startDate) ? `Day ${daysBetween(e.startDate, t) + 1}${isYmd(e.endDate) ? ' of ' + (daysBetween(e.startDate, e.endDate) + 1) : ''}` : e.status === 'planned' && isYmd(e.startDate) ? 'Starts ' + fmtDate(e.startDate) : e.learning ? 'Learned: ' + trunc(e.learning, 80) : '';
    const ev = e.policy && e.status === 'running' ? Loop.evaluate(D, e, t) : null;
    return `<button class="item" data-action="exp-open" data-id="${e.id}"><span class="item-main">${e.policy ? `<span class="cluster" style="margin-bottom:3px"><span class="tag accent">${e.status === 'running' ? 'Shaping your plans' : 'Changed your plans'}</span></span>` : ''}<span class="item-title">${esc(e.title)}</span><span class="item-meta">${esc(e.policy ? Loop.policyLabel(e.policy) : trunc(e.hypothesis, 110))}</span>${ev ? `<span class="item-meta">${esc(ev.text)}</span>` : ''}<span class="item-meta">${esc(meta)}${meta ? ' · ' : ''}${plural(obs.length, 'observation')}</span></span>${icon('right')}</button>`;
  };
  return head('Hypothesis → intervention → measurement → learning', 'Experiments', `<button class="btn primary" data-action="add" data-type="experiment">${icon('plus')}Experiment</button>`)
    + (D.experiments.length ? groups.map(([k, l]) => { const xs = D.experiments.filter((e) => e.status === k); return xs.length ? section(l, `<div class="list">${xs.map(row).join('')}</div>`) : ''; }).join('')
      : `<div class="empty"><strong>Treat changes as experiments.</strong> Write what you expect, try it for a set time, record what happens, then decide what to keep. The Brain suggests experiments from what it detects.<div style="margin-top:10px"><button class="btn sm" data-action="brain-suggest">See suggestions</button></div></div>`);
};
A['exp-open'] = (el) => openExperiment(el.dataset.id);
function openExperiment(id) {
  const e = get(id);
  if (!e) { toast('That experiment no longer exists.', 'bad'); return; }
  const t = today();
  const obs = (e.observations || []).slice().sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const kv = (k, v) => v ? `<div><div class="xs muted" style="font-weight:600;letter-spacing:.04em;text-transform:uppercase">${k}</div><p style="margin-top:2px;white-space:pre-wrap">${esc(v)}</p></div>` : '';
  openSheet({ title: e.title, body: `<div class="stack">
      <div class="cluster"><span class="tag ${e.status === 'running' ? 'accent' : e.status === 'done' ? 'good' : ''}">${esc((STATUS.experiment.find(([k]) => k === e.status) || [, e.status])[1])}</span>${isYmd(e.startDate) ? `<span class="tag num">${fmtDate(e.startDate)}${isYmd(e.endDate) ? ' → ' + fmtDate(e.endDate) : ''}</span>` : ''}</div>
      ${e.policy && e.status === 'running' ? (() => { const ev = Loop.evaluate(data(), e, t); return `<div class="card"><div class="xs muted" style="font-weight:600;letter-spacing:.04em;text-transform:uppercase">While it runs, your plans follow</div><b style="display:block;margin-top:2px">${esc(Loop.policyLabel(e.policy))}</b><p class="small" style="margin-top:8px">${esc(ev.text)}</p>
        ${ev.ready ? `<div class="form-actions"><button class="btn sm" data-action="exp-drop" data-id="${e.id}" data-from="exp">Drop it</button><button class="btn sm" data-action="exp-extend" data-id="${e.id}" data-from="exp">Another week</button><button class="btn sm primary" data-action="exp-keep" data-id="${e.id}" data-from="exp">Keep as a rule</button></div>` : ''}</div>`; })() : ''}
      ${kv('Hypothesis', e.hypothesis)}${kv('Intervention', e.intervention)}${kv('Measurement', e.measurement)}${kv('Outcome', e.outcome)}${kv('Learning', e.learning)}${kv('Next adaptation', e.adaptation)}
    </div>
    ${section('Observations', `${obs.length ? `<div class="list">${obs.map((o) => `<div class="item"><span class="num small muted" style="width:70px;flex:none">${fmtDate(o.date, { month: 'short', day: 'numeric' })}</span><span class="item-main">${o.value !== '' && o.value != null ? `<b class="num">${esc(o.value)}</b> ` : ''}${esc(o.note || '')}</span><button class="icon-btn plain" data-action="exp-obs-del" data-id="${e.id}" data-oid="${o.id}" aria-label="Remove observation">${icon('close')}</button></div>`).join('')}</div>` : '<div class="empty">No observations yet. Evidence is what makes this an experiment.</div>'}
      ${e.status !== 'done' && e.status !== 'abandoned' ? `<form class="form" data-form="exp-obs" data-id="${e.id}" style="margin-top:12px"><div class="form-row">${fieldHTML(['date', 'Date', 'date', { req: 1 }], t)}${fieldHTML(['value', 'Value (optional)', 'text', { max: 40, ph: 'e.g. 25 min' }], '')}</div>${fieldHTML(['note', 'What did you observe?', 'text', { max: 300 }], '')}<p class="err" data-form-error></p><div class="form-actions"><button class="btn">Add observation</button></div></form>` : ''}`)}
    <div class="form-actions" style="margin-top:20px">
      <button class="btn" data-action="edit" data-id="${e.id}">Edit</button>
      ${e.status === 'planned' ? `<button class="btn primary" data-action="exp-start" data-id="${e.id}">Start today</button>` : ''}
      ${e.status === 'running' ? `<button class="btn ${e.policy ? '' : 'primary'}" data-action="exp-finish" data-id="${e.id}">${e.policy ? 'Conclude by hand' : 'Conclude'}</button>` : ''}
    </div>` });
}
F['exp-obs'] = async (form, v) => {
  const e = get(form.dataset.id);
  if (!e) throw new Error('That experiment no longer exists.');
  if (!isYmd(v.date)) throw new Error('Pick a date.');
  const value = String(v.value || '').trim(), note = String(v.note || '').trim();
  if (!value && !note) throw new Error('Add a value or a note.');
  await put({ ...e, observations: [...(e.observations || []), { id: uid(), date: v.date, value, note }] });
  openExperiment(e.id);
  toast('Observation added');
};
A['exp-obs-del'] = async (el) => {
  const e = get(el.dataset.id);
  if (!e) return;
  await put({ ...e, observations: (e.observations || []).filter((o) => o.id !== el.dataset.oid) });
  openExperiment(e.id);
};
A['exp-start'] = async (el) => {
  const e = get(el.dataset.id);
  if (!e) return;
  const t = today();
  await put({ ...e, status: 'running', startDate: t, endDate: isYmd(e.endDate) && e.endDate >= t ? e.endDate : addDays(t, 6) });
  openExperiment(e.id);
  toast('Experiment started');
};
A['exp-finish'] = (el) => {
  const e = get(el.dataset.id);
  if (!e) return;
  openSheet({ title: 'Conclude experiment', body: `<form class="form" data-form="exp-finish" data-id="${e.id}"><p class="small muted">${esc(e.hypothesis)}</p>
    ${fieldHTML(['outcome', 'Outcome: what actually happened', 'area', { req: 1 }], e.outcome || '')}
    ${fieldHTML(['learning', 'Learning: what this tells you', 'area', { req: 1 }], e.learning || '')}
    ${fieldHTML(['adaptation', 'Next adaptation: what you will change', 'area'], e.adaptation || '')}
    ${fieldHTML(['status', 'Result', 'select', { options: [['done', 'Concluded'], ['abandoned', 'Abandoned early']], def: 'done' }], 'done')}
    <label class="check"><input type="checkbox" name="remember" checked> Save the learning to Learning & Memory</label>
    <p class="err" data-form-error></p>
    <div class="form-actions"><button type="button" class="btn" data-action="sheet-close">Cancel</button><button class="btn primary">Conclude</button></div></form>` });
};
F['exp-finish'] = async (form, v) => {
  const e = get(form.dataset.id);
  if (!e) throw new Error('That experiment no longer exists.');
  const outcome = String(v.outcome || '').trim(), learning = String(v.learning || '').trim();
  if (!outcome || !learning) throw new Error('Outcome and learning are both needed to conclude.');
  const status = v.status === 'abandoned' ? 'abandoned' : 'done';
  await put({ ...e, status, outcome, learning, adaptation: String(v.adaptation || '').trim(), endDate: today() });
  if (v.remember) await put({ type: 'memory', kind: status === 'done' ? 'worked' : 'failed', title: `${e.title}: ${trunc(learning, 70)}`, body: `Hypothesis: ${e.hypothesis}\nOutcome: ${outcome}\nLearning: ${learning}${v.adaptation ? `\nNext: ${v.adaptation}` : ''}`, date: today(), links: [e.id] });
  closeSheet();
  toast('Experiment concluded');
};

/* ===== Learning & Memory ===== */
const mem = { kind: 'all', q: '' };
function memoryList(D) {
  const q = mem.q.trim().toLowerCase();
  const xs = D.memories.filter((m) => (mem.kind === 'all' || m.kind === mem.kind) && (!q || `${m.title} ${m.body || ''} ${m.why || ''}`.toLowerCase().includes(q)))
    .sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || ''));
  return xs.length ? `<div class="list">${xs.map((m) => `<button class="item" data-action="edit" data-id="${m.id}"><span class="item-main"><span class="cluster" style="margin-bottom:3px"><span class="tag ${m.kind === 'worked' ? 'good' : m.kind === 'failed' ? 'bad' : m.kind === 'decision' ? 'accent' : ''}">${esc(MEM_KINDS[m.kind] || 'Note')}</span>${m.source === 'ai' ? '<span class="tag">From AI</span>' : ''}<span class="xs muted">${fmtDate(m.date)}</span></span>
    <span class="item-title">${esc(m.title)}</span>${m.body ? `<span class="item-meta">${esc(trunc(m.body, 160))}</span>` : ''}${m.why ? `<span class="item-meta">Why: ${esc(trunc(m.why, 120))}</span>` : ''}</span></button>`).join('')}</div>`
    : `<div class="empty">${q || mem.kind !== 'all' ? 'Nothing matches.' : 'Nothing remembered yet. Lessons from finished tasks, concluded experiments and decisions land here.'}</div>`;
}
VIEWS.memory = () => {
  const D = data();
  const patterns = D.insights.filter((i) => i.status === 'accepted');
  const pat = D.memories.filter((m) => m.kind === 'pattern');
  const kinds = [['all', 'All'], ...Object.entries(MEM_KINDS)];
  const rules = D.rules.slice().sort((a, b) => (a.active === false) - (b.active === false) || (b.since || '').localeCompare(a.since || ''));
  const rulesHTML = rules.length ? `<div class="list">${rules.map((r) => `<div class="item rule-row"><span class="item-main"><span class="item-title">${esc(r.title)}</span><span class="item-meta">${r.active === false ? 'Paused' : 'Shapes every plan'}${isYmd(r.since) ? ' · since ' + fmtDate(r.since) : ''}</span>${r.evidence ? `<span class="item-meta">${esc(trunc(r.evidence, 160))}</span>` : ''}</span>
      <button class="switch" role="switch" aria-checked="${r.active !== false}" aria-label="${esc(r.title)}" data-action="rule-toggle" data-id="${r.id}"></button><button class="icon-btn plain" data-action="delete" data-id="${r.id}" aria-label="Remove rule ${esc(r.title)}">${icon('close')}</button></div>`).join('')}</div>`
    : '<div class="empty">No rules yet. When an experiment works, keeping it makes it a rule, and every plan follows it after that.</div>';
  return head('What you tried, what worked, and why', 'Memory', `<button class="btn primary" data-action="add" data-type="memory">${icon('plus')}Note</button>`)
    + section('Your rules', rulesHTML)
    + `<div class="chips section">${kinds.map(([k, l]) => `<button class="chip" data-action="mem-kind" data-k="${k}" aria-pressed="${mem.kind === k}">${l} <span class="num faint">${k === 'all' ? D.memories.length : D.memories.filter((m) => m.kind === k).length}</span></button>`).join('')}</div>
      <input class="input" style="margin-top:12px" type="search" data-live="memory" value="${esc(mem.q)}" placeholder="Search memory" aria-label="Search memory">
      <div id="mem-list" class="section">${memoryList(D)}</div>`
    + section('Recurring patterns', patterns.length || pat.length ? `<div class="list">${pat.map((m) => `<button class="item" data-action="edit" data-id="${m.id}"><span class="item-main"><span class="item-title">${esc(m.title)}</span>${m.body ? `<span class="item-meta">${esc(trunc(m.body, 140))}</span>` : ''}</span></button>`).join('')}${patterns.map((i) => `<div class="item"><span class="item-main"><span class="item-title">${esc(i.title)}</span><span class="item-meta">Detected by the Brain · you agreed${i.note ? ' · ' + esc(i.note) : ''}</span></span></div>`).join('')}</div>` : '<div class="empty">When you agree with something the Brain detects, or save a “Recurring pattern” note, it is listed here.</div>');
};
A['mem-kind'] = (el) => { mem.kind = el.dataset.k; render(); };
document.addEventListener('input', (ev) => {
  if (ev.target.dataset && ev.target.dataset.live === 'memory') { mem.q = ev.target.value; const l = $('#mem-list'); if (l) l.innerHTML = memoryList(data()); }
});
