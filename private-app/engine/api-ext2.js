// Second batch of mock server rules: customers, proposals, support, My Day, Home, users, roles, org,
// settings, audit and the partner portal. Replace with your real backend later (see api-ext.js).
(function () {
  const prev = window.MOCK_EXT, DAY = 86400000, HOUR = 3600000;
  const SLA_HOURS = { CRIT: 4, HIGH: 24, MEDIUM: 72, LOW: 120 };
  const NEXT = { open: ['in_progress', 'waiting_client', 'resolved'], in_progress: ['waiting_client', 'resolved'], waiting_client: ['in_progress', 'resolved'], resolved: ['closed', 'in_progress'], closed: [] };
  const ROLE_LABELS = { super_admin: 'Super Admin', sales_manager: 'Sales Manager', sales_executive: 'Sales Executive', admin_finance: 'Admin Finance', partner_manager: 'Partner Manager' };
  const iso = (d) => new Date(Date.now() + d * DAY).toISOString();
  const plain = (r) => JSON.parse(JSON.stringify(r));

  function ensure(db) {
    if (db._v4) return; db._v4 = true;
    const byName = (n) => (db.partners.find((p) => p.name === n) || {}).id || '';
    db.customers = [
      { id: 'c1', clientCode: 'CUS-001', companyName: 'Greenfield Farms', email: 'leena@greenfield.example', phone: '+91 90000 11111', accountOwnerId: 'u2', partnerId: byName('Northwind Advisory'), createdAt: iso(-9), projectNames: ['Greenfield rollout'] },
      { id: 'c2', clientCode: 'CUS-002', companyName: 'Sunrise Dental', email: 'office@sunrise.example', phone: '', accountOwnerId: 'u3', partnerId: '', createdAt: iso(-40), projectNames: ['Sunrise CRM'] }
    ];
    db.conversions = [{ id: 'cv1', client: 'Greenfield Farms', contractValueNet: 600000, collected: 300000, currency: 'INR' }, { id: 'cv2', client: 'Sunrise Dental', contractValueNet: 400000, collected: 0, currency: 'INR' }];
    db.proposals = [
      { id: 'pr1', proposalNumber: 'PR-1001', currentVersion: 2, status: 'sent', lead: { id: 'l2', companyName: 'Zenith Foods', leadNumber: 'LD-1002' }, versions: [{ contractValueNet: 900000, currency: 'INR', validUntil: iso(14) }] },
      { id: 'pr2', proposalNumber: 'PR-1002', currentVersion: 1, status: 'draft', lead: { id: 'l5', companyName: 'Delta Logistics', leadNumber: 'LD-1005' }, versions: [{ contractValueNet: 1250000, currency: 'INR', validUntil: iso(30) }] },
      { id: 'pr3', proposalNumber: 'PR-1003', currentVersion: 1, status: 'accepted', lead: { id: 'l6', companyName: 'Greenfield Farms', leadNumber: 'LD-1006' }, versions: [{ contractValueNet: 600000, currency: 'INR', validUntil: iso(-5) }] }
    ];
    db.contracts = [
      { id: 'ct1', contractNumber: 'SC-001', clientName: 'Greenfield Farms', type: 'amc', startDate: iso(-340).slice(0, 10), endDate: iso(25).slice(0, 10), contractValue: 120000, currency: 'INR', status: 'active', projectName: 'Greenfield rollout' },
      { id: 'ct2', contractNumber: 'SC-002', clientName: 'Sunrise Dental', type: 'retainer', startDate: iso(-30).slice(0, 10), endDate: '', contractValue: 60000, currency: 'INR', status: 'active', projectName: '' }
    ];
    db.tickets = [
      { id: 'tk1', ticketNumber: 'TK-001', title: 'Report export fails', description: 'CSV export times out', clientName: 'Greenfield Farms', contractNumber: 'SC-001', severity: 'HIGH', type: 'bug', status: 'open', reportedAt: iso(-2), slaResolveBy: new Date(Date.now() - 2 * DAY + 24 * HOUR).toISOString(), assigneeId: 'u2', resolution: '' },
      { id: 'tk2', ticketNumber: 'TK-002', title: 'Add a user to the portal', description: '', clientName: 'Sunrise Dental', contractNumber: 'SC-002', severity: 'LOW', type: 'question', status: 'in_progress', reportedAt: iso(-1), slaResolveBy: new Date(Date.now() - DAY + 120 * HOUR).toISOString(), assigneeId: '', resolution: '' }
    ];
    db.followups = []; for (let w = 0; w < 8; w++) for (let i = 0; i < (w % 3) + 2; i++) db.followups.push({ id: 'f' + w + i, userId: i % 2 ? 'u3' : 'u2', leadId: 'l' + ((i % 6) + 1), at: new Date(Date.now() - w * 7 * DAY - i * DAY).toISOString(), outcome: 'Spoke to contact' });
    [['t6', 3], ['t7', 10], ['t8', 17]].forEach((x) => db.tasks.push({ id: x[0], title: 'Finished task ' + x[0], project: 'Greenfield rollout', sprint: 'Week 42', assignee: x[1] % 2 ? 'u3' : 'u2', status: 'Done', priority: 'Normal', type: 'Project', progress: 100, deadline: iso(-x[1] + 1), doneAt: iso(-x[1]), blocked: false, blockedReason: '', extended: false, carryOverCount: 0 }));
    db.departments.forEach((d) => { d.retired = false; }); db.designations.forEach((d) => { d.retired = false; d.departmentId = (db.departments.find((x) => x.name === d.department) || {}).id; });
    db.users.forEach((u) => { u.phone = u.phone || ''; u.managerId = u.managerId || (u.id === 'u2' ? 'u3' : ''); u.timezone = u.timezone || 'Asia/Kolkata'; u.deleted = false; u.lockedUntil = null; u.lastSignIn = u.lastSignIn || null; u.roleKey = u.roleKey || u.kind || ({ 'Super Admin': 'super_admin', 'Sales Manager': 'sales_manager', 'Sales Executive': 'sales_executive' }[u.profile]) || (u.partner ? 'partner' : 'sales_executive'); u.departmentId = (db.departments.find((d) => d.name === u.department) || {}).id || ''; u.designationId = (db.designations.find((d) => d.name === u.designation) || {}).id || ''; });
    const keys = window.api.ALL.slice().sort(); db.permissions = keys.map((k, i) => ({ id: 'pm' + i, key: k, module: k.split('_')[0], description: '' }));
    const idsOf = (list) => db.permissions.filter((p) => list.includes(p.key)).map((p) => p.id);
    const perm = (id) => (db.users.find((u) => u.id === id) || {}).permissions || [];
    db.roles = [{ id: 'r1', key: 'super_admin', label: 'Super Admin', isSystem: true, permissionIds: idsOf(keys) }, { id: 'r2', key: 'sales_manager', label: 'Sales Manager', isSystem: true, permissionIds: idsOf(perm('u3')) }, { id: 'r3', key: 'sales_executive', label: 'Sales Executive', isSystem: true, permissionIds: idsOf(perm('u2')) }, { id: 'r4', key: 'admin_finance', label: 'Admin Finance', isSystem: true, permissionIds: idsOf(perm('u5')) }, { id: 'r5', key: 'partner_manager', label: 'Partner Manager', isSystem: true, permissionIds: idsOf(perm('u6')) }];
    Object.assign(db.settings, { protection_resets_on_activity: true, csv_import_max_rows: 5000, lead_default_assignee_email: '', unassigned_amber_hours: 4, unassigned_red_hours: 24, followup_escalation_hours: 48 }, db.settings.lead_protection_days ? {} : { lead_protection_days: 90 });
  }

  const money = (items, cur, amt) => { const m = {}; items.forEach((i) => { const c = cur(i) || 'INR'; m[c] = (m[c] || 0) + (Number(amt(i)) || 0); }); return Object.entries(m).map(([currency, amount]) => ({ currency, amount })); };
  const clientOut = (db, c) => { const cons = db.conversions.filter((x) => x.client === c.companyName); return Object.assign({}, c, { accountOwner: (db.users.find((u) => u.id === c.accountOwnerId) || null) && { id: c.accountOwnerId, name: db.users.find((u) => u.id === c.accountOwnerId).name }, partner: c.partnerId ? { id: c.partnerId, companyName: (db.partners.find((p) => p.id === c.partnerId) || {}).name } : null, _count: { conversions: cons.length, projects: db.projects.filter((p) => c.projectNames.includes(p.name)).length }, totals: money(cons, (x) => x.currency, (x) => x.contractValueNet).map((g) => ({ currency: g.currency, contractValueNet: g.amount, collected: money(cons.filter((x) => x.currency === g.currency), (x) => x.currency, (x) => x.collected)[0].amount })) }); };
  const contractOut = (db, c) => { let status = c.status; if (status === 'active' && c.endDate && new Date(c.endDate) - Date.now() < 30 * DAY && new Date(c.endDate) >= new Date()) status = 'expiring'; if (c.endDate && new Date(c.endDate) < new Date() && c.status !== 'draft') status = 'expired'; return { id: c.id, contractNumber: c.contractNumber, client: { id: (db.customers.find((x) => x.companyName === c.clientName) || {}).id, companyName: c.clientName }, type: c.type, startDate: c.startDate, endDate: c.endDate, contractValue: c.contractValue, currency: c.currency, status, project: c.projectName ? { id: (db.projects.find((p) => p.name === c.projectName) || {}).id, name: c.projectName } : null, _count: { tickets: db.tickets.filter((t) => t.contractNumber === c.contractNumber).length } }; };
  const ticketOut = (db, t) => ({ id: t.id, ticketNumber: t.ticketNumber, title: t.title, description: t.description, client: { companyName: t.clientName }, contract: t.contractNumber ? { contractNumber: t.contractNumber } : null, severity: t.severity, type: t.type, status: t.status, reportedAt: t.reportedAt, slaResolveBy: t.slaResolveBy, breachedResolution: !['resolved', 'closed'].includes(t.status) && new Date(t.slaResolveBy) < new Date(), assignee: t.assigneeId ? { name: (db.users.find((u) => u.id === t.assigneeId) || {}).name } : null, resolution: t.resolution, allowedNext: NEXT[t.status] });
  const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const bucket = (l, now) => { const sod = startOfDay(now), d = startOfDay(l.nextAction); const diff = Math.round((d - sod) / DAY); return !l.nextAction ? 'none' : diff < 0 ? 'overdue' : diff === 0 ? 'today' : diff === 1 ? 'tomorrow' : diff <= 6 ? 'thisWeek' : 'later'; };
  const mondayOf = (d) => { const x = startOfDay(d); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };

  window.MOCK_EXT = async function (ctx) {
    const { method, p, q, body, db, u, delay, fail, save, log, uid } = ctx, now = new Date();
    ensure(db);
    // ----- customers -----
    if (p === '/clients' && method === 'GET') {
      const t = (q.q || '').toLowerCase(); let rows = db.customers.filter((c) => !t || [c.companyName, c.clientCode, c.email].some((v) => String(v || '').toLowerCase().includes(t)));
      if (q.accountOwnerId) rows = rows.filter((c) => c.accountOwnerId === q.accountOwnerId);
      const size = Number(q.pageSize) || 25, page = Math.max(1, Number(q.page) || 1);
      return delay({ rows: rows.slice((page - 1) * size, page * size).map((c) => clientOut(db, c)), total: rows.length, page, pageSize: size });
    }
    if (p === '/leads/my-day' && method === 'GET') {
      const mine = db.leads.filter((l) => !l.deleted && !['Won', 'Lost'].includes(l.status) && (l.assignedTo === u.id || (u.permissions.includes('LEAD_VIEW_ALL') && !l.assignedTo === false && false)));
      const own = u.permissions.includes('LEAD_VIEW_ALL') || u.permissions.includes('LEAD_VIEW_TEAM') ? db.leads.filter((l) => !l.deleted && !['Won', 'Lost'].includes(l.status) && l.assignedTo === u.id) : mine;
      const sec = { overdue: [], today: [], tomorrow: [], thisWeek: [] }; let none = 0;
      own.forEach((l) => { const b = bucket(l, now); if (sec[b]) sec[b].push(l); else if (b === 'none') none++; });
      const view = (l) => ({ id: l.id, companyName: l.company, contactName: l.contact, email: l.email, phone: '', priority: l.priority, dueAt: l.nextAction, owner: (db.users.find((x) => x.id === l.assignedTo) || {}).name || 'Unassigned', partner: l.source === 'Partner' });
      const out = { timeZone: db.settings.timezone, counts: { overdue: sec.overdue.length, today: sec.today.length, tomorrow: sec.tomorrow.length, thisWeek: sec.thisWeek.length, noNextAction: none }, sections: Object.fromEntries(Object.keys(sec).map((k) => [k, sec[k].map(view)])), team: null };
      if (u.permissions.includes('LEAD_VIEW_TEAM')) { const others = db.leads.filter((l) => !l.deleted && !['Won', 'Lost'].includes(l.status) && l.assignedTo && l.assignedTo !== u.id); const o = others.filter((l) => bucket(l, now) === 'overdue'), t = others.filter((l) => bucket(l, now) === 'today'); out.team = { counts: { overdue: o.length, dueToday: t.length, people: new Set(others.map((l) => l.assignedTo)).size }, sections: { overdue: o.map(view), today: t.map(view) } }; }
      return delay(out);
    }
    let m = p.match(/^\/leads\/([^/]+)\/followups$/);
    if (m && method === 'POST') { const l = db.leads.find((x) => x.id === m[1]); if (!l) return fail(404, 'Lead not found'); if (!String(body.outcome || '').trim()) return fail(400, 'Say how the follow-up went.'); if (!body.nextFollowUp) return fail(400, 'Set the next follow-up date.'); db.followups.push({ id: uid(), userId: u.id, leadId: l.id, at: now.toISOString(), outcome: body.outcome.trim() }); l.notes.push({ text: body.outcome.trim(), internal: true, at: now.toISOString(), author: u.name }); l.nextAction = new Date(body.nextFollowUp).toISOString(); l.updatedAt = now.toISOString(); l.flags = Array.from(new Set((l.flags || []).filter((f) => f !== 'untouched').concat(['updated', 'followups_done']))); log('logged follow-up', 'lead', l.id); save(); return delay({ ok: true }); }
    m = p.match(/^\/leads\/([^/]+)\/convert$/);
    if (m && method === 'POST') { const l = db.leads.find((x) => x.id === m[1]); if (!l) return fail(404, 'Lead not found'); if (l.status === 'Won') return fail(409, 'Already converted.'); if (body.amount && !(Number(body.amount) > 0)) return fail(400, 'Enter the final deal value as a positive amount.'); l.status = 'Won'; l.convertedAt = now.toISOString(); l.flags = (l.flags || []).concat('won'); if (body.amount) l.estimatedValue = Number(body.amount); l.updatedAt = l.convertedAt; db.conversions.push({ id: uid(), client: l.company, contractValueNet: l.estimatedValue, collected: 0, currency: l.currency }); if (!db.customers.some((c) => c.companyName === l.company)) db.customers.unshift({ id: uid(), clientCode: 'CUS-' + String(db.customers.length + 1).padStart(3, '0'), companyName: l.company, email: l.email, phone: '', accountOwnerId: l.assignedTo, partnerId: l.partnerId, createdAt: l.convertedAt, projectNames: [] }); log('recorded conversion', 'conversion', l.id); save(); return delay(plain(l)); }
    // ----- home -----
    if (p === '/dashboards/productivity') {
      const ws = mondayOf(now), weekStart = ws.toISOString(), within = (iso, a, b) => iso && new Date(iso) >= a && new Date(iso) < b;
      const measures = []; if (['LEAD_VIEW_OWN', 'LEAD_VIEW_TEAM', 'LEAD_VIEW_ALL'].some((k) => u.permissions.includes(k))) measures.push('followups', 'wins'); if (['OPS_VIEW_OWN', 'OPS_VIEW_ALL'].some((k) => u.permissions.includes(k))) measures.push('tasks');
      const slice = (userIds) => {
        const inUsers = (id) => !userIds || userIds.includes(id);
        const count = (kind, a, b) => kind === 'followups' ? db.followups.filter((f) => inUsers(f.userId) && within(f.at, a, b)).length : kind === 'tasks' ? db.tasks.filter((t) => t.status === 'Done' && inUsers(t.assignee) && within(t.doneAt, a, b)).length : db.leads.filter((l) => l.status === 'Won' && inUsers(l.assignedTo) && within(l.convertedAt, a, b)).length;
        const weeks = []; for (let i = 7; i >= 0; i--) { const a = new Date(+ws - i * 7 * DAY), b = new Date(+a + 7 * DAY); const w = { weekStart: a.toISOString() }; ['followups', 'tasks', 'wins'].forEach((k) => { w[k] = count(k, a, b); }); weeks.push(w); }
        const prev = new Date(+ws - 7 * DAY), prevSame = new Date(Math.min(+now - 7 * DAY, +ws)), tw = {}, lw = {}, lwt = {}; ['followups', 'tasks', 'wins'].forEach((k) => { tw[k] = count(k, ws, new Date(+now + 1)); lw[k] = count(k, prev, ws); lwt[k] = count(k, prev, new Date(+now - 7 * DAY + 1)); });
        const due = db.tasks.filter((t) => t.status === 'Done' && inUsers(t.assignee) && within(t.doneAt, ws, new Date(+now + 1)) && t.deadline); tw.onTime = due.length ? Math.round(due.filter((t) => new Date(t.doneAt) <= new Date(t.deadline)).length * 100 / due.length) : null; lwt.onTime = null; tw.hours = 0; lw.hours = 0;
        const od = db.leads.filter((l) => !l.deleted && !['Won', 'Lost'].includes(l.status) && inUsers(l.assignedTo)), tk = db.tasks.filter((t) => t.status !== 'Done' && inUsers(t.assignee));
        return { thisWeek: tw, lastWeek: lw, lastWeekToDate: lwt, weeks, now: { overdueFollowups: od.filter((l) => bucket(l, now) === 'overdue').length, dueToday: od.filter((l) => bucket(l, now) === 'today').length, overdueTasks: tk.filter((t) => new Date(t.deadline) < now).length, dueTodayTasks: tk.filter((t) => new Date(t.deadline).toDateString() === now.toDateString()).length, blockedTasks: tk.filter((t) => t.status === 'Blocked').length } };
      };
      const reports = db.users.filter((x) => x.managerId === u.id && !x.deleted), isMgr = u.permissions.includes('LEAD_VIEW_TEAM') || reports.length > 0;
      const team = isMgr ? { rows: reports.concat([u]).map((x) => ({ user: { id: x.id, name: x.name }, thisWeek: slice([x.id]).thisWeek })), totals: slice(reports.map((x) => x.id).concat(u.id)) } : null;
      const res = { timeZone: db.settings.timezone, weekStart, measures, me: slice([u.id]), team: team ? Object.assign({}, team.totals, { rows: team.rows }) : null };
      return delay(res);
    }
    // ----- proposals, support -----
    if (p === '/proposals' && method === 'GET') { const rows = db.proposals.filter((x) => !q.status || x.status === q.status); return delay({ rows, total: rows.length, page: 1 }); }
    if (p === '/support/contracts' && method === 'GET') { let rows = db.contracts.map((c) => contractOut(db, c)); if (q.status) rows = rows.filter((c) => c.status === q.status); if (q.expiringSoon === 'true') rows = rows.filter((c) => c.status === 'expiring'); if (q.clientId) { const cl = db.customers.find((c) => c.id === q.clientId); rows = rows.filter((c) => cl && c.client.companyName === cl.companyName); } return delay({ rows, total: rows.length, page: 1 }); }
    if (p === '/support/contracts' && method === 'POST') { const cl = db.customers.find((c) => c.id === body.clientId); if (!cl) return fail(400, 'Choose a client.'); if (!body.startDate) return fail(400, 'Enter the start date.'); if (body.endDate && body.endDate < body.startDate) return fail(400, 'The end date is before the start date.'); const c = { id: uid(), contractNumber: 'SC-' + String(db.contracts.length + 1).padStart(3, '0'), clientName: cl.companyName, type: body.type || 'amc', startDate: body.startDate, endDate: body.endDate || '', contractValue: Number(body.contractValue) || 0, currency: 'INR', status: 'draft', projectName: '' }; db.contracts.unshift(c); log('created contract', 'support_contract', c.id); save(); return delay(Object.assign(contractOut(db, c), { blocked: undefined })); }
    if (p === '/support/tickets' && method === 'GET') { let rows = db.tickets.map((t) => ticketOut(db, t)); if (q.status) rows = rows.filter((t) => t.status === q.status); if (q.severity) rows = rows.filter((t) => t.severity === q.severity); if (q.open === 'true') rows = rows.filter((t) => t.status !== 'closed'); if (q.breached === 'true') rows = rows.filter((t) => t.breachedResolution); return delay({ rows, total: rows.length, page: 1 }); }
    if (p === '/support/tickets' && method === 'POST') { const cl = db.customers.find((c) => c.id === body.clientId); if (!cl) return fail(400, 'Choose a client.'); if (String(body.title || '').trim().length < 3) return fail(400, 'Say what happened (at least 3 characters).'); const sev = SLA_HOURS[body.severity] ? body.severity : 'MEDIUM'; const t = { id: uid(), ticketNumber: 'TK-' + String(db.tickets.length + 1).padStart(3, '0'), title: body.title.trim(), description: body.description || '', clientName: cl.companyName, contractNumber: (db.contracts.find((c) => c.id === body.contractId) || {}).contractNumber || '', severity: sev, type: body.type || 'bug', status: 'open', reportedAt: now.toISOString(), slaResolveBy: new Date(+now + SLA_HOURS[sev] * HOUR).toISOString(), assigneeId: '', resolution: '', reportedByName: body.reportedByName || '' }; db.tickets.unshift(t); log('raised ticket', 'support_ticket', t.id); save(); return delay(ticketOut(db, t)); }
    m = p.match(/^\/support\/tickets\/([^/]+)\/(status|task)$/);
    if (m && method === 'POST') { const t = db.tickets.find((x) => x.id === m[1]); if (!t) return fail(404, 'Ticket not found');
      if (m[2] === 'status') { if (!NEXT[t.status].includes(body.status)) return fail(409, 'This ticket is ' + t.status.replace('_', ' ') + ' and cannot move to ' + String(body.status).replace('_', ' ') + '.'); if (body.status === 'resolved' && !String(body.resolution || '').trim()) return fail(400, 'Say how it was resolved.'); t.status = body.status; if (body.resolution) t.resolution = body.resolution; log('ticket ' + body.status, 'support_ticket', t.id); save(); return delay(ticketOut(db, t)); }
      const pj = db.projects.find((x) => x.id === body.projectId); if (!pj) return fail(400, 'Choose a project.'); db.tasks.unshift({ id: uid(), title: t.ticketNumber + ': ' + t.title, project: pj.name, sprint: '', assignee: '', status: 'To do', priority: t.severity === 'CRIT' || t.severity === 'HIGH' ? 'High' : 'Normal', type: 'Project', progress: 0, deadline: t.slaResolveBy, blocked: false, blockedReason: '', extended: false, carryOverCount: 0 }); log('raised task from ticket', 'support_ticket', t.id); save(); return delay({ ok: true }); }
    // ----- users, roles, org, settings, audit -----
    if (p === '/users' && method === 'GET') {
      const t = (q.q || '').toLowerCase(); let rows = db.users.filter((x) => (q.includeDeleted === 'true' || !x.deleted) && (!t || [x.name, x.email].some((v) => String(v).toLowerCase().includes(t))));
      if (q.departmentId) rows = rows.filter((x) => x.departmentId === q.departmentId); if (q.designationId) rows = rows.filter((x) => x.designationId === q.designationId); if (q.roleKey) rows = rows.filter((x) => x.roleKey === q.roleKey); if (q.status) rows = rows.filter((x) => x.status === q.status);
      const out = rows.map((x) => ({ id: x.id, name: x.name, email: x.email, phone: x.phone, status: x.status, roleKey: x.roleKey, role: { name: ROLE_LABELS[x.roleKey] || x.profile }, department: (db.departments.find((d) => d.id === x.departmentId) || {}).name || '', designation: (db.designations.find((d) => d.id === x.designationId) || {}).name || '', departmentId: x.departmentId, designationId: x.designationId, managerId: x.managerId, managerName: (db.users.find((y) => y.id === x.managerId) || {}).name || '', timezone: x.timezone, lastSignIn: x.lastSignIn, lockedUntil: x.lockedUntil, deletedAt: x.deleted ? x.deletedAt || now.toISOString() : null, partner: x.partner ? { companyName: (db.partners.find((pp) => pp.id === x.partner.id) || {}).name } : null }));
      return delay({ rows: out, total: out.length, page: 1 });
    }
    if (p === '/users' && method === 'POST') {
      const email = String(body.email || '').trim().toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(email)) return fail(400, 'Enter a valid email address.'); if (!String(body.name || '').trim()) return fail(400, 'Enter the name.'); if (!body.designationId) return fail(400, 'Choose a department and designation.');
      const same = db.users.find((x) => x.email === email);
      if (same && !same.deleted) return fail(409, 'A user with this email already exists.');
      if (same && same.deleted) return Promise.reject(Object.assign(new Error('This email belongs to a deleted account'), { status: 409, deletedAccount: { id: same.id, name: same.name, roleName: ROLE_LABELS[same.roleKey] || same.profile, deletedAt: same.deletedAt, partner: same.partner ? { companyName: (db.partners.find((pp) => pp.id === same.partner.id) || {}).name } : null } }));
      const role = db.roles.find((r) => r.key === body.roleKey) || db.roles.find((r) => r.key === 'sales_executive'); const perms = db.permissions.filter((x) => role.permissionIds.includes(x.id)).map((x) => x.key);
      const nu = { id: uid(), name: body.name.trim(), email, phone: body.phone || '', department: '', designation: '', profile: role.label, roleKey: role.key, status: 'Pending', permissions: perms, home: '/home', password: 'ChangeMe-12345', managerId: body.managerId || '', timezone: body.timezone || 'Asia/Kolkata', deleted: false, lockedUntil: null, lastSignIn: null, departmentId: body.departmentId || '', designationId: body.designationId || '' };
      db.users.push(nu); log('created user', 'user', nu.id); save(); return delay({ id: nu.id });
    }
    m = p.match(/^\/users\/([^/]+)\/(restore|unlock)$/);
    if (m && method === 'POST') { const x = db.users.find((y) => y.id === m[1]); if (!x) return fail(404, 'User not found'); if (m[2] === 'unlock') { x.lockedUntil = null; log('unlocked user', 'user', x.id); save(); return delay({ ok: true }); } x.deleted = false; x.status = 'Inactive'; if (!x.partner) { ['name', 'phone', 'departmentId', 'designationId', 'managerId', 'timezone'].forEach((k) => { if (body[k] !== undefined && body[k] !== '') x[k] = body[k]; }); if (body.roleKey) { x.roleKey = body.roleKey; x.profile = ROLE_LABELS[body.roleKey] || x.profile; } } log('restored user', 'user', x.id); save(); return delay({ ok: true }); }
    m = p.match(/^\/users\/([^/]+)$/);
    if (m && method === 'PATCH') {
      const x = db.users.find((y) => y.id === m[1]); if (!x) return fail(404, 'User not found'); const signedOut = [];
      ['name', 'phone', 'departmentId', 'designationId', 'managerId', 'timezone'].forEach((k) => { if (body[k] !== undefined) x[k] = body[k]; });
      if (body.roleKey && body.roleKey !== x.roleKey && !x.partner) { const role = db.roles.find((r) => r.key === body.roleKey); if (role) { x.roleKey = role.key; x.profile = role.label; x.permissions = db.permissions.filter((pp) => role.permissionIds.includes(pp.id)).map((pp) => pp.key); signedOut.push('access profile changed'); } }
      if (body.status && body.status !== x.status) { x.status = body.status; if (body.status !== 'Active') signedOut.push('status ' + body.status); }
      log('updated user' + (signedOut.length ? ' (signed out: ' + signedOut.join(', ') + ')' : ''), 'user', x.id); save(); return delay({ ok: true, signedOut: signedOut.length > 0 });
    }
    if (m && method === 'DELETE') { const x = db.users.find((y) => y.id === m[1]); if (!x) return fail(404, 'User not found'); if (x.id === u.id) return fail(409, 'You cannot delete your own account.'); x.deleted = true; x.deletedAt = now.toISOString(); log('deleted user', 'user', x.id); save(); return delay({ ok: true }); }
    if (p === '/users/permission-matrix') return delay({ roles: db.roles, permissions: db.permissions, modules: [...new Set(db.permissions.map((x) => x.module))] });
    m = p.match(/^\/users\/roles\/([^/]+)\/permissions$/);
    if (m && method === 'POST') { const r = db.roles.find((x) => x.id === m[1]); if (!r) return fail(404, 'Role not found'); if (r.key === 'super_admin') return fail(409, 'The Super Admin role cannot be edited.'); r.permissionIds = (body.permissionIds || []).filter((id) => db.permissions.some((x) => x.id === id)); const keys = db.permissions.filter((x) => r.permissionIds.includes(x.id)).map((x) => x.key); db.users.forEach((x) => { if (x.roleKey === r.key) x.permissions = keys; }); log('permissions changed for ' + r.label, 'role', r.id); save(); return delay(r); }
    if (p === '/org' && method === 'GET') return delay({ departments: db.departments.filter((d) => q.includeRetired === 'true' || !d.retired).map((d) => Object.assign({}, d, { designations: db.designations.filter((g) => g.departmentId === d.id && (q.includeRetired === 'true' || !g.retired)) })) });
    if (p === '/org/departments' && method === 'POST') { if (!String(body.name || '').trim()) return fail(400, 'Enter a name to save.'); const d = { id: uid(), name: body.name.trim(), retired: false }; db.departments.push(d); log('created department', 'department', d.id); save(); return delay(d); }
    if (p === '/org/designations' && method === 'POST') { if (!String(body.name || '').trim()) return fail(400, 'Enter a name to save.'); const dep = db.departments.find((d) => d.id === body.departmentId); if (!dep) return fail(400, 'Choose a department.'); const g = { id: uid(), name: body.name.trim(), department: dep.name, departmentId: dep.id, retired: false }; db.designations.push(g); log('created designation', 'designation', g.id); save(); return delay(g); }
    m = p.match(/^\/org\/(departments|designations)\/([^/]+)$/);
    if (m) { const list = m[1] === 'departments' ? db.departments : db.designations, row = list.find((x) => x.id === m[2]); if (!row) return fail(404, 'Not found');
      if (method === 'PATCH') { if (body.name !== undefined && !String(body.name).trim()) return fail(400, 'Enter a name to save.'); Object.assign(row, body); log((body.retired === true ? 'retired ' : body.retired === false ? 'restored ' : 'updated ') + m[1].slice(0, -1), 'org', row.id); save(); return delay(row); }
      if (method === 'DELETE') { const used = m[1] === 'departments' ? db.users.filter((x) => x.departmentId === row.id).length + db.designations.filter((g) => g.departmentId === row.id).length : db.users.filter((x) => x.designationId === row.id).length; if (used) return fail(409, used + (used === 1 ? ' record uses' : ' records use') + ' this. Retire it instead; it stops being offered and can be restored later.'); const i = list.indexOf(row); list.splice(i, 1); log('deleted ' + m[1].slice(0, -1), 'org', m[2]); save(); return delay({ ok: true }); } }
    if (p === '/settings' && method === 'PUT') {
      const s = Object.assign({}, db.settings, body), int = (k, lo, hi) => Number.isInteger(Number(s[k])) && Number(s[k]) >= lo && Number(s[k]) <= hi;
      if (!int('lead_protection_days', 1, 730)) return fail(400, 'Lead protection must be a whole number of days from 1 to 730.'); if (!int('csv_import_max_rows', 1, 100000)) return fail(400, 'The CSV row limit must be between 1 and 100000.');
      if (!(Number(s.unassigned_amber_hours) > 0)) return fail(400, 'The amber time must be above 0 hours.'); if (!(Number(s.unassigned_red_hours) > Number(s.unassigned_amber_hours))) return fail(400, 'The red time must be longer than the amber time.'); if (!(Number(s.followup_escalation_hours) > 0)) return fail(400, 'Follow-up escalation must be above 0 hours.');
      const em = String(s.lead_default_assignee_email || '').trim().toLowerCase(); if (em && !db.users.some((x) => x.email === em && x.status === 'Active' && !x.partner && !x.deleted)) return fail(400, 'That email is not an active internal user.');
      Object.keys(body).forEach((k) => { db.settings[k] = ['lead_protection_days', 'csv_import_max_rows', 'unassigned_amber_hours', 'unassigned_red_hours', 'followup_escalation_hours'].includes(k) ? Number(body[k]) : body[k]; }); log('updated settings', 'system_setting', 'settings'); save(); return delay(db.settings);
    }
    if (p === '/audit') {
      let rows = db.audit.map((a) => { const i = a.action.indexOf(': '); return { id: a.id, createdAt: a.at, actor: a.by === 'System' ? null : { name: a.by }, action: i > 0 ? a.action.slice(0, i) : a.action, reason: i > 0 ? a.action.slice(i + 2) : '', entityType: a.type, entityId: a.recordId }; });
      if (q.entityType) rows = rows.filter((r) => r.entityType === q.entityType); if (q.action) rows = rows.filter((r) => r.action.toLowerCase().includes(q.action.toLowerCase())); if (q.entityId) rows = rows.filter((r) => String(r.entityId).includes(q.entityId));
      const size = 15, page = Math.max(1, Number(q.page) || 1), pageCount = Math.max(1, Math.ceil(rows.length / size));
      return delay({ rows: rows.slice((page - 1) * size, page * size), total: rows.length, page, pageCount });
    }
    // ----- partner portal -----
    if (p === '/portal/dashboard' || p === '/portal/leads') {
      const part = u.partner && db.partners.find((x) => x.id === u.partner.id); if (!part) return fail(403, 'This page is for partner accounts.');
      const days = Number(db.settings.lead_protection_days) || 90;
      const mine = db.leads.filter((l) => l.partnerId === part.id && !l.deleted);
      const view = (l) => ({ id: l.id, companyName: l.company, serviceName: l.service || null, submittedAt: l.createdAt, status: l.status === 'Won' ? 'Converted' : l.status === 'Lost' ? 'Closed' : ['New', 'Contacted'].includes(l.status) ? 'In progress' : 'In discussion', protectedUntil: new Date(+new Date(l.createdAt) + days * DAY).toISOString(), protectionActive: new Date(+new Date(l.createdAt) + days * DAY) > now && l.status !== 'Lost' });
      if (p === '/portal/leads') { const rows = mine.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).map(view); return delay({ rows: rows.slice(0, Number(q.pageSize) || 25), total: rows.length }); }
      const won = mine.filter((l) => l.status === 'Won'), closed = mine.filter((l) => ['Won', 'Lost'].includes(l.status)), mapState = { awaiting_eligibility: 'earned', pending_approval: 'eligible', approved_unpaid: 'approved', paid: 'paid' };
      const earn = {}; db.approvals.filter((a) => a.partner === part.name).forEach((a) => { const c = a.currency || 'INR'; earn[c] = earn[c] || { currency: c, earned: 0, eligible: 0, approved: 0, paid: 0 }; earn[c][mapState[a.status]] += a.amount; });
      return delay({ partner: { companyName: part.name, partnerCode: part.code }, blocked: part.status === 'Active' ? null : { message: 'New submissions are paused while your partnership is not active. Your existing leads and earnings are unaffected.' }, leads: { total: mine.length, closed: closed.length, inProgress: mine.length - closed.length, converted: won.length, conversionRate: mine.length ? Math.round(won.length * 1000 / mine.length) / 10 : 0 }, earningsByCurrency: Object.values(earn), convertedValueByCurrency: money(won, (l) => l.currency, (l) => l.estimatedValue) });
    }
    if (p === '/portal/leads' && method === 'POST') return undefined;
    if (prev) return prev(ctx);
    return undefined;
  };
  // POST /portal/leads (kept separate so the GET above stays simple)
  const inner = window.MOCK_EXT;
  window.MOCK_EXT = async function (ctx) {
    if (ctx.p === '/portal/leads' && ctx.method === 'POST') {
      const { db, u, body, delay, fail, save, log } = ctx; ensure(db);
      const part = u.partner && db.partners.find((x) => x.id === u.partner.id); if (!part) return fail(403, 'This page is for partner accounts.');
      if (part.status !== 'Active') return fail(409, 'New submissions are paused while your partnership is not active.');
      const name = String(body.company || '').trim(); if (name.length < 2) return fail(400, 'Enter the company name.');
      const days = Number(db.settings.lead_protection_days) || 90, dup = db.leads.find((l) => !l.deleted && l.company.toLowerCase() === name.toLowerCase() && new Date(+new Date(l.createdAt) + days * DAY) > new Date());
      if (dup) return fail(409, dup.partnerId === part.id ? 'You have already registered this company.' : 'This company is already registered to another partner until ' + new Date(+new Date(dup.createdAt) + days * DAY).toLocaleDateString() + '.');
      const l = { id: 'x' + Math.random().toString(36).slice(2, 9), number: 'LD-' + (1000 + db.leads.length + 1), company: name, contact: body.contact || '', email: body.email || '', status: 'New', priority: 'medium', leadType: 'B2B', source: 'Partner', currency: 'INR', service: body.service || '', serviceId: '', partnerId: part.id, assignedTo: '', estimatedValue: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), nextAction: new Date(Date.now() + DAY).toISOString(), flags: ['untouched'], notes: [], hasNewNote: false, deleted: false, activities: [{ id: 'a' + Date.now(), description: 'Submitted by ' + part.name, at: new Date().toISOString() }] };
      db.leads.unshift(l); log('partner submitted lead', 'lead', l.id); save();
      return delay({ id: l.id, protectedUntil: new Date(Date.now() + days * DAY).toISOString() });
    }
    return inner(ctx);
  };
})();
