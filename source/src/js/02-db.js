/* ===== Storage: IndexedDB on this device. Everything loads into memory at start; writes go straight through. ===== */
const TYPES = ['task', 'event', 'note', 'journal', 'habit', 'goal'];
const DB_NAME = 'lifebrain2';
const DEFAULT_SETTINGS = {
  theme: 'system', // system | light | dark
  accent: 'blue',
  ai: { active: 'auto', linked: [], models: {}, baseUrls: {}, timeoutSec: 60, rememberKeys: false },
};
const S = (LB.S = {
  records: new Map(),
  settings: structuredClone(DEFAULT_SETTINGS),
  aiKeys: {}, // provider id → key. Held in memory; stored only when the person turns that on.
  storage: 'pending', // ok | unavailable | error
  lastSnapshot: null,
  migrated: false,
});
let idb = null;
const listeners = [];
const onChange = (fn) => listeners.push(fn);
let emitQueued = false;
function emit() {
  if (emitQueued) return;
  emitQueued = true;
  queueMicrotask(() => { emitQueued = false; listeners.forEach((f) => f()); });
}

function openDB() {
  return new Promise((res, rej) => {
    let r;
    try { r = indexedDB.open(DB_NAME, 1); } catch (e) { return rej(e); }
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('records', { keyPath: 'id' });
      d.createObjectStore('meta', { keyPath: 'key' });
      d.createObjectStore('snapshots', { keyPath: 'id' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('Database blocked by another open tab'));
  });
}
const txDo = (db, store, mode, fn) => new Promise((res, rej) => {
  if (!db) return res(null);
  let t, out;
  try { t = db.transaction(store, mode); out = fn(t.objectStore(store)); } catch (e) { return rej(e); }
  t.oncomplete = () => res(out && typeof out === 'object' && 'result' in out ? out.result : out);
  t.onerror = () => rej(t.error);
  t.onabort = () => rej(t.error || new Error('Transaction aborted'));
});
const idbDo = (store, mode, fn) => txDo(idb, store, mode, fn);
/* true = saved; null = no storage in this browser (a banner says so); false = the save failed. */
async function persist(store, fn) {
  if (!idb) return null;
  try { await idbDo(store, 'readwrite', fn); return true; }
  catch (e) { console.error('Save failed', e); S.storage = 'error'; emit(); return false; }
}
const NOT_SAVED = 'Not saved. This phone refused to store the change. Export a backup from Settings.';
const mustPersist = async (store, fn) => { if ((await persist(store, fn)) === false) throw new Error(NOT_SAVED); };
function mergeSettings(v) {
  const d = structuredClone(DEFAULT_SETTINGS);
  const ai = { ...d.ai, ...((v && v.ai) || {}) };
  ['models', 'baseUrls'].forEach((k) => { if (!ai[k] || typeof ai[k] !== 'object' || Array.isArray(ai[k])) ai[k] = {}; });
  if (!Array.isArray(ai.linked)) ai.linked = [];
  const out = { ...d, ...(v || {}), ai };
  if (!['system', 'light', 'dark'].includes(out.theme)) out.theme = 'system';
  return out;
}
async function dbInit() {
  try { idb = await openDB(); S.storage = 'ok'; }
  catch (e) { idb = null; S.storage = 'unavailable'; console.warn('IndexedDB unavailable', e); return; }
  try {
    for (const r of (await idbDo('records', 'readonly', (st) => st.getAll())) || []) S.records.set(r.id, r);
    for (const m of (await idbDo('meta', 'readonly', (st) => st.getAll())) || []) {
      if (m.key === 'settings') S.settings = mergeSettings(m.value);
      if (m.key === 'aiKeys' && m.value && typeof m.value === 'object') S.aiKeys = { ...m.value };
      if (m.key === 'lastSnapshot') S.lastSnapshot = m.value;
      if (m.key === 'migrated') S.migrated = !!m.value;
    }
  } catch (e) { S.storage = 'error'; console.error(e); }
}

const all = (type) => [...S.records.values()].filter((r) => r.type === type);
const get = (id) => (id ? S.records.get(id) || null : null);
/* quiet: save without redrawing the screen (used while typing, so the cursor isn't lost). */
async function put(rec, { quiet = false } = {}) {
  const now = new Date().toISOString();
  const r = { ...rec, id: rec.id || uid(), createdAt: rec.createdAt || now, updatedAt: now };
  S.records.set(r.id, r);
  if (!quiet) emit();
  await mustPersist('records', (st) => st.put(r));
  return r;
}
async function del(id) {
  S.records.delete(id);
  emit();
  await mustPersist('records', (st) => st.delete(id));
}
async function setMeta(key, value) { return mustPersist('meta', (st) => st.put({ key, value })); }
async function delMeta(key) { return mustPersist('meta', (st) => st.delete(key)); }
async function saveSettings(patch) {
  S.settings = mergeSettings({ ...S.settings, ...patch, ai: { ...S.settings.ai, ...(patch.ai || {}) } });
  emit();
  return setMeta('settings', S.settings);
}
async function setAiKey(provider, key) {
  if (key) S.aiKeys[provider] = key; else delete S.aiKeys[provider];
  await storeAiKeys();
  emit();
}
async function storeAiKeys() {
  if (S.settings.ai.rememberKeys && Object.keys(S.aiKeys).length) await setMeta('aiKeys', S.aiKeys); else await delMeta('aiKeys');
}
async function requestPersistence() { try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_) {} }

/* ---- The earlier Life Brain: turn its records into the new kinds. Example data is left behind. ---- */
function fromOld(records, profile) {
  const out = [], now = new Date().toISOString();
  const keep = (r) => r && typeof r === 'object' && !r.ex && typeof r.id === 'string';
  const base = (r) => ({ id: r.id, createdAt: r.createdAt || now, updatedAt: r.updatedAt || now });
  for (const r of records.filter(keep)) {
    if (r.type === 'task' && (r.status === 'open' || r.status === 'done' || !r.status)) {
      const done = r.status === 'done';
      const note = [r.firstStep && 'First step: ' + r.firstStep, r.why].filter(Boolean).join('\n');
      out.push({ ...base(r), type: 'task', title: String(r.title || 'Task'), done, doneDate: done ? r.doneDate || r.statusDate || '' : '', date: isYmd(r.plannedDate) ? r.plannedDate : done && isYmd(r.doneDate) ? r.doneDate : '', note, moved: Number(r.deferrals) || 0 });
    } else if (r.type === 'event' && isYmd(r.date)) {
      out.push({ ...base(r), type: 'event', title: String(r.title || 'Event'), date: r.date, time: r.allDay ? '' : /^\d{1,2}:\d{2}$/.test(r.start || '') ? r.start : '', note: [r.location, r.notes].filter(Boolean).join('\n') });
    } else if (r.type === 'habit') {
      const log = {};
      for (const [d, v] of Object.entries(r.log || {})) if (isYmd(d) && v) log[d] = true;
      out.push({ ...base(r), type: 'habit', title: [r.emoji, r.title].filter(Boolean).join(' ') || 'Habit', log });
    } else if (r.type === 'memory' || r.type === 'insight') {
      out.push({ ...base(r), type: 'note', title: String(r.title || ''), body: [r.body, r.why && 'Why: ' + r.why].filter(Boolean).join('\n\n'), pinned: false });
    } else if (r.type === 'goal') {
      const done = r.status === 'done';
      out.push({ ...base(r), type: 'goal', title: String(r.title || 'Goal'), target: 1, unit: '', log: done ? { [today()]: 1 } : {} });
    } else if (r.type === 'day' && isYmd(r.date) && String(r.note || '').trim()) {
      out.push({ id: 'journal-' + r.date, createdAt: r.createdAt || now, updatedAt: r.updatedAt || now, type: 'journal', date: r.date, text: String(r.note), mood: 0 });
    }
  }
  if (profile && !profile.ex && String(profile.direction || '').trim()) {
    out.push({ id: 'note-direction', createdAt: now, updatedAt: now, type: 'note', title: 'My direction', body: [profile.direction, profile.priorities && 'Priorities: ' + profile.priorities].filter(Boolean).join('\n\n'), pinned: true });
  }
  return out;
}
/* Read the old database once, if it is there. Never changes or deletes it. */
function readOldDB() {
  return new Promise((res) => {
    let r;
    try { r = indexedDB.open('lifebrain'); } catch (_) { return res(null); }
    r.onupgradeneeded = () => { try { r.transaction.abort(); } catch (_) {} }; // it doesn't exist: don't create it
    r.onerror = () => res(null);
    r.onblocked = () => res(null);
    r.onsuccess = async () => {
      const db = r.result;
      try {
        if (!db.objectStoreNames.contains('records')) { db.close(); return res(null); }
        const records = (await txDo(db, 'records', 'readonly', (st) => st.getAll())) || [];
        const meta = db.objectStoreNames.contains('meta') ? (await txDo(db, 'meta', 'readonly', (st) => st.getAll())) || [] : [];
        db.close();
        res({ records, meta: Object.fromEntries(meta.map((m) => [m.key, m.value])) });
      } catch (_) { try { db.close(); } catch (__) {} res(null); }
    };
  });
}
async function migrateOld() {
  if (S.migrated || !idb) return 0;
  const old = await readOldDB();
  let n = 0;
  if (old) {
    const recs = fromOld(old.records, old.meta.profile).filter((r) => !S.records.has(r.id));
    for (const r of recs) S.records.set(r.id, r);
    if (recs.length) await mustPersist('records', (st) => recs.forEach((r) => st.put(r)));
    n = recs.length;
    const os = old.meta.settings;
    if (os && typeof os === 'object') {
      const patch = {};
      if (os.mode === 'black') patch.theme = 'dark';
      if (os.mode === 'white') patch.theme = 'light';
      if (os.ai && typeof os.ai === 'object') patch.ai = { ...S.settings.ai, ...os.ai, active: 'auto' };
      S.settings = mergeSettings({ ...S.settings, ...patch });
      await setMeta('settings', S.settings);
    }
    if (old.meta.aiKeys && typeof old.meta.aiKeys === 'object') { S.aiKeys = { ...old.meta.aiKeys, ...S.aiKeys }; await storeAiKeys(); }
  }
  S.migrated = true;
  await setMeta('migrated', true);
  return n;
}

/* ---- Export / import / snapshots ---- */
function exportData() {
  return {
    app: 'life-brain', version: 2, exportedAt: new Date().toISOString(),
    settings: { theme: S.settings.theme, accent: S.settings.accent }, // never API keys or service addresses
    records: [...S.records.values()],
  };
}
function validateImport(obj) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj) || obj.app !== 'life-brain' || !Array.isArray(obj.records)) return { ok: false, errors: ['This file is not a Life Brain backup.'] };
  const raw = obj.version === 2 ? obj.records : fromOld(obj.records, obj.profile); // older backups are converted
  const errors = [], records = [];
  raw.forEach((r, i) => {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || !TYPES.includes(r.type)) errors.push(`Item ${i + 1} is damaged.`);
    else records.push(r);
  });
  if (errors.length > 5) errors.splice(5, errors.length - 5, `…and ${errors.length - 5} more.`);
  const counts = {};
  records.forEach((r) => (counts[r.type] = (counts[r.type] || 0) + 1));
  return { ok: errors.length === 0, errors, records, settings: obj.settings, counts };
}
async function importData(v, mode) {
  await snapshot('Before import');
  if (mode === 'replace') { S.records.clear(); await persist('records', (st) => st.clear()); }
  v.records.forEach((r) => S.records.set(r.id, r));
  await mustPersist('records', (st) => v.records.forEach((r) => st.put(r)));
  if (mode === 'replace' && v.settings && typeof v.settings === 'object') {
    const { theme, accent } = v.settings;
    await saveSettings({ theme: ['system', 'light', 'dark'].includes(theme) ? theme : S.settings.theme, accent: ACCENTS[accent] ? accent : S.settings.accent });
  }
  emit();
}
async function listSnapshots() {
  const l = (await idbDo('snapshots', 'readonly', (st) => st.getAll())) || [];
  return l.sort((a, b) => b.at.localeCompare(a.at));
}
async function snapshot(reason) {
  if (!idb || !S.records.size) return null;
  const snap = { id: uid(), at: new Date().toISOString(), reason, count: S.records.size, data: exportData() };
  if (!(await persist('snapshots', (st) => st.put(snap)))) return null;
  const list = await listSnapshots();
  for (const old of list.slice(10)) await persist('snapshots', (st) => st.delete(old.id));
  S.lastSnapshot = snap.at;
  await setMeta('lastSnapshot', snap.at);
  return snap;
}
async function autoSnapshot() {
  if (!S.records.size) return;
  if (S.lastSnapshot && Date.now() - Date.parse(S.lastSnapshot) < 864e5) return;
  await snapshot('Daily backup');
}
async function restoreSnapshot(id) {
  const snap = (await listSnapshots()).find((s) => s.id === id);
  if (!snap) throw new Error('That backup no longer exists.');
  const v = validateImport(snap.data);
  if (!v.ok) throw new Error('That backup is damaged.');
  await importData(v, 'replace');
}
async function deleteEverything() {
  S.records.clear();
  S.aiKeys = {};
  S.lastSnapshot = null;
  if (idb) {
    await persist('records', (st) => st.clear());
    await persist('snapshots', (st) => st.clear());
    await persist('meta', (st) => st.clear());
    S.settings = mergeSettings({ theme: S.settings.theme, accent: S.settings.accent });
    await setMeta('settings', S.settings);
    await setMeta('migrated', true); // a deliberate wipe must not bring the old data back
  }
  S.migrated = true;
  emit();
}
