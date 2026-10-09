/* ===== AI: any API key, recognised automatically. Nothing is sent until you've seen it and pressed Send. ===== */
const AI = (LB.AI = {});
const SYSTEM_PROMPT = `You look at one person's own records from Life Brain (tasks, calendar, journal, habits, goals, notes) and tell them what they may not be seeing.
Rules:
- Work only from the records given. Say plainly when there is too little to go on.
- Point out patterns: what keeps slipping, what goes with good and bad days, where time really goes, what they keep avoiding.
- Never diagnose their psychology or character.
- End with at most three small, concrete things to try next week.
- Be short: under 250 words, plain words, short lists.`;
/* ---- Providers: paste any key, we recognise the service and speak its own API. ---- */
const PROVIDERS = {
  openrouter: { name: 'OpenRouter', style: 'openai', base: 'https://openrouter.ai/api/v1', detect: /^sk-or-/, keys: 'https://openrouter.ai/keys', fallback: 'openrouter/auto', prefer: [/^openrouter\/auto$/] },
  openai: { name: 'OpenAI', style: 'openai', base: 'https://api.openai.com/v1', detect: /^sk-(proj|svcacct|admin)-|^sk-[A-Za-z0-9]{48}$/, keys: 'https://platform.openai.com/api-keys', fallback: 'gpt-4o-mini', prefer: [/^gpt-[\d.]+-mini$/, /mini/] },
  anthropic: { name: 'Anthropic', style: 'anthropic', base: 'https://api.anthropic.com/v1', detect: /^sk-ant-/, keys: 'https://console.anthropic.com/settings/keys', fallback: 'claude-sonnet-5-5', prefer: [/sonnet/, /haiku/] },
  gemini: { name: 'Google Gemini', style: 'gemini', base: 'https://generativelanguage.googleapis.com/v1beta', detect: /^AIza[0-9A-Za-z_-]{30,}$/, keys: 'https://aistudio.google.com/apikey', fallback: 'gemini-2.5-flash', prefer: [/^gemini-[\d.]+-flash$/, /flash(?!.*(lite|image|tts|live|audio))/] },
  groq: { name: 'Groq', style: 'openai', base: 'https://api.groq.com/openai/v1', detect: /^gsk_/, keys: 'https://console.groq.com/keys', fallback: 'llama-3.3-70b-versatile', prefer: [/versatile/, /70b/] },
  xai: { name: 'xAI (Grok)', style: 'openai', base: 'https://api.x.ai/v1', detect: /^xai-/, keys: 'https://console.x.ai', fallback: 'grok-3-mini', prefer: [/mini/] },
  deepseek: { name: 'DeepSeek', style: 'openai', base: 'https://api.deepseek.com/v1', detect: /^sk-[a-f0-9]{32}$/, keys: 'https://platform.deepseek.com/api_keys', fallback: 'deepseek-chat', prefer: [/^deepseek-chat$/] },
  mistral: { name: 'Mistral', style: 'openai', base: 'https://api.mistral.ai/v1', detect: /^[A-Za-z0-9]{32}$/, guess: true, keys: 'https://console.mistral.ai/api-keys', fallback: 'mistral-small-latest', prefer: [/small-latest/, /latest/] },
  perplexity: { name: 'Perplexity', style: 'openai', base: 'https://api.perplexity.ai', detect: /^pplx-/, keys: 'https://www.perplexity.ai/settings/api', fallback: 'sonar', prefer: [/^sonar$/] },
  together: { name: 'Together AI', style: 'openai', base: 'https://api.together.xyz/v1', detect: /^tgp_|^[a-f0-9]{64}$/, keys: 'https://api.together.ai/settings/api-keys', fallback: '', prefer: [/Llama-3\.3-70B-Instruct-Turbo/i, /instruct/i] },
  fireworks: { name: 'Fireworks', style: 'openai', base: 'https://api.fireworks.ai/inference/v1', detect: /^fw_/, keys: 'https://fireworks.ai/account/api-keys', fallback: '', prefer: [/llama.*instruct/i] },
  cerebras: { name: 'Cerebras', style: 'openai', base: 'https://api.cerebras.ai/v1', detect: /^csk-/, keys: 'https://cloud.cerebras.ai', fallback: '', prefer: [/llama/i] },
  huggingface: { name: 'Hugging Face', style: 'openai', base: 'https://router.huggingface.co/v1', detect: /^hf_/, keys: 'https://huggingface.co/settings/tokens', fallback: '', prefer: [/instruct/i] },
  ollama: { name: 'Ollama (this computer)', style: 'openai', base: 'http://localhost:11434/v1', local: true, fallback: '', prefer: [/llama/i] },
  lmstudio: { name: 'LM Studio (this computer)', style: 'openai', base: 'http://localhost:1234/v1', local: true, fallback: '', prefer: [] },
  custom: { name: 'Other (OpenAI-compatible)', style: 'openai', base: '', fallback: '', prefer: [] },
};
LB.PROVIDERS = PROVIDERS;
/* Returns { id, sure } or null. Specific prefixes first, shape-only guesses last. */
function detectProvider(key) {
  const k = String(key || '').trim();
  if (!k) return null;
  const order = ['openrouter', 'anthropic', 'gemini', 'groq', 'xai', 'perplexity', 'cerebras', 'huggingface', 'fireworks', 'openai', 'deepseek', 'together', 'mistral'];
  for (const id of order) if (PROVIDERS[id].detect.test(k)) return { id, sure: !PROVIDERS[id].guess && id !== 'deepseek' && !(id === 'together' && !k.startsWith('tgp_')) };
  if (/^sk-/.test(k)) return { id: 'openai', sure: false };
  return null;
}
LB.detectProvider = detectProvider;

const AIX = { models: {} }; // per-provider model lists, in memory only
const provBase = (p) => String(S.settings.ai.baseUrls[p] || PROVIDERS[p].base || '').replace(/\/+$/, '');
const provModel = (p) => S.settings.ai.models[p] || PROVIDERS[p].fallback || '';
/* Services the user has connected. Keyless ones (local, custom) count without a key. */
const connected = () => (S.settings.ai.linked || []).filter((p) => PROVIDERS[p] && (S.aiKeys[p] || PROVIDERS[p].local || p === 'custom'));
AI.connected = connected;
AI.provider = () => {
  const a = S.settings.ai.active;
  if (PROVIDERS[a] && connected().includes(a)) return a;
  return connected()[0] || 'none';
};
AI.providerName = (p = AI.provider()) => (PROVIDERS[p] ? `${PROVIDERS[p].name} · ${provModel(p) || 'no model'}` : 'No provider');
const hostOf = (u) => { try { return new URL(u).host; } catch (_) { return 'invalid URL'; } };
const aiErr = (code, message) => Object.assign(new Error(message), { code });
const checkUrl = (u) => {
  let url;
  try { url = new URL(u); } catch (_) { throw aiErr('bad_url', 'The service address is not a valid URL. Fix it in Settings → AI.'); }
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1'].includes(url.hostname)) throw aiErr('bad_url', 'The service address must start with https:// so your key is never sent in the clear.');
  return url;
};

/* One fetch path for every provider: timeout, stop, and readable errors. */
async function aiFetch(href, init, { signal, secs } = {}) {
  const url = checkUrl(href);
  secs = clamp(Number(secs || S.settings.ai.timeoutSec) || 60, 5, 300);
  const ctl = new AbortController();
  let reason = null;
  const timer = setTimeout(() => { reason = 'timeout'; ctl.abort(); }, secs * 1000);
  const onStop = () => { reason = reason || 'cancelled'; ctl.abort(); };
  signal && signal.addEventListener('abort', onStop);
  try {
    let res;
    try { res = await fetch(url.href, { ...init, signal: ctl.signal, referrerPolicy: 'no-referrer', credentials: 'omit' }); }
    catch (e) {
      if (reason === 'timeout') throw aiErr('timeout', `No answer after ${secs} seconds. Try again, or raise the timeout in Settings → AI.`);
      if (reason === 'cancelled') throw aiErr('cancelled', 'Stopped.');
      throw aiErr('network', `Could not reach ${url.host}. Check your internet. Some services refuse requests sent straight from a browser; if this keeps happening, that service needs a proxy (Settings → AI → Advanced).`);
    }
    let body = null;
    try { body = await res.json(); } catch (_) { if (reason === 'timeout') throw aiErr('timeout', `No answer after ${secs} seconds.`); }
    if (!res.ok) {
      const m = body && (body.error && (body.error.message || (typeof body.error === 'string' && body.error)) || body.message);
      const detail = m ? ` (${trunc(String(m), 160)})` : '';
      if (res.status === 401 || res.status === 403) throw aiErr('auth', 'The service rejected the API key' + detail + '.');
      if (res.status === 402) throw aiErr('credits', 'The account has no credit left' + detail + '.');
      if (res.status === 404) throw aiErr('not_found', 'The service could not find that model or address' + detail + '.');
      if (res.status === 429) throw aiErr('rate_limited', 'The service is rate-limiting requests or your quota is used up' + detail + '. Try again later.');
      if (res.status >= 500) throw aiErr('upstream', `The service had an error (${res.status})${detail}. Try again later.`);
      throw aiErr('http', `The service returned an error (${res.status})${detail}.`);
    }
    return body;
  } finally {
    clearTimeout(timer);
    signal && signal.removeEventListener('abort', onStop);
  }
}
const authHeaders = (p, key) => {
  const st = PROVIDERS[p].style;
  if (st === 'anthropic') return { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' };
  if (st === 'gemini') return { 'x-goog-api-key': key };
  return key ? { Authorization: 'Bearer ' + key } : {};
};
/* List models. Free for every provider: no tokens are used. */
async function listModels(p, key = S.aiKeys[p], base = provBase(p)) {
  if (!base) throw aiErr('bad_url', 'Add the service address first.');
  const st = PROVIDERS[p].style;
  const body = await aiFetch(base + '/models', { headers: authHeaders(p, key) }, { secs: 20 });
  let list;
  if (st === 'gemini') list = (body.models || []).filter((m) => (m.supportedGenerationMethods || []).includes('generateContent')).map((m) => ({ id: String(m.name || '').replace(/^models\//, ''), label: m.displayName || '' }));
  else list = (body.data || body.models || []).map((m) => ({ id: String(m.id || m.name || ''), label: m.display_name || m.name || '', free: !!(m.pricing && Number(m.pricing.prompt) === 0 && Number(m.pricing.completion) === 0) }));
  list = list.filter((m) => m.id && !/embed|whisper|tts|dall-e|moderation|transcribe|image-gen|rerank/i.test(m.id));
  if (!list.length) throw aiErr('empty', 'The key works, but the service listed no chat models.');
  AIX.models[p] = list;
  return list;
}
function pickModel(p, list) {
  for (const re of PROVIDERS[p].prefer) { const m = list.find((x) => re.test(x.id)); if (m) return m.id; }
  return (list.find((m) => m.id === PROVIDERS[p].fallback) || list[0]).id;
}
/* Check a key without spending tokens. OpenRouter also reports remaining credit. */
async function checkKey(p) {
  if (p === 'openrouter') {
    const b = await aiFetch(provBase(p) + '/key', { headers: authHeaders(p, S.aiKeys[p]) }, { secs: 20 });
    const d = (b && b.data) || {};
    const left = d.limit_remaining != null ? `$${Number(d.limit_remaining).toFixed(2)} of $${Number(d.limit).toFixed(2)} left` : d.limit == null ? 'no credit limit on this key' : '';
    return `Key works${d.is_free_tier ? ' · free tier' : ''}${left ? ' · ' + left : ''}${d.usage != null ? ` · $${Number(d.usage).toFixed(2)} used` : ''}`;
  }
  const list = await listModels(p);
  return `Key works · ${plural(list.length, 'model')} available`;
}

async function callProvider(p, user, signal) {
  const key = S.aiKeys[p] || '';
  if (!key && !PROVIDERS[p].local && p !== 'custom') throw aiErr('missing_key', `No API key is saved for ${PROVIDERS[p].name}. Add one in Settings → AI.`);
  const model = provModel(p);
  if (!model) throw aiErr('bad_model', `Choose a model for ${PROVIDERS[p].name} in Settings → AI.`);
  const base = provBase(p), st = PROVIDERS[p].style;
  const json = { 'Content-Type': 'application/json' };
  let body, text;
  if (st === 'anthropic') {
    body = await aiFetch(base + '/messages', { method: 'POST', headers: { ...json, ...authHeaders(p, key) }, body: JSON.stringify({ model, max_tokens: 1200, temperature: 0.4, system: SYSTEM_PROMPT, messages: [{ role: 'user', content: user }] }) }, { signal });
    text = (body.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('');
  } else if (st === 'gemini') {
    body = await aiFetch(`${base}/models/${encodeURIComponent(model)}:generateContent`, { method: 'POST', headers: { ...json, ...authHeaders(p, key) }, body: JSON.stringify({ systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] }, contents: [{ role: 'user', parts: [{ text: user }] }], generationConfig: { temperature: 0.4 } }) }, { signal });
    const c = body.candidates && body.candidates[0];
    text = c && c.content && (c.content.parts || []).map((x) => x.text || '').join('');
    if (!text && c && c.finishReason && c.finishReason !== 'STOP') throw aiErr('refused', `Gemini stopped without an answer (${c.finishReason}).`);
  } else {
    body = await aiFetch(base + '/chat/completions', { method: 'POST', headers: { ...json, ...authHeaders(p, key) }, body: JSON.stringify({ model, temperature: 0.4, messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: user }] }) }, { signal });
    text = body && body.choices && body.choices[0] && body.choices[0].message && body.choices[0].message.content;
  }
  if (!text || !String(text).trim()) throw aiErr('empty', 'The service answered with no text.');
  return String(text);
}
AI.call = (user, { signal } = {}) => {
  const p = AI.provider();
  if (PROVIDERS[p]) return callProvider(p, user, signal);
  return Promise.reject(aiErr('none', 'No AI is set up yet. Paste an API key in Settings → AI.'));
};

/* What can be shared, one switch each. Notes are off by default: they're the most private. */
const SCOPES = {
  tasks: { label: 'Tasks (last 30 days and open)', on: true, build: (D, t) => {
    const from = addDays(t, -30), L = [];
    D.tasks.filter((x) => x.done && isYmd(x.doneDate) && x.doneDate >= from).sort((a, b) => a.doneDate.localeCompare(b.doneDate)).forEach((x) => L.push(`Done ${x.doneDate}: ${x.title}${x.date && x.date !== x.doneDate ? ` (was due ${x.date})` : ''}`));
    D.tasks.filter((x) => !x.done).forEach((x) => L.push(`Open: ${x.title}${x.date ? ` | due ${x.date}${x.date < t ? ' (overdue)' : ''}` : ' | no date'}${x.moved ? ` | moved ${x.moved}×` : ''}`));
    return L.join('\n');
  } },
  calendar: { label: 'Calendar (last 30 and next 14 days)', on: true, build: (D, t) => D.events.filter((e) => e.date >= addDays(t, -30) && e.date <= addDays(t, 14)).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).map((e) => `${e.date}${e.time ? ' ' + e.time : ''}: ${e.title}`).join('\n') },
  journal: { label: 'Journal and mood (last 30 days)', on: true, build: (D, t) => D.journals.filter((j) => j.date >= addDays(t, -30) && j.date <= t).sort((a, b) => a.date.localeCompare(b.date)).map((j) => `${j.date}${Number(j.mood) ? ` mood ${j.mood}/5` : ''}: ${trunc(String(j.text || '').replace(/\s+/g, ' '), 400)}`).join('\n') },
  habits: { label: 'Habits (last 30 days)', on: true, build: (D, t) => D.habits.map((h) => {
    const days = [...Array(30)].map((_, i) => (habitDone(h, addDays(t, i - 29)) ? '■' : '·')).join('');
    return `${h.title}: ${habitCount(h, addDays(t, -29), t)}/30 days, streak ${habitStreak(h, t)} | ${days} (oldest → today)`;
  }).join('\n') },
  goals: { label: 'Goals', on: true, build: (D) => D.goals.map((g) => `${g.title}: ${goalNow(g)} of ${g.target}${g.unit ? ' ' + g.unit : ''}`).join('\n') },
  patterns: { label: 'Patterns the app found', on: true, build: (D, t) => patterns(D, t).map((p) => '- ' + p.text).join('\n') },
  notes: { label: 'Notes', on: false, build: (D) => D.notes.slice().sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 15).map((n) => `${n.title || 'Untitled'}: ${trunc(String(n.body || '').replace(/\s+/g, ' '), 300)}`).join('\n') },
};
function buildContext(scopes) {
  const D = data(), t = today();
  return `Today is ${t}.\n\n` + Object.keys(SCOPES).filter((k) => scopes.includes(k)).map((k) => `## ${SCOPES[k].label}\n${SCOPES[k].build(D, t).trim() || '(nothing recorded)'}`).join('\n\n');
}
const QUESTION = 'What patterns do you see in my last month that I might be missing? What is working, what keeps slipping, and what should I try next week?';
/* Preview exactly what will leave the phone, then send. */
function askAI() {
  const prov = AI.provider();
  if (prov === 'none') { go('settings', 'ai'); toast('Add an API key first. Any service works.'); return; }
  const state = { scopes: Object.keys(SCOPES).filter((k) => SCOPES[k].on), q: QUESTION };
  const payload = () => `${buildContext(state.scopes)}\n\n## Question\n${state.q}`;
  openSheet({ title: 'Ask AI', body: `
    <label class="field"><span>Your question</span><textarea id="ai-q" rows="3" maxlength="1000">${esc(state.q)}</textarea></label>
    <div class="field"><span>Share</span><div class="checks">${Object.entries(SCOPES).map(([k, s]) => `<label class="check"><input type="checkbox" data-scope="${k}" ${state.scopes.includes(k) ? 'checked' : ''}> ${esc(s.label)}</label>`).join('')}</div></div>
    <details class="preview-box"><summary>See exactly what will be sent <span class="muted" id="ai-size"></span></summary><pre class="preview" id="ai-preview"></pre></details>
    <p class="hint">Goes only to <b>${esc(AI.providerName(prov))}</b>. Nothing leaves your phone until you press Send.</p>
    <div class="row-end"><button class="btn" data-action="sheet-close">Cancel</button><button class="btn primary" id="ai-send">Send</button></div>
    <div id="ai-result"></div>`,
  onMount(root) {
    const refresh = () => { const p = payload(); $('#ai-preview', root).textContent = SYSTEM_PROMPT + '\n\n' + p; $('#ai-size', root).textContent = `· ${(SYSTEM_PROMPT.length + p.length).toLocaleString()} characters`; };
    refresh();
    root.addEventListener('change', (ev) => { const k = ev.target.dataset.scope; if (k) { state.scopes = ev.target.checked ? [...state.scopes, k] : state.scopes.filter((s) => s !== k); refresh(); } });
    $('#ai-q', root).addEventListener('input', (ev) => { state.q = ev.target.value.trim() || QUESTION; refresh(); });
    $('#ai-send', root).addEventListener('click', () => runAI(root, payload()));
  } });
}
LB.askAI = askAI;
async function runAI(root, user) {
  const out = $('#ai-result', root), send = $('#ai-send', root), ctl = new AbortController();
  send.disabled = true;
  out.innerHTML = `<div class="ai-out"><p class="muted">Thinking…</p><button class="btn sm" id="ai-stop">Stop</button></div>`;
  $('#ai-stop', root).addEventListener('click', () => ctl.abort());
  out.scrollIntoView({ block: 'nearest' });
  try {
    const text = await AI.call(user, { signal: ctl.signal });
    out.innerHTML = `<div class="ai-out"><div class="prose" id="ai-answer">${mdLite(text)}</div>
      <div class="row-end"><button class="btn sm" id="ai-copy">Copy</button><button class="btn sm primary" id="ai-save">Save as note</button></div></div>`;
    $('#ai-copy', root).addEventListener('click', () => copyText(text));
    $('#ai-save', root).addEventListener('click', async (ev) => {
      const b = ev.currentTarget; b.disabled = true;
      try { await put({ type: 'note', title: 'AI: ' + fmtDate(today(), { month: 'short', day: 'numeric' }), body: text, pinned: false }); b.textContent = 'Saved'; toast('Saved to Notes'); }
      catch (e) { b.disabled = false; toast(e.message, 'bad'); }
    });
  } catch (e) {
    out.innerHTML = `<div class="ai-out"><p class="err" id="ai-error" data-code="${esc(e.code || 'error')}">${esc(e.message || 'Something went wrong.')}</p></div>`;
  } finally { send.disabled = false; send.textContent = 'Send again'; }
}
