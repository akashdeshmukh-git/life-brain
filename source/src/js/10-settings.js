/* ===== Settings: appearance, AI, privacy, data ===== */
const env = () => (window.claude && typeof window.claude.use === 'function' ? 'claude' : window.LB_PWA ? 'pwa' : 'web');
let snapCache = null;
VIEWS.settings = () => {
  const st = S.settings, ai = st.ai;
  const mode = document.documentElement.dataset.mode;
  if (!snapCache) listSnapshots().then((l) => { snapCache = l; if (route.name === 'settings') render(); }).catch(() => { snapCache = []; });
  const envText = { claude: 'Running inside Claude. Data stays in this browser. External AI providers are blocked here; Claude (built in) works without a key.', pwa: `Self-hosted app. ${LB.swState === 'ready' ? 'Ready to work offline.' : LB.swState === 'error' ? 'Offline support could not be installed.' : 'Preparing offline support…'}`, web: 'Running as a web page. Install or self-host for offline use.' }[env()];
  const storageText = { ok: 'Saved on this device (IndexedDB).', unavailable: 'This browser is blocking storage, so nothing will be kept after you close the page. Export a backup before leaving.', error: 'The last save failed. Export a backup now.', pending: 'Checking storage…' }[S.storage];
  return head('Preferences and data', 'Settings')
    + section('Appearance', `<div class="modes"><button class="mode-card" data-action="set-mode" data-mode="black" aria-pressed="${mode === 'black'}"><i style="background:#000"></i>Black</button><button class="mode-card" data-action="set-mode" data-mode="white" aria-pressed="${mode === 'white'}"><i style="background:#ededea"></i>White</button></div>
      <div class="swatches" style="margin-top:16px" role="group" aria-label="Highlight colour">${Object.entries(ACCENTS).map(([k, a]) => `<button class="swatch" data-action="set-accent" data-accent="${k}" aria-pressed="${st.accent === k}" aria-label="${a.name}" title="${a.name}" style="background:${a.f}"></button>`).join('')}</div>`)
    + section('AI', aiSection())
    + section('Privacy', `<div class="prose small"><ul>
        <li>Everything you enter is stored only on this device. There is no account and no server.</li>
        <li>The local Brain runs entirely on this device.</li>
        <li>External AI is used only when you press a Brain button. Before anything is sent, you see exactly what will be shared and choose which parts to include. Your whole database is never sent automatically.</li>
        <li>AI answers are suggestions. They never change your values, direction, goals or commitments.</li></ul></div>`)
    + section('Data', `<p class="small">${esc(storageText)}</p><p class="small muted" style="margin-top:4px">${esc(envText)}</p>
      <div class="cluster" style="margin-top:12px"><button class="btn" data-action="export">Export backup</button><label class="btn" for="import-file">Import backup</label><input id="import-file" type="file" accept="application/json,.json" data-import hidden><button class="btn" data-action="export-text">Show backup as text</button></div>
      <div class="section"><div class="section-h"><h2>Automatic backups on this device</h2><button class="btn ghost sm" data-action="snap-now">Back up now</button></div>
        ${snapCache == null ? '<p class="small muted">Loading…</p>' : snapCache.length ? `<div class="list">${snapCache.map((s) => `<div class="item"><span class="item-main"><span class="item-title">${esc(new Date(s.at).toLocaleString())}</span><span class="item-meta">${esc(s.reason)} · ${plural(s.count, 'record')}</span></span><button class="btn sm" data-action="snap-restore" data-id="${s.id}">Restore</button></div>`).join('')}</div>` : '<p class="small muted">None yet. One is made daily when you open the app, and before every import or restore.</p>'}
        <p class="xs muted" style="margin-top:8px">These live in the same browser storage as your data. They protect against mistakes, not against clearing the browser. Export to keep a copy elsewhere.</p></div>
      <div class="section"><div class="section-h"><h2>Danger zone</h2></div><div class="cluster">${hasExamples() ? '<button class="btn" data-action="clear-examples">Remove example data</button>' : ''}<button class="btn danger" data-action="wipe">Delete everything</button></div></div>`)
    + `<p class="xs faint section">Life Brain · local-first · build ${LB.BUILD || 'dev'}</p>`;
};
A['set-mode'] = async (el) => { await saveSettings({ mode: el.dataset.mode }); applyTheme(); };
A['set-accent'] = async (el) => { if (ACCENTS[el.dataset.accent]) { await saveSettings({ accent: el.dataset.accent }); applyTheme(); } };
/* ---- AI settings: paste any key; we detect the service, check it for free, and list its models. ---- */
const aiStatus = {}; // provider → { ok, text } from the last check
let pendingConn = null;
function aiSection() {
  const ai = S.settings.ai, active = AI.provider(), conns = connected();
  const lost = (ai.linked || []).filter((p) => PROVIDERS[p] && !conns.includes(p));
  const choices = [...(AI.sample ? ['claude'] : []), ...conns];
  return `${env() === 'claude' ? '<p class="note">You are using the copy inside Claude. Here the AI is Claude itself, with no key. Claude blocks outside services, so your own keys work in the self-hosted app.</p>' : ''}
    <div class="list" role="radiogroup" aria-label="AI in use">${choices.length ? choices.map((p) => `<button class="item" role="radio" data-action="ai-use" data-p="${p}" aria-checked="${active === p}"><span class="radio" aria-hidden="true"></span><span class="item-main"><span class="item-title">${p === 'claude' ? 'Claude (built in)' : esc(PROVIDERS[p].name)}</span><span class="item-meta">${p === 'claude' ? 'No key needed' : `${esc(provModel(p) || 'Choose a model')} · ${esc(hostOf(provBase(p)))}`}</span></span></button>`).join('')
      : '<div class="item"><span class="item-main muted">No AI connected yet. Paste a key below.</span></div>'}</div>
    ${lost.length ? `<p class="small muted" style="margin-top:10px">Paste the key again for ${esc(lost.map((p) => PROVIDERS[p].name).join(', '))}. Keys are forgotten when the app closes unless “Remember keys” is on.</p>` : ''}
    ${conns.map(connectionCard).join('')}
    <form class="form section" data-form="ai-connect">
      <label class="field" for="f-aikey"><span>Paste any API key</span><input id="f-aikey" name="key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="sk-or-…  sk-ant-…  AIza…  gsk_…" maxlength="400" data-live="ai-key">
        <small id="ai-detect">Works with OpenRouter, OpenAI, Anthropic, Google Gemini, Groq, xAI, DeepSeek, Mistral, Perplexity, Together, Fireworks, Cerebras, Hugging Face, or your own server.</small></label>
      <div class="form-row"><label class="field" for="f-aiprov"><span>Service</span><select id="f-aiprov" name="provider"><option value="">Detect from the key</option>${Object.entries(PROVIDERS).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('')}</select></label>
        <label class="field" for="f-aibase"><span>Address (optional)</span><input id="f-aibase" name="base" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="The service’s usual address" maxlength="300"></label></div>
      <p class="err" data-form-error></p>
      <div class="form-actions"><button class="btn primary">Connect</button></div></form>
    <details class="section disclosure"><summary>Advanced</summary>
      <form class="form" data-form="ai-advanced" style="margin-top:12px">${fieldHTML(['timeoutSec', 'Timeout (seconds)', 'number', { min: 5, maxNum: 300 }], ai.timeoutSec)}
        <label class="check"><input type="checkbox" name="rememberKeys" ${ai.rememberKeys ? 'checked' : ''}> Remember keys on this device</label>
        <p class="xs muted">Without this, keys stay in memory until you close the app. A key stored by any browser app can be read by someone with this device or by a malicious browser extension, so use keys with a spending limit. Keys are never included in exports, and they are only ever sent to their own service.</p>
        <p class="err" data-form-error></p><div class="form-actions"><button class="btn">Save</button></div></form></details>`;
}
function connectionCard(p) {
  const models = AIX.models[p], st = aiStatus[p], P = PROVIDERS[p];
  return `<div class="card section" data-conn="${p}"><div class="split"><b>${esc(P.name)}</b><span class="xs muted num">${S.aiKeys[p] ? 'key ••••' + esc(S.aiKeys[p].slice(-4)) : P.local ? 'runs on this computer' : 'no key'}</span></div>
    <label class="field" style="margin-top:12px" for="f-model-${p}"><span>Model</span><input id="f-model-${p}" list="models-${p}" value="${esc(provModel(p))}" data-model-for="${p}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="${models ? `Type to search ${models.length} models` : 'Load models, or type a model name'}">
      <datalist id="models-${p}">${(models || []).map((m) => `<option value="${esc(m.id)}">${esc([m.label && m.label !== m.id ? m.label : '', m.free ? 'free' : ''].filter(Boolean).join(' · '))}</option>`).join('')}</datalist></label>
    ${st ? `<p class="small ${st.ok ? 'ok' : 'err'}" style="margin-top:8px" data-status="${p}">${esc(st.text)}</p>` : ''}
    <div class="form-actions"><button class="btn sm ghost danger" data-action="ai-remove" data-p="${p}">Remove</button><span class="spacer"></span><button class="btn sm" data-action="ai-models" data-p="${p}">${models ? 'Reload models' : 'Load models'}</button><button class="btn sm" data-action="ai-check" data-p="${p}">Check key</button><button class="btn sm" data-action="ai-test" data-p="${p}">Send a test</button></div></div>`;
}
document.addEventListener('input', (ev) => {
  if (ev.target.dataset.live !== 'ai-key') return;
  const d = detectProvider(ev.target.value), hint = $('#ai-detect'), sel = $('#f-aiprov');
  if (!hint) return;
  if (!ev.target.value.trim()) { hint.textContent = 'Paste a key and the service is recognised automatically.'; return; }
  hint.textContent = d ? (d.sure ? `Recognised: ${PROVIDERS[d.id].name} key.` : `Probably a ${PROVIDERS[d.id].name} key. If not, choose the service.`) : 'Not sure which service this is for. Choose it under Service.';
  if (d && sel && (!sel.value || sel.dataset.auto)) { sel.value = d.id; sel.dataset.auto = '1'; }
});
document.addEventListener('change', (ev) => {
  const p = ev.target.dataset && ev.target.dataset.modelFor;
  if (!p) return;
  const v = ev.target.value.trim();
  saveSettings({ ai: { models: { ...S.settings.ai.models, [p]: v } } }).then(() => toast(v ? `${PROVIDERS[p].name} will use ${v}` : 'Model cleared')).catch((e) => toast(e.message, 'bad'));
});
async function commitConn({ p, key, base, models }) {
  if (key) S.aiKeys[p] = key;
  const ai = S.settings.ai;
  await saveSettings({ ai: {
    linked: [...new Set([...(ai.linked || []), p])], active: p,
    baseUrls: base ? { ...ai.baseUrls, [p]: base } : ai.baseUrls,
    models: { ...ai.models, [p]: ai.models[p] || (models ? pickModel(p, models) : PROVIDERS[p].fallback || '') },
  } });
  await storeAiKeys();
}
F['ai-connect'] = async (form, v) => {
  const key = String(v.key || '').trim();
  const d = detectProvider(key);
  const p = v.provider || (d && d.id);
  if (!p || !PROVIDERS[p]) throw new Error('Could not tell which service this key is for. Choose it under Service.');
  const P = PROVIDERS[p];
  if (!key && !P.local && p !== 'custom') throw new Error('Paste the API key first.');
  if (/\s/.test(key)) throw new Error('The key contains spaces. Copy it again from the service’s website.');
  const base = String(v.base || '').trim().replace(/\/+$/, '');
  if (base) checkUrl(base);
  if (!base && !P.base) throw new Error('Add your server’s address. It usually ends in /v1.');
  const btn = $('button.primary', form), err = $('.err', form);
  btn.disabled = true; btn.textContent = 'Checking…';
  try {
    const models = await listModels(p, key, base || P.base);
    await commitConn({ p, key, base, models });
    aiStatus[p] = { ok: true, text: `Connected · ${plural(models.length, 'model')} available` };
    render();
    toast(`Connected to ${P.name}`);
    haptic('success');
  } catch (e) {
    btn.disabled = false; btn.textContent = 'Connect';
    if (['auth', 'credits', 'bad_url'].includes(e.code)) throw e;
    pendingConn = { p, key, base };
    err.innerHTML = `${esc(e.message)} <button type="button" class="btn sm" data-action="ai-connect-anyway">Save anyway</button>`;
  }
};
A['ai-connect-anyway'] = async () => {
  if (!pendingConn) return;
  const { p } = pendingConn;
  await commitConn(pendingConn);
  pendingConn = null;
  aiStatus[p] = { ok: false, text: 'Saved without checking. Type a model name, then send a test.' };
  render();
  toast(`${PROVIDERS[p].name} saved`);
};
A['ai-use'] = async (el) => { await saveSettings({ ai: { active: el.dataset.p } }); toast(`Using ${el.dataset.p === 'claude' ? 'Claude' : PROVIDERS[el.dataset.p].name}`); };
A['ai-remove'] = async (el) => {
  const p = el.dataset.p, ai = S.settings.ai;
  delete S.aiKeys[p]; delete AIX.models[p]; delete aiStatus[p];
  await saveSettings({ ai: { linked: (ai.linked || []).filter((x) => x !== p), active: ai.active === p ? 'auto' : ai.active } });
  await storeAiKeys();
  toast(`${PROVIDERS[p].name} removed and its key forgotten`);
};
A['ai-models'] = async (el) => {
  const p = el.dataset.p;
  el.disabled = true; el.textContent = 'Loading…';
  try { const list = await listModels(p); aiStatus[p] = { ok: true, text: `${plural(list.length, 'model')} loaded. Start typing in the Model field to search.` }; }
  catch (e) { aiStatus[p] = { ok: false, text: e.message }; }
  render();
};
A['ai-check'] = async (el) => {
  const p = el.dataset.p;
  el.disabled = true; el.textContent = 'Checking…';
  try { aiStatus[p] = { ok: true, text: await checkKey(p) }; } catch (e) { aiStatus[p] = { ok: false, text: e.message }; }
  render();
};
A['ai-test'] = async (el) => {
  if (el && el.dataset.p) await saveSettings({ ai: { active: el.dataset.p } });
  askAI({ title: 'Send a test', question: 'Reply with exactly: Connection works.', scopes: [] });
};
F['ai-advanced'] = async (form, v) => {
  const timeoutSec = Number(v.timeoutSec);
  if (!Number.isFinite(timeoutSec) || timeoutSec < 5 || timeoutSec > 300) throw new Error('Timeout must be between 5 and 300 seconds.');
  await saveSettings({ ai: { timeoutSec, rememberKeys: !!form.elements.rememberKeys.checked } });
  await storeAiKeys();
  toast(S.settings.ai.rememberKeys ? 'Saved. Keys are kept on this device.' : 'Saved. Keys stay in memory only.');
};
/* Export: the Claude viewer blocks plain downloads, so use its downloads capability there. */
async function saveFile(filename, text) {
  if (env() === 'claude') {
    let dl = null;
    try { dl = await window.claude.use('downloads'); } catch (_) {}
    if (dl) {
      try { await dl.save({ filename, data: text }); toast('Backup saved'); return true; }
      catch (e) { if (e && e.code === 'declined') { toast('Save cancelled'); return false; } }
    }
    toast('Saving files is not available here. Use “Show backup as text” and copy it.', 'bad');
    return false;
  }
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Backup downloaded');
  return true;
}
const backupName = () => `life-brain-backup-${today()}.json`;
A.export = () => saveFile(backupName(), JSON.stringify(exportData(), null, 2));
A['export-text'] = () => {
  const text = JSON.stringify(exportData(), null, 2);
  openSheet({ title: 'Backup as text', body: `<p class="small muted">Copy all of this and keep it somewhere safe. Import it later from Settings → Data. Your API key is not included.</p>
    <textarea class="input num" id="backup-text" readonly style="min-height:260px;margin-top:10px;font-size:12px">${esc(text)}</textarea>
    <div class="form-actions"><button class="btn" data-action="sheet-close">Close</button><button class="btn primary" data-action="copy-backup">Copy</button></div>` });
};
A['copy-backup'] = () => { const ta = $('#backup-text'); ta.select(); copyText(ta.value); };
document.addEventListener('change', async (ev) => {
  if (!ev.target.matches('[data-import]')) return;
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) { toast('That file is too large to be a Life Brain backup.', 'bad'); return; }
  let obj;
  try { obj = JSON.parse(await file.text()); } catch (_) { toast('That file is not valid JSON.', 'bad'); return; }
  importPreview(validateImport(obj));
});
let pendingImport = null;
function importPreview(v) {
  pendingImport = v;
  const names = { area: 'areas', aim: 'aims', goal: 'goals', project: 'projects', task: 'tasks', habit: 'habits', event: 'events', experiment: 'experiments', memory: 'memories', insight: 'insights' };
  openSheet({ title: 'Import backup', body: v.ok
    ? `<p>This backup contains:</p><div class="cluster" style="margin-top:10px">${Object.entries(v.counts).map(([k, n]) => `<span class="tag num">${n} ${names[k]}</span>`).join('') || '<span class="tag">no records</span>'}</div>
      <p class="small muted" style="margin-top:12px"><b>Merge</b> adds these records and updates any with the same id. <b>Replace</b> removes everything currently stored first. A backup of your current data is made automatically either way.</p>
      <div class="form-actions"><button class="btn" data-action="sheet-close">Cancel</button><button class="btn" data-action="import-go" data-mode="replace">Replace all</button><button class="btn primary" data-action="import-go" data-mode="merge">Merge</button></div>`
    : `<p class="err">This file can’t be imported:</p><ul class="evidence" style="margin-top:8px">${v.errors.map((e) => `<li>${esc(e)}</li>`).join('')}</ul><div class="form-actions"><button class="btn" data-action="sheet-close">Close</button></div>` });
}
LB.importPreview = importPreview;
A['import-go'] = async (el) => {
  if (!pendingImport || !pendingImport.ok) return;
  const mode = el.dataset.mode === 'replace' ? 'replace' : 'merge';
  if (mode === 'replace') {
    closeSheet();
    const ok = await confirmSheet({ title: 'Replace everything?', text: 'All current records will be removed and replaced with the backup. A backup of the current data is made first.', confirmLabel: 'Replace', danger: true });
    if (!ok) return;
  }
  await importData(pendingImport, mode);
  pendingImport = null;
  snapCache = null;
  closeSheet();
  toast(mode === 'replace' ? 'Backup restored' : 'Backup merged');
};
A['snap-now'] = async () => { const s = await snapshot('Manual backup'); snapCache = null; render(); toast(s ? 'Backup made' : 'Nothing to back up yet'); };
A['snap-restore'] = async (el) => {
  const ok = await confirmSheet({ title: 'Restore this backup?', text: 'Your current data will be replaced by this backup. A backup of the current state is made first, so you can undo this.', confirmLabel: 'Restore', danger: true });
  if (!ok) return;
  await restoreSnapshot(el.dataset.id);
  snapCache = null;
  toast('Backup restored');
};
A.wipe = async () => {
  const ok = await confirmSheet({ title: 'Delete everything?', text: 'All records, your direction, the stored API key and every automatic backup on this device will be erased. This cannot be undone. Export a backup first if you might want it.', confirmLabel: 'Delete everything', danger: true, requireText: 'DELETE' });
  if (!ok) return;
  await deleteEverything();
  snapCache = null;
  go('home');
  toast('Everything deleted');
};
A['clear-examples'] = async () => {
  const ok = await confirmSheet({ title: 'Remove example data?', text: 'All example records will be removed. Anything you added yourself stays.', confirmLabel: 'Remove examples' });
  if (!ok) return;
  const ex = [...S.records.values()].filter((r) => r.ex);
  ex.forEach((r) => S.records.delete(r.id));
  const changed = unlinkRefs();
  await persist('records', (st) => { ex.forEach((r) => st.delete(r.id)); changed.forEach((r) => st.put(r)); });
  if (S.profile.ex) await saveProfile({ ...DEFAULT_PROFILE, ex: false });
  emit();
  toast('Examples removed');
};
