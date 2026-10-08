/* ===== External AI: provider abstraction. Nothing is sent without a preview the user confirms. ===== */
const AI = (LB.AI = { sample: null, sampleChecked: false });

const SYSTEM_PROMPT = `You are the reasoning layer inside Life Brain, a personal life operating system.
Rules:
- Work only from the evidence given. Say plainly when evidence is missing or thin.
- Never diagnose the person's psychology or character. Talk about plans, load, evidence and options.
- For a diagnosis, give 2–3 competing hypotheses (H1, H2, H3), the evidence for each, a confidence (low/medium/high), and what new information would change the conclusion.
- Suggest; never decide for the person. Never tell them to change their values or direction.
- Prefer sustainable progress over maximum output.
- Be concise: under 300 words, plain language, short lists where they help.`;

/* Context scopes the user can include or leave out. Each returns plain text. */
const SCOPES = {
  direction: { label: 'Direction, values and priorities', build: (D) => {
    const p = D.profile;
    return [p.identity && `Identity: ${p.identity}`, p.direction && `Direction: ${p.direction}`, p.values?.length && `Values (ranked): ${p.values.join(', ')}`, p.priorities && `Priorities: ${p.priorities}`, `Daily capacity: ${p.capacityHours || 6}h`].filter(Boolean).join('\n');
  } },
  model: { label: 'Areas, aims, goals and projects', build: (D) => {
    const L = [];
    D.areas.forEach((a) => L.push(`Area: ${a.name}`));
    D.aims.forEach((a) => L.push(`Aim: ${a.title}${a.areaId ? ` (area: ${get(a.areaId)?.name || '?'})` : ''}`));
    D.goals.forEach((g) => L.push(`Goal [${g.status}]: ${g.title}${g.due ? `, due ${g.due}` : ''}${g.aimId ? `, aim: ${get(g.aimId)?.title || '?'}` : ''}${!g.aimId && !g.areaId ? ', not linked' : ''}`));
    D.projects.forEach((p) => L.push(`Project [${p.status}]: ${p.title}${p.goalId ? `, goal: ${get(p.goalId)?.title || '?'}` : ', no goal'}`));
    return L.join('\n');
  } },
  plan: { label: 'Open tasks and the next 7 days', build: (D, o) => {
    const t = today(), L = [];
    D.tasks.filter((x) => x.status === 'open').sort((a, b) => Brain.score(D, b) - Brain.score(D, a)).slice(0, 25).forEach((x) =>
      L.push(`Task: ${x.title} | priority ${x.priority || 2} | est ${x.estimateMin ? fmtMin(x.estimateMin) : 'none'} | planned ${x.plannedDate || 'unplanned'} | moved ${x.deferrals || 0}× | ${Brain.chain(D, x).linked ? 'linked' : 'unlinked'}`));
    for (let i = 0; i < 7; i++) {
      const d = addDays(t, i), l = Brain.dayLoad(D, d, t);
      if (l.total) L.push(`Day ${d}: load ${fmtMin(l.total)} of ${fmtMin(l.cap)} (${pct(l.ratio)})`);
      l.events.forEach((e) => L.push(`  Event: ${e.title}${e.allDay ? ' (all day)' : ` ${e.start || ''}–${e.end || ''}`}${o.details && e.location ? ` @ ${e.location}` : ''}${o.details && e.notes ? ` | ${e.notes}` : ''}`));
    }
    return L.join('\n');
  } },
  reality: { label: 'Last 14 days: what actually happened', build: (D) => {
    const t = today(), L = [];
    D.tasks.filter((x) => ['done', 'abandoned', 'skipped'].includes(x.status) && isYmd(x.doneDate || x.statusDate) && daysBetween(x.doneDate || x.statusDate, t) <= 14).forEach((x) =>
      L.push(`${x.status}: ${x.title} | est ${x.estimateMin ? fmtMin(x.estimateMin) : '—'} | actual ${x.actualMin ? fmtMin(x.actualMin) : '—'}${x.outcome ? ` | outcome: ${x.outcome}` : ''}${x.abandonedReason ? ` | reason: ${x.abandonedReason}` : ''}`));
    Brain.weekly(D, t, 2).forEach((w) => L.push(`Week of ${w.start}: ${w.kept}/${w.planned} plans kept`));
    const c = Brain.calibration(D);
    if (c.n) L.push(`Estimate calibration: actual/estimate median ${c.median.toFixed(2)} over ${c.n} tasks`);
    return L.join('\n');
  } },
  findings: { label: 'What the local Brain detected', build: (D) => Brain.active(D).slice(0, 12).map((f) => `- [${f.severity}] ${f.title}. ${f.summary}${f.evidence.length ? ' Evidence: ' + f.evidence.slice(0, 4).join('; ') : ''}`).join('\n') },
  experiments: { label: 'Experiments', build: (D) => D.experiments.map((e) => `Experiment [${e.status}]: ${e.title} | hypothesis: ${e.hypothesis || '—'} | ${(e.observations || []).length} observations${e.outcome ? ` | outcome: ${e.outcome}` : ''}${e.learning ? ` | learned: ${e.learning}` : ''}`).join('\n') },
  memory: { label: 'Lessons and past decisions', build: (D) => D.memories.slice().sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 20).map((m) => `${MEM_KINDS[m.kind] || 'Note'}: ${m.title}${m.body ? ' — ' + trunc(m.body, 200) : ''}`).join('\n') },
};

function buildContext(scopes, o = {}) {
  const D = data();
  return Object.keys(SCOPES).filter((k) => scopes.includes(k)).map((k) => {
    const body = SCOPES[k].build(D, o).trim();
    return `## ${SCOPES[k].label}\n${body || '(nothing recorded)'}`;
  }).join('\n\n');
}

AI.detect = async () => {
  if (AI.sampleChecked) return AI.sample;
  try { AI.sample = window.claude && typeof window.claude.use === 'function' ? await window.claude.use('sample') : null; }
  catch (_) { AI.sample = null; }
  AI.sampleChecked = true;
  return AI.sample;
};
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
  if (a === 'claude') return AI.sample ? 'claude' : 'none';
  if (PROVIDERS[a] && connected().includes(a)) return a;
  if (AI.sample) return 'claude';
  return connected()[0] || 'none';
};
AI.providerName = (p = AI.provider()) => (p === 'claude' ? 'Claude (built in)' : PROVIDERS[p] ? `${PROVIDERS[p].name} · ${provModel(p) || 'no model'}` : 'No provider');
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
      throw aiErr('network', env() === 'claude'
        ? `Could not reach ${url.host}. This copy of Life Brain runs inside Claude, which blocks outside connections. Use Claude (built in) here, or open the self-hosted app to use your own key.`
        : `Could not reach ${url.host}. Check your connection. Some services refuse requests sent straight from a browser; if this keeps happening, that service needs a proxy (set its address under Advanced).`);
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
const CLAUDE_ERR = {
  not_granted: 'Claude was not allowed for this page. You can allow it from the page’s permissions menu.',
  sampling_disabled: 'Claude is not available for this account.', rate_limited: 'Too many requests, or your Claude usage limit is reached. Try again later.',
  session_expired: 'Your Claude session expired. Sign in again.', refused: 'Claude declined this request. Try rephrasing it.',
  empty_completion: 'Claude returned no text. Try asking for less at once.', prompt_too_large: 'Too much context was included. Leave out some sections and try again.',
  cancelled: 'Stopped.', upstream_error: 'Claude had a temporary problem. Try again.',
};
async function callClaude(user, signal, onText) {
  if (!AI.sample) throw aiErr('unavailable', 'Claude is not available in this copy of Life Brain.');
  try {
    const { text } = await AI.sample(SYSTEM_PROMPT + '\n\n' + user, { signal, onText: onText ? ({ text }) => onText(text) : undefined, cache: false });
    return text;
  } catch (e) {
    const code = e && e.code;
    throw Object.assign(aiErr(code || 'upstream_error', CLAUDE_ERR[code] || 'Claude had a temporary problem. Try again.'), { partial: e && e.text });
  }
}
AI.call = (user, { signal, onText } = {}) => {
  const p = AI.provider();
  if (p === 'claude') return callClaude(user, signal, onText);
  if (PROVIDERS[p]) return callProvider(p, user, signal);
  return Promise.reject(aiErr('none', 'No AI is set up yet. Paste any API key in Settings → AI.'));
};

/* The one entry point views use: preview what will be shared, then ask. */
function askAI({ title, question, scopes = [], extra = '', saveAs = 'lesson' }) {
  const state = { scopes: [...scopes], details: false };
  const payload = () => [buildContext(state.scopes, state), extra && `## Specific item\n${extra}`, `## Request\n${question}`].filter(Boolean).join('\n\n');
  const prov = AI.provider();
  const body = () => `
    <p class="small muted">Only what is shown below leaves this device, and only to <b>${esc(AI.providerName(prov))}</b>${PROVIDERS[prov] ? ` at ${esc(hostOf(provBase(prov)))}` : ''}. Nothing is sent until you press Send.</p>
    <div class="section"><div class="section-h"><h2>Include</h2></div>
      <div class="stack">${Object.entries(SCOPES).map(([k, s]) => `<label class="check"><input type="checkbox" data-scope="${k}" ${state.scopes.includes(k) ? 'checked' : ''}> ${esc(s.label)}</label>`).join('')}
        <label class="check"><input type="checkbox" data-scope-details ${state.details ? 'checked' : ''}> Event locations and notes</label>
      </div></div>
    <div class="section"><div class="section-h"><h2>Exactly what will be sent</h2><span class="xs muted num" id="ai-size"></span></div>
      <pre class="preview" id="ai-preview"></pre></div>
    ${prov === 'none' ? `<p class="err" style="margin-top:12px">No AI provider is available. Set one up in Settings → AI.</p>` : ''}
    <div class="form-actions"><button class="btn" data-action="sheet-close">Cancel</button><button class="btn primary" id="ai-send" ${prov === 'none' ? 'disabled' : ''}>Send</button></div>
    <div id="ai-result"></div>`;
  openSheet({ title: title || 'Ask the Brain', body: body(), onMount(root) {
    const refresh = () => { const p = payload(); $('#ai-preview', root).textContent = SYSTEM_PROMPT + '\n\n' + p; $('#ai-size', root).textContent = `${(SYSTEM_PROMPT.length + p.length).toLocaleString()} characters`; };
    refresh();
    root.addEventListener('change', (ev) => {
      const k = ev.target.dataset.scope;
      if (k) { state.scopes = ev.target.checked ? [...state.scopes, k] : state.scopes.filter((s) => s !== k); refresh(); }
      if ('scopeDetails' in ev.target.dataset) { state.details = ev.target.checked; refresh(); }
    });
    $('#ai-send', root).addEventListener('click', () => runAI(root, payload(), title, saveAs));
  } });
}
async function runAI(root, user, title, saveAs) {
  const out = $('#ai-result', root), send = $('#ai-send', root);
  const ctl = new AbortController();
  send.disabled = true;
  out.innerHTML = `<div class="section"><div class="ai-out"><p class="muted" id="ai-text">Thinking…</p><div class="form-actions"><button class="btn sm" id="ai-stop">Stop</button></div></div></div>`;
  $('#ai-stop', root).addEventListener('click', () => ctl.abort());
  out.scrollIntoView({ block: 'nearest' });
  try {
    const text = await AI.call(user, { signal: ctl.signal, onText: (t) => { const el = $('#ai-text', root); if (el) { el.className = 'prose'; el.innerHTML = mdLite(t); } } });
    out.innerHTML = `<div class="section"><div class="section-h"><h2>Answer · ${esc(AI.providerName())}</h2></div><div class="ai-out prose" id="ai-answer">${mdLite(text)}</div>
      <p class="xs muted" style="margin-top:8px">This is a suggestion. Nothing in your Life Brain was changed.</p>
      <div class="form-actions"><button class="btn sm" id="ai-copy">Copy</button><button class="btn sm primary" id="ai-save">Save to memory</button></div></div>`;
    $('#ai-copy', root).addEventListener('click', () => copyText(text));
    $('#ai-save', root).addEventListener('click', async (ev) => {
      const b = ev.currentTarget;
      b.disabled = true;
      try {
        await put({ type: 'memory', kind: saveAs, title: title || 'Brain answer', body: text, date: today(), source: 'ai' });
        b.textContent = 'Saved';
        toast('Saved to Learning & Memory');
      } catch (e) { b.disabled = false; toast(e.message, 'bad'); }
    });
  } catch (e) {
    out.innerHTML = `<div class="section"><div class="ai-out">${e.partial ? `<div class="prose">${mdLite(e.partial)}</div><p class="xs muted">The answer was interrupted.</p>` : ''}<p class="err" id="ai-error" data-code="${esc(e.code || 'error')}">${esc(e.message || 'Something went wrong.')}</p></div></div>`;
  } finally {
    send.disabled = false;
    send.textContent = 'Send again';
  }
}
