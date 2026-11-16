// Runs before first paint. A previous visit is not consent to the redesigned appearance.
(() => {
  let view = 'legacy';
  try { if (JSON.parse(localStorage.getItem('m3102-classic-view-v1'))?.view === 'classic') view = 'classic'; } catch { /* Original appearance without storage. */ }
  document.documentElement.dataset.classicView = view;
  window.applyClassicView = () => {
    for (const sheet of document.querySelectorAll('[data-classic-design]')) sheet.media = view === 'classic' ? 'all' : 'not all';
    for (const label of document.querySelectorAll('[data-classic-label]')) if (view === 'classic') label.textContent = label.dataset.classicLabel;
  };
  document.addEventListener('DOMContentLoaded', window.applyClassicView);
})();
