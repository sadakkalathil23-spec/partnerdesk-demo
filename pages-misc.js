// Unassigned queue, ownership conflicts (with a decision dialog) and collections.
(() => {
  const W = WorkOS, esc = W.esc, F = W.field, reg = W.register;
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const dt = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  const head = (t, s, meta) => '<h1>' + esc(t) + (meta ? ' <small style="font-size:14px;font-weight:400;color:var(--ink-m)">' + esc(meta) + '</small>' : '') + '</h1><p class="sub">' + esc(s) + '</p>';
  const human = (s) => { const t = String(s).replace(/[._]+/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
  const TONE = { red: 'background:#FDF1F0', amber: 'background:#FCF6E8' };

  // ---------------- unassigned ----------------
  reg('/unassigned', { perm: ['LEAD_ASSIGN'], render: async (el) => {
    const draw = async () => {
      const [d, users] = await Promise.all([api.get('/leads/unassigned'), api.get('/users/assignees')]), rows = d.rows;
      el.innerHTML = head('Unassigned', 'Leads that nobody owns yet. Give each one an owner. Longest-waiting first: amber after 4 hours, red after 24.', rows.length + ' waiting')
        + (rows.length ? '<table><thead><tr><th>Company</th><th>Waiting for an owner</th><th>Contact</th><th>Partner</th><th>Service</th><th>Country</th><th>Lead created</th><th></th></tr></thead><tbody>' + rows.map((r) => '<tr style="' + (TONE[r.ageTone] || '') + '"><td><b>' + esc(r.companyName) + '</b></td><td>' + (r.ageTone === 'neutral' ? esc(r.ageLabel) : '<span class="tag ' + (r.ageTone === 'red' ? 'bad' : 'warn') + '">' + esc(r.ageLabel) + '</span>') + '</td><td>' + esc(r.contactName || '-') + '</td><td>' + esc(r.partner ? r.partner.companyName : '-') + '</td><td>' + esc(r.service ? r.service.name : '-') + '</td><td>' + esc(r.country) + '</td><td>' + dt(r.createdAt) + '</td><td><button class="btn sm primary" data-a="' + r.id + '">Assign</button></td></tr>').join('') + '</tbody></table>' : '<div class="empty"><b>No unassigned leads.</b><p>Every lead has an owner. A new lead that arrives without one will appear here.</p></div>');
      el.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => { const r = rows.find((x) => x.id === b.dataset.a); W.modal('Assign ' + r.companyName, F('assignedUserId', 'Assign to', 'select', { options: [{ value: '', label: 'Choose someone...' }].concat(users.map((u) => ({ value: u.id, label: u.name + ' — ' + u.openLeads + ' open · ' + u.role.name }))) }) + '<p class="sub">Each name shows how many open leads that person already has, so you can share the work evenly.</p>', async (v) => { if (!v.assignedUserId) throw new Error('Choose who should own this lead.'); await api.post('/leads/' + r.id + '/assign', { assignedUserId: v.assignedUserId }); W.toast('Assigned ' + r.companyName); draw(); }, 'Assign'); }; });
    };
    await draw();
  } });

  // ---------------- conflicts ----------------
  reg('/conflicts', { perm: ['PARTNER_CONFLICT_DECIDE'], render: async (el) => {
    const draw = async () => {
      const rows = await api.get('/leads/conflicts');
      el.innerHTML = head('Conflicts', 'Two partners have submitted the same account. Decide here who keeps it, before the deal converts.', rows.length ? rows.length + ' listed' : '')
        + (rows.length ? '<table><thead><tr><th>Account</th><th>Matched on</th><th>Currently registered to</th><th>Raised</th><th></th></tr></thead><tbody>' + rows.map((r) => '<tr><td><b>' + esc(r.existingLead.companyName) + '</b></td><td><span class="tag">' + esc(human(r.matchType)) + '</span></td><td>' + esc(r.existingLead.partner ? r.existingLead.partner.companyName : '-') + '</td><td>' + dt(r.createdAt) + '</td><td><button class="btn sm primary" data-d="' + r.id + '" title="Review both submissions and decide">Adjudicate</button></td></tr>').join('') + '</tbody></table>' : '<div class="empty"><b>No conflicts waiting for a decision.</b><p>Every duplicate submission has been decided. A new one appears here when a partner submits an account another partner already registered.</p></div>');
      el.querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => { const r = rows.find((x) => x.id === b.dataset.d), a = r.existingLead.partner, c = r.challenger.partner;
        W.modal('Decide: ' + r.existingLead.companyName, '<div class="two"><div class="card"><small>First submission</small><br><b>' + esc(a.companyName) + '</b><br><small>registered first, currently holds the account</small></div><div class="card"><small>Second submission</small><br><b>' + esc(c.companyName) + '</b><br><small>' + esc(r.challenger.contact || '') + ' · ' + dt(r.challenger.submittedAt) + '</small></div></div><p class="sub">Matched on: ' + esc(human(r.matchType)) + '. Only one partner can keep the account; the other is told it was declined.</p>' + F('winnerPartnerId', 'Who keeps the account?', 'select', { options: [{ value: '', label: 'Choose...' }, { value: a.id, label: a.companyName + ' (keeps it)' }, { value: c.id, label: c.companyName + ' (takes it over)' }] }) + F('reason', 'Reason (at least 5 characters; kept in the audit log)', 'textarea'), async (v) => { if (!v.winnerPartnerId) throw new Error('Choose which partner keeps the account.'); await api.post('/leads/conflicts/' + r.id + '/decide', { winnerPartnerId: v.winnerPartnerId, reason: v.reason }); W.toast('Decision recorded.'); draw(); }, 'Record decision'); }; });
    };
    await draw();
  } });

  // ---------------- collections ----------------
  const CSTAT = { due: 'Due', partially_paid: 'Partially paid', pending: 'Pending' }, TRIG = { milestone_accepted: 'A milestone was accepted', on_signing: 'The deal was signed', support_renewal: 'A support contract renewed' };
  reg('/finance/collections', { perm: ['PAYMENT_RECORD'], render: async (el) => {
    let status = '', untriggered = false;
    const draw = async () => {
      const p = new URLSearchParams({ pageSize: '100' }); if (status) p.set('status', status); if (untriggered) p.set('includeUntriggered', 'true');
      const d = await api.get('/finance/collections-due?' + p.toString()), rows = d.rows, tot = {}; rows.forEach((r) => { tot[r.currency] = (tot[r.currency] || 0) + r.outstanding; });
      el.querySelector('#tot').innerHTML = Object.keys(tot).length ? '<div class="card" style="margin-bottom:12px"><small>Outstanding</small><strong>' + Object.keys(tot).map((c) => esc(c + ' ' + tot[c].toLocaleString('en-IN'))).join('<br>') + '</strong><em>Adds up the ' + plural(rows.length, 'instalment') + ' listed below' + (d.total > rows.length ? ' (of ' + d.total + ' that match)' : '') + ', one total per currency.</em></div>' : '';
      el.querySelector('#cnt').textContent = rows.length + ' of ' + d.total + ' shown, oldest first';
      el.querySelector('#body').innerHTML = rows.length ? '<table><thead><tr><th>Client</th><th>Instalment</th><th title="The milestone or event that made this instalment due">Became due because of</th><th>Outstanding</th><th title="Days since the instalment fell due">Days overdue</th><th>Sales owner</th><th>Status</th></tr></thead><tbody>' + rows.map((r) => '<tr><td><b>' + esc(r.client.companyName) + '</b><br><small>' + esc(r.conversionNumber) + (r.project ? ' · ' + esc(r.project.name) : '') + '</small></td><td>' + esc(r.label) + (r.percentage ? ' <small>' + r.percentage + '%</small>' : '') + '</td><td>' + esc(r.milestone ? 'Milestone ' + r.milestone.sequence + ': ' + r.milestone.name : TRIG[r.trigger] || human(r.trigger)) + (r.triggered ? '' : ' <span class="tag">not yet due</span>') + '</td><td>' + esc(r.currency + ' ' + r.outstanding.toLocaleString('en-IN')) + '</td><td style="' + (r.daysOverdue > 30 ? 'color:var(--stop);font-weight:600' : '') + '">' + (r.triggered ? r.daysOverdue : '-') + '</td><td>' + esc(r.salesOwner ? r.salesOwner.name : '-') + '</td><td>' + W.tagFor(CSTAT[r.status]) + '</td></tr>').join('') + '</tbody></table>' : '<div class="empty"><b>' + (status || untriggered ? 'Nothing matches these filters.' : 'Nothing outstanding.') + '</b><p>' + (status ? 'No instalment has the status "' + esc(CSTAT[status]) + '". Choose "Everything owed" to see the rest.' : 'Either everything has been collected, or nothing has fallen due yet. An instalment appears here once the milestone it depends on is accepted.') + '</p></div>';
    };
    el.innerHTML = head('Collections', 'Every instalment that has fallen due and is not yet paid in full. When a client accepts a milestone, the instalment tied to it becomes due and appears here.') + '<div class="bar"><span style="flex:1"></span><button class="btn" id="rf">Refresh</button></div><div id="tot"></div><div class="bar"><select class="in" id="st" aria-label="Filter by status"><option value="">Everything owed</option>' + Object.keys(CSTAT).map((k) => '<option value="' + k + '">' + CSTAT[k] + '</option>').join('') + '</select><label><input type="checkbox" id="un"> Include instalments not yet due</label><span id="cnt" style="color:var(--ink-m)"></span></div><div id="body"></div>';
    el.querySelector('#st').onchange = (e) => { status = e.target.value; draw(); }; el.querySelector('#un').onchange = (e) => { untriggered = e.target.checked; draw(); }; el.querySelector('#rf').onclick = draw;
    await draw();
  } });
})();
