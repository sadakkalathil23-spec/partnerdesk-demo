// Sixth batch of mock server rules (v3.4): saved views and reports that people can keep private or share
// with the team. Replace with your real backend later (see api-ext.js). Who may share, edit and delete
// must be enforced on the server.
(function () {
  const prev = window.MOCK_EXT;
  const has = (u, ks) => ks.some((k) => u.permissions.includes(k));
  const PAGES = ['leads', 'report'];
  const asView = (db, v, u) => ({ id: v.id, page: v.page, name: v.name, query: v.query, shared: !!v.shared, ownerId: v.ownerId, ownerName: v.ownerName, createdAt: v.createdAt, mine: v.ownerId === u.id, canDelete: v.ownerId === u.id || has(u, ['SETTINGS_MANAGE']) });

  function ensure(db) {
    if (db._v7) return; db._v7 = true;
    const day = 86400000, at = (d) => new Date(Date.now() - d * day).toISOString();
    db.views = [
      { id: 'v1', page: 'leads', name: 'High priority', query: 'priority=high', shared: true, ownerId: 'u1', ownerName: 'Demo Admin', createdAt: at(8) },
      { id: 'v2', page: 'report', name: 'Pipeline value by stage', query: JSON.stringify({ dataset: 'leads', groupBy: 'status', measure: 'sum', chart: 'bar', filters: [] }), shared: true, ownerId: 'u1', ownerName: 'Demo Admin', createdAt: at(6) },
      { id: 'v3', page: 'report', name: 'Leads by source', query: JSON.stringify({ dataset: 'leads', groupBy: 'source', measure: 'count', chart: 'donut', filters: [] }), shared: true, ownerId: 'u1', ownerName: 'Demo Admin', createdAt: at(5) }
    ];
  }

  window.MOCK_EXT = async function (ctx) {
    const { method, p, q, body, db, u, delay, fail, save, log, uid } = ctx; ensure(db);
    if (p === '/views' && method === 'GET') {
      if (u.partner) return fail(403, 'Not available.');
      const rows = db.views.filter((v) => (!q.page || v.page === q.page) && (v.shared || v.ownerId === u.id)).map((v) => asView(db, v, u));
      rows.sort((a, b) => (b.mine - a.mine) || a.name.localeCompare(b.name)); return delay({ rows });
    }
    if (p === '/views' && method === 'POST') {
      if (u.partner) return fail(403, 'Not available.');
      if (!PAGES.includes(body.page)) return fail(400, 'Unknown page.');
      const name = String(body.name || '').trim(); if (name.length < 2 || name.length > 40) return fail(400, 'Give the view a name of 2 to 40 characters.');
      const query = String(body.query == null ? '' : body.query); if (query.length > 2000) return fail(400, 'That view is too large to save.');
      if (body.page === 'report') { try { const o = JSON.parse(query); if (!o || typeof o !== 'object') throw new Error('x'); } catch (e) { return fail(400, 'That report could not be saved.'); } }
      const shared = body.shared === true;
      if (shared && !has(u, ['LEAD_VIEW_TEAM', 'LEAD_VIEW_ALL'])) return fail(403, 'Only a manager can share a view with the team.');
      const dup = db.views.find((v) => v.page === body.page && v.name.toLowerCase() === name.toLowerCase() && (v.ownerId === u.id || (shared && v.shared)));
      if (dup) return fail(409, dup.ownerId === u.id ? 'You already have a view with this name.' : 'The team already has a shared view with this name.');
      const v = { id: uid(), page: body.page, name, query, shared, ownerId: u.id, ownerName: u.name, createdAt: new Date().toISOString() };
      db.views.push(v); log('saved view', 'view', v.id); save(); return delay(asView(db, v, u));
    }
    const m = p.match(/^\/views\/([^/]+)$/);
    if (m && method === 'DELETE') {
      const v = db.views.find((x) => x.id === m[1]); if (!v || !(v.shared || v.ownerId === u.id)) return fail(404, 'View not found');
      if (v.ownerId !== u.id && !has(u, ['SETTINGS_MANAGE'])) return fail(403, 'Only the person who saved this view, or an administrator, can delete it.');
      db.views = db.views.filter((x) => x.id !== v.id); log('deleted view', 'view', v.id); save(); return delay({ ok: true });
    }
    return prev ? prev(ctx) : undefined;
  };
})();
