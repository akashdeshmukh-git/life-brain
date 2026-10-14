/* ===== Notes: the why behind things. Each note belongs to a day: today unless you pick another. ===== */
const notesUI = { q: '' };
VIEWS.notes = () => {
  const D = data();
  const q = notesUI.q.trim().toLowerCase();
  const match = (n) => !q || `${n.title} ${n.body}`.toLowerCase().includes(q);
  const notes = D.notes.filter(match).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  const pinned = notes.filter((n) => n.pinned), rest = notes.filter((n) => !n.pinned);
  const card = (n) => `<button class="note" data-action="note-open" data-id="${n.id}">${n.title ? `<b>${esc(n.title)}</b>` : ''}<span>${esc(trunc(String(n.body || ''), 260))}</span><small class="note-date">${esc(relDate(noteDay(n)))}</small></button>`;
  const label = (l) => `<p class="mb-2 mt-5 text-sm font-semibold text-muted">${l}</p>`;
  return header('Notes', D.notes.length ? plural(D.notes.length, 'note') : 'The why behind things, and brain dumps')
    + `<div class="search-row flex items-center gap-2"><label class="search flex min-w-0 flex-1 items-center gap-2 rounded-full bg-sunk px-4 text-muted">${icon('search')}<input id="notes-q" type="search" class="min-w-0 flex-1 bg-transparent py-3 text-[16px] text-ink outline-none" placeholder="Search notes" value="${esc(notesUI.q)}" data-live="notes-q" autocomplete="off" aria-label="Search notes"></label><button class="btn ai-ask" data-action="notes-ask"><span class="ai-mark !h-5 !w-5">${icon('spark')}</span>Ask</button></div>`
    + (pinned.length ? `${label('Pinned')}<div class="notes">${pinned.map(card).join('')}</div>${rest.length ? label('Others') : ''}` : '')
    + (rest.length ? `<div class="notes${pinned.length ? '' : ' mt-4'}">${rest.map(card).join('')}</div>` : '')
    + (!notes.length ? `<p class="empty py-16 text-center text-muted">${q ? 'No notes match.' : 'No notes yet. Tap + to write one.'}</p>` : '')
    + `<button class="fab" data-action="note-new" aria-label="New note">${icon('plus')}</button>`;
};
document.addEventListener('input', (ev) => { if (ev.target.dataset && ev.target.dataset.live === 'notes-q') { notesUI.q = ev.target.value; render(); } });

/* The note editor saves as you type. A new note is only created once something is written. */
let noteId = null, newNoteDay = '';
A['note-new'] = (el) => { newNoteDay = (el && el.dataset && isYmd(el.dataset.date) && el.dataset.date) || today(); noteSheet(null); };
A['note-open'] = (el) => noteSheet(get(el.dataset.id));
function noteSheet(n) {
  noteId = n ? n.id : null;
  if (LB.sheetClosed) { LB.sheetClosed.length = 0; LB.sheetClosed.push(() => { if (noteId) return autoNote(noteId); }); }
  const t = today(), d = n ? noteDay(n) : newNoteDay || t;
  const written = n && n.createdAt && !Number.isNaN(Date.parse(n.createdAt)) ? ymd(new Date(n.createdAt)) : '';
  const dayBtn = (v, l) => `<button type="button" class="chip" data-action="note-day" data-v="${v}" aria-pressed="${d === v}">${l}</button>`;
  openSheet({ title: n ? 'Note' : 'New note', body: `<div class="note-when chips items-center">${dayBtn(t, 'Today')}${dayBtn(addDays(t, 1), 'Tomorrow')}<input type="date" id="note-date" data-note="date" class="h-9 rounded-full bg-sunk px-3 text-sm" value="${esc(d)}" aria-label="Day this note is for"></div>
    ${written && written !== d ? `<p class="small mt-2">Written ${esc(fmtDate(written, { weekday: 'long', month: 'long', day: 'numeric' }))}</p>` : ''}
    <input class="note-title mt-4" id="note-title" data-note="title" value="${esc(n ? n.title : '')}" placeholder="Title" maxlength="200" aria-label="Title">
    <textarea class="note-body" id="note-body" data-note="body" rows="12" placeholder="Write it down. Tap Organise to turn it into tasks." aria-label="Note">${esc(n ? n.body : '')}</textarea>
    <div class="sheet-foot"><button type="button" class="btn" data-action="note-organise" id="note-organise"><span class="ai-mark !h-5 !w-5">${icon('spark')}</span>Organise</button>
      <button type="button" class="btn icon-only" data-action="note-pin" id="note-pin" aria-pressed="${!!(n && n.pinned)}" aria-label="${n && n.pinned ? 'Unpin' : 'Pin'}">${icon('pin')}</button>
      <button type="button" class="btn icon-only danger" data-action="note-delete" ${n ? '' : 'hidden'} id="note-del" aria-label="Delete note">${icon('trash')}</button><span class="spacer"></span><button class="btn primary" data-action="sheet-close">Done</button></div>` });
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
  if (k === 'date') $$('[data-action="note-day"]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === ev.target.value)));
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
  $$('[data-action="note-day"]').forEach((b) => b.setAttribute('aria-pressed', String(b === el)));
  if (get(noteId)) await saveNote({ date: el.dataset.v });
};
A['note-delete'] = async () => { if (noteId) await A.delete({ dataset: { id: noteId } }); };
