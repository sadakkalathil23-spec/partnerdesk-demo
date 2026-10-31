// CSV export for every list. Any table shown on a page gets an "Export CSV" button that saves what is on screen.
// Also provides PD.downloadCsv for the report builder.
(() => {
  // A cell that starts with = + - @ would be run as a formula by a spreadsheet, so it is defused.
  const cell = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };
  const toCsv = (rows) => rows.map((r) => r.map(cell).join(',')).join('\r\n');
  function downloadCsv(name, rows) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + toCsv(rows)], { type: 'text/csv;charset=utf-8' })); a.download = name.replace(/[^\w.-]+/g, '-'); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const text = (n) => (n.innerText || n.textContent || '').replace(/\s+/g, ' ').trim();
  // Header + rows of a table, leaving out the checkbox and button-only columns.
  function tableRows(table) {
    const heads = [...table.querySelectorAll('thead th')], body = [...table.querySelectorAll('tbody tr')].map((tr) => [...tr.children]);
    const width = heads.length, rows = body.filter((r) => r.length === width);
    const keep = heads.map((h, i) => text(h) !== '' && !h.hasAttribute('data-noexport') && rows.some((r) => text(r[i]) !== ''));
    return [heads.filter((h, i) => keep[i]).map(text)].concat(rows.map((r) => r.filter((c, i) => keep[i]).map(text)));
  }
  const today = () => new Date().toISOString().slice(0, 10);
  const nameOf = () => { const c = document.getElementById('crumb'); return (c ? text(c) : 'list').replace(/\s*\/\s*/g, '-'); };
  let queued = 0;
  function decorate() {
    queued = 0; const page = document.getElementById('page'); if (!page) return;
    page.querySelectorAll('table').forEach((t) => {
      if (t.closest('.modal, .sign, [data-noexport]') || t.hasAttribute('data-noexport')) return;
      const prev = t.previousElementSibling; if (prev && prev.classList.contains('tbl-tools')) return;
      if (!t.querySelector('tbody tr')) return;
      const bar = document.createElement('div'); bar.className = 'tbl-tools no-print'; bar.innerHTML = '<button type="button" class="btn sm" title="Save what is shown in this list as a spreadsheet file">Export CSV</button>';
      bar.querySelector('button').onclick = () => { const rows = tableRows(t); downloadCsv(nameOf() + '-' + today() + '.csv', rows); if (window.WorkOS) WorkOS.toast(rows.length - 1 + (rows.length === 2 ? ' row' : ' rows') + ' exported.'); };
      t.parentNode.insertBefore(bar, t);
    });
  }
  const schedule = () => { if (!queued) queued = requestAnimationFrame(decorate); };
  window.addEventListener('pd-shell', () => { const page = document.getElementById('page'); if (page && !page._pdExport) { page._pdExport = true; new MutationObserver(schedule).observe(page, { childList: true, subtree: true }); } schedule(); });
  window.PD = Object.assign(window.PD || {}, { downloadCsv, csvText: toCsv, tableRows });
})();
