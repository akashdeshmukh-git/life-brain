/* ===== Settings: look, AI, data ===== */
let snapCache = null;
const aiStatus = {}; // provider → { ok, text } from the last check
let pendingConn = null;
VIEWS.settings = (sub) => {
  const st = S.settings;
  if (!snapCache) listSnapshots().then((l) => { snapCache = l; if (route.name === 'settings') render(); }).catch(() => { snapCache = []; });
  if (sub === 'ai') setTimeout(() => { const el = $('#ai-card'); if (el) el.scrollIntoView({ block: 'start' }); }, 0);
  const offline = !window.LB_PWA ? '' : LB.swState === 'ready' ? 'Works offline.' : LB.swState === 'error' ? 'Offline mode could not be set up.' : 'Setting up offline mode…';
  return `<header class="top"><button class="icon-btn" data-action="nav" data-to="today" aria-label="Back">${icon('left')}</button><div class="top-text"><h1>Settings</h1></div></header>`
    + `<section class="card">${sectionH('Look')}
      <div class="seg" role="radiogroup" aria-label="Theme">${[['system', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([k, l]) => `<button role="radio" data-action="set-theme" data-v="${k}" aria-selected="${st.theme === k}" aria-checked="${st.theme === k}">${l}</button>`).join('')}</div>
      <div class="swatches" role="radiogroup" aria-label="Colour">${Object.entries(ACCENTS).map(([k, a]) => `<button class="swatch" role="radio" data-action="set-accent" data-v="${k}" aria-checked="${st.accent === k}" aria-label="${a.name}" title="${a.name}" style="--c:${isDark() ? a.dark : a.light}"></button>`).join('')}</div></section>`
    + `<section class="card" id="ai-card">${sectionH('AI')}${aiSection()}</section>`
    + `<section class="card">${sectionH('Your data')}
      <p class="small">Everything stays on this phone. No account, no server. ${offline}</p>
      <div class="chips"><button class="btn" data-action="export">Export backup</button><label class="btn" for="import-file">Import backup</label><input id="import-file" type="file" accept="application/json,.json" data-import hidden></div>
      <details class="more"><summary>Backups on this phone</summary>
        ${snapCache == null ? '<p class="small muted">Loading…</p>' : snapCache.length ? snapCache.map((s) => `<div class="srow"><span><b>${esc(new Date(s.at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }))}</b><small>${esc(s.reason)} · ${plural(s.count, 'item')}</small></span><button class="btn sm" data-action="snap-restore" data-id="${s.id}">Restore</button></div>`).join('') : '<p class="small muted">One is made each day you open the app.</p>'}
        <p class="small muted">These sit in the same storage as your data. Export now and then to keep a copy somewhere else.</p></details>
      <button class="btn danger block" data-action="wipe">Delete everything</button></section>`
    + `<p class="about"><img src="${LB.LOGO}" alt="" width="28" height="28">Life Brain · ${esc(LB.BUILD || 'dev')}</p>`;
};
A['set-theme'] = async (el) => { await saveSettings({ theme: el.dataset.v }); applyTheme(); };
A['set-accent'] = async (el) => { if (ACCENTS[el.dataset.v]) { await saveSettings({ accent: el.dataset.v }); applyTheme(); } };

/* ---- AI: paste any key; the service is recognised, checked for free, and a model is picked. ---- */
function aiSection() {
  const ai = S.settings.ai, active = AI.provider(), conns = connected();
  const lost = (ai.linked || []).filter((p) => PROVIDERS[p] && !conns.includes(p));
  return `${conns.length ? conns.map((p) => connCard(p, active)).join('') : '<p class="small muted">Paste any API key. The app works out which service it is for.</p>'}
    ${lost.length ? `<p class="small muted">Paste the key again for ${esc(lost.map((p) => PROVIDERS[p].name).join(', '))}. Keys are forgotten when the app closes unless you keep them on this phone.</p>` : ''}
    <form class="form" data-form="ai-connect">
      <label class="field"><span>${conns.length ? 'Add another key' : 'API key'}</span><input id="f-aikey" name="key" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="sk-or-…  sk-ant-…  AIza…  gsk_…" maxlength="400" data-live="ai-key"><small id="ai-detect"></small></label>
      <details class="more"><summary>Service and address</summary>
        <label class="field"><span>Service</span><select id="f-aiprov" name="provider"><option value="">Work it out from the key</option>${Object.entries(PROVIDERS).map(([k, v]) => `<option value="${k}">${esc(v.name)}</option>`).join('')}</select></label>
        <label class="field"><span>Address</span><input name="base" inputmode="url" autocapitalize="off" spellcheck="false" placeholder="Leave empty for the usual one" maxlength="300"></label></details>
      <p class="err" data-form-error></p>
      <button class="btn primary block">Connect</button></form>
    <label class="check"><input type="checkbox" data-action="ai-remember" ${ai.rememberKeys ? 'checked' : ''}> Keep keys on this phone</label>
    <p class="small muted">Otherwise you paste the key again after closing the app. A kept key can be read by anyone with this phone, so use one with a spending limit. Keys are never in backups.</p>`;
}
function connCard(p, active) {
  const models = AIX.models[p], st = aiStatus[p], P = PROVIDERS[p];
  return `<div class="conn${active === p ? ' on' : ''}" data-conn="${p}"><div class="conn-top"><button class="radio-btn" data-action="ai-use" data-p="${p}" role="radio" aria-checked="${active === p}" aria-label="Use ${esc(P.name)}"></button><b>${esc(P.name)}</b><span class="muted small">${S.aiKeys[p] ? '••••' + esc(S.aiKeys[p].slice(-4)) : ''}</span></div>
    <label class="field"><span>Model</span><input list="models-${p}" value="${esc(provModel(p))}" data-model-for="${p}" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Type a model name">
      <datalist id="models-${p}">${(models || []).map((m) => `<option value="${esc(m.id)}">${esc(m.free ? 'free' : '')}</option>`).join('')}</datalist></label>
    ${st ? `<p class="small ${st.ok ? 'ok' : 'err'}" data-status="${p}">${esc(st.text)}</p>` : ''}
    <div class="chips"><button class="btn sm" data-action="ai-check" data-p="${p}">Check key</button><button class="btn sm danger" data-action="ai-remove" data-p="${p}">Remove</button></div></div>`;
}
document.addEventListener('input', (ev) => {
  if (ev.target.dataset.live !== 'ai-key') return;
  const d = detectProvider(ev.target.value), hint = $('#ai-detect'), sel = $('#f-aiprov');
  if (!hint) return;
  if (!ev.target.value.trim()) { hint.textContent = ''; return; }
  hint.textContent = d ? (d.sure ? `${PROVIDERS[d.id].name} key` : `Probably ${PROVIDERS[d.id].name}. If not, pick the service below.`) : 'Not sure which service this is. Pick it below.';
  if (d && sel && (!sel.value || sel.dataset.auto)) { sel.value = d.id; sel.dataset.auto = '1'; }
});
document.addEventListener('change', (ev) => {
  const p = ev.target.dataset && ev.target.dataset.modelFor;
  if (!p) return;
  const v = ev.target.value.trim();
  saveSettings({ ai: { models: { ...S.settings.ai.models, [p]: v } } }).then(() => toast(v ? `Using ${v}` : 'Model cleared')).catch((e) => toast(e.message, 'bad'));
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
  const key = String(v.key || '').trim(), d = detectProvider(key), p = v.provider || (d && d.id);
  if (!p || !PROVIDERS[p]) throw new Error('Can’t tell which service this key is for. Pick it under “Service and address”.');
  const P = PROVIDERS[p];
  if (!key && !P.local && p !== 'custom') throw new Error('Paste the key first.');
  if (/\s/.test(key)) throw new Error('The key has a space in it. Copy it again.');
  const base = String(v.base || '').trim().replace(/\/+$/, '');
  if (base) checkUrl(base);
  if (!base && !P.base) throw new Error('Add the server’s address. It usually ends in /v1.');
  const btn = $('button.primary', form), err = $('.err', form);
  btn.disabled = true; btn.textContent = 'Checking…';
  try {
    const models = await listModels(p, key, base || P.base);
    await commitConn({ p, key, base, models });
    aiStatus[p] = { ok: true, text: `Connected · ${plural(models.length, 'model')}` };
    render();
    toast(`Connected to ${P.name}`);
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
  aiStatus[p] = { ok: false, text: 'Saved without checking. Type a model name if needed.' };
  render();
};
A['ai-use'] = async (el) => { await saveSettings({ ai: { active: el.dataset.p } }); };
A['ai-remove'] = async (el) => {
  const p = el.dataset.p, ai = S.settings.ai;
  delete S.aiKeys[p]; delete AIX.models[p]; delete aiStatus[p];
  await saveSettings({ ai: { linked: (ai.linked || []).filter((x) => x !== p), active: ai.active === p ? 'auto' : ai.active } });
  await storeAiKeys();
  toast(`${PROVIDERS[p].name} removed`);
};
A['ai-check'] = async (el) => {
  const p = el.dataset.p;
  el.disabled = true; el.textContent = 'Checking…';
  try { aiStatus[p] = { ok: true, text: await checkKey(p) }; } catch (e) { aiStatus[p] = { ok: false, text: e.message }; }
  render();
};
A['ai-remember'] = async (el) => {
  await saveSettings({ ai: { rememberKeys: !!el.checked } });
  await storeAiKeys();
  toast(el.checked ? 'Keys kept on this phone' : 'Keys kept in memory only');
};

/* ---- Data ---- */
function saveFile(filename, text) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Backup downloaded');
}
A.export = () => saveFile(`life-brain-backup-${today()}.json`, JSON.stringify(exportData(), null, 2));
document.addEventListener('change', async (ev) => {
  if (!ev.target.matches('[data-import]')) return;
  const file = ev.target.files && ev.target.files[0];
  ev.target.value = '';
  if (!file) return;
  if (file.size > 50 * 1024 * 1024) { toast('That file is too big to be a backup.', 'bad'); return; }
  let obj;
  try { obj = JSON.parse(await file.text()); } catch (_) { toast('That file isn’t a backup.', 'bad'); return; }
  importPreview(validateImport(obj));
});
let pendingImport = null;
const NAMES = { task: 'tasks', event: 'events', note: 'notes', journal: 'journal entries', habit: 'habits', goal: 'goals' };
function importPreview(v) {
  pendingImport = v;
  openSheet({ title: 'Import backup', body: v.ok
    ? `<p>${Object.entries(v.counts).map(([k, n]) => `${n} ${NAMES[k]}`).join(', ') || 'Nothing in it.'}</p>
      <p class="small muted"><b>Add</b> keeps what you have and adds these. <b>Replace</b> clears everything first. A backup of what you have now is made either way.</p>
      <div class="row-end"><button class="btn" data-action="import-go" data-mode="replace">Replace</button><button class="btn primary" data-action="import-go" data-mode="merge">Add</button></div>`
    : `<p class="err">${v.errors.map(esc).join('<br>')}</p><div class="row-end"><button class="btn" data-action="sheet-close">Close</button></div>` });
}
LB.importPreview = importPreview;
A['import-go'] = async (el) => {
  if (!pendingImport || !pendingImport.ok) return;
  const mode = el.dataset.mode === 'replace' ? 'replace' : 'merge';
  if (mode === 'replace') {
    closeSheet();
    if (!(await confirmSheet({ title: 'Replace everything?', text: 'What you have now is replaced by the backup. A copy of it is kept under “Backups on this phone”.', confirmLabel: 'Replace', danger: true }))) return;
  }
  await importData(pendingImport, mode);
  pendingImport = null; snapCache = null;
  closeSheet();
  toast(mode === 'replace' ? 'Backup restored' : 'Backup added');
};
A['snap-restore'] = async (el) => {
  if (!(await confirmSheet({ title: 'Restore this backup?', text: 'What you have now is replaced. A copy of it is kept first, so you can undo this.', confirmLabel: 'Restore', danger: true }))) return;
  await restoreSnapshot(el.dataset.id);
  snapCache = null;
  toast('Backup restored');
};
A.wipe = async () => {
  if (!(await confirmSheet({ title: 'Delete everything?', text: 'Every task, event, note, journal entry, habit, goal, key and backup on this phone is erased. This can’t be undone.', confirmLabel: 'Delete everything', danger: true, requireText: 'DELETE' }))) return;
  await deleteEverything();
  snapCache = null;
  go('today');
  toast('Everything deleted');
};
