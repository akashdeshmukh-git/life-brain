/* ===== Start ===== */
function registerSW() {
  if (!window.LB_PWA || !('serviceWorker' in navigator)) return;
  LB.swState = 'pending';
  navigator.serviceWorker.register('sw.js').then(() => navigator.serviceWorker.ready).then(() => { LB.swState = 'ready'; document.documentElement.dataset.sw = 'ready'; if (route.name === 'settings') render(); })
    .catch((e) => { console.warn('Service worker failed', e); LB.swState = 'error'; });
}
async function boot() {
  await dbInit();
  applyTheme();
  let moved = 0;
  try { moved = await migrateOld(); } catch (e) { console.error('Could not bring over old data', e); }
  Object.assign(route, parseHash());
  onChange(() => render(false));
  render(false);
  if (moved) toast(`Brought over ${plural(moved, 'item')} from the old version`);
  window.addEventListener('hashchange', () => { const r = parseHash(); if (r.name !== route.name || r.sub !== route.sub) { Object.assign(route, r); render(true); } });
  /* Past midnight, "today" changes: redraw when the app comes back. */
  let day = today();
  document.addEventListener('visibilitychange', () => { if (!document.hidden && today() !== day) { day = today(); render(false); } });
  requestPersistence();
  autoSnapshot().catch(() => {});
  registerSW();
  LB.ready = true;
  document.documentElement.dataset.ready = '1';
}
boot().catch((e) => { console.error(e); $('#view').innerHTML = `<div class="empty">Life Brain couldn’t start: ${esc(e.message)}</div>`; });
