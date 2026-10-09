/* ===== Organise: the AI reads one note (a brain dump) and suggests tasks, events, habits and goals.
   You see exactly what is sent, then check every suggestion before anything is added. ===== */
const ORGANISE_PROMPT = `You turn one person's messy note into items for their planner app. Reply with JSON only, no other text, in exactly this shape:
{"items":[{"kind":"task","title":"...","date":"YYYY-MM-DD or empty","goal":"goal title or empty"},{"kind":"event","title":"...","date":"YYYY-MM-DD","time":"HH:MM","end":"HH:MM or empty"},{"kind":"habit","title":"...","goal":"goal title or empty"},{"kind":"goal","title":"...","target":12,"unit":"books"}]}
Rules:
- task: something to do once. event: something at a set time (a meeting, call, class, appointment). habit: something to repeat regularly ("every evening", "daily", "mon/wed/fri"). goal: something they want to reach ("finish the paper", "read 12 books"). Give target and unit only when it is a count; otherwise target 0.
- Work out dates from words like "tomorrow", "friday", "next week" using today's date. If no date is given, leave it empty. Never invent a date.
- Times are 24-hour HH:MM. An event needs a date and a time; without them, make it a task.
- goal on a task or habit: the exact title of the one goal it moves forward, either a goal they already have (listed below) or a goal in your list. Empty if none.
- If a habit has set days, put them in the title, like "Gym (Mon/Wed/Fri)".
- Short titles in the person's own words. Tasks start with a verb. No emoji.
- Leave out thoughts, reasons and feelings: those stay in the note.
- Don't repeat anything they already have (listed below).
- At most 25 items.`;
const KINDS = { task: 'Task', event: 'Event', habit: 'Habit', goal: 'Goal' };
const ORG = { items: [], noteId: null, ctl: null };

function organiseRequest(n) {
  const D = data(), t = today();
  const open = D.tasks.filter((x) => !x.done).slice(0, 40).map((x) => x.title);
  return [`Today is ${fmtDate(t, { weekday: 'long' })}, ${t}.`, '',
    'They already have:',
    `Open tasks: ${open.length ? open.join('; ') : 'none'}`,
    `Habits: ${D.habits.length ? D.habits.map((h) => h.title).join('; ') : 'none'}`,
    `Goals: ${D.goals.length ? D.goals.map((g) => g.title).join('; ') : 'none'}`,
    `Upcoming events: ${D.events.filter((e) => e.date >= t).slice(0, 20).map((e) => `${e.title} (${e.date})`).join('; ') || 'none'}`,
    '', '## Note', n.title || '(no title)', String(n.body || '')].join('\n');
}
/* The answer should be JSON, but models sometimes wrap it in a code fence or a sentence. */
function parseItems(text) {
  let s = String(text || '').replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  let obj = null;
  if (a >= 0 && b > a) { try { obj = JSON.parse(s.slice(a, b + 1)); } catch (_) {} }
  if (!obj) { const c = s.indexOf('['), d = s.lastIndexOf(']'); if (c >= 0 && d > c) { try { obj = { items: JSON.parse(s.slice(c, d + 1)) }; } catch (_) {} } }
  const raw = obj && Array.isArray(obj.items) ? obj.items : Array.isArray(obj) ? obj : null;
  if (!raw) throw aiErr('bad_answer', 'The AI answered, but not in a form the app can read. Try again, or try another model in Settings.');
  const D = data(), have = new Set([...D.tasks.filter((x) => !x.done), ...D.habits, ...D.goals, ...D.events].map((r) => String(r.title).trim().toLowerCase()));
  const out = [];
  for (const r of raw.slice(0, 25)) {
    if (!r || typeof r !== 'object' || !KINDS[r.kind]) continue;
    const title = String(r.title || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!title) continue;
    const it = { kind: r.kind, title, date: day(r.date), time: TIME.test(r.time || '') ? r.time : '', end: TIME.test(r.end || '') ? r.end : '', target: clamp(Math.round(Number(r.target) || 0), 0, 100000), unit: String(r.unit || '').slice(0, 20), goal: String(r.goal || '').replace(/\s+/g, ' ').trim().slice(0, 120) };
    if (it.kind === 'event' && (!it.date || !it.time)) it.kind = 'task'; // an event without a day and time is really a task
    it.dup = have.has(title.toLowerCase());
    it.on = !it.dup;
    out.push(it);
  }
  return out;
}

A['note-organise'] = () => {
  if (LB.sheetClosed) LB.sheetClosed.length = 0; // you're organising it yourself, so no background run on close
  const n = get(noteId);
  if (!n || !String(n.body || n.title || '').trim()) { toast('Write something in the note first.'); return; }
  const prov = AI.provider();
  if (prov === 'none') { closeSheet(); go('settings', 'ai'); toast('Add an API key first. Any service works.'); return; }
  ORG.noteId = n.id; ORG.items = [];
  const req = organiseRequest(n);
  openSheet({ title: 'Organise this note', body: `<p class="small">Your AI is turning this note into tasks, events, habits and goals. Nothing is added until you tap Add.</p>
    <div id="org-result"></div>
    <div class="row-end tool-row"><button class="btn" data-action="note-back">Back to note</button><button class="btn" id="org-send" data-action="organise-send">Ask again</button></div>
    <details class="preview-box"><summary>See what is sent to ${esc(AI.providerName(prov))}</summary><pre class="preview" id="org-preview"></pre></details>`,
  onMount(root) { $('#org-preview', root).textContent = ORGANISE_PROMPT + '\n\n' + req; } });
  A['organise-send'](); // one tap: it starts right away
};
A['note-back'] = () => noteSheet(get(ORG.noteId));
A['organise-send'] = async () => {
  const n = get(ORG.noteId);
  if (!n) return;
  const out = $('#org-result'), send = $('#org-send');
  ORG.ctl = new AbortController();
  send.disabled = true;
  out.innerHTML = '<div class="ai-out"><p class="muted">Reading your note…</p><button class="btn sm" data-action="organise-stop">Stop</button></div>';
  try {
    const text = await AI.call(organiseRequest(n), { signal: ORG.ctl.signal, system: ORGANISE_PROMPT });
    ORG.items = parseItems(text);
    renderOrganised();
  } catch (e) {
    if (!document.contains(out)) return;
    out.innerHTML = `<div class="ai-out"><p class="err" id="org-error" data-code="${esc(e.code || 'error')}">${esc(e.message || 'Something went wrong.')}</p></div>`;
    send.disabled = false; send.textContent = 'Try again';
  }
};
A['organise-stop'] = () => { if (ORG.ctl) ORG.ctl.abort(); };

/* Goals a task or habit here can be tied to: the ones you have, plus new ones ticked in this list */
const orgGoals = () => [...new Set(activeGoals(data()).map((g) => g.title).concat(ORG.items.filter((x) => x.on && x.kind === 'goal' && x.title.trim()).map((x) => x.title.trim())))];
function orgRow(it, i) {
  const t = today();
  const when = it.kind === 'task' ? `<input type="date" data-org="date" data-i="${i}" value="${esc(it.date)}" aria-label="Date">`
    : it.kind === 'event' ? `<input type="date" data-org="date" data-i="${i}" value="${esc(it.date)}" aria-label="Date"><input type="time" data-org="time" data-i="${i}" value="${esc(it.time)}" aria-label="Time">`
    : it.kind === 'goal' ? `<input type="number" inputmode="numeric" min="0" data-org="target" data-i="${i}" value="${it.target ? esc(it.target) : ''}" placeholder="count" aria-label="Target, if you're counting"><input data-org="unit" data-i="${i}" value="${esc(it.unit)}" placeholder="unit" maxlength="20" aria-label="Unit">`
    : '<span class="small muted">Shows on Today to tick</span>';
  const goals = orgGoals(), gsel = (it.kind === 'task' || it.kind === 'habit') && goals.length
    ? `<select data-org="goal" data-i="${i}" aria-label="Goal" class="org-goal"><option value="">No goal</option>${goals.map((g) => `<option value="${esc(g)}" ${g.toLowerCase() === String(it.goal || '').toLowerCase() ? 'selected' : ''}>${esc(trunc(g, 40))}</option>`).join('')}</select>` : '';
  return `<div class="org-item${it.on ? '' : ' off'}">
    <input type="checkbox" class="org-on" data-org="on" data-i="${i}" ${it.on ? 'checked' : ''} aria-label="Add ${esc(it.title)}">
    <div class="org-main"><div class="org-top"><select data-org="kind" data-i="${i}" aria-label="Kind">${Object.entries(KINDS).map(([k, l]) => `<option value="${k}" ${it.kind === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
      <input class="org-title" data-org="title" data-i="${i}" value="${esc(it.title)}" maxlength="200" aria-label="Title"></div>
      <div class="org-when">${when}${gsel}${it.kind === 'task' && it.date ? `<span class="small muted">${esc(relDate(it.date, t))}</span>` : ''}${it.dup ? '<span class="small muted">Already in your app</span>' : ''}</div></div></div>`;
}
function renderOrganised() {
  const out = $('#org-result');
  if (!out) return;
  const n = ORG.items.filter((x) => x.on).length;
  out.innerHTML = ORG.items.length
    ? `<div class="org-list" id="org-list">${ORG.items.map(orgRow).join('')}</div>
      <div class="row-end"><button class="btn primary" data-action="organise-add" id="org-add" ${n ? '' : 'disabled'}>Add ${n || ''}</button></div>`
    : '<div class="ai-out"><p class="muted" id="org-empty">The AI found nothing to turn into tasks, events, habits or goals. That note may be all thoughts, which is fine.</p></div>';
  const send = $('#org-send'); if (send) { send.disabled = false; send.textContent = 'Ask again'; }
}
/* Edits in the suggestion list update the list in memory; changing the kind redraws that row. */
const orgChange = (ev) => {
  const k = ev.target.dataset && ev.target.dataset.org;
  if (!k) return;
  const it = ORG.items[Number(ev.target.dataset.i)];
  if (!it) return;
  if (k === 'on') it.on = ev.target.checked;
  else if (k === 'target') it.target = clamp(Math.round(Number(ev.target.value) || 0), 0, 100000);
  else it[k] = ev.target.value;
  if (k === 'kind' || k === 'on' || (k === 'title' && ev.type === 'change' && it.kind === 'goal') || (k === 'date' && ev.type === 'change')) renderOrganised();
  else { const b = $('#org-add'); if (b) { const c = ORG.items.filter((x) => x.on).length; b.disabled = !c; b.textContent = `Add ${c || ''}`; } }
};
document.addEventListener('input', orgChange);
document.addEventListener('change', (ev) => { if (ev.target.dataset && ['kind', 'on', 'date', 'title'].includes(ev.target.dataset.org)) orgChange(ev); });

A['organise-add'] = async () => {
  const n = get(ORG.noteId), from = n ? `From your note “${trunc(n.title || String(n.body || '').split('\n')[0], 60)}”` : '';
  const made = [], picked = ORG.items.filter((x) => x.on && x.title.trim());
  const bad = picked.find((it) => it.kind === 'event' && !day(it.date));
  if (bad) { toast(`“${trunc(bad.title.trim(), 30)}” needs a date to be an event.`, 'bad'); return; }
  // Goals first, so the tasks and habits in the same list can be tied to them
  const gid = new Map(activeGoals(data()).map((g) => [g.title.trim().toLowerCase(), g.id]));
  for (const it of picked.filter((x) => x.kind === 'goal')) {
    const g = await put({ type: 'goal', title: it.title.trim().slice(0, 120), why: '', by: '', target: it.target || 0, unit: it.unit.trim(), log: {}, done: false, doneDate: '' }, { quiet: true });
    made.push(g); gid.set(g.title.toLowerCase(), g.id);
  }
  const goalOf = (it) => gid.get(String(it.goal || '').trim().toLowerCase()) || '';
  for (const it of picked.filter((x) => x.kind !== 'goal')) {
    const title = it.title.trim();
    let r;
    if (it.kind === 'task') r = { type: 'task', title, date: day(it.date), done: false, doneDate: '', note: from, moved: 0, goalId: goalOf(it) };
    else if (it.kind === 'event') { r = { type: 'event', title, date: it.date, time: TIME.test(it.time) ? it.time : '', end: TIME.test(it.time) && TIME.test(it.end) ? it.end : '', note: from }; }
    else r = { type: 'habit', title: title.slice(0, 80), log: {}, goalId: goalOf(it) };
    made.push(await put(r, { quiet: true }));
  }
  if (ORG.noteId) await dropPending((p) => p.kind === 'organise' && p.noteId === ORG.noteId);
  closeSheet();
  emit();
  const by = (k) => made.filter((r) => r.type === k).length;
  const parts = [['task', 'task'], ['event', 'event'], ['habit', 'habit'], ['goal', 'goal']].filter(([k]) => by(k)).map(([k, w]) => plural(by(k), w));
  toast(`Added ${joinAnd(parts)}`, '', { action: 'Undo', onAction: async () => { for (const r of made) await del(r.id); } });
};
