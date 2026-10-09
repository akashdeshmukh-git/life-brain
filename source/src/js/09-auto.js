/* ===== Automatic AI. When it's switched on in Settings, the AI does its thinking by itself while the app is
   open and online: a line about today, ideas for overdue tasks, organising a note you just wrote, a weekly
   look back, a Monday plan. Anything that would change your tasks waits on Home for one tap. ===== */
const AUTO_PARTS = [
  ['today', 'A line about today, the first time you open the app each day'],
  ['overdue', 'Ideas for overdue tasks, once a day when two or more are overdue'],
  ['notes', 'Organise a note when you close it'],
  ['week', 'A weekly look back on Sunday or Monday, saved to Notes'],
  ['plan', 'A plan for the week on Mondays'],
];
const AUTO = { busy: '', running: false };
LB.AUTO = AUTO;
const autoOn = (k) => { const a = S.settings.auto || {}; return !!a.on && (!k || a[k] !== false) && AI.provider() !== 'none'; };
const pendingList = () => (Array.isArray(S.settings.pending) ? S.settings.pending : []);
const savePending = (list) => saveSettings({ pending: list.slice(-10) });
const dropPending = (test) => savePending(pendingList().filter((p) => !test(p)));
const hashText = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return String(h); };

/* One automatic request: say what's happening on Home, remember exactly what was sent, record any failure. */
async function autoAsk(what, system, request) {
  AUTO.busy = what;
  if (route.name === 'home') render(false);
  try {
    const text = await AI.call(request, { system });
    await saveSettings({ autoLast: { at: new Date().toISOString(), what, text: trunc(system + '\n\n' + request, 20000) }, autoError: null });
    return text;
  } catch (e) {
    await saveSettings({ autoError: { at: new Date().toISOString(), what, message: e.message || 'Something went wrong.' } });
    throw e;
  } finally { AUTO.busy = ''; if (route.name === 'home') render(false); }
}
async function autoRun() {
  if (!autoOn() || AUTO.running || navigator.onLine === false) return;
  AUTO.running = true;
  const t = today(), ran = { ...(S.settings.autoRan || {}) }, mark = async (k) => { ran[k] = t; await saveSettings({ autoRan: { ...ran } }); };
  const wd = parseYmd(t).getDay(), D = data();
  try {
    if (autoOn('today') && !homeLine() && ran.today !== t) {
      await mark('today');
      await saveHomeLine(t, await autoAsk('a line about today', HOME_PROMPT, homeRequest(t)));
    }
    if (autoOn('overdue') && ran.overdue !== t && overdueList(data(), t).length >= 2 && !pendingList().some((p) => p.kind === 'overdue')) {
      await mark('overdue');
      const r = SPECS.overdue.parse(await autoAsk('ideas for overdue tasks', OVERDUE_PROMPT, SPECS.overdue.request(t)), t);
      if (r.rows.length) await savePending([...pendingList(), { id: uid(), kind: 'overdue', at: new Date().toISOString(), rows: r.rows }]);
    }
    const lb = S.settings.lookBack;
    if (autoOn('week') && (wd === 0 || wd === 1) && (!lb || lb < addDays(t, -5)) && D.tasks.length + D.notes.length >= 5) {
      await saveSettings({ lookBack: t });
      const note = await saveLookBack(t, await autoAsk('your weekly look back', WEEK_PROMPT, weekRequest(t)));
      await savePending([...pendingList(), { id: uid(), kind: 'lookback', at: new Date().toISOString(), noteId: note.id }]);
    }
    if (autoOn('plan') && wd === 1 && (!ran.plan || ran.plan < addDays(t, -5)) && planOpen(data(), t).length >= 3 && !pendingList().some((p) => p.kind === 'plan')) {
      await mark('plan');
      const r = SPECS.plan.parse(await autoAsk('a plan for your week', PLAN_PROMPT, SPECS.plan.request(t)), t);
      if (r.rows.length) await savePending([...pendingList(), { id: uid(), kind: 'plan', at: new Date().toISOString(), rows: r.rows, note: r.note }]);
    }
  } catch (_) { /* recorded in autoError and shown in Settings */ }
  finally { AUTO.running = false; emit(); }
}
LB.autoRun = autoRun;

/* A note just closed: if it has something new in it, organise it in the background. */
async function autoNote(id) {
  const n = get(id);
  if (!n || !autoOn('notes') || navigator.onLine === false) return;
  const text = `${n.title || ''}\n${n.body || ''}`.trim(), h = hashText(text);
  const seen = { ...(S.settings.autoNotes || {}) };
  if (text.length < 40 || seen[id] === h || /^(Look back|AI|Journal) · /.test(n.title || '')) return;
  seen[id] = h;
  await saveSettings({ autoNotes: seen });
  try {
    const items = parseItems(await autoAsk('organising your note', ORGANISE_PROMPT, organiseRequest(n)));
    if (!items.some((x) => x.on)) return;
    await savePending([...pendingList().filter((p) => !(p.kind === 'organise' && p.noteId === id)), { id: uid(), kind: 'organise', at: new Date().toISOString(), noteId: id, items }]);
    toast('Suggestions ready from your note', '', { action: 'Look', onAction: () => A['pending-open']({ dataset: { id: pendingList().slice(-1)[0].id } }) });
  } catch (_) {}
}
LB.sheetClosed = [];

/* What waits on Home */
function pendingItems() {
  const out = [];
  for (const p of pendingList()) {
    if (p.kind === 'organise') {
      const n = get(p.noteId), k = (p.items || []).filter((x) => x.on).length;
      if (!n || !k) continue;
      out.push({ title: `✦ Suggestions from “${trunc(n.title || String(n.body || '').split('\n')[0], 40) || 'your note'}”`, attrs: `data-action="pending-open" data-id="${p.id}"`, text: `${plural(k, 'task, event or habit', 'tasks, events or habits')} to check. Nothing is added until you tap Add.` });
    } else if (p.kind === 'overdue' || p.kind === 'plan') {
      const k = (p.rows || []).filter((r) => SPECS[p.kind].still(r)).length;
      if (!k) continue;
      out.push(p.kind === 'overdue'
        ? { title: `✦ What to do with ${plural(k, 'overdue task')}`, attrs: `data-action="pending-open" data-id="${p.id}"`, text: 'Your AI has suggestions ready. Nothing changes until you tap Apply.' }
        : { title: '✦ A plan for this week', attrs: `data-action="pending-open" data-id="${p.id}"`, text: `${plural(k, 'task')} spread over the week. Check it before anything moves.` });
    } else if (p.kind === 'lookback' && get(p.noteId)) {
      out.push({ title: '✦ Your weekly look back is ready', attrs: `data-action="pending-open" data-id="${p.id}"`, text: 'Written by your AI and saved in Notes.' });
    }
  }
  return out;
}
const agoText = (iso) => { const m = Math.round((Date.now() - Date.parse(iso)) / 60000); return m < 2 ? 'just now' : m < 60 ? `${m} minutes ago` : m < 1440 ? `${Math.round(m / 60)} hours ago` : relDate(ymd(new Date(iso))).toLowerCase(); };
A['pending-open'] = (el) => {
  const p = pendingList().find((x) => x.id === el.dataset.id);
  if (!p) return;
  const dismiss = `<button class="btn" data-action="pending-dismiss" data-id="${p.id}">Not now</button>`;
  if (p.kind === 'lookback') { dropPending((x) => x.id === p.id); noteSheet(get(p.noteId)); return; }
  if (p.kind === 'organise') {
    const n = get(p.noteId);
    Object.assign(ORG, { noteId: p.noteId, items: p.items.map((x) => ({ ...x })) });
    openSheet({ title: 'Organise this note', body: `<p class="small">Your AI read <b>${esc(trunc(n.title || 'your note', 50))}</b> ${esc(agoText(p.at))}. Check these, then tap Add.</p><div class="row-end">${dismiss}</div><div id="org-result"></div>` });
    renderOrganised();
    return;
  }
  const spec = SPECS[p.kind];
  openSheet({ title: spec.title, body: `<p class="small">Your AI prepared this ${esc(agoText(p.at))}. Nothing changes until you tap Apply.</p><div class="row-end">${dismiss}</div><div id="tool-result"></div>` });
  reviewSpec(spec, $('#tool-result'), p.rows.filter(spec.still).map((r) => ({ ...r })), p.note);
  REV.after = () => dropPending((x) => x.id === p.id);
};
A['pending-dismiss'] = async (el) => { await dropPending((x) => x.id === el.dataset.id); closeSheet(); };

/* ---- Settings section ---- */
function autoSection() {
  const a = S.settings.auto || {}, prov = AI.provider();
  if (prov === 'none') return '<p class="small muted">Connect an AI above to let it work by itself.</p>';
  const last = S.settings.autoLast, err = S.settings.autoError;
  return `<div class="auto">
    <label class="check"><input type="checkbox" data-action="auto-toggle" ${a.on ? 'checked' : ''}> <b>Let the AI work by itself</b></label>
    <p class="small">It runs only while the app is open and online, and sends the same things the ✦ buttons send, to ${esc(AI.providerName(prov))}. Anything that would change your tasks waits on Home until you tap Apply. Expect a few short requests a day on your AI credits.</p>
    ${a.on ? `<div class="checks auto-parts">${AUTO_PARTS.map(([k, l]) => `<label class="check"><input type="checkbox" data-action="auto-part" data-k="${k}" ${a[k] !== false ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>
      ${S.settings.ai.rememberKeys ? '' : '<p class="small bad" id="auto-key-warn">Your key is forgotten when the app closes, so automatic runs stop then. <button class="link" data-action="auto-keep-key">Keep key on this phone</button></p>'}
      ${err && Date.now() - Date.parse(err.at) < 864e5 ? `<p class="small bad" id="auto-error">Last automatic run (${esc(err.what)}) failed: ${esc(err.message)}</p>` : ''}
      ${last ? `<details class="more"><summary>Last automatic run: ${esc(last.what)}, ${esc(agoText(last.at))}</summary><pre class="preview">${esc(last.text)}</pre></details>` : ''}` : ''}
  </div>`;
}
A['auto-toggle'] = async (el) => {
  const on = !!el.checked;
  await saveSettings({ auto: { ...(S.settings.auto || {}), on } });
  toast(on ? 'The AI will now work by itself' : 'Automatic AI is off');
  if (on) autoRun();
};
A['auto-part'] = async (el) => { await saveSettings({ auto: { ...(S.settings.auto || {}), [el.dataset.k]: !!el.checked } }); };
A['auto-keep-key'] = async () => { await saveSettings({ ai: { rememberKeys: true } }); await storeAiKeys(); toast('Key kept on this phone'); };

/* Run when the app opens, comes back to the front, or gets its connection back. */
document.addEventListener('visibilitychange', () => { if (!document.hidden) setTimeout(() => autoRun(), 800); });
window.addEventListener('online', () => setTimeout(() => autoRun(), 800));
