/* ===== The AI box. Type anything into + with "Auto" picked, and your AI decides what it is: a task, habit,
   goal, note or calendar event. It's added straight away in the right place, the screen updates at once,
   and one Undo takes it back. Without an AI key, + works as before and you pick the kind yourself. ===== */
const OMNI_PROMPT = `
You are the AI Orchestration engine for the "Life Brain" mobile utility app.
The user is providing a chaotic raw text input, brain dump, or quick action string.
Analyze the input text and organize it into the correct app features.

You MUST return a clean, valid JSON object following this strict schema structure:
{
  "determinedType": "task" | "habit" | "goal" | "note" | "calendar",
  "title": "Clean concise title text optimized for short mobile rows",
  "extractedMeta": {
    "dueDate": "YYYY-MM-DD if mentioned, otherwise null",
    "frequency": "daily | weekly | null if it is a habit",
    "targetDeadline": "date string if goal deadline is implied, else null"
  },
  "summaryForNotes": "If the type is a note, clean up typos and structure it beautifully. Else null"
}

Do not include any conversational text or markdown formatting blockers. Return ONLY the JSON object.
`;
LB.OMNI_PROMPT = OMNI_PROMPT;
const OMNI_TYPES = { task: 'task', habit: 'habit', goal: 'goal', note: 'note', calendar: 'event' };
/* The model can't know today's date, so it travels with the text; that's how "tomorrow" becomes a date. */
const omniRequest = (raw, t = today()) => `Today is ${fmtDate(t, { weekday: 'long' })}, ${t}. Work out dates like "tomorrow" or "friday" from this.\n\nInput:\n${raw}`;
/* A date the model wrote as "2026-12-31" or "December 31, 2026" */
const anyDay = (s) => day(s) || (typeof s === 'string' && s.trim() && !Number.isNaN(Date.parse(s)) ? day(ymd(new Date(s))) : '');
/* A time anywhere in what you typed: "3pm", "9:30 am", "17:45". The schema has no time field, so it's read here. */
function timeIn(raw) {
  const m = raw.match(/\b(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i) || raw.match(/\b(\d{1,2}):(\d{2})\b/);
  if (!m) return '';
  let h = Number(m[1]); const min = Number(m[2] || 0), ap = (m[3] || '').toLowerCase();
  if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0;
  return h <= 23 && min <= 59 ? `${pad(h)}:${pad(min)}` : '';
}
/* One AI answer → one record, in the shape every screen reads. Throws when the answer can't be used. */
function omniRecord(text, raw, t = today()) {
  const j = pullJSON(text), type = OMNI_TYPES[String(j.determinedType || '').trim().toLowerCase()];
  if (!type) throw aiErr('bad_answer', 'The AI answered, but didn’t say what kind of thing this is. Pick a kind above and add it yourself.');
  const meta = j.extractedMeta && typeof j.extractedMeta === 'object' ? j.extractedMeta : {};
  const title = String(j.title || '').replace(/\s+/g, ' ').trim().slice(0, 200) || trunc(raw.replace(/\s+/g, ' '), 120);
  const due = anyDay(meta.dueDate);
  if (type === 'task') return { type, title, date: due || t, done: false, doneDate: '', note: '', moved: 0, goalId: '' };
  if (type === 'event') return { type, title, date: due || t, time: timeIn(raw), end: '', note: '' };
  if (type === 'habit') return { type, title: (String(meta.frequency).toLowerCase() === 'weekly' && !/week/i.test(title) ? `${title} (weekly)` : title).slice(0, 80), log: {}, goalId: '' };
  if (type === 'goal') return { type, title: title.slice(0, 120), why: '', by: anyDay(meta.targetDeadline), target: 0, unit: '', log: {}, done: false, doneDate: '' };
  return { type: 'note', title, body: String(j.summaryForNotes || raw).trim().slice(0, 20000), pinned: false, date: t };
}
/* The router: save the record where it belongs. Saving redraws whichever screen is open, so it shows at once. */
async function routeAIResponseToUI(text, raw) {
  const rec = await put(omniRecord(text, raw));
  const name = `“${trunc(rec.title, 40)}”`;
  const msg = rec.type === 'task' ? `Added task ${name} for ${relDate(rec.date)}`
    : rec.type === 'event' ? `Added ${name} to your calendar, ${relDate(rec.date)}${rec.time ? ' at ' + fmtTime(rec.time) : ''}`
    : rec.type === 'habit' ? `New habit ${name}, ready to tick`
    : rec.type === 'goal' ? `New goal ${name}${rec.by ? `, by ${fmtDate(rec.by, { month: 'short', day: 'numeric' })}` : ''}`
    : `Saved ${name} to Notes`;
  return { rec, msg };
}
LB.routeAIResponseToUI = routeAIResponseToUI;
/* From the + box: ask, route, close, and offer Undo. On failure the sheet stays open with your text in it. */
async function omniAdd(raw, form) {
  if (QA.busy) return null;
  QA.busy = true;
  const btn = $('#qa-add', form);
  if (btn) { btn.disabled = true; btn.innerHTML = `<span class="ai-mark animate-pulse">${icon('spark')}</span>Sorting…`; }
  try {
    const { rec, msg } = await routeAIResponseToUI(await AI.call(omniRequest(raw), { system: OMNI_PROMPT }), raw);
    if (SH.open && document.contains(form)) closeSheet();
    haptic();
    toast(msg, '', { action: 'Undo', onAction: () => del(rec.id) });
    return rec;
  } finally {
    QA.busy = false;
    if (btn && document.contains(btn)) { btn.disabled = false; btn.textContent = 'Add'; }
  }
}

/* Everything the screens show, as one object, for anyone reading the code or poking at it in the console.
   It's a live view of the app's one store (kept in this browser's IndexedDB), not a second copy. */
Object.defineProperty(window, 'lifeBrainState', {
  configurable: true,
  get() { const D = data(); return { userProfile: { name: S.settings.name || '' }, tasks: D.tasks, habits: D.habits, goals: D.goals, notes: D.notes, calendarEvents: D.events }; },
});
window.renderActiveTab = () => render(false);
