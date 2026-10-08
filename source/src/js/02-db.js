/* ===== Storage: IndexedDB, local-first. Everything loads into memory at boot; writes go through. ===== */
const TYPES = ['area', 'aim', 'goal', 'project', 'task', 'habit', 'event', 'experiment', 'memory', 'insight', 'day', 'rule', 'week'];
const DEFAULT_PROFILE = { identity: '', direction: '', values: [], priorities: '', capacityHours: 6 };
const DEFAULT_SETTINGS = {
  mode: null, // 'black' | 'white'; null = follow device on first run
  accent: 'yellow', // amber, the classic departure-board LED
  ai: { active: 'auto', linked: [], models: {}, baseUrls: {}, timeoutSec: 60, rememberKeys: false },
};
const S = (LB.S = {
  records: new Map(),
  profile: { ...DEFAULT_PROFILE },
  settings: structuredClone(DEFAULT_SETTINGS),
  aiKeys: {}, // provider id → key. Held in memory; persisted only when the user opts in.
  storage: 'pending', // ok | unavailable | error
  lastSnapshot: null,
  seeded: false,
});
let idb = null;
let listeners = [];
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
    try { r = indexedDB.open('lifebrain', 1); } catch (e) { return rej(e); }
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
function idbDo(store, mode, fn) {
  return new Promise((res, rej) => {
    if (!idb) return res(null);
    let t, out;
    try { t = idb.transaction(store, mode); out = fn(t.objectStore(store)); } catch (e) { return rej(e); }
    t.oncomplete = () => res(out && typeof out === 'object' && 'result' in out ? out.result : out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Transaction aborted'));
  });
}
/* true = saved; null = no storage in this browser (a banner says so); false = the save failed. */
async function persist(store, fn) {
  if (!idb) return null;
  try { await idbDo(store, 'readwrite', fn); return true; }
  catch (e) {
    console.error('Save failed', e);
    S.storage = 'error';
    emit();
    return false;
  }
}
const NOT_SAVED = 'Not saved: this device refused to store the change. Export a backup from Settings → Data.';
const mustPersist = async (store, fn) => { if ((await persist(store, fn)) === false) throw new Error(NOT_SAVED); };
function mergeSettings(v) {
  const d = structuredClone(DEFAULT_SETTINGS);
  const ai = { ...d.ai, ...((v && v.ai) || {}) };
  ['models', 'baseUrls'].forEach((k) => { if (!ai[k] || typeof ai[k] !== 'object' || Array.isArray(ai[k])) ai[k] = {}; });
  if (!Array.isArray(ai.linked)) ai.linked = [];
  return { ...d, ...(v || {}), ai };
}
async function dbInit() {
  try { idb = await openDB(); S.storage = 'ok'; }
  catch (e) { idb = null; S.storage = 'unavailable'; console.warn('IndexedDB unavailable', e); }
  if (!idb) return;
  try {
    for (const r of (await idbDo('records', 'readonly', (st) => st.getAll())) || []) S.records.set(r.id, r);
    for (const m of (await idbDo('meta', 'readonly', (st) => st.getAll())) || []) {
      if (m.key === 'profile') S.profile = { ...DEFAULT_PROFILE, ...m.value };
      if (m.key === 'settings') S.settings = mergeSettings(m.value);
      if (m.key === 'aiKeys' && m.value && typeof m.value === 'object') S.aiKeys = { ...m.value };
      if (m.key === 'lastSnapshot') S.lastSnapshot = m.value;
      if (m.key === 'seeded') S.seeded = !!m.value;
    }
  } catch (e) { S.storage = 'error'; console.error(e); }
}

const all = (type) => [...S.records.values()].filter((r) => r.type === type);
const get = (id) => (id ? S.records.get(id) || null : null);
async function put(rec) {
  const now = new Date().toISOString();
  const r = { ...rec, id: rec.id || uid(), createdAt: rec.createdAt || now, updatedAt: now };
  S.records.set(r.id, r);
  emit();
  await mustPersist('records', (st) => st.put(r));
  return r;
}
async function del(id) {
  S.records.delete(id);
  const changed = unlinkRefs();
  emit();
  await mustPersist('records', (st) => { st.delete(id); changed.forEach((r) => st.put(r)); });
}
/* Clear links that point at records which no longer exist. Returns the records it changed. */
function unlinkRefs() {
  const changed = [];
  for (const r of S.records.values()) {
    let dirty = false;
    for (const k of ['areaId', 'aimId', 'goalId', 'projectId']) if (r[k] && !S.records.has(r[k])) { r[k] = ''; dirty = true; }
    if (dirty) changed.push(r);
  }
  return changed;
}
async function setMeta(key, value) { return mustPersist('meta', (st) => st.put({ key, value })); }
async function delMeta(key) { return mustPersist('meta', (st) => st.delete(key)); }
async function saveProfile(p) { S.profile = { ...S.profile, ex: false, ...p }; emit(); return setMeta('profile', S.profile); }
async function saveSettings(patch) {
  S.settings = mergeSettings({ ...S.settings, ...patch, ai: { ...S.settings.ai, ...(patch.ai || {}) } });
  emit();
  return setMeta('settings', S.settings);
}
/* Keys live in memory; written to this device only when "remember keys" is on. */
async function setAiKey(provider, key) {
  if (key) S.aiKeys[provider] = key; else delete S.aiKeys[provider];
  await storeAiKeys();
  emit();
}
async function storeAiKeys() {
  if (S.settings.ai.rememberKeys && Object.keys(S.aiKeys).length) await setMeta('aiKeys', S.aiKeys); else await delMeta('aiKeys');
}
async function requestPersistence() {
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (_) {}
}

/* ---- Export / import / snapshots ---- */
function exportData() {
  return {
    app: 'life-brain', version: 1, exportedAt: new Date().toISOString(),
    profile: S.profile,
    settings: { mode: S.settings.mode, accent: S.settings.accent, ai: { ...S.settings.ai } }, // never the API key
    records: [...S.records.values()],
  };
}
function validateImport(obj) {
  const errors = [], records = [];
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { ok: false, errors: ['The file is not a Life Brain backup (not a JSON object).'] };
  if (obj.app !== 'life-brain') errors.push('This file is not a Life Brain backup.');
  if (!Array.isArray(obj.records)) errors.push('The backup has no records list.');
  else obj.records.forEach((r, i) => {
    if (!r || typeof r !== 'object' || typeof r.id !== 'string' || !r.id || !TYPES.includes(r.type)) errors.push(`Record ${i + 1} is missing an id or has an unknown type.`);
    else records.push(r);
  });
  if (errors.length > 6) errors.splice(6, errors.length - 6, `…and ${errors.length - 6} more problems.`);
  const counts = {};
  records.forEach((r) => (counts[r.type] = (counts[r.type] || 0) + 1));
  const profile = obj.profile && typeof obj.profile === 'object' ? obj.profile : null;
  return { ok: errors.length === 0, errors, records, profile, settings: obj.settings, counts };
}
async function importData(v, mode) {
  await snapshot('Before import');
  if (mode === 'replace') { S.records.clear(); await persist('records', (st) => st.clear()); }
  v.records.forEach((r) => S.records.set(r.id, r));
  await persist('records', (st) => { v.records.forEach((r) => st.put(r)); });
  if (v.profile && (mode === 'replace' || !S.profile.direction)) {
    S.profile = { ...DEFAULT_PROFILE, ...v.profile };
    await setMeta('profile', S.profile);
  }
  if (mode === 'replace' && v.settings) {
    const { mode: m, accent, ai } = v.settings;
    await saveSettings({ mode: m === 'black' || m === 'white' ? m : S.settings.mode, accent: ACCENTS[accent] ? accent : S.settings.accent, ai: ai && typeof ai === 'object' ? { timeoutSec: Number(ai.timeoutSec) || 60, models: ai.models && typeof ai.models === 'object' ? ai.models : {} } : {} }); // never import service addresses: a crafted backup could redirect your key
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
  await snapshot('Daily automatic backup');
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
  S.profile = { ...DEFAULT_PROFILE };
  S.aiKeys = {};
  S.lastSnapshot = null;
  if (idb) {
    await persist('records', (st) => st.clear());
    await persist('snapshots', (st) => st.clear());
    await persist('meta', (st) => st.clear());
    await setMeta('seeded', true); // don't re-add examples after a deliberate wipe
    S.settings = mergeSettings({ ...S.settings, ai: { ...S.settings.ai, linked: [], baseUrls: {}, active: 'auto' } });
    await setMeta('settings', S.settings); // keep appearance and model choices, drop connections
  }
  S.seeded = true;
  emit();
}
