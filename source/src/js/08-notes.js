/* ===== Notes: the why behind things. Each note belongs to a day: today unless you pick another. ===== */
const notesUI = { q: '' };
VIEWS.notes = () => {
  const D = data();
  const q = notesUI.q.trim().toLowerCase();
  const match = (n) => !q || `${n.title} ${n.body}`.toLowerCase().includes(q);
  const notes = D.notes.filter(match).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const pinned = notes.filter((n) => n.pinned), rest = notes.filter((n) => !n.pinned);
  const card = (n) => `<button class="note" data-action="note-open" data-id="${n.id}">${n.title ? `<b>${esc(n.title)}</b>` : ''}<span>${esc(trunc(String(n.body || ''), 260))}</span><small class="note-date">${esc(relDate(noteDay(n)))}</small></button>`;
  return header('Notes', '', '')
    + `<div class="search-row"><label class="search">${icon('search')}<input id="notes-q" type="search" placeholder="Search notes" value="${esc(notesUI.q)}" data-live="notes-q" autocomplete="off" aria-label="Search notes"></label><button class="btn ai-ask" data-action="notes-ask">${icon('spark')}Ask</button></div>`
    + (pinned.length ? `<p class="mini-label">Pinned</p><div class="notes">${pinned.map(card).join('')}</div>${rest.length ? '<p class="mini-label">Others</p>' : ''}` : '')
    + (rest.length ? `<div class="notes">${rest.map(card).join('')}</div>` : '')
    + (!notes.length ? `<p class="empty">${q ? 'No notes match.' : 'No notes yet. Tap + to write one.'}</p>` : '')
    + `<button class="fab" data-action="note-new" aria-label="New note">${icon('plus')}</button>`;
};
document.addEventListener('input', (ev) => { if (ev.target.dataset && ev.target.dataset.live === 'notes-q') { notesUI.q = ev.target.value; render(); } });

/* The note editor saves as you type. A new note is only created once something is written. */
let noteId = null, newNoteDay = '';
A['note-new'] = (el) => { newNoteDay = (el && el.dataset && isYmd(el.dataset.date) && el.dataset.date) || today(); noteSheet(null); };
A['note-open'] = (el) => noteSheet(get(el.dataset.id));
function noteSheet(n) {
  noteId = n ? n.id : null;
  const t = today(), d = n ? noteDay(n) : newNoteDay || t;
  const written = n && n.createdAt && !Number.isNaN(Date.parse(n.createdAt)) ? ymd(new Date(n.createdAt)) : '';
  openSheet({ title: n ? 'Note' : 'New note', body: `<div class="note-when"><label class="note-day"><input type="date" id="note-date" data-note="date" value="${esc(d)}" aria-label="Day this note is for"></label>
      <button type="button" class="chip" data-action="note-day" data-v="${t}">Today</button><button type="button" class="chip" data-action="note-day" data-v="${addDays(t, 1)}">Tomorrow</button></div>
    ${written && written !== d ? `<p class="small">Written ${esc(fmtDate(written, { weekday: 'long', month: 'long', day: 'numeric' }))}</p>` : ''}<input class="note-title" id="note-title" data-note="title" value="${esc(n ? n.title : '')}" placeholder="Title" maxlength="200" aria-label="Title">
    <textarea class="note-body" id="note-body" data-note="body" rows="12" placeholder="Note" aria-label="Note">${esc(n ? n.body : '')}</textarea>
    <div class="row-end"><button type="button" class="btn" data-action="note-organise" id="note-organise">${icon('spark')}Organise</button>
      <button type="button" class="btn icon-only" data-action="note-pin" id="note-pin" aria-pressed="${!!(n && n.pinned)}" aria-label="${n && n.pinned ? 'Unpin' : 'Pin'}">${icon('pin')}</button>
      <button type="button" class="btn icon-only danger" data-action="note-delete" ${n ? '' : 'hidden'} id="note-del" aria-label="Delete note">${icon('trash')}</button><span class="spacer"></span><button class="btn primary" data-action="sheet-close">Done</button></div>
    <p class="hint">Organise: the AI turns this note into tasks, events, habits and goals for you to check.</p>` });
}
async function saveNote(patch) {
  const old = get(noteId);
  if (!old && !String(patch.title || patch.body || '').trim()) return;
  noteId = noteId || uid(); // set before saving, so quick typing can't create two notes
  const d = $('#note-del'); if (d) d.hidden = false;
  await put({ ...(old || { type: 'note', title: '', body: '', pinned: false, date: ($('#note-date') || {}).value || newNoteDay || today() }), ...patch, id: noteId }, { quiet: true });
}
document.addEventListener('input', (ev) => {
  const k = ev.target.dataset && ev.target.dataset.note;
  if (k) saveNote({ [k]: ev.target.value }).catch((e) => toast(e.message, 'bad'));
});
A['note-pin'] = async (el) => {
  const old = get(noteId), pinned = !(old && old.pinned);
  if (!old) { await saveNote({ title: $('#note-title').value || 'Untitled', body: $('#note-body').value, pinned }); }
  else await put({ ...old, pinned }, { quiet: true });
  el.setAttribute('aria-pressed', pinned);
  el.setAttribute('aria-label', pinned ? 'Unpin' : 'Pin');
  toast(pinned ? 'Pinned' : 'Unpinned');
};
A['note-day'] = async (el) => {
  const f = $('#note-date');
  if (f) f.value = el.dataset.v;
  if (get(noteId)) await saveNote({ date: el.dataset.v });
};
A['note-delete'] = async () => { if (noteId) await A.delete({ dataset: { id: noteId } }); };
