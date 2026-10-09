/* ===== AI tools. Each one is a button. It shows exactly what will be sent, asks once, and either shows an
   answer or a list of suggested changes you check before anything happens. Every change can be undone. ===== */

/* ---- Shared parts ---- */
const needAI = () => {
  if (AI.provider() !== 'none') return true;
  closeSheet(); go('settings', 'ai'); toast('Add an API key first. Any service works.');
  return false;
};
/* Models sometimes wrap JSON in a code fence or a sentence; take the outermost object. */
function pullJSON(text) {
  const s = String(text || '').replace(/```(?:json)?/gi, '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(s.slice(a, b + 1)); } catch (_) {} }
  throw aiErr('bad_answer', 'The AI answered, but not in a form the app can read. Try again, or try another model in Settings.');
}
const capacity = (D, t) => { // tasks actually finished per day, over the last 14 days
  const n = D.tasks.filter((x) => x.done && isYmd(x.doneDate) && x.doneDate >= addDays(t, -13) && x.doneDate <= t).length;
  return Math.round((n / 14) * 10) / 10;
};
const taskLine = (x, t) => `${x.id} | ${x.title}${x.goalId && get(x.goalId) ? ` | goal: ${get(x.goalId).title}` : ''}${x.date ? ` | due ${x.date}${x.date < t ? ' (overdue)' : ''}` : ' | no date'}${x.moved ? ` | moved ${x.moved} times` : ''}${x.note ? ` | note: ${trunc(x.note.replace(/\s+/g, ' '), 120)}` : ''}`;
const eventLine = (e) => `${e.date}${e.time ? ' ' + e.time + (e.end ? '-' + e.end : '') : ''}: ${e.title}`;

/* One sheet for every tool: intro, optional extra fields, the exact request, Send, then the result. */
const TOOL = { ctl: null };
/* One tap runs it: the sheet opens already asking. A tool that needs a question waits for you to type one. */
function aiTool({ title, intro, system, request, extra = '', sendLabel = 'Ask again', onAnswer, validate }) {
  if (!needAI()) return;
  const prov = AI.provider();
  openSheet({ title, body: `<p class="small">${intro}</p>${extra}
    <div id="tool-result"></div>
    <div class="row-end tool-row"><button class="btn" data-action="sheet-close">Close</button><button class="btn" id="tool-send">${esc(validate ? 'Ask' : sendLabel)}</button></div>
    <details class="preview-box"><summary>See what is sent to ${esc(AI.providerName(prov))}</summary><pre class="preview" id="tool-preview"></pre></details>`,
  onMount(root) {
    const refresh = () => { $('#tool-preview', root).textContent = system + '\n\n' + request(root); };
    refresh();
    root.addEventListener('input', (ev) => { if (ev.target.dataset && 'toolField' in ev.target.dataset) refresh(); });
    root.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' && ev.target.dataset && 'toolField' in ev.target.dataset) { ev.preventDefault(); $('#tool-send', root).click(); } });
    if (!validate) setTimeout(() => { const b = $('#tool-send', root); if (b && document.contains(b)) b.click(); }, 0);
    else { const f = $('[data-tool-field]', root); if (f) f.focus(); }
    $('#tool-send', root).addEventListener('click', async () => {
      const out = $('#tool-result', root), send = $('#tool-send', root);
      const problem = validate && validate(root);
      if (problem) { out.innerHTML = `<div class="ai-out"><p class="err" id="tool-error">${esc(problem)}</p></div>`; return; }
      TOOL.ctl = new AbortController();
      send.disabled = true;
      out.innerHTML = '<div class="ai-out"><p class="muted">Thinking…</p><button class="btn sm" data-action="tool-stop">Stop</button></div>';
      try {
        const text = await AI.call(request(root), { signal: TOOL.ctl.signal, system });
        if (!document.contains(out)) return;
        await onAnswer(text, out, root);
      } catch (e) {
        if (document.contains(out)) out.innerHTML = `<div class="ai-out"><p class="err" id="tool-error" data-code="${esc(e.code || 'error')}">${esc(e.message || 'Something went wrong.')}</p></div>`;
      } finally { if (document.contains(send)) { send.disabled = false; send.textContent = validate ? 'Ask' : 'Ask again'; } }
    });
  } });
}
A['tool-stop'] = () => { if (TOOL.ctl) TOOL.ctl.abort(); };

/* A list of suggested changes, each with a tick box and editable fields. rows: [{ on, ...fields }]. */
const REV = { rows: [], row: null, apply: null, label: 'Apply' };
function showReview(out, rows, row, apply, label = 'Apply') {
  Object.assign(REV, { rows, row, apply, label, out, after: null });
  drawReview();
}
function drawReview() {
  const out = REV.out;
  if (!out || !document.contains(out)) return;
  const n = REV.rows.filter((r) => r.on).length;
  out.innerHTML = REV.rows.length
    ? `<div class="org-list" id="rev-list">${REV.rows.map((r, i) => `<div class="org-item${r.on ? '' : ' off'}"><input type="checkbox" class="org-on" data-rev="on" data-i="${i}" ${r.on ? 'checked' : ''} aria-label="Include this change"><div class="org-main">${REV.row(r, i)}</div></div>`).join('')}</div>
       <div class="row-end"><button class="btn primary" id="rev-apply" data-action="rev-apply" ${n ? '' : 'disabled'}>${esc(REV.label)} ${n || ''}</button></div>`
    : '<div class="ai-out"><p class="muted" id="rev-empty">Nothing to change.</p></div>';
}
const revInput = (ev) => {
  const k = ev.target.dataset && ev.target.dataset.rev;
  if (!k) return;
  const r = REV.rows[Number(ev.target.dataset.i)];
  if (!r) return;
  r[k] = ev.target.type === 'checkbox' ? ev.target.checked : ev.target.value;
  if (k === 'on' || ev.target.tagName === 'SELECT') drawReview();
  else { const b = $('#rev-apply'); if (b) { const c = REV.rows.filter((x) => x.on).length; b.disabled = !c; b.textContent = `${REV.label} ${c || ''}`; } }
};
document.addEventListener('input', revInput);
document.addEventListener('change', (ev) => { if (ev.target.dataset && (ev.target.dataset.rev === 'on' || (ev.target.dataset.rev && ev.target.tagName === 'SELECT'))) revInput(ev); });
/* Changes go through a recorder so one Undo can reverse all of them. */
A['rev-apply'] = async () => {
  const undo = [], rec = {
    async create(r) { const x = await put(r, { quiet: true }); undo.push(() => del(x.id)); return x; },
    async update(r) { const old = get(r.id); await put(r, { quiet: true }); if (old) undo.push(() => put(old)); },
    async remove(id) { const old = get(id); if (!old) return; await del(id); undo.push(() => put(old)); },
  };
  const msg = await REV.apply(REV.rows.filter((r) => r.on), rec);
  if (REV.after) await REV.after();
  closeSheet(); emit();
  toast(msg || 'Done', '', { action: 'Undo', onAction: async () => { for (const f of undo.reverse()) await f(); } });
};
const dateField = (i, v, key = 'date') => `<input type="date" data-rev="${key}" data-i="${i}" value="${esc(v || '')}" aria-label="Date">`;

/* ---- 1. Break down a big task ---- */
const BREAK_PROMPT = `Split one task into 3 to 6 small, concrete steps that each take under about an hour. Reply with JSON only, in this shape:
{"steps":[{"title":"...","date":"YYYY-MM-DD or empty"}]}
Rules:
- Steps in the order they should be done. Each title starts with a verb. No emoji.
- If the task has a due date, spread the steps from today up to that date, never after it. If it has no due date, start from today and put one step per day.
- The first step should be small enough to start in five minutes.`;
A['task-break'] = (el) => {
  const x = get(el.dataset.id), t = today();
  if (!x) return;
  aiTool({ title: 'Break down', intro: `The AI suggests small steps for <b>${esc(x.title)}</b>. You check them before they’re added.`, system: BREAK_PROMPT,
    request: () => `Today is ${fmtDate(t, { weekday: 'long' })}, ${t}.\nThey usually finish about ${capacity(data(), t)} tasks a day.\n\nTask: ${x.title}\nDue: ${x.date || 'no date'}\n${x.moved ? `Moved ${x.moved} times already.\n` : ''}${x.note ? `Note: ${x.note}\n` : ''}`,
    onAnswer: (text, out) => {
      const j = pullJSON(text), steps = (Array.isArray(j.steps) ? j.steps : []).slice(0, 8).map((s) => ({ on: true, title: String((s && s.title) || '').trim().slice(0, 200), date: day(s && s.date) })).filter((s) => s.title);
      if (x.date) steps.forEach((s) => { if (s.date && s.date > x.date) s.date = x.date; });
      steps.push({ on: true, replace: true, title: `Replace “${trunc(x.title, 40)}” with these steps` });
      showReview(out, steps, (s, i) => s.replace ? `<span class="rev-note">${esc(s.title)}</span><span class="small muted">The big task is removed; Undo brings it back.</span>`
        : `<div class="org-top"><input class="org-title" data-rev="title" data-i="${i}" value="${esc(s.title)}" maxlength="200" aria-label="Step"></div><div class="org-when">${dateField(i, s.date)}${s.date ? `<span class="small muted">${esc(relDate(s.date))}</span>` : ''}</div>`,
      async (rows, rec) => {
        const add = rows.filter((r) => !r.replace && r.title.trim());
        for (const s of add) await rec.create({ type: 'task', title: s.title.trim(), date: day(s.date), done: false, doneDate: '', note: `Step of “${trunc(x.title, 60)}”`, moved: 0, goalId: x.goalId || '' });
        if (rows.some((r) => r.replace) && add.length) await rec.remove(x.id);
        return `Added ${plural(add.length, 'step')}`;
      }, 'Add');
    } });
};

/* Review "specs": how to ask, how to read the answer into rows, how to draw a row, how to apply.
   The same spec serves the button (ask now) and the automatic run (asked earlier, waiting for you). */
const SPECS = {};

/* ---- 2. Plan my week ---- */
const PLAN_PROMPT = `You plan one person's next 7 days. You get their open tasks (each with an id), their calendar, and how many tasks they really finish per day. Reply with JSON only, in this shape:
{"plan":[{"id":"...","date":"YYYY-MM-DD or empty"}],"note":"one short sentence about the week"}
Rules:
- Only use the ids given. Give each task a day from today to 6 days ahead, or "" to leave it unscheduled this week.
- Don't put more tasks on a day than they usually finish (round up), and fewer on days with several events.
- Never schedule a task after its due date. Overdue tasks go early in the week or are left unscheduled.
- Tasks for a goal that is behind or stalled go early in the week. Spread similar tasks out. Don't schedule everything: a realistic week beats a full one.`;
const planOpen = (D, t) => D.tasks.filter((x) => !x.done && (!x.date || x.date <= addDays(t, 6))).slice(0, 60);
SPECS.plan = {
  title: 'Plan my week', label: 'Apply', system: PLAN_PROMPT,
  ready: (D, t) => planOpen(D, t).length > 0,
  request: (t) => {
    const D = data(), evs = D.events.filter((e) => e.date >= t && e.date <= addDays(t, 6)).sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    return `Today is ${fmtDate(t, { weekday: 'long' })}, ${t}.\nThey finish about ${capacity(D, t)} tasks a day (last 14 days).\n\n## Open tasks\n${planOpen(D, t).map((x) => taskLine(x, t)).join('\n') || '(none)'}\n\n## Goals\n${activeGoals(D).map((g) => goalForAI(D, g, t)).join('\n') || '(none)'}\n\n## Calendar, next 7 days\n${evs.map(eventLine).join('\n') || '(nothing)'}`;
  },
  parse: (text, t) => {
    const j = pullJSON(text), rows = [];
    for (const p of Array.isArray(j.plan) ? j.plan : []) {
      const x = p && get(String(p.id)); if (!x || x.type !== 'task' || x.done) continue;
      let d = day(p.date); if (d && (d < t || d > addDays(t, 6))) d = ''; if (d && x.date && x.date >= t && d > x.date) d = x.date;
      if (d === (x.date || '') || rows.some((r) => r.id === x.id)) continue;
      rows.push({ on: true, id: x.id, title: x.title, from: x.date || '', date: d });
    }
    return { rows, note: j.note ? trunc(String(j.note), 200) : '' };
  },
  still: (r) => { const x = get(r.id); return !!x && !x.done; },
  row: (r, i) => `<span class="rev-note">${esc(r.title)}</span><div class="org-when"><span class="small muted">${r.from ? esc(relDate(r.from)) : 'No date'} →</span>${dateField(i, r.date)}</div>`,
  apply: async (sel, rec) => { for (const r of sel) { const x = get(r.id); if (x) await rec.update({ ...x, date: day(r.date) }); } return `Planned ${plural(sel.length, 'task')}`; },
};

/* ---- 3. Clear the overdue pile ---- */
const OVERDUE_PROMPT = `Help clear a pile of overdue tasks. For each task (id given) choose one action:
"today" (do it today), "move" (to a later date, give "date"), "split" (too big: give 2 to 4 "steps"), "drop" (no longer worth doing).
Reply with JSON only, in this shape:
{"actions":[{"id":"...","action":"today|move|split|drop","date":"YYYY-MM-DD or empty","steps":["..."],"why":"under 12 words"}]}
Rules: no more than 3 tasks on today. Tasks moved many times are good candidates for split or drop. Only use the ids given.`;
const ACTIONS = { today: 'Do today', move: 'Move', split: 'Split', drop: 'Delete', keep: 'Leave as is' };
const overdueList = (D, t) => D.tasks.filter((x) => isOverdue(x, t)).sort((a, b) => a.date.localeCompare(b.date)).slice(0, 40);
SPECS.overdue = {
  title: 'Sort out overdue', label: 'Apply', system: OVERDUE_PROMPT,
  ready: (D, t) => overdueList(D, t).length > 0,
  request: (t) => `Today is ${fmtDate(t, { weekday: 'long' })}, ${t}.\nThey finish about ${capacity(data(), t)} tasks a day.\n\n## Overdue tasks\n${overdueList(data(), t).map((x) => taskLine(x, t)).join('\n')}`,
  parse: (text, t) => {
    const j = pullJSON(text), rows = [];
    for (const a of Array.isArray(j.actions) ? j.actions : []) {
      const x = a && get(String(a.id)); if (!x || !isOverdue(x, t) || rows.some((r) => r.id === x.id)) continue;
      const action = ACTIONS[a.action] ? a.action : 'keep';
      const steps = (Array.isArray(a.steps) ? a.steps : []).map((s) => String(s || '').trim().slice(0, 200)).filter(Boolean).slice(0, 4);
      rows.push({ on: action !== 'keep', id: x.id, title: x.title, action: action === 'split' && !steps.length ? 'keep' : action, date: day(a.date) > t ? day(a.date) : addDays(t, 1), steps: steps.join('\n'), why: String(a.why || '').slice(0, 120) });
    }
    return { rows };
  },
  still: (r) => { const x = get(r.id); return !!x && !x.done && isOverdue(x, today()); },
  row: (r, i) => `<span class="rev-note">${esc(r.title)}</span><div class="org-when"><select data-rev="action" data-i="${i}" aria-label="What to do">${Object.entries(ACTIONS).map(([k, l]) => `<option value="${k}" ${r.action === k ? 'selected' : ''}>${l}</option>`).join('')}</select>
    ${r.action === 'move' ? dateField(i, r.date) : ''}</div>${r.action === 'split' ? `<textarea class="rev-steps" data-rev="steps" data-i="${i}" rows="3" aria-label="Steps, one per line">${esc(r.steps)}</textarea>` : ''}${r.why ? `<span class="small muted">${esc(r.why)}</span>` : ''}`,
  apply: async (sel, rec) => {
    const t = today();
    let n = 0;
    for (const r of sel) {
      const x = get(r.id); if (!x) continue;
      if (r.action === 'today') await rec.update({ ...x, date: t, moved: (x.moved || 0) + 1 });
      else if (r.action === 'move' && day(r.date)) await rec.update({ ...x, date: r.date, moved: (x.moved || 0) + 1 });
      else if (r.action === 'drop') await rec.remove(x.id);
      else if (r.action === 'split') {
        const steps = String(r.steps).split('\n').map((v) => v.trim()).filter(Boolean);
        if (!steps.length) continue;
        for (const [k, v] of steps.entries()) await rec.create({ type: 'task', title: v, date: addDays(t, k), done: false, doneDate: '', note: `Step of “${trunc(x.title, 60)}”`, moved: 0, goalId: x.goalId || '' });
        await rec.remove(x.id);
      } else continue;
      n++;
    }
    return `Sorted ${plural(n, 'task')}`;
  },
};
/* Show a spec's rows in a sheet area; used after asking now and when opening a waiting suggestion. */
function reviewSpec(spec, out, rows, note = '') {
  showReview(out, rows, spec.row, spec.apply, spec.label);
  if (note && rows.length && $('#rev-list')) $('#rev-list').insertAdjacentHTML('beforebegin', `<p class="small" id="plan-note">${esc(note)}</p>`);
}
const specButton = (key, intro, empty) => () => {
  const spec = SPECS[key], t = today();
  const ready = pendingList().find((p) => p.kind === key && (p.rows || []).some(spec.still));
  if (ready) { A['pending-open']({ dataset: { id: ready.id } }); return; } // your AI already prepared this
  if (!spec.ready(data(), t)) { toast(empty); return; }
  aiTool({ title: spec.title, intro: intro(), system: spec.system, request: () => spec.request(t),
    onAnswer: (text, out) => { const r = spec.parse(text, t); reviewSpec(spec, out, r.rows, r.note); } });
};
A['plan-week'] = specButton('plan', () => 'The AI spreads your open tasks over the next 7 days, sized to what you usually finish. You check every move.', 'No open tasks to plan.');
A['overdue-sort'] = specButton('overdue', () => `The AI suggests what to do with each of your ${plural(overdueList(data(), today()).length, 'overdue task')}: do today, move, split or delete. You decide.`, 'Nothing is overdue.');

/* ---- 4. A line about today, on Home ---- */
const HOME_PROMPT = `Write one or two short sentences for the top of someone's day view: the single thing most worth knowing about today, from their records. Name the specific task, event or habit. If a goal is behind or stalled and something today could move it, that is often the thing. Plain words, no greeting, no list, no exclamation marks, under 40 words. Plain text only.`;
function homeRequest(t) {
  const D = data(), y = addDays(t, -1);
  return `Today is ${fmtDate(t, { weekday: 'long' })}, ${t}, ${fmtTime(`${LB.now().getHours()}:${pad(LB.now().getMinutes())}`)}.\n\n## Today's calendar\n${eventsOn(D, t).map(eventLine).join('\n') || '(nothing)'}\n\n## Due today or overdue\n${D.tasks.filter((x) => !x.done && x.date && x.date <= t).map((x) => taskLine(x, t)).join('\n') || '(nothing)'}\n\n## Done yesterday\n${doneOn(D, y).map((x) => x.title).join('; ') || '(nothing)'}\n\n## Habits (done in the last 7 days)\n${D.habits.map((h) => `${h.title}: ${habitCount(h, addDays(t, -7), addDays(t, -1))}/7${habitDone(h, t) ? ', done today' : ''}`).join('\n') || '(none)'}\n\n## Goals\n${activeGoals(D).map((g) => goalForAI(D, g, t)).join('\n') || '(none)'}\n\n## Notes for today or tomorrow\n${D.notes.filter((n) => [t, addDays(t, 1)].includes(noteDay(n))).map((n) => `${noteDay(n)}: ${n.title} ${trunc(String(n.body || '').replace(/\s+/g, ' '), 200)}`).join('\n') || '(none)'}`;
}
const saveHomeLine = (t, text) => saveSettings({ homeLine: { date: t, text: String(text).replace(/[*#`]/g, '').replace(/\s+/g, ' ').trim().slice(0, 300) } });
A['home-ai'] = () => {
  const t = today();
  aiTool({ title: 'About today', intro: 'The AI writes one line about today for the top of Home. It stays until tomorrow.', system: HOME_PROMPT,
    request: () => homeRequest(t),
    onAnswer: async (text) => { await saveHomeLine(t, text); closeSheet(); go('home'); } });
};
const homeLine = () => { const h = S.settings.homeLine; return h && h.date === today() && h.text ? h.text : ''; };

/* ---- 5. Weekly look back ---- */
const WEEK_PROMPT = `Write a short look back on one person's last 7 days from their records, under 180 words, with three parts in bold: **Done**, **Slipped** (and why, if their notes say), **One thing to try next week**. If they have goals, say which ones the week moved and which it didn't. Use only what is in the records and say so when something is unclear. Be specific. No praise padding.`;
function weekRequest(t) {
  const D = data(), from = addDays(t, -6);
  const done = D.tasks.filter((x) => x.done && x.doneDate >= from && x.doneDate <= t);
  const slipped = D.tasks.filter((x) => !x.done && x.date && x.date < t && x.date >= addDays(t, -13));
  const notes = D.notes.filter((n) => noteDay(n) >= from && noteDay(n) <= t && !/^Look back · /.test(n.title || ''));
  return `This week: ${from} to ${t}.\n\n## Done (${done.length})\n${done.map((x) => `${x.doneDate}: ${x.title}`).join('\n') || '(nothing)'}\n\n## Still open past their date\n${slipped.map((x) => taskLine(x, t)).join('\n') || '(nothing)'}\n\n## Habits\n${D.habits.map((h) => `${h.title}: ${habitCount(h, from, t)} of 7 days`).join('\n') || '(none)'}\n\n## Goals\n${D.goals.map((g) => goalForAI(D, g, t)).join('\n') || '(none)'}\n\n## Calendar\n${D.events.filter((e) => e.date >= from && e.date <= t).map(eventLine).join('\n') || '(nothing)'}\n\n## Notes from this week\n${notes.map((n) => `${noteDay(n)} ${n.title}: ${trunc(String(n.body || '').replace(/\s+/g, ' '), 400)}`).join('\n') || '(none)'}`;
}
const saveLookBack = (t, text) => put({ type: 'note', title: 'Look back · ' + fmtDate(t, { month: 'short', day: 'numeric' }), body: text, pinned: false, date: t });
A['look-back'] = () => {
  const t = today();
  aiTool({ title: 'Weekly look back', intro: 'The AI looks at your last 7 days and writes a short look back. You can save it as a note.', system: WEEK_PROMPT,
    request: () => weekRequest(t),
    onAnswer: async (text, out) => {
      await saveSettings({ lookBack: t });
      out.innerHTML = `<div class="ai-out"><div class="prose" id="tool-answer">${mdLite(text)}</div><div class="row-end"><button class="btn sm primary" id="tool-save">Save as note</button></div></div>`;
      $('#tool-save', out).addEventListener('click', async (ev) => {
        const b = ev.currentTarget; // currentTarget is gone after the first await
        b.disabled = true;
        await saveLookBack(t, text);
        b.textContent = 'Saved'; toast('Saved to Notes');
      });
    } });
};

/* ---- 6. Ask your notes ---- */
const ASK_PROMPT = `Answer the person's question using only their notes below. Each note starts with a number like [3]. Cite the notes you used with their numbers in square brackets. If the notes don't answer it, say so plainly. Under 150 words.`;
A['notes-ask'] = () => {
  const list = data().notes.slice().sort((a, b) => noteDay(b).localeCompare(noteDay(a))).slice(0, 60);
  if (!list.length) { toast('No notes to ask about yet.'); return; }
  aiTool({ title: 'Ask your notes', intro: `The AI answers from your ${plural(list.length, 'note')}, and points to the ones it used.`, system: ASK_PROMPT, sendLabel: 'Ask',
    extra: '<label class="field"><span>Your question</span><input id="ask-q" data-tool-field maxlength="300" placeholder="Why did I change the prior?" autocomplete="off"></label>',
    request: (root) => {
      let budget = 24000;
      const body = list.map((n, i) => { const s = `[${i + 1}] ${noteDay(n)} ${n.title || ''}\n${String(n.body || '').slice(0, 2500)}`; budget -= s.length; return budget > 0 ? s : null; }).filter(Boolean).join('\n\n');
      return `## Question\n${(($('#ask-q', root) || {}).value || '').trim() || '(type a question above)'}\n\n## Notes\n${body}`;
    },
    validate: (root) => (($('#ask-q', root).value || '').trim() ? '' : 'Type a question first.'),
    onAnswer: (text, out) => {
      const html = mdLite(text).replace(/\[(\d{1,3})\]/g, (m, k) => { const n = list[Number(k) - 1]; return n ? `<button class="cite" data-action="note-open" data-id="${n.id}" title="${esc(n.title || 'Note')}">${m}</button>` : m; });
      out.innerHTML = `<div class="ai-out"><div class="prose" id="tool-answer">${html}</div></div>`;
    } });
};
