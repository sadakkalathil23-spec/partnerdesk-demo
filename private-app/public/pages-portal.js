// Partner portal: overview, all leads, submit a lead (with a protection receipt).
(() => {
  const W = WorkOS, esc = W.esc, F = W.field, reg = W.register;
  const num = (n, c) => (c ? c + ' ' : '') + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const dt = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  const head = (t, s) => '<h1>' + esc(t) + '</h1><p class="sub">' + s + '</p>';
  const STATES = [['earned', 'Earned, awaiting eligibility'], ['eligible', 'Eligible, with our finance team'], ['approved', 'Approved, awaiting payment'], ['paid', 'Paid']];
  const leadTable = (rows) => '<table><thead><tr><th>Company</th><th>Service</th><th>Submitted</th><th>Status</th></tr></thead><tbody>' + rows.map((r) => '<tr><td><b>' + esc(r.companyName) + '</b></td><td>' + esc(r.serviceName || '-') + '</td><td>' + dt(r.submittedAt) + '</td><td>' + W.tagFor(r.status) + '</td></tr>').join('') + '</tbody></table>';

  reg('/partner', { render: async (el) => {
    const [d, l] = await Promise.all([api.get('/portal/dashboard'), api.get('/portal/leads?pageSize=25')]), rows = l.rows, none = d.leads.total === 0;
    const prot = rows.filter((r) => r.protectionActive).slice(0, 5), first = rows.slice(0, 6), earn = d.earningsByCurrency, cv = d.convertedValueByCurrency;
    el.innerHTML = '<div class="bar"><div style="flex:1">' + head('Overview', esc(d.partner.companyName) + ' · <span class="mono" title="Your partner code">' + esc(d.partner.partnerCode) + '</span>').replace('<p class="sub">', '<p class="sub" style="margin:0">') + '</div>' + (d.blocked ? '' : '<a class="btn primary" href="#/partner/submit" style="text-decoration:none">Submit a lead</a>') + '</div>'
      + (d.blocked ? '<div class="alert warn" style="margin-bottom:14px"><b>New submissions are paused</b>' + esc(d.blocked.message) + '</div>' : '')
      + (none ? '<div class="empty"><b>You have not submitted a lead yet.</b><p>When you refer a company to us, you get a receipt with the date your registration is protected until, and you can follow its progress here.</p>' + (d.blocked ? '' : '<a class="btn" href="#/partner/submit" style="text-decoration:none">Submit a lead</a>') + '</div>' : ''
        + '<div class="card" style="margin-bottom:14px"><b>Your incentives</b><p class="sub" style="margin:2px 0 8px;font-size:12px">what you have earned and been paid, by currency</p>' + (earn.length ? earn.map((e) => '<div style="margin:10px 0"><b>' + esc(e.currency) + '</b>' + STATES.map((s) => '<div><small>' + s[1] + '</small><span style="float:right">' + esc(num(e[s[0]], e.currency)) + '</span></div>').join('') + '</div>').join('') : '<p>No incentives yet. They appear here once a lead you referred converts.</p>') + '<p class="sub" style="font-size:12px">Each incentive is paid in the currency of its deal. Amounts in different currencies are never converted or added together.</p></div>'
        + '<div class="cards"><div class="card"><small>Leads submitted</small><strong>' + d.leads.total + '</strong><em>' + d.leads.closed + ' closed</em></div><div class="card"><small>In progress</small><strong>' + d.leads.inProgress + '</strong><em>not yet converted or closed</em></div><div class="card"><small>Converted</small><strong>' + d.leads.converted + '</strong><em>' + d.leads.conversionRate + '% of the leads you submitted</em></div><div class="card"><small>Converted value</small><strong>' + (cv[0] ? esc(num(cv[0].amount, cv[0].currency)) : '-') + '</strong><em>' + cv.slice(1).map((x) => '+ ' + esc(num(x.amount, x.currency))).join(' ') + ' excluding tax; your incentives are calculated from this amount</em></div></div>'
        + '<div class="card" style="margin-bottom:14px"><div class="bar" style="margin:0"><b>My leads</b><small class="sub">showing ' + first.length + ' of ' + d.leads.total + '</small><span style="flex:1"></span><a href="#/partner/leads">See all leads</a></div>' + leadTable(first) + '</div>'
        + '<div class="card"><b>Lead protection</b><p class="sub" style="margin:2px 0 8px;font-size:12px">companies registered to you, and until when</p>' + (prot.length ? prot.map((r) => '<div style="margin:6px 0"><b>' + esc(r.companyName) + '</b><span style="float:right">protected until ' + dt(r.protectedUntil) + '</span></div>').join('') : '<p>None of your leads is inside its protection period right now.</p>') + '</div>');
  } });

  reg('/partner/leads', { render: async (el) => {
    const l = await api.get('/portal/leads?pageSize=200');
    el.innerHTML = head('My leads', 'Every company you have submitted, and where it stands.') + (l.rows.length ? leadTable(l.rows) + '<p class="sub">Protected until: ' + l.rows.filter((r) => r.protectionActive).length + ' of your leads are still inside their protection period.</p>' : '<div class="empty"><b>You have not submitted a lead yet.</b></div>');
  } });

  reg('/partner/submit', { render: async (el) => {
    const d = await api.get('/portal/dashboard');
    if (d.blocked) { el.innerHTML = head('Submit a lead', 'Register a company you are referring to us.') + '<div class="alert warn"><b>New submissions are paused</b>' + esc(d.blocked.message) + '</div>'; return; }
    el.innerHTML = head('Submit a lead', 'Register a company you are referring to us. Once accepted, it is protected in your name for a set period.') + '<form id="f" class="card" style="max-inline-size:520px"><div id="msg"></div>' + F('company', 'Company', 'text', { required: true }) + F('contact', 'Contact person', 'text') + F('email', 'Contact email', 'email') + F('service', 'Service they are interested in', 'text') + '<button class="btn primary">Submit lead</button></form>';
    el.querySelector('#f').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target, msg = el.querySelector('#msg');
      try { const r = await api.post('/portal/leads', { company: f.company.value, contact: f.contact.value, email: f.email.value, service: f.service.value }); el.innerHTML = head('Lead received', 'Keep this receipt for your records.') + '<div class="card" style="max-inline-size:520px"><div class="alert ok" style="margin-bottom:12px"><b>' + esc(f.company ? 'Registered' : '') + '</b>This company is now registered to you.</div><dl class="kv"><dt>Company</dt><dd>' + esc(f.company.value) + '</dd><dt>Registered on</dt><dd>' + esc(dt(new Date())) + '</dd><dt>Protected until</dt><dd><b>' + esc(dt(r.protectedUntil)) + '</b></dd></dl><p><a href="#/partner">Back to overview</a></p></div>'; }
      catch (er) { msg.innerHTML = '<div class="alert danger" style="margin-bottom:10px">' + esc(er.message) + '</div>'; }
    };
  } });
})();
