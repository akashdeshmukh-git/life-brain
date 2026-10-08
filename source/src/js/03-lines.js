/* ===== Lines: every life area is a subway line with a letter and a colour. Tasks ride their area's line,
   found through project → goal → area. Colours are the New York subway palette. ===== */
const LINE_COLORS = {
  blue: { name: 'Blue', hex: '#2850ad', ink: '#ffffff' },
  orange: { name: 'Orange', hex: '#ff6319', ink: '#ffffff' },
  red: { name: 'Red', hex: '#ee352e', ink: '#ffffff' },
  yellow: { name: 'Yellow', hex: '#fccc0a', ink: '#111111' },
  green: { name: 'Green', hex: '#00933c', ink: '#ffffff' },
  lime: { name: 'Lime', hex: '#6cbe45', ink: '#111111' },
  purple: { name: 'Purple', hex: '#b933ad', ink: '#ffffff' },
  brown: { name: 'Brown', hex: '#996633', ink: '#ffffff' },
  gray: { name: 'Grey', hex: '#a7a9ac', ink: '#111111' },
};
const LINE_ORDER = ['blue', 'orange', 'green', 'purple', 'red', 'yellow', 'lime', 'brown', 'gray'];
const Lines = (LB.Lines = {});
Lines.COLORS = LINE_COLORS;
Lines.all = (D) => D.areas.slice().sort((a, b) => (a.createdAt || '').localeCompare(b.createdAt || '') || String(a.name).localeCompare(String(b.name)));
Lines.code = (a) => (String(a.code || '').trim() || String(a.name || '?').trim()[0] || '?').slice(0, 2).toUpperCase();
/* A line's look: its own colour if set, otherwise the next colour in order, so a new area always gets one. */
Lines.of = (D, area) => {
  if (!area) return null;
  const i = Math.max(0, Lines.all(D).findIndex((a) => a.id === area.id));
  const color = LINE_COLORS[area.color] ? area.color : LINE_ORDER[i % LINE_ORDER.length];
  const c = LINE_COLORS[color];
  return { id: area.id, name: area.name, code: Lines.code(area), color, hex: c.hex, ink: c.ink, colorName: c.name };
};
Lines.forTask = (D, x) => Lines.of(D, Brain.chain(D, x).area);
Lines.forGoal = (D, g) => Lines.of(D, D.areas.find((a) => a.id === (g.areaId || (D.aims.find((m) => m.id === g.aimId) || {}).areaId)));
/* The bullet: a coloured disc with the line's letter. No line = an empty grey ring. */
const lineBullet = (L, cls = '') => (L
  ? `<span class="bullet ${cls}" style="--l:${L.hex};--li:${L.ink}" aria-hidden="true">${esc(L.code)}</span>`
  : `<span class="bullet none ${cls}" aria-hidden="true"></span>`);
/* How a line is doing: tasks on it planned and kept over the last two weeks of closed days. */
Lines.kept = (D, lineId, t = today()) => {
  let planned = 0, kept = 0;
  for (const d of Loop.reviewed(D, addDays(t, -14), t)) for (const id of d.plannedIds) {
    const x = D.tasks.find((y) => y.id === id);
    if (!x || (Lines.forTask(D, x) || {}).id !== lineId) continue;
    planned++;
    if ((d.kept || []).includes(id)) kept++;
  }
  return { planned, kept };
};
