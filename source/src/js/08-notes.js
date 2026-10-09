/* ===== Notes and Journal ===== */
const notesUI = { q: '' };
VIEWS.notes = (sub) => {
  const D = data(), journal = sub === 'journal';
  const seg = `<div class="seg" role="tablist"><button role="tab" data-action="nav" data-to="notes" aria-selected="${!journal}">Notes</button><button role="tab" data-action="nav" data-to="notes" data-sub="journal" aria-selected="${journal}">Journal</button></div>`;
  if (journal) {
    const t = today(), list = D.journals.filter((j) => String(j.text || '').trim() || Number(j.mood)).sort((a, b) => b.date.localeCompare(a.date));
    return header('Journal', '', '') + seg
      + `<button class="btn primary block" data-action="journal-open" data-date="${t}">${journalOn(t) && String(journalOn(t).text || '').trim() ? 'Today’s entry' : 'Write today'}</button>`
      + (list.length ? `<div class="jlist">${list.map((j) => `<button class="jentry" data-action="journal-open" data-date="${j.date}"><span class="jdate"><b>${parseYmd(j.date).getDate()}</b><small>${esc(fmtDate(j.date, { month: 'short' }))}</small></span>
          <span class="jbody"><span class="jtop">${esc(fmtDate(j.date, { weekday: 'long' }))}${j.date.slice(0, 4) !== t.slice(0, 4) ? ' ' + j.date.slice(0, 4) : ''} ${Number(j.mood) ? moodFace(j.mood) : ''}</span><span class="jtext">${esc(trunc(String(j.text || ''), 220)) || '<span class="muted">Mood only</span>'}</span></span></button>`).join('')}</div>`
        : '<p class="empty">Your journal is empty. Write a line or two at the end of the day.</p>');
  }
  const q = notesUI.q.trim().toLowerCase();
  const match = (n) => !q || `${n.title} ${n.body}`.toLowerCase().includes(q);
  const notes = D.notes.filter(match).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const pinned = notes.filter((n) => n.pinned), rest = notes.filter((n) => !n.pinned);
  const card = (n) => `<button class="note" data-action="note-open" data-id="${n.id}">${n.title ? `<b>${esc(n.title)}</b>` : ''}<span>${esc(trunc(String(n.body || ''), 260))}</span></button>`;
  return header('Notes', '', '') + seg
    + `<label class="search">${icon('search')}<input id="notes-q" type="search" placeholder="Search notes" value="${esc(notesUI.q)}" data-live="notes-q" autocomplete="off" aria-label="Search notes"></label>`
    + (pinned.length ? `<p class="mini-label">Pinned</p><div class="notes">${pinned.map(card).join('')}</div>${rest.length ? '<p class="mini-label">Others</p>' : ''}` : '')
    + (rest.length ? `<div class="notes">${rest.map(card).join('')}</div>` : '')
    + (!notes.length ? `<p class="empty">${q ? 'No notes match.' : 'No notes yet. Tap + to write one.'}</p>` : '')
    + `<button class="fab" data-action="note-new" aria-label="New note">${icon('plus')}</button>`;
};
document.addEventListener('input', (ev) => { if (ev.target.dataset && ev.target.dataset.live === 'notes-q') { notesUI.q = ev.target.value; render(); } });

/* The note editor saves as you type. A new note is only created once something is written. */
let noteId = null;
A['note-new'] = () => noteSheet(null);
A['note-open'] = (el) => noteSheet(get(el.dataset.id));
function noteSheet(n) {
  noteId = n ? n.id : null;
  openSheet({ title: n ? 'Note' : 'New note', body: `<input class="note-title" id="note-title" data-note="title" value="${esc(n ? n.title : '')}" placeholder="Title" maxlength="200" aria-label="Title">
    <textarea class="note-body" id="note-body" data-note="body" rows="12" placeholder="Note" aria-label="Note">${esc(n ? n.body : '')}</textarea>
    <div class="row-end"><button type="button" class="btn" data-action="note-pin" id="note-pin" aria-pressed="${!!(n && n.pinned)}">${icon('pin')}${n && n.pinned ? 'Pinned' : 'Pin'}</button>
      <button type="button" class="btn danger" data-action="note-delete" ${n ? '' : 'hidden'} id="note-del">Delete</button><span class="spacer"></span><button class="btn primary" data-action="sheet-close">Done</button></div>` });
}
async function saveNote(patch) {
  const old = get(noteId);
  if (!old && !String(patch.title || patch.body || '').trim()) return;
  noteId = noteId || uid(); // set before saving, so quick typing can't create two notes
  const d = $('#note-del'); if (d) d.hidden = false;
  await put({ ...(old || { type: 'note', title: '', body: '', pinned: false }), ...patch, id: noteId }, { quiet: true });
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
  el.innerHTML = icon('pin') + (pinned ? 'Pinned' : 'Pin');
};
A['note-delete'] = async () => { if (noteId) await A.delete({ dataset: { id: noteId } }); };
