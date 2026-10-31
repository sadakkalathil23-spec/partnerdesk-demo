// Report engine: loads records, filters them, groups them and measures them. No screen code here, so it can be tested.
// Money is never added across currencies: a total or average is always for one currency, and the rest are reported as left out.
window.ReportEngine = (() => {
  const cap = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');
  const monthKey = (d) => { const t = d ? new Date(d) : null; return t && !isNaN(t) ? t.toISOString().slice(0, 7) : ''; };
  const monthLabel = (d) => { const k = monthKey(d); return k ? new Date(k + '-01T00:00:00Z').toLocaleDateString(undefined, { month: 'short', year: 'numeric', timeZone: 'UTC' }) : 'No date'; };
  const MEASURES = ['count', 'sum', 'avg'];

  // Pages through a list endpoint. Stops when everything is loaded, and never repeats a record.
  async function pages(path) {
    const seen = new Set(), rows = []; let page = 1, total = Infinity;
    for (let guard = 0; guard < 40 && rows.length < total; guard++) {
      const d = await api.get(path + (path.includes('?') ? '&' : '?') + 'pageSize=100&page=' + page), got = d.rows || [];
      let fresh = 0; got.forEach((r) => { const id = r.id || JSON.stringify(r); if (!seen.has(id)) { seen.add(id); rows.push(r); fresh++; } });
      total = d.total != null ? d.total : rows.length; if (!fresh) break; page++;
    }
    return rows;
  }

  // The sets of records a report can be built on.
  function datasets(can) {
    const out = {};
    out.leads = { label: 'Leads', noun: 'leads', needs: ['LEAD_VIEW_OWN', 'LEAD_VIEW_TEAM', 'LEAD_VIEW_ALL'],
      async load() { const [rows, people, lk] = await Promise.all([pages('/leads'), api.get('/users/assignees'), api.get('/services/lookups')]); const who = (id) => (people.find((u) => u.id === id) || {}).name || 'Unassigned', pn = (id) => (lk.partners.find((p) => p.id === id) || {}).name || 'Direct'; rows.forEach((r) => { r._owner = who(r.assignedTo); r._partner = pn(r.partnerId); }); return rows; },
      fields: { status: { label: 'Status', get: (r) => r.status }, priority: { label: 'Priority', get: (r) => cap(r.priority) }, source: { label: 'Source', get: (r) => r.source || 'None' }, owner: { label: 'Owner', get: (r) => r._owner }, partner: { label: 'Partner', get: (r) => r._partner }, service: { label: 'Service', get: (r) => r.service || 'None' }, type: { label: 'Type', get: (r) => r.leadType || 'None' }, created: { label: 'Created month', get: (r) => monthLabel(r.createdAt), key: (r) => monthKey(r.createdAt), time: true } },
      value: { label: 'Estimated value', get: (r) => Number(r.estimatedValue) || 0, currency: (r) => r.currency || 'INR' },
      columns: [['Lead', (r) => r.number], ['Company', (r) => r.company], ['Contact', (r) => r.contact], ['Status', (r) => r.status], ['Owner', (r) => r._owner], ['Estimated value', (r) => r.estimatedValue || 0], ['Currency', (r) => r.currency || ''], ['Created', (r) => (r.createdAt || '').slice(0, 10)]],
      href: (r) => '#/lead?id=' + r.id };
    const PS = { draft: 'Draft', pending_approval: 'Waiting for approval', approved: 'Approved', sent: 'Sent to client', accepted: 'Accepted', rejected: 'Declined', on_hold: 'On hold' };
    out.proposals = { label: 'Proposals', noun: 'proposals', needs: ['PRESALES_VIEW', 'LEAD_VIEW_ALL'],
      async load() { return pages('/proposals'); },
      fields: { status: { label: 'Status', get: (r) => PS[r.status] || r.status }, client: { label: 'Client', get: (r) => r.lead.companyName }, author: { label: 'Written by', get: (r) => (r.versions[0] || {}).createdByName || 'Unknown' }, versions: { label: 'Versions', get: (r) => String(r.currentVersion) }, created: { label: 'Created month', get: (r) => monthLabel((r.versions[r.versions.length - 1] || {}).createdAt), key: (r) => monthKey((r.versions[r.versions.length - 1] || {}).createdAt), time: true } },
      value: { label: 'Proposal value', get: (r) => Number((r.versions[0] || {}).contractValueNet) || 0, currency: (r) => (r.versions[0] || {}).currency || 'INR' },
      columns: [['Proposal', (r) => r.proposalNumber], ['Client', (r) => r.lead.companyName], ['Status', (r) => PS[r.status] || r.status], ['Value', (r) => (r.versions[0] || {}).contractValueNet || 0], ['Currency', (r) => (r.versions[0] || {}).currency || ''], ['Open until', (r) => ((r.versions[0] || {}).validUntil || '').slice(0, 10)]],
      href: (r) => '#/proposal?id=' + r.id };
    const OWE = { due: 'Due', pending: 'Not yet due', partially_paid: 'Partly paid' }, bucket = (d) => (d > 60 ? 'Over 60 days late' : d > 30 ? '31 to 60 days late' : d > 0 ? '1 to 30 days late' : 'Not late');
    out.payments = { label: 'Payments owed', noun: 'instalments', needs: ['PAYMENT_RECORD'],
      async load() { return pages('/finance/collections-due?includeUntriggered=true'); },
      fields: { status: { label: 'Status', get: (r) => OWE[r.status] || r.status }, client: { label: 'Client', get: (r) => (r.client || {}).companyName || 'Unknown' }, owner: { label: 'Sales owner', get: (r) => (r.salesOwner || {}).name || 'None' }, late: { label: 'How late', get: (r) => bucket(r.daysOverdue || 0), key: (r) => String(Math.min(3, Math.ceil((r.daysOverdue || 0) / 30))), time: true }, trigger: { label: 'Due when', get: (r) => String(r.trigger || '').replace(/_/g, ' ') } },
      value: { label: 'Outstanding amount', get: (r) => Number(r.outstanding) || 0, currency: (r) => r.currency || 'INR' },
      columns: [['Instalment', (r) => r.label], ['Client', (r) => (r.client || {}).companyName], ['Outstanding', (r) => r.outstanding], ['Currency', (r) => r.currency], ['Status', (r) => OWE[r.status] || r.status], ['Days late', (r) => r.daysOverdue || 0]],
      href: () => '#/finance/collections' };
    out.tasks = { label: 'Tasks', noun: 'tasks', needs: ['OPS_VIEW_OWN', 'OPS_VIEW_ALL'],
      async load() { const [rows, people] = await Promise.all([pages('/operations/tasks'), api.get('/users/assignees')]); rows.forEach((r) => { r._owner = (people.find((u) => u.id === r.assignee) || {}).name || 'Unassigned'; }); return rows; },
      fields: { status: { label: 'Status', get: (r) => r.status }, priority: { label: 'Priority', get: (r) => r.priority }, owner: { label: 'Assigned to', get: (r) => r._owner }, project: { label: 'Project', get: (r) => r.project || 'None' }, type: { label: 'Type', get: (r) => r.type || 'None' }, due: { label: 'Deadline month', get: (r) => monthLabel(r.deadline), key: (r) => monthKey(r.deadline), time: true } },
      value: { label: 'Progress %', get: (r) => Number(r.progress) || 0, currency: null },
      columns: [['Task', (r) => r.title], ['Project', (r) => r.project], ['Status', (r) => r.status], ['Priority', (r) => r.priority], ['Assigned to', (r) => r._owner], ['Progress %', (r) => r.progress || 0], ['Deadline', (r) => (r.deadline || '').slice(0, 10)]],
      href: null };
    Object.keys(out).forEach((k) => { if (can && !can(out[k].needs)) delete out[k]; });
    return out;
  }

  const matches = (row, f, fields) => { const x = String(f.value == null ? '' : f.value).trim().toLowerCase(); if (!x) return true; const v = String(fields[f.field].get(row) == null ? '' : fields[f.field].get(row)).toLowerCase(); return f.op === 'is' ? v === x : f.op === 'isnot' ? v !== x : v.includes(x); };

  // Turns records into groups with a count and (for money or numbers) a total or average.
  function run(rows, ds, cfg) {
    const f = ds.fields[cfg.groupBy]; if (!f) throw new Error('Choose what to group by.');
    if (!MEASURES.includes(cfg.measure)) throw new Error('Choose how to measure.');
    const valued = cfg.measure !== 'count' && !!ds.value; if (cfg.measure !== 'count' && !ds.value) throw new Error('This data has nothing to add up.');
    const kept = rows.filter((r) => (cfg.filters || []).every((x) => ds.fields[x.field] && matches(r, x, ds.fields)));
    let used = kept, currency = '', currencies = [], excluded = 0;
    if (valued && ds.value.currency) {
      const tally = {}; kept.forEach((r) => { const c = ds.value.currency(r); tally[c] = (tally[c] || 0) + 1; });
      currencies = Object.keys(tally).sort((a, b) => tally[b] - tally[a]); currency = currencies.includes(cfg.currency) ? cfg.currency : currencies[0] || '';
      used = kept.filter((r) => ds.value.currency(r) === currency); excluded = kept.length - used.length;
    }
    const map = new Map();
    used.forEach((r) => { const k = String(f.key ? f.key(r) : f.get(r)); if (!map.has(k)) map.set(k, { key: k, label: String(f.get(r)), rows: [] }); map.get(k).rows.push(r); });
    const groups = [...map.values()].map((g) => { const sum = valued ? g.rows.reduce((a, r) => a + ds.value.get(r), 0) : 0; return Object.assign(g, { count: g.rows.length, sum, value: cfg.measure === 'count' ? g.rows.length : cfg.measure === 'sum' ? sum : sum / g.rows.length }); });
    groups.sort(f.time ? (a, b) => (a.key < b.key ? -1 : 1) : (a, b) => b.value - a.value || a.label.localeCompare(b.label));
    const all = valued ? used.reduce((a, r) => a + ds.value.get(r), 0) : 0;
    const total = cfg.measure === 'count' ? used.length : cfg.measure === 'sum' ? all : used.length ? all / used.length : 0;
    return { groups, total, records: used, matched: kept.length, excluded, currency, currencies, valueLabel: valued ? ds.value.label : '' };
  }
  return { run, datasets, pages, matches, MEASURES, monthKey, monthLabel };
})();
