// Seventh batch of mock server rules (v3.4): lead statuses you can edit (name, step in the sales journey, on or off),
// and the number of leads in each status. Replace with your real backend later (see api-ext.js).
(function () {
  const prev = window.MOCK_EXT, STEPS = 6; let DEFAULTS = null;
  const has = (u, ks) => ks.some((k) => u.permissions.includes(k));
  const slug = (n) => String(n).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  // The list lives in the database so edits survive a reload. api.STATUSES is the shared list the screens read.
  function sync(db) {
    const A = window.api && window.api.STATUSES; if (!A) return;
    if (!DEFAULTS) DEFAULTS = A.map((s) => ({ key: s.key, name: s.name, step: s.step, system: !!s.system, active: s.isActive !== false }));
    if (!db.leadStatuses) db.leadStatuses = DEFAULTS.map((s) => Object.assign({}, s));
    A.splice(0, A.length, ...db.leadStatuses.map((s) => ({ id: s.key, key: s.key, name: s.name, isActive: s.active !== false, step: s.step, system: !!s.system })));
  }
  const counts = (db) => { const c = {}; db.leadStatuses.forEach((s) => { c[s.key] = 0; }); db.leads.filter((l) => !l.deleted).forEach((l) => { const s = db.leadStatuses.find((x) => x.name === l.status); if (s) c[s.key]++; }); return c; };
  const view = (db, u) => (has(u, ['LEAD_VIEW_ALL', 'LEAD_VIEW_TEAM']) ? db.leads.filter((l) => !l.deleted) : db.leads.filter((l) => !l.deleted && l.assignedTo === u.id));

  window.MOCK_EXT = async function (ctx) {
    const { method, p, body, db, u, delay, fail, save, log } = ctx; sync(db);
    if (p === '/leads/status-counts' && method === 'GET') {
      const out = {}; db.leadStatuses.forEach((s) => { out[s.key] = 0; }); let total = 0;
      view(db, u).forEach((l) => { const s = db.leadStatuses.find((x) => x.name === l.status); if (s) { out[s.key]++; total++; } }); return delay({ counts: out, total });
    }
    if (p === '/lead-statuses' && method === 'GET') {
      if (!has(u, ['SETTINGS_MANAGE'])) return fail(403, 'You cannot manage lead statuses.');
      const c = counts(db); return delay({ rows: db.leadStatuses.map((s) => Object.assign({}, s, { leads: c[s.key] })), steps: STEPS });
    }
    if (p === '/lead-statuses' && method === 'POST') {
      if (!has(u, ['SETTINGS_MANAGE'])) return fail(403, 'You cannot manage lead statuses.');
      const name = String(body.name || '').trim(), step = Number(body.step);
      if (name.length < 2 || name.length > 30) return fail(400, 'Give the status a name of 2 to 30 characters.');
      if (!Number.isInteger(step) || step < 1 || step > STEPS) return fail(400, 'Choose a step from 1 to ' + STEPS + '.');
      if (db.leadStatuses.some((s) => s.name.toLowerCase() === name.toLowerCase())) return fail(409, 'A status with this name already exists.');
      let key = slug(name) || 'status', base = key, n = 2; while (db.leadStatuses.some((s) => s.key === key)) key = base + '_' + n++;
      const at = db.leadStatuses.findIndex((s) => s.step > step); const row = { key, name, step, system: false, active: true };
      const wonAt = db.leadStatuses.findIndex((s) => s.key === 'won'); db.leadStatuses.splice(at === -1 || (wonAt !== -1 && at > wonAt) ? (wonAt === -1 ? db.leadStatuses.length : wonAt) : at, 0, row);
      sync(db); log('added lead status', 'lead_status', key); save(); return delay(row);
    }
    const m = p.match(/^\/lead-statuses\/([^/]+)$/);
    if (m && method === 'PATCH') {
      if (!has(u, ['SETTINGS_MANAGE'])) return fail(403, 'You cannot manage lead statuses.');
      const s = db.leadStatuses.find((x) => x.key === m[1]); if (!s) return fail(404, 'Status not found');
      if (body.step !== undefined) { const step = Number(body.step); if (!Number.isInteger(step) || step < 1 || step > STEPS) return fail(400, 'Choose a step from 1 to ' + STEPS + '.'); s.step = step; }
      if (body.name !== undefined && String(body.name).trim() !== s.name) {
        if (s.system) return fail(409, 'The built-in statuses cannot be renamed because the rest of the system relies on their names.');
        const name = String(body.name).trim(); if (name.length < 2 || name.length > 30) return fail(400, 'Give the status a name of 2 to 30 characters.');
        if (db.leadStatuses.some((x) => x !== s && x.name.toLowerCase() === name.toLowerCase())) return fail(409, 'A status with this name already exists.');
        db.leads.forEach((l) => { if (l.status === s.name) l.status = name; }); s.name = name;
      }
      if (body.active !== undefined) {
        if (!body.active) { if (s.system) return fail(409, 'The built-in statuses cannot be switched off.'); if (counts(db)[s.key] > 0) return fail(409, 'Move the ' + counts(db)[s.key] + ' lead(s) in this status somewhere else first.'); }
        s.active = !!body.active;
      }
      sync(db); log('edited lead status', 'lead_status', s.key); save(); return delay(s);
    }
    return prev ? prev(ctx) : undefined;
  };
})();
