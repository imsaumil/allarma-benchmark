// nav.js — Top nav: anchor scrolling (browser-native) + the table-search box.
// The search box is a client-side filter that highlights/scrolls to matching rows
// in the active section's currently-rendered table; it is NOT a global command palette.

document.addEventListener('DOMContentLoaded', () => {
  const search = document.getElementById('nav-search');
  if (!search) return;

  search.addEventListener('input', e => {
    const q = e.target.value.trim().toLowerCase();
    if (!q) {
      // Clear all highlights
      document.querySelectorAll('table tr.search-highlight').forEach(tr => tr.classList.remove('search-highlight'));
      return;
    }
    const tables = document.querySelectorAll('section table tbody');
    let firstMatch = null;
    tables.forEach(tbody => {
      tbody.querySelectorAll('tr').forEach(tr => {
        const text = tr.textContent.toLowerCase();
        const match = text.includes(q);
        tr.classList.toggle('search-highlight', match);
        if (match && !firstMatch) firstMatch = tr;
      });
    });
    if (firstMatch) firstMatch.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
});
