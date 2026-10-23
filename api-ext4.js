// Fourth batch of mock server rules (v2): global search, notifications, lead timeline, CSV import with
// duplicate detection. Replace with your real backend later (see api-ext.js).
(function () {
  const prev = window.MOCK_EXT, DAY = 86400000, HOUR = 3600000;
  const has = (u, ks) => ks.some((k) => u.permissions.includes(k));
  const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/\b(pvt|private|ltd|limited|llp|inc|co|company|corp|corporation)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const PRI = ['high', 'medium', 'low'], TYPES = ['B2B', 'B2C'], SOURCES = ['Direct', 'Partner'];

  function myLeads(db, u) { const all = has(u, ['LEAD_VIEW_ALL', 'LEAD_VIEW_TEAM']); return db.leads.filter((l) => !l.deleted && (all || l.assignedTo === u.id)); }

  function notifications(db, u) {
    const items = [], now = Date.now(), add = (id, kind, text, href, at) => items.push({ id, kind, text, href, at: at || new Date().toISOString() });
    if (u.partner) return items;
    const open = (l) => !['Won', 'Lost'].includes(l.status);
    if (u.permissions.includes('LEAD_ASSIGN')) { const n = db.leads.filter((l) => !l.deleted && !l.assignedTo && open(l)).length; if (n) add('unassigned:' + n, 'lead', n + (n === 1 ? ' lead is' : ' leads are') + ' waiting for an owner.', '#/unassigned'); }
    const mine = db.leads.filter((l) => !l.deleted && l.assignedTo === u.id && open(l));
    const od = mine.filter((l) => l.nextAction && new Date(l.nextAction) < new Date(now - 0)).length; if (od) add('overdue:' + od, 'followup', od + (od === 1 ? ' follow-up is' : ' follow-ups are') + ' overdue.', '#/my-day');
    mine.filter((l) => l.hasNewNote).forEach((l) => add('note:' + l.id, 'note', 'New note on ' + l.company + '.', '#/lead?id=' + l.id, (l.notes[l.notes.length - 1] || {}).at));
    if (u.permissions.includes('INCENTIVE_APPROVE')) { const dn = db.approvals.filter((a) => a.dispute && !a.dispute.resolvedAt).length; if (dn) add('dispute:' + dn, 'money', dn + (dn === 1 ? ' payout is' : ' payouts are') + ' disputed by a partner', '#/statement', new Date().toISOString()); }
    if (u.permissions.includes('INCENTIVE_APPROVE')) { const n = db.approvals.filter((a) => a.status === 'pending_approval' && a.recordedBy !== u.id).length; if (n) add('approve:' + n, 'money', n + (n === 1 ? ' payout needs' : ' payouts need') + ' your approval.', '#/approvals'); }
    if (u.permissions.includes('SUPPORT_VIEW')) { const n = db.tickets.filter((t) => !['resolved', 'closed'].includes(t.status) && new Date(t.slaResolveBy) < new Date()).length; if (n) add('sla:' + n, 'support', n + (n === 1 ? ' ticket is' : ' tickets are') + ' past its deadline.', '#/support/tickets'); }
    if (u.permissions.includes('ATTENDANCE_VIEW_ALL')) { const n = (db.corrections || []).filter((c) => c.status === 'pending').length; if (n) add('corr:' + n, 'attendance', n + (n === 1 ? ' attendance correction is' : ' attendance corrections are') + ' waiting.', '#/attendance/exceptions'); }
    if (u.permissions.includes('PARTNER_CONFLICT_DECIDE')) { const n = db.conflicts.length; if (n) add('conf:' + n, 'partner', n + (n === 1 ? ' conflict needs' : ' conflicts need') + ' a decision.', '#/conflicts'); }
    const t = db.tasks.filter((k) => k.assignee === u.id && k.status !== 'Done'); const bl = t.filter((k) => k.status === 'Blocked').length, tod = t.filter((k) => new Date(k.deadline) < new Date()).length;
    if (tod) add('taskod:' + tod, 'task', tod + (tod === 1 ? ' task is' : ' tasks are') + ' overdue.', '#/operations/my-work'); if (bl) add('taskbl:' + bl, 'task', bl + (bl === 1 ? ' task is' : ' tasks are') + ' blocked.', '#/operations/my-work');
    return items;
  }

  window.MOCK_EXT = async function (ctx) {
    const { method, p, q, body, db, u, delay, fail, save, log, uid } = ctx;
    // ----- partner payout statement and disputes -----
    const payRows = (partner) => db.approvals.filter((a) => a.partner === partner.name).map((a) => {
      const lead = db.leads.find((l) => l.number === a.lead), rule = db.rules.find((r) => r.name === a.rule), value = lead ? Number(lead.estimatedValue) || 0 : 0, n = (x) => Number(x).toLocaleString('en-IN', { maximumFractionDigits: 2 });
      let how = 'Rule: ' + a.rule + '.';
      if (rule && value) {
        if (rule.calculationType === 'percentage') how += ' Deal value ' + n(value) + ' x ' + rule.percentage + '% = ' + n(value * rule.percentage / 100) + '.';
        else if (rule.calculationType === 'fixed') how += ' Fixed amount of ' + n(rule.fixedAmount) + '.';
        else how += ' Banded rate on a deal value of ' + n(value) + '.';
      }
      return { id: a.id, number: a.incentiveNumber, lead: a.lead, company: lead ? lead.company : '', service: a.service, rule: a.rule, how, amount: a.amount, currency: a.currency, status: a.status, since: a.since, eligible: a.eligible, dispute: a.dispute || null };
    });
    if (p === '/statement' && method === 'GET') {
      const partner = u.partner ? db.partners.find((x) => x.id === u.partner.id) : db.partners.find((x) => x.id === q.partnerId);
      if (!u.partner && !has(u, ['PARTNER_VIEW', 'INCENTIVE_APPROVE'])) return fail(403, 'You cannot see partner statements.');
      if (!partner) return fail(404, 'Choose a partner.');
      const rows = payRows(partner), tot = {}; rows.forEach((r) => { tot[r.currency] = tot[r.currency] || { paid: 0, approved: 0, waiting: 0 }; const k = r.status === 'paid' ? 'paid' : r.status === 'approved_unpaid' ? 'approved' : 'waiting'; tot[r.currency][k] += r.amount; });
      return delay({ partner: { id: partner.id, name: partner.name, code: partner.code }, generatedAt: new Date().toISOString(), rows, totals: tot });
    }
    let dp = p.match(/^\/incentives\/([^/]+)\/dispute(\/resolve)?$/);
    if (dp && method === 'POST') {
      const a = db.approvals.find((x) => x.id === dp[1]); if (!a) return fail(404, 'Payout not found');
      if (dp[2]) { if (!has(u, ['INCENTIVE_APPROVE'])) return fail(403, 'Only an approver can resolve a dispute.'); if (!a.dispute || a.dispute.resolvedAt) return fail(409, 'There is no open dispute.'); if (String(body.note || '').trim().length < 3) return fail(400, 'Say how it was resolved.'); a.dispute.resolvedAt = new Date().toISOString(); a.dispute.resolution = String(body.note).trim(); log('resolved payout dispute', 'incentive', a.id); save(); return delay({ ok: true }); }
      const mine = u.partner && db.partners.find((x) => x.id === u.partner.id); if (!mine || mine.name !== a.partner) return fail(403, 'You can only dispute your own payouts.');
      if (a.dispute && !a.dispute.resolvedAt) return fail(409, 'This payout is already disputed.');
      if (String(body.reason || '').trim().length < 10) return fail(400, 'Explain what looks wrong (10 characters or more).');
      a.dispute = { reason: String(body.reason).trim(), at: new Date().toISOString() }; log('disputed payout', 'incentive', a.id); save(); return delay({ ok: true });
    }
    // ----- one-click follow-up scheduling -----
    let rs = p.match(/^\/leads\/([^/]+)\/reschedule$/);
    if (rs && method === 'POST') {
      const l = myLeads(db, u).find((x) => x.id === rs[1]); if (!l) return fail(404, 'Lead not found');
      const at = new Date(body.nextFollowUp); if (isNaN(at)) return fail(400, 'Choose a valid date.');
      if (!body.restore && at < new Date(Date.now() - DAY)) return fail(400, 'Pick today or a later date.');
      const was = l.nextAction; l.nextAction = at.toISOString(); l.updatedAt = new Date().toISOString();
      l.activities.unshift({ id: uid(), description: 'Next follow-up set to ' + at.toLocaleDateString(), at: l.updatedAt });
      log('rescheduled follow-up', 'lead', l.id); save(); return delay({ ok: true, id: l.id, nextAction: l.nextAction, was });
    }
    // ----- notifications -----
    if (p === '/notifications' && method === 'GET') { db.notifRead = db.notifRead || {}; const read = db.notifRead[u.id] || [], items = notifications(db, u).map((n) => Object.assign(n, { read: read.includes(n.id) })); return delay({ items, unread: items.filter((n) => !n.read).length }); }
    if (p === '/notifications/read' && method === 'POST') { db.notifRead = db.notifRead || {}; const cur = new Set(db.notifRead[u.id] || []); (body.all ? notifications(db, u).map((n) => n.id) : body.ids || []).forEach((id) => cur.add(id)); db.notifRead[u.id] = [...cur].slice(-200); save(); return delay({ ok: true }); }
    // ----- global search -----
    if (p === '/search' && method === 'GET') {
      const t = String(q.q || '').trim().toLowerCase(), groups = []; if (t.length < 2) return delay({ groups });
      const has2 = (v) => String(v || '').toLowerCase().includes(t), add = (type, label, items) => { if (items.length) groups.push({ type, label, items: items.slice(0, 5) }); };
      if (has(u, ['LEAD_VIEW_OWN', 'LEAD_VIEW_TEAM', 'LEAD_VIEW_ALL'])) add('lead', 'Leads', myLeads(db, u).filter((l) => [l.company, l.contact, l.number, l.email].some(has2)).map((l) => ({ title: l.company, sub: l.number + ' · ' + l.status, href: '#/lead?id=' + l.id })));
      if (has(u, ['PRESALES_VIEW', 'LEAD_VIEW_ALL'])) add('customer', 'Customers', (db.customers || []).filter((c) => [c.companyName, c.clientCode, c.email].some(has2)).map((c) => ({ title: c.companyName, sub: c.clientCode, href: '#/customers?q=' + encodeURIComponent(c.companyName) })));
      if (u.permissions.includes('PARTNER_VIEW')) add('partner', 'Partners', db.partners.filter((x) => !x.deleted && [x.name, x.code, x.contact].some(has2)).map((x) => ({ title: x.name, sub: x.code + ' · ' + x.status, href: '#/partners' })));
      if (u.permissions.includes('SUPPORT_VIEW')) add('ticket', 'Tickets', (db.tickets || []).filter((x) => [x.title, x.ticketNumber, x.clientName].some(has2)).map((x) => ({ title: x.title, sub: x.ticketNumber + ' · ' + x.clientName, href: '#/support/tickets' })));
      if (has(u, ['OPS_VIEW_OWN', 'OPS_VIEW_ALL'])) { add('task', 'Tasks', db.tasks.filter((x) => (u.permissions.includes('OPS_VIEW_ALL') || x.assignee === u.id) && [x.title, x.project].some(has2)).map((x) => ({ title: x.title, sub: (x.project || 'General') + ' · ' + x.status, href: '#/operations/tasks?q=' + encodeURIComponent(x.title) }))); if (u.permissions.includes('OPS_VIEW_ALL')) add('project', 'Projects', db.projects.filter((x) => !x.deleted && has2(x.name)).map((x) => ({ title: x.name, sub: x.status, href: '#/operations/projects' }))); }
      if (u.permissions.includes('USER_MANAGE')) add('user', 'Users', db.users.filter((x) => !x.deleted && [x.name, x.email].some(has2)).map((x) => ({ title: x.name, sub: x.email, href: '#/admin/users' })));
      return delay({ groups });
    }
    // ----- lead timeline -----
    let m = p.match(/^\/leads\/([^/]+)\/timeline$/);
    if (m && method === 'GET') {
      const l = db.leads.find((x) => x.id === m[1]); if (!l) return fail(404, 'Lead not found');
      if (!has(u, ['LEAD_VIEW_ALL', 'LEAD_VIEW_TEAM']) && l.assignedTo !== u.id) return fail(403, 'You cannot open this lead.');
      const ev = [];
      (l.activities || []).forEach((a) => ev.push({ at: a.at, kind: 'activity', text: a.description }));
      (l.notes || []).forEach((n) => ev.push({ at: n.at, kind: 'note', text: n.text, who: n.author, internal: n.internal }));
      (db.followups || []).filter((f) => f.leadId === l.id).forEach((f) => ev.push({ at: f.at, kind: 'followup', text: f.outcome, who: (db.users.find((x) => x.id === f.userId) || {}).name }));
      (db.proposals || []).filter((x) => x.lead && x.lead.id === l.id).forEach((x) => ev.push({ at: new Date().toISOString(), kind: 'proposal', text: x.proposalNumber + ' (' + x.status + ')' }));
      ev.sort((a, b) => new Date(b.at) - new Date(a.at));
      const part = l.partnerId ? db.partners.find((x) => x.id === l.partnerId) : null, days = Number(db.settings.lead_protection_days) || 90;
      return delay({ lead: Object.assign({}, l, { ownerName: (db.users.find((x) => x.id === l.assignedTo) || {}).name || 'Unassigned' }), events: ev, partner: part ? { id: part.id, name: part.name, code: part.code } : null, protectedUntil: part ? new Date(+new Date(l.createdAt) + days * DAY).toISOString() : null, proposals: (db.proposals || []).filter((x) => x.lead && x.lead.id === l.id) });
    }
    // ----- CSV import -----
    if (p === '/leads/import' && method === 'POST') {
      if (!u.permissions.includes('LEAD_CREATE')) return fail(403, 'You cannot import leads.');
      const rows = Array.isArray(body.rows) ? body.rows : [], max = Number(db.settings.csv_import_max_rows) || 5000;
      if (!rows.length) return fail(400, 'The file has no data rows.');
      if (rows.length > max) return fail(400, 'This file has ' + rows.length + ' rows; the limit is ' + max + '. Nothing was imported.');
      const seenC = new Set(db.leads.filter((l) => !l.deleted).map((l) => norm(l.company))), seenE = new Set(db.leads.filter((l) => !l.deleted && l.email).map((l) => String(l.email).toLowerCase()));
      const ok = [], skipped = [];
      rows.forEach((r, i) => {
        const n = i + 2, company = String(r.company || '').trim(), email = String(r.email || '').trim().toLowerCase(), val = String(r.estimatedValue == null ? '' : r.estimatedValue).replace(/[,\s]/g, '');
        const bad = (why) => skipped.push({ row: n, company, reason: why });
        if (company.length < 2) return bad('Company name is missing.');
        if (email && !EMAIL.test(email)) return bad('The email address is not valid.');
        if (val && !/^\d+(\.\d{1,2})?$/.test(val)) return bad('The value is not a valid amount.');
        const pri = String(r.priority || 'medium').toLowerCase(); if (!PRI.includes(pri)) return bad('Priority must be high, medium or low.');
        const type = String(r.leadType || 'B2C').toUpperCase(); if (!TYPES.includes(type)) return bad('Type must be B2B or B2C.');
        const src = r.source ? SOURCES.find((s) => s.toLowerCase() === String(r.source).toLowerCase()) : 'Direct'; if (!src) return bad('Source must be Direct or Partner.');
        if (seenC.has(norm(company))) return bad('Duplicate: a lead for this company already exists.');
        if (email && seenE.has(email)) return bad('Duplicate: this email is already on another lead.');
        seenC.add(norm(company)); if (email) seenE.add(email);
        ok.push({ company, contact: String(r.contact || '').trim(), email, estimatedValue: val ? Number(val) : 0, priority: pri, leadType: type, source: src, service: String(r.service || '').trim() });
      });
      if (body.dryRun) return delay({ dryRun: true, willCreate: ok.length, skipped });
      const def = db.settings.lead_default_assignee_email ? (db.users.find((x) => x.email === db.settings.lead_default_assignee_email) || {}).id || '' : '';
      ok.forEach((r) => { const now = new Date().toISOString(); db.leads.unshift({ id: uid(), number: 'LD-' + (1000 + db.leads.length + 1), company: r.company, contact: r.contact, email: r.email, status: 'New', priority: r.priority, leadType: r.leadType, source: r.source, currency: 'INR', service: r.service, serviceId: '', partnerId: '', assignedTo: def, estimatedValue: r.estimatedValue, createdAt: now, updatedAt: now, nextAction: new Date(Date.now() + DAY).toISOString(), flags: ['untouched'], notes: [], hasNewNote: false, deleted: false, activities: [{ id: uid(), description: 'Imported from a CSV file', at: now }] }); });
      log('imported leads: ' + ok.length + ' created, ' + skipped.length + ' skipped', 'lead', 'import'); save();
      return delay({ created: ok.length, skipped });
    }
    if (prev) return prev(ctx);
    return undefined;
  };
})();
