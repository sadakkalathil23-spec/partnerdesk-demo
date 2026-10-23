// Integrity checks: partners whose leads are never worked, and the same company under different spellings.
(() => {
  const W = WorkOS, esc = W.esc;
  async function allLeads() { let rows = [], page = 1, d; do { d = await api.get('/leads?pageSize=200&page=' + page); rows = rows.concat(d.rows); page++; } while (page <= (d.pageCount || 1)); return rows; }
  W.register('/integrity', { perm: ['PARTNER_VIEW'], render: async (el) => {
    el.innerHTML = '<h1>Integrity checks</h1><p class="sub">Spot partners whose leads are never worked, and the same company submitted under different spellings. A flag is a prompt to look, not proof of a problem.</p><div id="out"><div class="card">Checking...</div></div>';
    const [leads, ps] = await Promise.all([allLeads(), api.get('/partners?pageSize=100')]);
    const found = LeadIntel.integrity(leads, ps.rows), by = (id) => leads.find((l) => l.id === id);
    el.querySelector('#out').innerHTML = found.length ? found.map((f) => '<div class="card" style="margin-bottom:10px"><b>' + (f.kind === 'idle' ? 'Leads not being worked' : 'Same company, different spelling') + '</b> <span class="tag warn">' + esc(f.partner) + '</span><p style="margin:6px 0">' + esc(f.detail) + '</p><small>' + f.leads.map((id) => by(id)).filter(Boolean).map((l) => '<a href="#/lead?id=' + esc(l.id) + '">' + esc(l.number + ' ' + l.company) + '</a>').join(' &middot; ') + '</small></div>').join('') : '<div class="empty">Nothing looks unusual right now.</div>';
  } });
})();
