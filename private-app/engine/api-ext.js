// Mock server rules for dashboards, sales targets, partners, tasks, sprints and approvals.
// This stands in for your real backend; delete it (and the MOCK_EXT hook in api.js) when you connect your own API.
(function () {
  const DAY = 86400000;
  const KINDS = { 'Super Admin': 'super_admin', 'Sales Manager': 'sales_manager', 'Sales Executive': 'sales_executive', 'Admin Finance': 'admin_finance', 'Partner Manager': 'partner_manager' };
  const kindOf = (u) => u.kind || KINDS[u.profile] || 'sales_executive';
  const TASK_STATUSES = ['To do', 'In progress', 'Blocked', 'Done'];
  const monthsBetween = (a, b) => { const out = []; let [y, m] = a.split('-').map(Number); const [ey, em] = b.split('-').map(Number); while (y < ey || (y === ey && m <= em)) { out.push(y + '-' + String(m).padStart(2, '0')); m++; if (m > 12) { m = 1; y++; } } return out; };
  const groups = (items, cur, amt) => { const m = {}; items.forEach((i) => { const c = cur(i) || 'INR'; m[c] = m[c] || { currency: c, amount: 0, count: 0 }; m[c].amount += Number(amt(i)) || 0; m[c].count++; }); return Object.values(m).sort((a, b) => b.amount - a.amount); };
  const mondayOf = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 6) % 7)); return x; };
  const weekly = (leads) => { const now = mondayOf(new Date()), out = []; for (let i = 11; i >= 0; i--) { const s = new Date(+now - i * 7 * DAY), e = new Date(+s + 7 * DAY); out.push({ weekStart: s.toISOString().slice(0, 10), submitted: leads.filter((l) => new Date(l.createdAt) >= s && new Date(l.createdAt) < e).length, converted: leads.filter((l) => l.convertedAt && new Date(l.convertedAt) >= s && new Date(l.convertedAt) < e).length }); } return out; };
  const OPEN_KEYS = ['new', 'contacted', 'qualified', 'initial_discussion', 'proposal_sent', 'negotiation'];

  function dashboard(ctx) {
    const { db, u, keyOf, nameOf } = ctx, kind = kindOf(u), now = Date.now();
    const alive = db.leads.filter((l) => !l.deleted);
    const scope = kind === 'sales_executive' ? alive.filter((l) => l.assignedTo === u.id) : alive;
    const isOpen = (l) => !['Won', 'Lost'].includes(l.status), open = scope.filter(isOpen);
    const rate = (a) => a.length ? Math.round(a.filter((l) => l.status === 'Won').length * 1000 / a.length) / 10 : 0;
    const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const wonMonth = scope.filter((l) => l.status === 'Won' && l.convertedAt && new Date(l.convertedAt) >= monthStart);
    const overdue = open.filter((l) => l.nextAction && new Date(l.nextAction) < now);
    const channel = { partner: { leads: scope.filter((l) => l.source === 'Partner').length, converted: scope.filter((l) => l.source === 'Partner' && l.status === 'Won').length }, direct: { leads: scope.filter((l) => l.source !== 'Partner').length, converted: scope.filter((l) => l.source !== 'Partner' && l.status === 'Won').length } };
    channel.partner.rate = channel.partner.leads ? Math.round(channel.partner.converted * 1000 / channel.partner.leads) / 10 : 0; channel.direct.rate = channel.direct.leads ? Math.round(channel.direct.converted * 1000 / channel.direct.leads) / 10 : 0;
    const pipelineByStage = OPEN_KEYS.map((k) => { const ls = open.filter((l) => keyOf(l.status) === k); return { status: nameOf(k), count: ls.length, values: groups(ls, (l) => l.currency, (l) => l.estimatedValue) }; });
    const base = { kind, kpis: {}, weekly: weekly(scope), channel, conversionRate: rate(scope), pipelineByStage };
    const sales = db.users.filter((x) => !x.partner && ['Sales Executive', 'Sales Manager'].includes(x.profile));
    const staleDays = 14, stale = open.filter((l) => now - new Date(l.updatedAt) > staleDays * DAY).length;
    const partnersView = () => {
      const conflicts = db.conflicts.map((c) => ({ id: c.id, company: c.account, claimants: c.partners, matchType: c.matchedOn.toLowerCase(), ageDays: 2 }));
      const expiring = db.partners.filter((p) => !p.deleted && p.expires && new Date(p.expires) - now < 30 * DAY && new Date(p.expires) > now).map((p) => ({ id: p.id, companyName: p.name, agreementExpiry: p.expires, daysLeft: Math.ceil((new Date(p.expires) - now) / DAY) }));
      const live = db.partners.filter((p) => !p.deleted);
      const year = now - 365 * DAY, board = [];
      live.forEach((p) => { const won = alive.filter((l) => l.partnerId === p.id && l.status === 'Won' && l.convertedAt && new Date(l.convertedAt) > year); const g = groups(won, (l) => l.currency, (l) => l.estimatedValue); g.forEach((x) => board.push({ currency: x.currency, companyName: p.name, amount: x.amount })); });
      return { conflicts, expiring, leaderboard: board.sort((a, b) => b.amount - a.amount), partners: live.map((p) => { const ls = alive.filter((l) => l.partnerId === p.id), won = ls.filter((l) => l.status === 'Won'); return { id: p.id, companyName: p.name, partnerCode: p.code, tier: p.tier ? { name: p.tier } : null, _count: { leads: ls.length, conversions: won.length }, conversionRate: ls.length ? Math.round(won.length * 1000 / ls.length) / 10 : 0, earnings: groups(won, (l) => l.currency, (l) => l.estimatedValue * 0.05), status: p.status.toLowerCase() === 'active' ? 'active' : p.status.toLowerCase().replace(/\s+/g, '_') }; }), pk: { activePartners: live.filter((p) => p.status === 'Active').length, partnerLeadsThisMonth: alive.filter((l) => l.source === 'Partner' && new Date(l.createdAt) >= monthStart).length, pendingConflicts: conflicts.length, expiringAgreements: expiring.length } };
    };
    const moneyView = () => {
      const q = db.approvals.filter((a) => ['pending_approval', 'awaiting_eligibility'].includes(a.status)), wait = db.approvals.filter((a) => a.status === 'pending_approval'), unpaid = db.approvals.filter((a) => a.status === 'approved_unpaid'), paid = db.approvals.filter((a) => a.status === 'paid');
      const days = (a) => Math.max(0, Math.floor((now - new Date(a.since)) / DAY));
      const liab = {}; db.approvals.filter((a) => a.status !== 'paid').forEach((a) => { const c = a.currency || 'INR'; liab[c] = liab[c] || { currency: c, total: 0, breakdown: {} }; liab[c].total += a.amount; const b = liab[c].breakdown[a.status] = liab[c].breakdown[a.status] || { status: a.status, count: 0, amount: 0 }; b.count++; b.amount += a.amount; });
      return { fk: { awaitingApproval: wait.length, approvedUnpaid: unpaid.length, paidThisMonth: paid.length, oldestWaitingDays: wait.length ? Math.max(...wait.map(days)) : 0, cycleDays: null }, awaitingApprovalValue: groups(wait, (a) => a.currency, (a) => a.amount), approvedUnpaidValue: groups(unpaid, (a) => a.currency, (a) => a.amount), paidThisMonthValue: groups(paid, (a) => a.currency, (a) => a.amount), queue: q.map((a) => ({ id: a.id, partner: a.partner, status: a.status, lead: a.lead, service: a.service, incentiveNumber: a.incentiveNumber, daysWaiting: days(a), amount: a.amount, currency: a.currency, canApprove: a.status === 'pending_approval' && a.recordedBy !== u.id, blockedReason: a.status !== 'pending_approval' ? 'Not eligible yet' : a.recordedBy === u.id ? 'You recorded this payment' : '' })), outstandingIncentiveLiability: Object.values(liab).map((x) => Object.assign(x, { breakdown: Object.values(x.breakdown) })), collection: db.collections.filter((c) => c.status !== 'paid') };
    };
    if (kind === 'sales_executive') { base.kpis = { open: open.length, overdue: overdue.length, dueToday: open.filter((l) => l.nextAction && new Date(l.nextAction).toDateString() === new Date().toDateString()).length, noNextAction: open.filter((l) => !l.nextAction).length, converted: scope.filter((l) => l.status === 'Won').length }; base.wonThisMonth = groups(wonMonth, (l) => l.currency, (l) => l.estimatedValue); }
    if (kind === 'sales_manager') { base.kpis = { open: open.length, unassigned: open.filter((l) => !l.assignedTo).length, totalOverdue: overdue.length, overduePct: open.length ? Math.round(overdue.length * 100 / open.length) : 0, teamSize: sales.length }; base.pipelineValue = groups(open, (l) => l.currency, (l) => l.estimatedValue); base.perExecutive = sales.map((x) => { const ls = alive.filter((l) => l.assignedTo === x.id), o = ls.filter(isOpen); return { user: { id: x.id, name: x.name }, open: o.length, overdue: o.filter((l) => l.nextAction && new Date(l.nextAction) < now).length, noNextAction: o.filter((l) => !l.nextAction).length, conversionRate: rate(ls), won: groups(ls.filter((l) => l.status === 'Won'), (l) => l.currency, (l) => l.estimatedValue) }; }); base.leadTypes = ['B2C', 'B2B'].map((t) => { const ls = alive.filter((l) => l.leadType === t); return { leadType: t, leads: ls.length, rate: rate(ls) }; }); base.stale = { days: staleDays, count: stale }; }
    if (kind === 'partner_manager' || kind === 'super_admin') { const pv = partnersView(); Object.assign(base, { conflicts: pv.conflicts, expiring: pv.expiring, leaderboard: pv.leaderboard, partners: pv.partners }); base.kpis = Object.assign(base.kpis, pv.pk); }
    if (kind === 'admin_finance' || kind === 'super_admin') { const mv = moneyView(); Object.assign(base, { awaitingApprovalValue: mv.awaitingApprovalValue, approvedUnpaidValue: mv.approvedUnpaidValue, paidThisMonthValue: mv.paidThisMonthValue, queue: mv.queue, outstandingIncentiveLiability: mv.outstandingIncentiveLiability, collection: mv.collection }); base.kpis = Object.assign(base.kpis, mv.fk); }
    if (kind === 'super_admin') { base.kpis = Object.assign(base.kpis, { open: open.length, totalLeads: alive.length, unassigned: open.filter((l) => !l.assignedTo).length }); base.wonThisMonth = groups(wonMonth, (l) => l.currency, (l) => l.estimatedValue); base.leadTypes = ['B2C', 'B2B'].map((t) => { const ls = alive.filter((l) => l.leadType === t); return { leadType: t, leads: ls.length, rate: rate(ls) }; }); base.stale = { days: staleDays, count: stale }; }
    return base;
  }

  const rangeOf = (type, start) => { const n = { quarter: 3, half_year: 6, year: 12 }[type] || 1; return monthsBetween(start, (() => { let [y, m] = start.split('-').map(Number); m += n - 1; while (m > 12) { m -= 12; y++; } return y + '-' + String(m).padStart(2, '0'); })()); };
  function validateTarget(b) {
    if (!b.name || b.name.trim().length < 2) return 'Give the target a name.';
    if (b.scope !== 'company' && !b.ownerId) return 'Choose who the target belongs to.';
    if (!b.periodStart || !b.periodEnd || b.periodEnd < b.periodStart) return 'The last month is before the first.';
    if (!Array.isArray(b.months) || !b.months.length || b.months.length > 24) return 'A target covers between 1 and 24 months.';
    if (b.months.some((m) => !(Number(m.revenueTarget) > 0) || !(Number.isInteger(m.dealsTarget) && m.dealsTarget >= 0))) return 'Every month needs an amount and a whole number of deals.';
    if (!(Number(b.averageDealValue) > 0)) return 'Enter the average deal value.';
    const a = b.assumptions || {}; if (!['opportunityRate', 'proposalRate', 'winRate'].every((k) => a[k] > 0 && a[k] <= 100)) return 'Each rate is above 0 and at most 100.';
    return '';
  }

  window.MOCK_EXT = async function (ctx) {
    const { method, p, q, body, db, u, delay, fail, save, log, uid, keyOf } = ctx; const now = Date.now();
    if (p === '/dashboards/me') return delay(dashboard(ctx));
    // ----- incentives -----
    if (p === '/incentives/approval-queue') return delay(db.approvals.filter((a) => ['pending_approval', 'awaiting_eligibility'].includes(a.status)).map((a) => Object.assign({}, a, { daysWaiting: Math.max(0, Math.floor((now - new Date(a.since)) / DAY)), canApprove: a.status === 'pending_approval' && a.recordedBy !== u.id, blockedReason: a.status !== 'pending_approval' ? 'Not eligible yet' : a.recordedBy === u.id ? 'You recorded this payment' : '' })));
    let m = p.match(/^\/incentives\/([^/]+)\/approve$/);
    if (m && method === 'POST') { const a = db.approvals.find((x) => x.id === m[1]); if (!a) return fail(404, 'Not found'); if (a.status !== 'pending_approval') return fail(409, 'This payout is not waiting for approval.'); if (a.recordedBy === u.id) return fail(409, 'A second approver is required: you recorded this payment.'); a.status = 'approved_unpaid'; a.approvedBy = u.id; log('approved payout', 'partner_payout', a.id); save(); return delay(a); }
    // ----- partners -----
    if (p === '/partners' && method === 'GET') {
      const t = (q.q || '').toLowerCase(); let rows = db.partners.filter((x) => q.includeDeleted === 'true' || !x.deleted);
      if (q.status) rows = rows.filter((x) => x.status === q.status); if (t) rows = rows.filter((x) => [x.name, x.code, x.contact].some((v) => String(v).toLowerCase().includes(t)));
      const out = rows.slice(0, Number(q.pageSize) || 100).map((x) => Object.assign({}, x, { ownerName: (db.users.find((y) => y.id === x.ownerId) || {}).name || '', _count: { leads: db.leads.filter((l) => l.partnerId === x.id && !l.deleted).length, conversions: db.leads.filter((l) => l.partnerId === x.id && l.status === 'Won').length } }));
      return delay({ rows: out, total: rows.length, page: 1 });
    }
    if (p === '/partners' && method === 'POST') { if (!u.permissions.includes('PARTNER_CREATE')) return fail(403, 'You cannot add partners.'); if (!String(body.name || '').trim()) return fail(400, 'Enter the firm name.'); const x = Object.assign({ id: uid(), code: 'PRT-' + String(1000 + db.partners.length + 1), status: 'Pending', category: '', tier: '', defaultCurrency: 'INR', ownerId: '', expires: '', deleted: false }, body); db.partners.unshift(x); log('created partner', 'partner', x.id); save(); return delay(x); }
    m = p.match(/^\/partners\/([^/]+)(\/restore)?$/);
    if (m) {
      const x = db.partners.find((y) => y.id === m[1]); if (!x) return fail(404, 'Partner not found');
      if (m[2] && method === 'POST') { x.deleted = false; x.status = 'Inactive'; log('restored partner', 'partner', x.id); save(); return delay(x); }
      if (method === 'DELETE') { if (!u.permissions.includes('PARTNER_DELETE')) return fail(403, 'You cannot delete partners.'); x.deleted = true; log('deleted partner' + (body && body.reason ? ': ' + body.reason : ''), 'partner', x.id); save(); return delay({ ok: true }); }
      if (method === 'PATCH') { Object.assign(x, body); log('updated partner', 'partner', x.id); save(); return delay(x); }
    }
    // ----- tasks, sprints -----
    if (p === '/operations/tasks' && method === 'GET') {
      let rows = db.tasks.slice(); const t = (q.q || '').toLowerCase(), od = (x) => x.status !== 'Done' && new Date(x.deadline) < now;
      if (t) rows = rows.filter((x) => (x.title + ' ' + x.project).toLowerCase().includes(t));
      ['project', 'assignee', 'status', 'priority', 'type'].forEach((k) => { if (q[k]) rows = rows.filter((x) => String(x[k]) === q[k]); });
      if (q.overdue === 'true') rows = rows.filter(od); if (q.blocked === 'true') rows = rows.filter((x) => x.status === 'Blocked'); if (q.extended === 'true') rows = rows.filter((x) => x.extended); if (q.unassigned === 'true') rows = rows.filter((x) => !x.assignee);
      rows.sort((a, b) => new Date(a.deadline) - new Date(b.deadline)); const size = Number(q.pageSize) || 100;
      return delay({ rows: rows.slice(0, size), total: rows.length, page: 1 });
    }
    if (p === '/operations/tasks' && method === 'POST') { if (!String(body.title || '').trim()) return fail(400, 'Give the task a title.'); const x = Object.assign({ id: uid(), status: 'To do', priority: 'Normal', type: body.project ? 'Project' : 'General', progress: 0, blocked: false, blockedReason: '', extended: false, carryOverCount: 0, sprint: '', assignee: '' }, body, { deadline: body.deadline ? new Date(body.deadline).toISOString() : new Date(now + 3 * DAY).toISOString() }); db.tasks.unshift(x); log('created task', 'task', x.id); save(); return delay(x); }
    m = p.match(/^\/operations\/tasks\/([^/]+)$/);
    if (m && method === 'PATCH') {
      const x = db.tasks.find((y) => y.id === m[1]); if (!x) return fail(404, 'Task not found');
      if (body.status) { if (!TASK_STATUSES.includes(body.status)) return fail(400, 'Unknown status.'); if (body.status === 'Blocked' && !String(body.blockedReason || x.blockedReason || '').trim()) return fail(400, 'Say what is blocking it before marking it blocked.'); x.status = body.status; x.blocked = body.status === 'Blocked'; if (body.status !== 'Blocked') x.blockedReason = ''; if (body.status === 'Done') x.progress = 100; }
      if (body.blockedReason !== undefined && x.status === 'Blocked') x.blockedReason = body.blockedReason;
      if (body.deadline) { const d = new Date(body.deadline).toISOString(); if (d > x.deadline) x.extended = true; x.deadline = d; }
      ['assignee', 'priority', 'title', 'progress'].forEach((k) => { if (body[k] !== undefined) x[k] = body[k]; });
      log('updated task', 'task', x.id); save(); return delay(x);
    }
    if (p === '/operations/dashboard') { const live = db.tasks, od = live.filter((x) => x.status !== 'Done' && new Date(x.deadline) < now); return delay({ overdue: od.length, blocked: live.filter((x) => x.status === 'Blocked').length, dueToday: live.filter((x) => x.status !== 'Done' && new Date(x.deadline).toDateString() === new Date().toDateString()).length, extended: live.filter((x) => x.extended).length, active: live.filter((x) => x.status !== 'Done').length, completed: live.filter((x) => x.status === 'Done').length, activeProjects: db.projects.filter((x) => x.status === 'active').length, sprints: db.sprints.filter((s) => s.start <= new Date().toISOString().slice(0, 10) && s.end >= new Date().toISOString().slice(0, 10)).map((s) => Object.assign({}, s, { taskCount: db.tasks.filter((t) => t.sprint === s.name).length })) }); }
    if (p === '/operations/sprints') { const today = new Date().toISOString().slice(0, 10); return delay(db.sprints.map((s) => Object.assign({}, s, { current: s.start <= today && s.end >= today, taskCount: db.tasks.filter((t) => t.sprint === s.name).length }))); }
    // ----- sales targets -----
    if (p.startsWith('/sales-targets')) {
      if (!u.permissions.includes('SALES_TARGET_VIEW')) return fail(403, 'Sales targets are not part of your access.');
      const canCompany = u.permissions.includes('SETTINGS_MANAGE');
      if (p === '/sales-targets/options') return delay({ people: db.users.filter((x) => !x.partner).map((x) => ({ id: x.id, name: x.name, reportCount: x.designation === 'Manager' ? 2 : 0 })), canManageCompany: canCompany, pipeline: db.pipeline });
      if (p === '/sales-targets/pipeline-settings' && method === 'PUT') { for (const k of Object.keys(db.pipeline)) { const v = body[k]; if (!v || !(Number(v.probability) > 0 && Number(v.probability) <= 100) || !(Number.isInteger(Number(v.days)) && Number(v.days) >= 1)) return fail(400, 'Each chance is above 0 and at most 100, and each day limit is a whole number of days.'); } Object.keys(db.pipeline).forEach((k) => { db.pipeline[k] = { probability: Number(body[k].probability), days: Number(body[k].days) }; }); log('updated pipeline settings', 'system_setting', 'pipeline'); save(); return delay(db.pipeline); }
      if (p === '/sales-targets' && method === 'GET') return delay(db.targets.filter((t) => q.includeArchived === 'true' || t.status !== 'archived'));
      if (p === '/sales-targets' && (method === 'POST')) { const err = validateTarget(body); if (err) return fail(400, err); if (body.scope === 'company' && !canCompany) return fail(403, 'Only admins can set a company target.'); const t = Object.assign({ id: uid(), status: 'active' }, body); db.targets.unshift(t); log('created sales target', 'sales_target', t.id); save(); return delay(t); }
      m = p.match(/^\/sales-targets\/([^/]+)(?:\/(archive|restore|performance))?$/);
      if (m) {
        const t = db.targets.find((x) => x.id === m[1]); if (!t) return fail(404, 'Target not found');
        if (m[2] === 'archive' || m[2] === 'restore') { t.status = m[2] === 'archive' ? 'archived' : 'active'; log(m[2] + 'd sales target', 'sales_target', t.id); save(); return delay(t); }
        if (!m[2] && (method === 'PUT' || method === 'PATCH')) { const err = validateTarget(Object.assign({}, t, body)); if (err) return fail(400, err); Object.assign(t, body); log('updated sales target', 'sales_target', t.id); save(); return delay(t); }
        if (m[2] === 'performance') {
          const from = q.from || t.periodStart + '-01', to = q.to || t.periodEnd + '-31';
          let leads = db.leads.filter((l) => !l.deleted); if (t.scope === 'user') leads = leads.filter((l) => l.assignedTo === t.ownerId);
          if (q.userId) leads = leads.filter((l) => l.assignedTo === q.userId); if (q.leadSourceId) leads = leads.filter((l) => l.source === q.leadSourceId);
          const won = leads.filter((l) => l.status === 'Won' && l.convertedAt && l.convertedAt.slice(0, 10) >= from && l.convertedAt.slice(0, 10) <= to);
          const inRange = t.months.filter((x) => x.month >= from.slice(0, 7) && x.month <= to.slice(0, 7));
          const byMonth = t.months.map((x) => { const w = won.filter((l) => l.convertedAt.slice(0, 7) === x.month); return { month: x.month, revenueTarget: x.revenueTarget, dealsTarget: x.dealsTarget, wonAmount: w.reduce((s, l) => s + l.estimatedValue, 0), wonDeals: w.length }; });
          const open = leads.filter((l) => !['Won', 'Lost'].includes(l.status)); let weighted = 0;
          const byStage = Object.keys(db.pipeline).map((k) => { const ls = open.filter((l) => keyOf(l.status) === k), cfg = db.pipeline[k]; const val = ls.reduce((s, l) => s + l.estimatedValue, 0); weighted += val * cfg.probability / 100; return { key: k, name: ctx.nameOf(k), count: ls.length, value: val, probability: cfg.probability, days: cfg.days, flagged: ls.filter((l) => now - new Date(l.updatedAt) > cfg.days * DAY).length }; });
          return delay({ target: t, range: { from, to }, won: { amount: won.reduce((s, l) => s + l.estimatedValue, 0), deals: won.length }, planned: { revenue: inRange.reduce((s, x) => s + Number(x.revenueTarget), 0), deals: inRange.reduce((s, x) => s + x.dealsTarget, 0) }, byMonth, forecast: { weighted, unweighted: open.reduce((s, l) => s + l.estimatedValue, 0) }, byStage });
        }
      }
    }
    return undefined;
  };
  window.MOCK_UTIL = { monthsBetween, rangeOf };
})();
