// Data layer. Default = in-browser mock (localStorage). To use your own API later, set
//   window.WORKOS_CONFIG = { apiBase: "https://your-api.example.com" }  (see config.js)
// Nothing here ever calls any third-party API. The mock also plays the part of the server rules.
(function () {
  const CFG = window.WORKOS_CONFIG || {};
  const KEY = 'partnerdesk.mock.v4', TOK = 'partnerdesk.tokens';
  const day = 86400000, now = Date.now();
  const iso = (d) => new Date(now + d * day).toISOString();
  const ALL = ['ATTENDANCE_SELF','ATTENDANCE_VIEW_ALL','ATTENDANCE_VIEW_TEAM','AUDIT_VIEW','CONVERSION_VIEW','CONVERSION_CREATE','INCENTIVE_APPROVE','INCENTIVE_RULE_DELETE','INCENTIVE_RULE_MANAGE','INCENTIVE_SIMULATE','LEAD_ASSIGN','LEAD_CREATE','LEAD_DELETE','LEAD_EDIT','LEAD_EXPORT','LEAD_VIEW_ALL','LEAD_VIEW_OWN','LEAD_VIEW_TEAM','OPS_REPORT_VIEW','OPS_VIEW_ALL','OPS_VIEW_OWN','PARTNER_CONFLICT_DECIDE','PARTNER_CREATE','PARTNER_DELETE','PARTNER_VIEW','PAYMENT_RECORD','PRESALES_VIEW','ROLE_MANAGE','SALES_TARGET_VIEW','SERVICE_MANAGE','SETTINGS_MANAGE','SUPPORT_VIEW','USER_MANAGE'];
  const REP = ['SALES_TARGET_VIEW','ATTENDANCE_SELF','LEAD_VIEW_OWN','LEAD_CREATE','LEAD_EDIT','OPS_VIEW_OWN','PRESALES_VIEW'];
  // Pipeline. Stages that need a follow-up date + comment cannot be dragged into; Won only via conversion.
  // key, name, step in the 6-step sales journey, built in (1) or added by an admin (0). Admins can edit this list (api-ext7.js).
  const STATUSES = [['new', 'New', 1, 1], ['interested', 'Interested', 2, 0], ['not_interested', 'Not Interested', 2, 0], ['callback', 'Callback', 2, 0], ['rnr', 'RNR', 2, 0], ['invalid_number', 'Invalid Number', 2, 0], ['have_requirement_in_future', 'Have a Requirement in future', 2, 0], ['contacted', 'Contacted', 2, 1], ['qualified', 'Qualified', 3, 1], ['initial_discussion', 'Initial Discussion', 3, 1], ['proposal_sent', 'Proposal Sent', 4, 1], ['negotiation', 'Negotiation', 5, 1], ['won', 'Won', 6, 1], ['lost', 'Lost', 6, 1]].map((s) => ({ id: s[0], key: s[0], name: s[1], isActive: true, step: s[2], system: !!s[3] }));
  const FOLLOWUP_REQUIRED = ['proposal_sent', 'negotiation', 'callback'];
  const keyOf = (name) => (STATUSES.find((s) => s.name === name) || {}).key;
  const nameOf = (k) => (STATUSES.find((s) => s.key === k) || {}).name;
  const LOSS = ['Price', 'Chose a competitor', 'No response', 'Not a fit', 'Timing', 'Other'].map((n, i) => ({ id: 'lr' + i, name: n }));
  const FOCUS = ['untouched','updated','won','calls_done','calls_pending','followups_done','followups_pending','messages_done','meetings_done'];
  const seed = () => ({
    users: [
      { id: 'u1', name: 'Demo Admin', email: 'admin@example.com', password: 'WorkOS-demo-12345', department: 'Management', designation: 'Director', profile: 'Super Admin', status: 'Active', permissions: ALL, home: '/home' },
      { id: 'u2', name: 'Asha Menon', email: 'asha@example.com', password: 'WorkOS-demo-12345', department: 'Sales', designation: 'Executive', profile: 'Sales Executive', status: 'Active', permissions: REP, home: '/home' },
      { id: 'u3', name: 'Ravi Nair', email: 'ravi@example.com', password: 'WorkOS-demo-12345', department: 'Sales', designation: 'Manager', profile: 'Sales Manager', status: 'Active', permissions: REP.concat(['LEAD_VIEW_TEAM','LEAD_ASSIGN','LEAD_EXPORT','CONVERSION_CREATE','ATTENDANCE_VIEW_TEAM','CONVERSION_VIEW','PARTNER_VIEW']), home: '/home' },
      { id: 'u5', name: 'Farah Khan', email: 'finance@example.com', password: 'WorkOS-demo-12345', department: 'Finance', designation: 'Finance lead', profile: 'Admin Finance', kind: 'admin_finance', status: 'Active', permissions: ['ATTENDANCE_SELF','INCENTIVE_APPROVE','PAYMENT_RECORD','AUDIT_VIEW','INCENTIVE_SIMULATE'], home: '/home' },
      { id: 'u6', name: 'Meera Pillai', email: 'partners@example.com', password: 'WorkOS-demo-12345', department: 'Sales', designation: 'Partner manager', profile: 'Partner Manager', kind: 'partner_manager', status: 'Active', permissions: ['ATTENDANCE_SELF','PARTNER_VIEW','PARTNER_CREATE','PARTNER_CONFLICT_DECIDE','LEAD_VIEW_ALL'], home: '/home' },
      { id: 'u4', name: 'Partner Demo', email: 'partner@example.com', password: 'WorkOS-demo-12345', profile: 'Partner', status: 'Active', permissions: [], partner: { id: 'p1', code: 'PRT-0001' }, home: '/partner' }
    ],
    partners: [
      { id: 'p1', code: 'PRT-0001', name: 'Northwind Advisory', contact: 'Meera Das', status: 'Active', expires: iso(20), category: 'Consultancy', tier: 'Gold', defaultCurrency: 'INR', ownerId: 'u6', deleted: false },
      { id: 'p2', code: 'PRT-0002', name: 'Bluepeak Consulting', contact: 'Joel Mathew', status: 'Active', expires: iso(200), category: 'Consultancy', tier: 'Silver', defaultCurrency: 'INR', ownerId: 'u6', deleted: false },
      { id: 'p3', code: 'PRT-0003', name: 'Harbor Partners', contact: 'Anita Roy', status: 'In discussion', expires: iso(400), category: 'Reseller', tier: 'Silver', defaultCurrency: 'AED', ownerId: '', deleted: false },
      { id: 'p4', code: 'PRT-0004', name: 'Cedar Group', contact: 'Imran Q', status: 'Documents pending', expires: '', category: 'Reseller', tier: '', defaultCurrency: 'INR', ownerId: 'u6', deleted: false },
      { id: 'p5', code: 'PRT-0005', name: 'Quill & Co', contact: 'Sana M', status: 'Rejected', expires: '', category: 'Consultancy', tier: '', defaultCurrency: 'INR', ownerId: '', deleted: false }
    ],
    leads: [
      ['LD-1001','Acme Textiles','Priya S','high','Direct','u2','Qualified',420000,-2,['calls_done'],'B2C'],
      ['LD-1002','Zenith Foods','Mark T','medium','Partner','u3','Proposal Sent',900000,1,['followups_pending'],'B2B'],
      ['LD-1003','Orbit Labs','Divya K','medium','Direct','u2','New',150000,0,['untouched'],'B2C'],
      ['LD-1004','Pinecrest School','Sam P','high','Partner','','New',300000,3,['untouched'],'B2B'],
      ['LD-1005','Delta Logistics','Nikhil R','medium','Direct','u3','Negotiation',1250000,-1,['calls_pending','followups_pending'],'B2C'],
      ['LD-1006','Greenfield Farms','Leena J','low','Partner','u2','Won',600000,-9,['won','meetings_done'],'B2B'],
      ['LD-1007','Crown Hotels','Arun V','high','Direct','u3','Initial Discussion',780000,2,['messages_done'],'B2C'],
      ['LD-1008','Lotus Clinics','Fathima A','low','Direct','','New',210000,4,['untouched'],'B2C'],
      ['LD-1009','Harbor Foods','Imran K','medium','Direct','u2','Interested',180000,2,['calls_done'],'B2C'],
      ['LD-1010','Maple Dental','Rina D','low','Direct','u3','Callback',90000,1,['calls_pending'],'B2C'],
      ['LD-1011','Sparrow Logistics','Joel M','low','Direct','u2','Not Interested',0,0,['calls_done'],'B2C'],
      ['LD-1012','Quartz Interiors','Neha B','medium','Direct','u3','RNR',120000,1,['calls_pending'],'B2C'],
      ['LD-1013','Willow Schools','Anil G','medium','Direct','u2','Have a Requirement in future',350000,30,['calls_done'],'B2C']
    ].map((r, i) => ({ id: 'l' + (i + 1), number: r[0], company: r[1], contact: r[2], email: r[2].split(' ')[0].toLowerCase() + '@' + r[1].split(' ')[0].toLowerCase() + '.example', priority: r[3], source: r[4], assignedTo: r[5], status: r[6], estimatedValue: r[7], currency: 'INR', nextAction: iso(r[8]), flags: r[9], leadType: r[10], service: ['Website','CRM setup','Analytics'][i % 3], serviceId: ['s1','s2','s3'][i % 3], partnerId: r[4] === 'Partner' ? 'p' + ((i % 3) + 1) : '', createdAt: iso(-i * 3), updatedAt: iso(-i * 2), notes: i === 1 ? [{ text: 'Asked for a revised quote', internal: false, at: iso(-1), author: 'Ravi Nair' }] : [], hasNewNote: i === 1, deleted: false, convertedAt: r[6] === 'Won' ? iso(-9) : null, activities: [{ id: 'a' + i, description: 'Lead created', at: iso(-i * 3) }] })),
    customers: [
      { id: 'c1', code: 'CUS-001', company: 'Greenfield Farms', contact: 'Leena J', owner: 'u2' },
      { id: 'c2', code: 'CUS-002', company: 'Sunrise Dental', contact: 'Dr. Rao', owner: 'u3' }
    ],
    proposals: [
      { id: 'pr1', title: 'CRM rollout - Zenith Foods', lead: 'LD-1002', amount: 900000, status: 'sent' },
      { id: 'pr2', title: 'Analytics - Delta Logistics', lead: 'LD-1005', amount: 1250000, status: 'draft' }
    ],
    conflicts: [{ id: 'cf1', account: 'Crown Hotels', matchedOn: 'Company name', partners: ['Northwind Advisory','Bluepeak Consulting'] }],
    approvals: [
      { id: 'a1', incentiveNumber: 'INC-0001', partner: 'Northwind Advisory', lead: 'LD-1006', service: 'Website', amount: 30000, currency: 'INR', rule: 'Standard 5%', eligible: true, status: 'pending_approval', since: iso(-6), recordedBy: 'u1' },
      { id: 'a2', incentiveNumber: 'INC-0002', partner: 'Bluepeak Consulting', lead: 'LD-1002', service: 'CRM setup', amount: 54000, currency: 'INR', rule: 'Standard 6%', eligible: false, status: 'awaiting_eligibility', since: iso(-2), recordedBy: 'u3' },
      { id: 'a3', incentiveNumber: 'INC-0003', partner: 'Northwind Advisory', lead: 'LD-1001', service: 'Analytics', amount: 25000, currency: 'INR', rule: 'Analytics flat fee', eligible: true, status: 'approved_unpaid', since: iso(-12), recordedBy: 'u3' }
    ],
    collections: [
      { id: 'co1', project: 'Greenfield rollout', due: iso(-6), amount: 200000, currency: 'INR', status: 'overdue' },
      { id: 'co2', project: 'Sunrise CRM', due: iso(8), amount: 150000, currency: 'INR', status: 'upcoming' }
    ],
    rules: [
      { id: 'r1', name: 'Standard 5%', description: 'General rule', partnerId: '', partnerCategoryId: '', partnerTierId: '', serviceId: '', serviceCategoryId: '', handlingType: '', calculationType: 'percentage', percentage: 5, fixedAmount: '', tiers: [], tierMode: 'flat', minDealValue: '', maxDealValue: '', currency: '', eligibilityCondition: 'on_first_payment', eligibilityThresholdPct: '', effectiveFrom: '2026-01-01', effectiveUntil: '', status: 'active' },
      { id: 'r2', name: 'CRM, large deals', description: '', partnerId: '', partnerCategoryId: 'Consultancy', partnerTierId: '', serviceId: 's2', serviceCategoryId: '', handlingType: '', calculationType: 'percentage', percentage: 6, fixedAmount: '', tiers: [], tierMode: 'flat', minDealValue: 500000, maxDealValue: '', currency: '', eligibilityCondition: 'on_full_payment', eligibilityThresholdPct: '', effectiveFrom: '2026-01-01', effectiveUntil: '', status: 'active' },
      { id: 'r3', name: 'Analytics flat fee', description: '', partnerId: '', partnerCategoryId: '', partnerTierId: '', serviceId: 's3', serviceCategoryId: '', handlingType: '', calculationType: 'fixed', percentage: '', fixedAmount: 25000, tiers: [], tierMode: 'flat', minDealValue: '', maxDealValue: '', currency: '', eligibilityCondition: 'on_conversion', eligibilityThresholdPct: '', effectiveFrom: '2026-03-01', effectiveUntil: '', status: 'active' },
      { id: 'r4', name: 'Northwind website tiers', description: '', partnerId: 'p1', partnerCategoryId: '', partnerTierId: '', serviceId: 's1', serviceCategoryId: '', handlingType: '', calculationType: 'tiered', percentage: '', fixedAmount: '', tiers: [{ min: 0, max: 200000, rate: 4 }, { min: 200000, max: null, rate: 7 }], tierMode: 'flat', minDealValue: '', maxDealValue: '', currency: 'INR', eligibilityCondition: 'on_payment_percentage', eligibilityThresholdPct: 50, effectiveFrom: '2026-02-01', effectiveUntil: '', status: 'active' }
    ],
    services: [
      { id: 's1', name: 'Website', category: 'Build', defaultAmount: 300000, defaultPct: 3, archived: false },
      { id: 's2', name: 'CRM setup', category: 'Build', defaultAmount: 800000, defaultPct: 3, archived: false },
      { id: 's3', name: 'Analytics', category: 'Insight', defaultAmount: 250000, defaultPct: 2, archived: false }
    ],
    departments: [{ id: 'd1', name: 'Sales' }, { id: 'd2', name: 'Operations' }, { id: 'd3', name: 'Management' }],
    designations: [{ id: 'g1', name: 'Executive', department: 'Sales' }, { id: 'g2', name: 'Manager', department: 'Sales' }, { id: 'g3', name: 'Director', department: 'Management' }],
    projects: [
      { id: 'pj1', name: 'Greenfield rollout', type: 'Implementation', status: 'active', priority: 'High' },
      { id: 'pj2', name: 'Sunrise CRM', type: 'Implementation', status: 'awaiting_kickoff', priority: 'Normal' }
    ],
    tasks: [
      { id: 't1', title: 'Kickoff call', project: 'Greenfield rollout', sprint: 'Week 43', assignee: 'u2', status: 'In progress', priority: 'High', type: 'Project', progress: 40, deadline: iso(-1), blocked: false, blockedReason: '', extended: false, carryOverCount: 1 },
      { id: 't2', title: 'Data import', project: 'Greenfield rollout', sprint: 'Week 43', assignee: 'u3', status: 'To do', priority: 'Normal', type: 'Project', progress: 0, deadline: iso(2), blocked: false, blockedReason: '', extended: true, carryOverCount: 0 },
      { id: 't3', title: 'Training deck', project: 'Sunrise CRM', sprint: '', assignee: '', status: 'To do', priority: 'Normal', type: 'Project', progress: 0, deadline: iso(5), blocked: false, blockedReason: '', extended: false, carryOverCount: 0 },
      { id: 't4', title: 'Access request', project: 'Sunrise CRM', sprint: 'Week 43', assignee: 'u2', status: 'Blocked', priority: 'High', type: 'Project', progress: 10, deadline: iso(1), blocked: true, blockedReason: 'Waiting for the client IT team', extended: false, carryOverCount: 0 },
      { id: 't5', title: 'Weekly report', project: '', sprint: 'Week 43', assignee: 'u3', status: 'To do', priority: 'Normal', type: 'General', progress: 0, deadline: iso(0), blocked: false, blockedReason: '', extended: false, carryOverCount: 0 }
    ],
    sprints: [
      { id: 'sp1', name: 'Week 43', kind: 'weekly', start: iso(-3).slice(0, 10), end: iso(3).slice(0, 10) },
      { id: 'sp2', name: 'Week 42', kind: 'weekly', start: iso(-10).slice(0, 10), end: iso(-4).slice(0, 10) },
      { id: 'sp3', name: 'Today', kind: 'daily', start: iso(0).slice(0, 10), end: iso(0).slice(0, 10) }
    ],
    targets: [],
    pipeline: { new: { probability: 5, days: 7 }, contacted: { probability: 10, days: 7 }, qualified: { probability: 25, days: 14 }, initial_discussion: { probability: 40, days: 14 }, proposal_sent: { probability: 60, days: 10 }, negotiation: { probability: 80, days: 7 } },
    contracts: [{ id: 'ct1', client: 'Greenfield Farms', plan: 'Gold', ends: iso(25), status: 'active' }],
    tickets: [{ id: 'tk1', client: 'Greenfield Farms', detail: 'Report export fails', severity: 'HIGH', status: 'open', raised: iso(-1) }],
    attendance: [],
    audit: [],
    settings: { lead_protection_days: 90, timezone: 'UTC', idleThresholdSeconds: 60, heartbeatSeconds: 30, workingDays: [1, 2, 3, 4, 5], shiftStart: '09:30' }
  });
  let db;
  const load = () => { try { db = JSON.parse(localStorage.getItem(KEY)); } catch (e) { db = null; } if (!db) db = seed(); };
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch (e) { /* storage may be unavailable */ } };
  load();
  const uid = () => 'x' + Math.random().toString(36).slice(2, 9);
  const delay = (v) => new Promise((r) => setTimeout(() => r(JSON.parse(JSON.stringify(v))), 40));
  const fail = (status, message) => Promise.reject(Object.assign(new Error(message), { status }));
  const tokens = { get: () => { try { return JSON.parse(localStorage.getItem(TOK) || 'null'); } catch (e) { return null; } }, set: (t) => { try { localStorage.setItem(TOK, JSON.stringify(t)); } catch (e) { /* ignore */ } }, clear: () => { try { localStorage.removeItem(TOK); } catch (e) { /* ignore */ } } };
  const me = () => { const t = tokens.get(); return t && db.users.find((u) => u.id === t.userId); };
  const log = (action, type, id) => { const u = me(); db.audit.unshift({ id: uid(), at: new Date().toISOString(), by: u ? u.name : 'System', action, type, recordId: id }); save(); };
  const pub = (u) => { const c = Object.assign({}, u); delete c.password; return c; };
  const COLL = { '/customers': 'customers', '/proposals': 'proposals', '/services': 'services', '/operations/tasks': 'tasks', '/operations/projects': 'projects', '/support/contracts': 'contracts', '/support/tickets': 'tickets', '/users': 'users', '/org/departments': 'departments', '/org/designations': 'designations' };
  function filterRows(rows, q) {
    const text = (q.q || '').toLowerCase();
    return rows.filter((r) => !r.deleted || q.includeDeleted === 'true').filter((r) => !text || JSON.stringify(r).toLowerCase().includes(text)).filter((r) => Object.keys(q).every((k) => ['q','page','pageSize','includeDeleted'].includes(k) || q[k] === '' || String(r[k]) === q[k]));
  }
  // ---- leads ----
  const leadOut = (l) => Object.assign({}, l, { statusKey: keyOf(l.status), latestNote: l.notes.length ? l.notes[l.notes.length - 1] : null });
  function leadList(q) {
    let rows = db.leads.filter((l) => q.includeDeleted === 'true' || !l.deleted);
    const t = (q.q || '').toLowerCase();
    if (t) rows = rows.filter((l) => [l.company, l.contact, l.number, l.email].some((v) => String(v).toLowerCase().includes(t)));
    if (q.statusId) rows = rows.filter((l) => keyOf(l.status) === q.statusId);
    if (q.serviceId) rows = rows.filter((l) => l.serviceId === q.serviceId);
    if (q.leadType) rows = rows.filter((l) => l.leadType === q.leadType);
    if (q.leadSourceId) rows = rows.filter((l) => l.source === q.leadSourceId);
    if (q.assignedUserId) rows = rows.filter((l) => l.assignedTo === q.assignedUserId);
    if (q.unassigned === 'true') rows = rows.filter((l) => !l.assignedTo);
    if (q.priority) rows = rows.filter((l) => l.priority === q.priority);
    if (q.createdFrom) rows = rows.filter((l) => l.createdAt.slice(0, 10) >= q.createdFrom.slice(0, 10));
    if (q.createdTo) rows = rows.filter((l) => l.createdAt.slice(0, 10) <= q.createdTo.slice(0, 10));
    if (q.focus && FOCUS.includes(q.focus)) rows = rows.filter((l) => l.flags.includes(q.focus));
    const by = ['company', 'estimatedValue', 'updatedAt'].includes(q.sortBy) ? q.sortBy : 'updatedAt', dir = q.sortDir === 'asc' ? 1 : -1;
    rows = rows.slice().sort((a, b) => (a[by] > b[by] ? 1 : a[by] < b[by] ? -1 : 0) * dir);
    const size = Math.min(200, Number(q.pageSize) || 25), total = rows.length, pageCount = Math.max(1, Math.ceil(total / size)), page = Math.min(pageCount, Math.max(1, Number(q.page) || 1));
    return { rows: rows.slice((page - 1) * size, page * size).map(leadOut), total, page, pageSize: size, pageCount };
  }
  function leadStatus(l, b) {
    const to = b.statusKey;
    if (!STATUSES.some((s) => s.key === to)) return fail(400, 'Unknown status.');
    if (l.status === 'Won') return fail(409, 'A won lead cannot be moved.');
    if (to === 'won') return fail(409, 'A lead becomes Won only when its conversion is recorded.');
    if (to === 'lost') { if (!LOSS.some((r) => r.id === b.lossReasonId)) return fail(400, 'Choose why the lead was lost.'); l.lossReason = LOSS.find((r) => r.id === b.lossReasonId).name; }
    if (FOLLOWUP_REQUIRED.includes(to)) { if (!b.nextFollowUp || !String(b.comment || '').trim()) return fail(400, nameOf(to) + ' needs a next follow-up date and a comment.'); l.nextAction = new Date(b.nextFollowUp).toISOString(); }
    if (b.comment && String(b.comment).trim()) l.notes.push({ text: String(b.comment).trim(), internal: true, at: new Date().toISOString(), author: (me() || {}).name });
    l.status = nameOf(to); l.updatedAt = new Date().toISOString(); l.activities.unshift({ id: uid(), description: 'Moved to ' + l.status, at: l.updatedAt });
    log('moved to ' + l.status, 'lead', l.id); save(); return delay(leadOut(l));
  }
  // ---- payout rules ----
  const inRange = (r, date) => (!r.effectiveFrom || date >= r.effectiveFrom) && (!r.effectiveUntil || date <= r.effectiveUntil);
  function ruleAmount(rule, base, deal) {
    if (rule.calculationType === 'fixed') return { amount: Number(rule.fixedAmount) || 0, rate: null, steps: [{ label: 'Fixed amount', value: Number(rule.fixedAmount) || 0 }] };
    if (rule.calculationType === 'tiered') {
      const bands = (rule.tiers || []).slice().sort((a, b) => a.min - b.min);
      if (rule.tierMode === 'graduated') { let sum = 0; const steps = []; bands.forEach((t) => { const top = t.max == null ? base : Math.min(base, t.max), part = Math.max(0, top - t.min); if (part > 0) { const v = part * t.rate / 100; sum += v; steps.push({ label: 'Band from ' + t.min + (t.max == null ? ' (no upper limit)' : ' to ' + t.max) + ' at ' + t.rate + '%', value: v }); } }); return { amount: sum, rate: base ? sum * 100 / base : 0, steps }; }
      const band = bands.find((t) => deal >= t.min && (t.max == null || deal < t.max)) || bands[bands.length - 1] || { rate: 0 };
      return { amount: base * band.rate / 100, rate: band.rate, steps: [{ label: 'Band rate (whole base)', value: band.rate + '%' }, { label: 'Base x rate', value: base * band.rate / 100 }] };
    }
    const pct = Number(rule.percentage) || 0; return { amount: base * pct / 100, rate: pct, steps: [{ label: 'Rate', value: pct + '%' }, { label: 'Eligible base x rate', value: base * pct / 100 }] };
  }
  function simulate(b) {
    const deal = Number(b.dealValue), collected = b.collected === '' || b.collected == null ? 0 : Number(b.collected);
    const partner = db.partners.find((p) => p.id === b.partnerId), service = db.services.find((s) => s.id === b.serviceId);
    if (!partner || !service || !(deal >= 0)) return fail(400, 'Choose a partner, a service and a valid deal value.');
    const date = (b.evaluationDate || new Date().toISOString()).slice(0, 10), cur = b.currency || partner.defaultCurrency;
    const cands = [], rejected = [];
    db.rules.filter((r) => r.status === 'active').forEach((r) => {
      const why = [], dims = []; let score = 0;
      const dim = (val, actual, label, pts) => { if (!val) return; if (val === actual) { score += pts; dims.push(label); } else why.push('different ' + label); };
      dim(r.partnerId, partner.id, 'partner', 100); dim(r.partnerTierId, partner.tier, 'partner tier', 40); dim(r.partnerCategoryId, partner.category, 'partner category', 30);
      dim(r.serviceId, service.id, 'service', 60); dim(r.serviceCategoryId, service.category, 'service category', 20);
      if (r.currency) { if (r.currency === cur) { score += 5; dims.push('currency'); } else why.push('different currency'); }
      if (r.minDealValue !== '' && deal < Number(r.minDealValue)) why.push('deal value below the minimum'); else if (r.minDealValue !== '') { score += 5; dims.push('minimum deal value'); }
      if (r.maxDealValue !== '' && deal > Number(r.maxDealValue)) why.push('deal value above the maximum');
      if (!inRange(r, date)) why.push('not in effect on ' + date);
      why.length ? rejected.push({ id: r.id, name: r.name, reason: why.join(', ') }) : cands.push({ r, score, dims });
    });
    cands.sort((a, c) => c.score - a.score || (c.r.effectiveFrom > a.r.effectiveFrom ? 1 : -1));
    let win, tie = false, note = '';
    if (cands.length) { win = cands[0]; if (cands[1] && cands[1].score === win.score) { tie = true; note = 'The rule with the later effective date was chosen.'; } }
    else win = { r: { id: 'default', name: 'Service default (' + service.defaultPct + '%)', calculationType: 'percentage', percentage: service.defaultPct, eligibilityCondition: 'on_conversion' }, score: 0, dims: [], isDefault: true };
    const r = win.r, thr = Number(r.eligibilityThresholdPct) || 0; let eligible = true, reason = '', base = deal;
    if (r.eligibilityCondition === 'on_first_payment') { eligible = collected > 0; base = Math.min(collected, deal) || deal; if (!eligible) reason = 'No payment has been received yet.'; }
    if (r.eligibilityCondition === 'on_full_payment') { eligible = collected >= deal && deal > 0; if (!eligible) reason = 'The deal is not fully paid yet.'; }
    if (r.eligibilityCondition === 'on_payment_percentage') { const pct = deal ? collected * 100 / deal : 0; eligible = pct >= thr; if (!eligible) reason = 'Only ' + pct.toFixed(1) + '% collected; needs ' + thr + '%.'; }
    const calc = ruleAmount(r, base, deal);
    return delay({ matched: true, currency: cur, winner: { id: r.id, name: r.name, score: win.score, matchedDimensions: win.dims, isServiceDefault: !!win.isDefault, eligibilityCondition: r.eligibilityCondition }, eligibility: { eligible, reason, eligibleBase: base }, tieBreakApplied: tie, tieBreakNote: note, calculation: { effectiveRate: calc.rate, amount: calc.amount, steps: calc.steps }, runnersUp: cands.slice(1).map((c) => ({ id: c.r.id, name: c.r.name, lostBecause: 'Lower specificity (score ' + c.score + ' against ' + win.score + ')' + (c.score === win.score ? ' and an earlier effective date' : '') })), rejected });
  }
  // ---- what-if: replay deals against a draft payout rule ----
  // Nothing is saved: the draft is swapped in for the run, then the real rules are put back.
  async function whatIf(b) {
    let d = b.draft || {}; if (!['percentage', 'fixed'].includes(d.calculationType)) return fail(400, 'Choose percentage or fixed amount for the draft rule.');
    if (d.calculationType === 'percentage' && (d.percentage === '' || d.percentage == null || !(Number(d.percentage) >= 0))) return fail(400, 'Enter the draft percentage.');
    if (d.calculationType === 'fixed' && (d.fixedAmount === '' || d.fixedAmount == null || !(Number(d.fixedAmount) >= 0))) return fail(400, 'Enter the draft fixed amount.');
    const deals = db.leads.filter((l) => !l.deleted && l.partnerId && l.serviceId && (l.status === 'Won' || (b.includeOpen && l.status !== 'Lost')));
    const original = db.rules, rows = [];
    const base = original.find((r) => r.id === (b.replaceId || '')) || {};
    const scope = {}; ['partnerId', 'partnerCategoryId', 'partnerTierId', 'serviceId', 'serviceCategoryId', 'handlingType', 'currency', 'effectiveFrom', 'effectiveUntil'].forEach((k) => { if (base[k] !== undefined && base[k] !== '') scope[k] = base[k]; });
    d = Object.assign({}, d); ['partnerId', 'serviceId', 'partnerCategoryId', 'partnerTierId', 'serviceCategoryId'].forEach((k) => { if (d[k] === '' || d[k] == null) delete d[k]; });
    if (base.id && (d.minDealValue === '' || d.minDealValue == null)) { d = Object.assign({}, d, { minDealValue: base.minDealValue, maxDealValue: base.maxDealValue }); }
    const draft = Object.assign({ id: 'draft', name: 'Draft rule', description: '', partnerId: '', partnerCategoryId: '', partnerTierId: '', serviceId: '', serviceCategoryId: '', handlingType: '', percentage: '', fixedAmount: '', tiers: [], tierMode: 'flat', minDealValue: '', maxDealValue: '', currency: '', eligibilityCondition: 'on_conversion', eligibilityThresholdPct: '', effectiveFrom: new Date().toISOString().slice(0, 10), effectiveUntil: '', status: 'active' }, scope, d, { id: 'draft', status: 'active', minDealValue: d.minDealValue === '' || d.minDealValue == null ? '' : Number(d.minDealValue), maxDealValue: d.maxDealValue === '' || d.maxDealValue == null ? '' : Number(d.maxDealValue) });
    const run = async (l) => { try { return await simulate({ partnerId: l.partnerId, serviceId: l.serviceId, dealValue: l.estimatedValue, collected: l.estimatedValue }); } catch (e) { return null; } };
    try {
      for (const l of deals) {
        db.rules = original; const now_ = await run(l);
        db.rules = original.filter((r) => r.id !== (b.replaceId || '')).concat([draft]); const then_ = await run(l);
        if (!now_ || !then_) continue;
        const cur = now_.eligibility.eligible ? now_.calculation.amount : 0, nxt = then_.eligibility.eligible ? then_.calculation.amount : 0;
        rows.push({ leadId: l.id, number: l.number, company: l.company, partner: (db.partners.find((p) => p.id === l.partnerId) || {}).name || '', dealValue: l.estimatedValue, actual: l.status === 'Won', currentRule: now_.winner.name, draftRule: then_.winner.name, draftApplies: then_.winner.id === 'draft', current: cur, proposed: nxt, change: nxt - cur, currentEligible: now_.eligibility.eligible, proposedEligible: then_.eligibility.eligible });
      }
    } finally { db.rules = original; }
    const sum = (k, f) => rows.filter(f || (() => true)).reduce((a, r) => a + r[k], 0);
    return delay({ rows, totals: { current: sum('current'), proposed: sum('proposed'), change: sum('change'), affected: rows.filter((r) => r.draftApplies).length, increases: rows.filter((r) => r.change > 0).length, decreases: rows.filter((r) => r.change < 0).length }, note: rows.length ? '' : 'There are no partner deals to replay yet.' });
  }
  // ---- attendance ----
  const todayStr = () => new Date().toISOString().slice(0, 10);
  const openRec = (u) => db.attendance.find((a) => a.userId === u.id && a.status === 'open');
  const accrue = (rec) => { const t = Date.now(), d = Math.min(120, Math.max(0, (t - rec.lastBeat) / 1000)); rec.lastBeat = t; const s = rec.trackingState; rec.totals.attendanceSeconds += d; if (s === 'active') rec.totals.activeSeconds += d; else if (s === 'idle') rec.totals.idleSeconds += d; else if (s === 'hidden') rec.totals.hiddenSeconds += d; };
  const policy = () => ({ idleThresholdSeconds: db.settings.idleThresholdSeconds, heartbeatSeconds: db.settings.heartbeatSeconds, timezone: db.settings.timezone, workingDays: db.settings.workingDays, shiftStart: db.settings.shiftStart });
  function dashboard() {
    const open = db.leads.filter((l) => !l.deleted && !['Won','Lost'].includes(l.status));
    const partnerLeads = db.leads.filter((l) => l.source === 'Partner'), direct = db.leads.filter((l) => l.source !== 'Partner');
    const rate = (a) => a.length ? Math.round(a.filter((l) => l.status === 'Won').length * 100 / a.length) : 0;
    return { overdue: open.filter((l) => new Date(l.nextAction) < new Date()).length, dueToday: open.filter((l) => new Date(l.nextAction).toDateString() === new Date().toDateString()).length, myOpen: open.length, unassigned: open.filter((l) => !l.assignedTo).length, activePartners: db.partners.filter((p) => p.status === 'Active').length, conflicts: db.conflicts.length, expiring: db.partners.filter((p) => new Date(p.expires) - now < 30 * day).length, partnerRate: rate(partnerLeads), directRate: rate(direct), leaderboard: db.partners.map((p) => ({ name: p.name, revenue: db.leads.filter((l) => l.partnerId === p.id && l.status === 'Won').reduce((s, l) => s + l.estimatedValue, 0) })).sort((a, b) => b.revenue - a.revenue), funnel: { awaiting: db.approvals.filter((a) => a.eligible).length, notEligible: db.approvals.filter((a) => !a.eligible).length } };
  }
  async function mock(method, path, body) {
    const [p, qs] = path.split('?'); const q = Object.fromEntries(new URLSearchParams(qs || '')); body = body || {};
    if (p === '/auth/login') { const u = db.users.find((x) => x.email === String(body.email).toLowerCase()); if (!u || u.password !== body.password) return fail(401, 'Incorrect email or password.'); if (u.status !== 'Active') return fail(403, 'This account is not active.'); tokens.set({ userId: u.id }); return delay({ accessToken: 'mock', refreshToken: 'mock', user: pub(u) }); }
    if (p === '/auth/logout') { tokens.clear(); return delay({}); }
    if (p === '/auth/forgot-password' || p === '/auth/reset-password-otp' || p === '/auth/change-password') return delay({ ok: true });
    if (p.startsWith('/public/') && window.MOCK_PUBLIC) { const r = await window.MOCK_PUBLIC({ method, p, q, body, db, delay, fail, save, log, uid, iso }); if (r !== undefined) return r; }
    const u = me(); if (!u) return fail(401, 'Not signed in');
    if (p === '/auth/me') return delay(pub(u));
    if (window.MOCK_EXT) { const r = await window.MOCK_EXT({ method, p, q, body, db, u, delay, fail, save, log, uid, keyOf, nameOf, iso }); if (r !== undefined) return r; }
    if (p === '/dashboards/me') return delay(dashboard());
    if (p === '/incentive-rules/simulate') return simulate(body);
    if (p === '/incentive-rules/what-if' && method === 'POST') return whatIf(body);
    if (p === '/incentive-rules' || p.startsWith('/incentive-rules/')) {
      const id = p.slice('/incentive-rules/'.length);
      if (method === 'GET') return delay(db.rules.filter((r) => q.includeArchived === 'true' || r.status !== 'archived'));
      if (method === 'POST') { if (!String(body.name || '').trim()) return fail(400, 'Give the rule a name.'); if (!db.rules.length || true) { const r = Object.assign({ id: uid() }, body); db.rules.unshift(r); log('created rule', 'incentive_rule', r.id); save(); return delay(r); } }
      const r = db.rules.find((x) => x.id === id); if (!r) return fail(404, 'Rule not found');
      if (method === 'PATCH' || method === 'PUT') { Object.assign(r, body); log('updated rule', 'incentive_rule', id); save(); return delay(r); }
      if (method === 'DELETE') { db.rules = db.rules.filter((x) => x.id !== id); log('deleted rule', 'incentive_rule', id); save(); return delay({ ok: true }); }
    }
    if (p === '/leads' && method === 'GET') return delay(leadList(q));
    if (p === '/leads' && method === 'POST') { if (!String(body.company || '').trim()) return fail(400, 'Company is required.'); const l = Object.assign({ id: uid(), number: 'LD-' + (1000 + db.leads.length + 1), status: 'New', priority: 'medium', leadType: 'B2C', source: 'Direct', currency: 'INR', service: '', serviceId: '', partnerId: '', assignedTo: '', estimatedValue: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), nextAction: iso(1), flags: ['untouched'], notes: [], hasNewNote: false, deleted: false, activities: [{ id: uid(), description: 'Lead created', at: new Date().toISOString() }] }, body); db.leads.unshift(l); log('created', 'lead', l.id); save(); return delay(leadOut(l)); }
    if (p === '/leads/unassigned') return delay(db.leads.filter((l) => !l.assignedTo && !l.deleted));
    if (p === '/leads/conflicts') return delay(db.conflicts);
    if (p === '/leads/my-day') return delay(db.leads.filter((l) => !l.deleted && !['Won','Lost'].includes(l.status)));
    if (p === '/leads/bulk-delete') { const out = { deleted: 0, skipped: [] }; (body.leadIds || []).forEach((id) => { const l = db.leads.find((x) => x.id === id); if (!l) return; if (l.status === 'Won') out.skipped.push({ companyName: l.company, reason: 'Already converted' }); else { l.deleted = true; l.deletedAt = new Date().toISOString(); out.deleted++; } }); log('bulk delete' + (body.reason ? ': ' + body.reason : ''), 'lead', (body.leadIds || []).join(',')); save(); return delay(out); }
    if (p === '/users/bulk-reassign') { (body.leadIds || []).forEach((id) => { const l = db.leads.find((x) => x.id === id); if (l) { l.assignedTo = body.returnToQueue ? '' : body.assignedUserId; l.updatedAt = new Date().toISOString(); } }); log('bulk reassign', 'lead', (body.leadIds || []).join(',')); save(); return delay({ ok: true }); }
    let m = p.match(/^\/leads\/([^/]+)\/(status|assign|convert|notes|restore|notes\/seen)$/);
    if (m) {
      const l = db.leads.find((x) => x.id === m[1]); if (!l) return fail(404, 'Lead not found');
      if (m[2] === 'status') return leadStatus(l, body);
      if (m[2] === 'assign') { l.assignedTo = body.userId; }
      if (m[2] === 'convert') { if (l.status === 'Won') return fail(409, 'Already converted.'); l.status = 'Won'; l.convertedAt = new Date().toISOString(); l.flags = (l.flags || []).concat('won'); if (body.amount) l.estimatedValue = Number(body.amount); }
      if (m[2] === 'notes') { l.notes.push({ text: body.text, internal: !!body.internal, at: new Date().toISOString(), author: u.name }); }
      if (m[2] === 'restore') { l.deleted = false; delete l.deletedAt; }
      if (m[2] === 'notes/seen') l.hasNewNote = false;
      l.updatedAt = new Date().toISOString(); log(m[2] + ' lead', 'lead', l.id); save(); return delay(leadOut(l));
    }
    m = p.match(/^\/leads\/([^/]+)$/);
    if (m && method === 'GET') { const l = db.leads.find((x) => x.id === m[1]); return l ? delay(leadOut(l)) : fail(404, 'Lead not found'); }
    if (p === '/audit') return delay(db.audit);
    if (p === '/settings') { if (method === 'PUT') { Object.assign(db.settings, body); log('updated settings', 'system_setting', 'settings'); } return delay(db.settings); }
    if (p === '/notifications') return delay(db.leads.filter((l) => !l.assignedTo && !l.deleted).slice(0, 3).map((l) => ({ id: l.id, text: l.company + ' is waiting for an owner' })));
    if (p === '/users/assignees') return delay(db.users.filter((x) => !x.partner).map((x) => ({ id: x.id, name: x.name })));
    if (p === '/services/lookups') return delay({ services: db.services.filter((s) => !s.archived), partners: db.partners, statuses: STATUSES, sources: [{ id: 'Direct', name: 'Direct' }, { id: 'Partner', name: 'Partner' }], lossReasons: LOSS, serviceCategories: [...new Set(db.services.map((s) => s.category))], partnerCategories: [...new Set(db.partners.map((x) => x.category))], partnerTiers: [...new Set(db.partners.map((x) => x.tier))] });
    if (p === '/users/permission-matrix') return delay({ permissions: ALL, roles: ['Super Admin','Sales Manager','Sales Executive'] });
    if (p === '/finance/collections-due') return delay(db.collections);
    if (p === '/incentives/approval-queue') return delay(db.approvals);
    if (p === '/attendance/me/today') { const r = openRec(u) || db.attendance.find((a) => a.userId === u.id && a.day === todayStr()) || null; return delay({ serverTime: new Date().toISOString(), record: r, policy: policy() }); }
    if (p === '/attendance/punch-in') { if (openRec(u)) return delay({ ok: true }); const t = new Date().toISOString(); db.attendance.unshift({ id: uid(), userId: u.id, user: u.name, day: todayStr(), in: t, out: null, status: 'open', trackingState: 'active', lastBeat: Date.now(), totals: { attendanceSeconds: 0, activeSeconds: 0, idleSeconds: 0, hiddenSeconds: 0 } }); log('punched in', 'attendance', u.id); save(); return delay({ ok: true }); }
    if (p === '/attendance/punch-out') { const r = openRec(u); if (r) { accrue(r); r.status = 'closed'; r.out = new Date().toISOString(); log('punched out', 'attendance', u.id); save(); } return delay({ ok: true }); }
    if (p === '/attendance/activity/transition' || p === '/attendance/activity/heartbeat') { const r = openRec(u); if (!r) return fail(409, 'Your day is already closed.'); accrue(r); if (body.state) r.trackingState = body.state; save(); return delay({ state: r.trackingState }); }
    if (p === '/attendance/me/history' || p === '/attendance/admin/records') return delay(db.attendance.filter((a) => p === '/attendance/admin/records' || a.userId === u.id));
    if (p === '/portal/dashboard') return delay({ code: u.partner ? u.partner.code : '', leads: db.leads.filter((l) => l.partnerId === (u.partner && u.partner.id)), paused: false });
    const base = Object.keys(COLL).sort((a, b) => b.length - a.length).find((k) => p === k || p.startsWith(k + '/'));
    if (base) {
      const rows = db[COLL[base]], id = p.slice(base.length + 1);
      if (method === 'GET' && !id) { const f = filterRows(rows, q), size = Number(q.pageSize) || 25, page = Number(q.page) || 1; return delay({ rows: f.slice((page - 1) * size, page * size), total: f.length, page }); }
      if (method === 'POST') { const row = Object.assign({ id: uid(), createdAt: new Date().toISOString(), deleted: false }, body); rows.unshift(row); log('created', COLL[base], row.id); save(); return delay(row); }
      const row = rows.find((x) => x.id === id); if (!row) return fail(404, 'Not found');
      if (method === 'PATCH' || method === 'PUT') { Object.assign(row, body); log('updated', COLL[base], id); save(); return delay(row); }
      if (method === 'DELETE') { row.deleted = true; row.archived = true; log('deleted', COLL[base], id); save(); return delay({ ok: true }); }
      return delay(row);
    }
    return fail(404, 'No mock for ' + p);
  }
  async function real(method, path, body) {
    const t = tokens.get(); const h = {}; if (body !== undefined) h['Content-Type'] = 'application/json'; if (t && t.accessToken) h.Authorization = 'Bearer ' + t.accessToken;
    const r = await fetch(CFG.apiBase + '/api' + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
    const txt = await r.text(); const j = txt ? JSON.parse(txt) : null;
    if (!r.ok) throw Object.assign(new Error(Array.isArray(j && j.message) ? j.message.join('. ') : (j && j.message) || 'Request failed'), { status: r.status });
    if (path === '/auth/login' && j) tokens.set({ accessToken: j.accessToken, refreshToken: j.refreshToken });
    return j;
  }
  const call = CFG.apiBase ? real : mock;
  window.api = { mode: CFG.apiBase ? 'live' : 'mock', STATUSES, FOLLOWUP_REQUIRED, CONVERSION_READY: ['qualified', 'initial_discussion', 'proposal_sent', 'negotiation'], ALL, get: (p) => call('GET', p), post: (p, b) => call('POST', p, b), patch: (p, b) => call('PATCH', p, b), put: (p, b) => call('PUT', p, b), del: (p, b) => call('DELETE', p, b), demoLogin: CFG.apiBase ? null : (email) => call('POST', '/auth/login', { email, password: 'WorkOS-demo-12345' }), reset: () => { db = seed(); save(); } };
})();
