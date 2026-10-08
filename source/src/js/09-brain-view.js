/* ===== Brain ===== */
let showDismissed = false;
VIEWS.brain = () => {
  const D = data(), t = today();
  const all_ = Brain.analyze(D, t);
  const dismissed = all_.filter((f) => Brain.verdict(D, f.id)?.status === 'rejected');
  const shown = all_.filter((f) => showDismissed || Brain.verdict(D, f.id)?.status !== 'rejected');
  const prov = AI.provider();
  const tool = (action, title, text) => `<button class="card" style="text-align:left;cursor:pointer;color:inherit;display:grid;gap:4px;align-content:start;font:inherit" data-action="${action}"><b>${title}</b><span class="small muted">${text}</span></button>`;
  return head(`Local Brain · ${prov === 'none' ? 'external AI not set up' : esc(AI.providerName(prov))}`, 'Brain')
    + `<div class="grid-2">${tool('brain-analyze', 'Analyze life', 'A read of direction, load and reality.')}${tool('brain-decide', 'Help me decide', 'Weigh options against your values.')}${tool('brain-suggest', 'Suggest experiments', 'Small tests for what is not working.')}${tool('brain-ask', 'Ask anything', 'Search your records, then ask AI.')}</div>`
    + section(`Diagnose · ${plural(shown.length, 'finding')}`, shown.length ? `<div class="list">${shown.map((f) => findingRow(f, D)).join('')}</div>` : '<div class="empty">The local Brain found nothing worth flagging. It checks structure, load, conflicts, delays, estimates, plan-keeping, experiments and habits.</div>',
      dismissed.length ? `<button class="btn ghost sm" data-action="toggle-dismissed">${showDismissed ? 'Hide' : 'Show'} ${dismissed.length} dismissed</button>` : '')
    + `<p class="xs muted section">The local Brain uses only your stored records and runs on this device. It offers competing explanations with a confidence, never certainty. You can agree, reject or annotate every conclusion.</p>`;
};
A['toggle-dismissed'] = () => { showDismissed = !showDismissed; render(); };
function findFinding(id) { return Brain.analyze(data(), today()).find((f) => f.id === id); }
A.finding = (el) => {
  const D = data(), f = findFinding(el.dataset.id);
  if (!f) { toast('That finding no longer applies.', 'bad'); render(); return; }
  const v = Brain.verdict(D, f.id);
  openSheet({ title: 'Diagnosis', body: `<div class="stack">
      <div class="cluster">${sevTag(f.severity)}${f.uncertain ? '<span class="tag">Uncertain: evidence is thin</span>' : ''}</div>
      <h3 style="font-size:18px">${esc(f.title)}</h3><p class="muted">${esc(f.summary)}</p>
      ${f.evidence.length ? `<div><div class="eyebrow" style="margin-bottom:4px">Evidence</div><ul class="evidence">${f.evidence.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
      ${f.hypotheses ? `<div class="eyebrow" style="margin-top:6px">Competing explanations</div>${f.hypotheses.map((h) => `<div class="hyp"><div class="split"><span class="hyp-label">${h.label}</span><span class="xs muted">${confLabel(h.confidence)} confidence</span></div><b>${esc(h.text)}</b>
        <div class="conf"><div class="meter"><i style="width:${Math.round(h.confidence * 100)}%"></i></div><span class="num xs">${pct(h.confidence)}</span></div><ul class="evidence">${h.evidence.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`).join('')}
        <p class="xs muted">Confidence comes from simple counts in your records and is capped below certainty. Explanations can all be partly true.</p>` : ''}
      ${f.wouldChange ? `<div><div class="eyebrow" style="margin-bottom:4px">What would change this conclusion</div><ul class="evidence">${f.wouldChange.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>` : ''}
    </div>
    <form class="form section" data-form="verdict" data-fid="${esc(f.id)}" data-title="${esc(f.title)}">
      ${fieldHTML(['note', 'Your note (optional)', 'area', { ph: 'What the Brain is missing, or what you think is really going on' }], v ? v.note : '')}
      <div class="form-actions">${v ? `<span class="tag ${v.status === 'accepted' ? 'good' : ''}" style="margin-right:auto">${v.status === 'accepted' ? 'You agreed' : v.status === 'rejected' ? 'You rejected this' : 'Noted'}</span>` : ''}
        <button class="btn" name="status" value="rejected">Reject</button><button class="btn" name="status" value="noted">Save note</button><button class="btn primary" name="status" value="accepted">Agree</button></div></form>
    <div class="form-actions" style="margin-top:4px">
      ${f.route ? `<button class="btn sm ghost" data-action="nav" data-to="${f.route.split('-')[0]}" data-sub="${f.route.split('-')[1] || ''}">Go to it</button>` : ''}
      ${f.suggest ? `<button class="btn sm" data-action="start-suggested" data-fid="${esc(f.id)}">Turn into experiment</button>` : ''}
      <button class="btn sm" data-action="finding-ai" data-fid="${esc(f.id)}">Ask AI about this</button></div>` });
};
document.addEventListener('click', (ev) => { const b = ev.target.closest('form[data-form="verdict"] button[name="status"]'); if (b) b.form.dataset.status = b.value; }, true);
F.verdict = async (form, v) => {
  const D = data(), fid = form.dataset.fid, old = Brain.verdict(D, fid);
  const status = ['accepted', 'rejected', 'noted'].includes(form.dataset.status) ? form.dataset.status : 'noted';
  await put({ ...(old || { type: 'insight' }), findingId: fid, title: form.dataset.title, status, note: String(v.note || '').trim(), at: today() });
  closeSheet();
  toast(status === 'accepted' ? 'Saved as an insight' : status === 'rejected' ? 'Dismissed. It will stay hidden unless the situation changes.' : 'Note saved');
};
A['start-suggested'] = (el) => {
  const f = findFinding(el.dataset.fid);
  if (!f || !f.suggest) return;
  const t = today();
  editSheet('experiment', null, { ...f.suggest, status: 'planned', startDate: t, endDate: addDays(t, 6) });
};
A['finding-ai'] = (el) => {
  const f = findFinding(el.dataset.fid);
  if (!f) return;
  const extra = [`Finding: ${f.title}`, f.summary, ...f.evidence.map((e) => '- ' + e), ...(f.hypotheses || []).map((h) => `${h.label} (${confLabel(h.confidence)}): ${h.text} Evidence: ${h.evidence.join(' ')}`)].join('\n');
  askAI({ title: 'Diagnose with AI', question: 'Reason about this finding. Do the local hypotheses hold up? Is there an explanation they miss? What single piece of information would most change the conclusion? Suggest one small experiment.', scopes: ['direction', 'plan', 'reality'], extra, saveAs: 'pattern' });
};

/* Analyze life: a local read first, AI optional. */
A['brain-analyze'] = () => {
  const D = data(), t = today();
  const open = D.tasks.filter((x) => x.status === 'open');
  const linked = open.filter((x) => Brain.chain(D, x).linked).length;
  const goals = D.goals.filter((g) => g.status === 'active');
  const goalsLinked = goals.filter((g) => g.aimId || g.areaId).length;
  const wk = Brain.weekly(D, t, 2), planned = wk.reduce((s, w) => s + w.planned, 0), kept = wk.reduce((s, w) => s + w.kept, 0);
  const cal = Brain.calibration(D);
  const loads = [...Array(7)].map((_, i) => Brain.dayLoad(D, addDays(t, i), t));
  const avgLoad = loads.reduce((s, l) => s + l.ratio, 0) / 7;
  const fs = Brain.active(D, t);
  const lines = [
    D.profile.direction ? `Your stated direction: “${esc(trunc(D.profile.direction, 160))}”.` : 'You have not written a direction yet, so nothing can be judged against it.',
    goals.length ? `${goalsLinked} of ${plural(goals.length, 'active goal')} ${goalsLinked === 1 ? 'is' : 'are'} linked to a life area or aim.` : 'There are no active goals.',
    open.length ? `${pct(linked / open.length)} of open tasks connect to a goal (${linked}/${open.length}).` : 'There are no open tasks.',
    planned ? `In the last two weeks you kept ${kept} of ${planned} plans (${pct(kept / planned)}).` : 'There is no plan-keeping data for the last two weeks yet.',
    cal.n >= 3 ? `Finished tasks took ${cal.median.toFixed(1)}× their estimate (median of ${cal.n}).` : `Only ${plural(cal.n, 'task')} ${cal.n === 1 ? 'has' : 'have'} an estimate and an actual time, so estimate accuracy is unknown.`,
    `The next 7 days average ${pct(avgLoad)} of your capacity${avgLoad > 0.85 ? ', above the sustainable 80%' : ''}.`,
    fs.length ? `The local Brain has ${plural(fs.length, 'open finding')}; the most pressing: “${esc(fs[0].title)}”.` : 'The local Brain has no open findings.',
  ];
  openSheet({ title: 'Analyze life', body: `<div class="prose stack">${lines.map((l) => `<p>${l}</p>`).join('')}</div>
    <p class="xs muted section">Computed on this device from your records. Missing data is reported as unknown, not guessed.</p>
    <div class="form-actions"><button class="btn" data-action="sheet-close">Close</button><button class="btn primary" data-action="analyze-ai">Ask AI for a deeper read</button></div>` });
};
A['analyze-ai'] = () => askAI({ title: 'Analyze my life', question: 'Give a short, honest read of how my plans and reality line up with my direction. Name the two most important tensions, with evidence, and one change worth testing. Mark anything uncertain.', scopes: ['direction', 'model', 'plan', 'reality', 'findings'], saveAs: 'lesson' });

/* Help me decide: weighted matrix with sensitivity, plus what your records say. */
let decision = null;
A['brain-decide'] = () => {
  decision = null;
  openSheet({ title: 'Help me decide', body: `<form class="form" data-form="decide-setup">
    ${fieldHTML(['question', 'What are you deciding?', 'text', { req: 1, max: 200, ph: 'Take the course now or after the project ships?' }], '')}
    ${fieldHTML(['options', 'Options, one per line (2–5)', 'area', { req: 1, ph: 'Start the course now\nWait until v1 ships' }], '')}
    ${fieldHTML(['criteria', 'What matters, one per line', 'area', { hint: 'Prefilled from your values. Edit freely.' }], (S.profile.values || []).slice(0, 5).join('\n'))}
    <p class="err" data-form-error></p><div class="form-actions"><button type="button" class="btn" data-action="sheet-close">Cancel</button><button class="btn primary">Next: score options</button></div></form>` });
};
F['decide-setup'] = (form, v) => {
  const lines = (s) => String(s || '').split('\n').map((x) => x.trim()).filter(Boolean);
  const options = [...new Set(lines(v.options))].slice(0, 5), criteria = [...new Set(lines(v.criteria))].slice(0, 6);
  if (!String(v.question || '').trim()) throw new Error('Write the decision first.');
  if (options.length < 2) throw new Error('Add at least two options, one per line.');
  if (!criteria.length) throw new Error('Add at least one thing that matters.');
  decision = { question: v.question.trim(), options, criteria: criteria.map((name) => ({ name, weight: 2 })), scores: options.map(() => criteria.map(() => 3)) };
  renderDecision();
};
function renderDecision() {
  const d = decision, res = Brain.decide(d.options, d.criteria, d.scores);
  const recall = Brain.recall(data(), d.question + ' ' + d.options.join(' '));
  const sel = (name, val, max, label) => `<select class="input num" name="${name}" aria-label="${esc(label)}" style="min-height:36px;padding:4px 8px">${[...Array(max + 1).keys()].slice(max === 3 ? 0 : 1).map((n) => `<option ${n === val ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  openSheet({ title: 'Help me decide', wide: true, body: `<p class="lead" style="font-size:19px">${esc(d.question)}</p>
    <form data-form="decide-score" class="section"><div style="overflow-x:auto"><table style="border-collapse:collapse;width:100%;min-width:${200 + d.options.length * 90}px">
      <thead><tr><th style="text-align:left;padding:6px 4px" class="xs muted">What matters · weight 0–3</th>${d.options.map((o) => `<th class="small" style="padding:6px 4px;text-align:left">${esc(o)}</th>`).join('')}</tr></thead>
      <tbody>${d.criteria.map((c, ci) => `<tr style="border-top:1px solid var(--line)"><td style="padding:8px 4px"><div class="small" style="font-weight:600">${esc(c.name)}</div>${sel('w' + ci, c.weight, 3, 'Weight for ' + c.name)}</td>${d.options.map((o, oi) => `<td style="padding:8px 4px">${sel(`s${oi}_${ci}`, d.scores[oi][ci], 5, `${o} on ${c.name}`)}</td>`).join('')}</tr>`).join('')}</tbody>
      <tfoot><tr style="border-top:1px solid var(--line)" id="dec-totals">${decisionTotals(d, res)}</tr></tfoot></table></div>
      <p class="xs muted" style="margin-top:6px">Score each option 1 (poor) to 5 (great) on each line. Totals update as you change them.</p></form>
    <div class="section card" id="dec-result">${decisionResult(res)}</div>
    ${section('What your records say', recall.length ? `<div class="list">${recall.map((r) => `<div class="item"><span class="item-main"><span class="tag">${esc(r.label)}</span> <span class="item-title">${esc(r.r.title)}</span><span class="item-meta">${esc(trunc(r.r.body || r.r.learning || r.r.outcomeNote || r.r.hypothesis || '', 160))}</span></span></div>`).join('')}</div>` : '<div class="empty">Nothing in your memory or experiments mentions this yet.</div>')}
    <form class="form section" data-form="decision-save">${fieldHTML(['choice', 'I’m choosing', 'select', { options: d.options.map((o) => [o, o]) }], res.ranked[0].option)}${fieldHTML(['why', 'Why (your future self will want this)', 'area', { req: 1 }], '')}
      <p class="err" data-form-error></p><div class="form-actions"><button type="button" class="btn" data-action="decide-ai">Ask AI about the trade-offs</button><button class="btn primary">Save decision</button></div></form>`,
  onMount(root) {
    $('form[data-form="decide-score"]', root).addEventListener('change', (ev) => {
      const n = ev.target.name, val = Number(ev.target.value);
      if (/^w\d+$/.test(n)) d.criteria[Number(n.slice(1))].weight = val;
      const m = n.match(/^s(\d+)_(\d+)$/);
      if (m) d.scores[Number(m[1])][Number(m[2])] = val;
      const r = Brain.decide(d.options, d.criteria, d.scores);
      $('#dec-totals', root).innerHTML = decisionTotals(d, r);
      $('#dec-result', root).innerHTML = decisionResult(r);
    });
  } });
}
const decisionTotals = (d, res) => `<td class="small muted" style="padding:8px 4px">Weighted total</td>${d.options.map((o, oi) => `<td class="num" style="padding:8px 4px;font-weight:600">${res.ranked.find((r) => r.index === oi).total}</td>`).join('')}`;
const decisionResult = (res) => `<b>${esc(res.ranked[0].option)}</b> scores highest${res.margin != null ? `, ahead by <span class="num">${res.margin}</span>` : ''}.
  <p class="small muted" style="margin-top:6px">${res.margin === 0 ? 'It is a tie. The scores alone do not decide this.' : res.flip ? `This would flip to “${esc(res.flip.winner)}” if “${esc(res.flip.criterion)}” were weighted ${res.flip.to} instead of ${res.flip.from}. Ask yourself whether that weight is honest.` : 'No single weight change of one or two points would flip it, so the result is fairly robust.'}</p>`;
F['decide-score'] = () => {};
F['decision-save'] = async (form, v) => {
  if (!decision) throw new Error('Start the decision again.');
  const why = String(v.why || '').trim();
  if (!why) throw new Error('Write down why. It is what makes the decision reviewable later.');
  const res = Brain.decide(decision.options, decision.criteria, decision.scores);
  await put({ type: 'memory', kind: 'decision', title: `${decision.question} → ${v.choice}`, why, date: today(),
    body: `Options: ${decision.options.join(' / ')}\nScores: ${res.ranked.map((r) => `${r.option} ${r.total}`).join(', ')}\nWeights: ${decision.criteria.map((c) => `${c.name} ${c.weight}`).join(', ')}` });
  closeSheet();
  toast('Decision saved to memory');
};
A['decide-ai'] = () => {
  if (!decision) return;
  const res = Brain.decide(decision.options, decision.criteria, decision.scores);
  const extra = `Decision: ${decision.question}\nOptions: ${decision.options.join(' | ')}\n` + decision.criteria.map((c, ci) => `${c.name} (weight ${c.weight}): ` + decision.options.map((o, oi) => `${o}=${decision.scores[oi][ci]}`).join(', ')).join('\n') + `\nCurrent leader: ${res.ranked[0].option}`;
  askAI({ title: 'Trade-offs', question: 'Explain the real trade-offs between these options in my context. What does the matrix miss? What would I regret with each option? Do not choose for me; end with the one question I should answer to decide.', scopes: ['direction', 'memory'], extra, saveAs: 'decision' });
};

/* Suggest experiments from what the Brain detected. */
A['brain-suggest'] = () => {
  const fs = Brain.active(data(), today()).filter((f) => f.suggest);
  openSheet({ title: 'Suggested experiments', body: (fs.length ? `<div class="list">${fs.map((f) => `<div class="item"><span class="item-main"><span class="item-title">${esc(f.suggest.title)}</span><span class="item-meta">${esc(f.suggest.hypothesis)}</span><span class="item-meta">Because: ${esc(f.title)}</span></span><button class="btn sm" data-action="start-suggested" data-fid="${esc(f.id)}">Set up</button></div>`).join('')}</div>`
    : '<div class="empty">No suggestions right now. They come from overload, repeated delays, estimate gaps and failing plans once there is evidence.</div>')
    + `<div class="form-actions section"><button class="btn" data-action="sheet-close">Close</button><button class="btn primary" data-action="suggest-ai">Ask AI for ideas</button></div>` });
};
A['suggest-ai'] = () => askAI({ title: 'Experiment ideas', question: 'Suggest up to three small, time-boxed experiments (7–14 days) that would test my most important open problem. For each: hypothesis, intervention, what to measure, and what result would prove it wrong.', scopes: ['direction', 'findings', 'experiments', 'memory'], saveAs: 'tried' });

/* Ask anything: local recall first. */
A['brain-ask'] = () => {
  openSheet({ title: 'Ask anything', body: `<form class="form" data-form="ask-local">${fieldHTML(['q', 'Your question', 'area', { req: 1, ph: 'Why do my Mondays fall apart?' }], '')}
    <p class="err" data-form-error></p><div class="form-actions"><button class="btn primary">Search my records</button></div></form><div id="ask-out"></div>` });
};
let lastQuestion = '';
F['ask-local'] = (form, v) => {
  const q = String(v.q || '').trim();
  if (!q) throw new Error('Write a question first.');
  lastQuestion = q;
  const hits = Brain.recall(data(), q);
  $('#ask-out').innerHTML = section('What your records say', hits.length ? `<div class="list">${hits.map((r) => `<div class="item"><span class="item-main"><span class="tag">${esc(r.label)}</span> <span class="item-title">${esc(r.r.title)}</span><span class="item-meta">${esc(trunc(r.r.body || r.r.learning || r.r.outcomeNote || r.r.hypothesis || '', 180))}</span></span></div>`).join('')}</div>` : '<div class="empty">Nothing in your memory, experiments or task outcomes matches.</div>')
    + `<div class="form-actions section"><button class="btn primary" data-action="ask-ai">Ask AI with context</button></div>`;
};
A['ask-ai'] = () => askAI({ title: 'Ask', question: lastQuestion, scopes: ['direction', 'plan', 'reality', 'memory'], saveAs: 'lesson' });
