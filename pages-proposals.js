// Proposals: list, detail with versions + approval + sending, editor, and the public client sign page.
(() => {
  const W = WorkOS, esc = W.esc, F = W.field, reg = W.register;
  const STAT = { draft: 'Draft', pending_approval: 'Waiting for approval', approved: 'Approved', sent: 'Sent to client', accepted: 'Accepted', rejected: 'Declined', on_hold: 'On hold', expired: 'Expired' };
  const num = (n, c) => (c ? c + ' ' : '') + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const day = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  const when = (d) => d ? new Date(d).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const inDays = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return ymd(d); };
  const tag = (s) => W.tagFor(STAT[s] || s);
  const itemsTable = (v) => '<table><thead><tr><th>Item</th><th style="text-align:right">Qty</th><th style="text-align:right">Price</th><th style="text-align:right">Amount</th></tr></thead><tbody>' + v.items.map((i) => '<tr><td>' + esc(i.description) + '</td><td style="text-align:right">' + i.qty + '</td><td style="text-align:right">' + num(i.unitPrice) + '</td><td style="text-align:right">' + num(i.qty * i.unitPrice) + '</td></tr>').join('') + '<tr><td colspan="3" style="text-align:right"><b>Total</b></td><td style="text-align:right"><b>' + num(v.contractValueNet != null ? v.contractValueNet : v.total, v.currency) + '</b></td></tr></tbody></table>';
  const schedule = (list, total, cur) => '<table><thead><tr><th>Instalment</th><th style="text-align:right">Share</th><th style="text-align:right">Amount</th></tr></thead><tbody>' + list.map((i) => '<tr><td>' + esc(i.label) + '</td><td style="text-align:right">' + i.percentage + '%</td><td style="text-align:right">' + num(i.amount != null ? i.amount : total * i.percentage / 100, cur) + '</td></tr>').join('') + '</tbody></table>';

  // ---------- editor (new proposal, or a new version) ----------
  async function editor(opts, saved) {
    const base = opts.base, newOne = !base;
    let leads = [];
    if (newOne) { const d = await api.get('/leads?pageSize=100'); leads = d.rows.filter((l) => !['won', 'lost'].includes(l.statusKey)); }
    const rowItem = (i) => '<div class="pr-item row2"><input class="in" data-k="d" placeholder="What you are offering" value="' + esc(i.description) + '" aria-label="Item description"><input class="in" data-k="q" type="number" min="0" step="any" value="' + i.qty + '" aria-label="Quantity" style="max-width:70px"><input class="in" data-k="p" type="number" min="0" step="any" value="' + i.unitPrice + '" aria-label="Price" style="max-width:110px"><button type="button" class="btn sm" data-rm aria-label="Remove line">&times;</button></div>';
    const rowIns = (i) => '<div class="pr-ins row2"><input class="in" data-k="l" placeholder="e.g. On signing" value="' + esc(i.label) + '" aria-label="Instalment name"><input class="in" data-k="s" type="number" min="0" step="any" value="' + i.percentage + '" aria-label="Percent" style="max-width:90px"><span>%</span><button type="button" class="btn sm" data-rm aria-label="Remove instalment">&times;</button></div>';
    const v = base ? base.versions[0] : { items: [{ description: '', qty: 1, unitPrice: '' }], instalments: [{ label: 'On signing', percentage: 50 }, { label: 'On delivery', percentage: 50 }], terms: 'Payment as per the schedule. Prices exclude taxes.', validUntil: inDays(14), currency: 'INR' };
    const body = (newOne ? F('leadId', 'Lead', 'select', { options: [{ value: '', label: 'Choose a lead...' }].concat(leads.map((l) => ({ value: l.id, label: l.company + ' (' + l.number + ')' }))) }) : '<p class="sub">' + esc(base.lead.companyName) + ' &middot; new version ' + (base.currentVersion + 1) + '. Earlier versions are kept.</p>')
      + '<div class="fld"><label>Line items</label><div id="items">' + v.items.map(rowItem).join('') + '</div><button type="button" class="btn sm" id="addi">+ Add line</button></div>'
      + '<div class="fld"><label>Payment schedule (must add up to 100%)</label><div id="inss">' + v.instalments.map(rowIns).join('') + '</div><button type="button" class="btn sm" id="addn">+ Add instalment</button> <small id="sum"></small></div>'
      + F('validUntil', 'Offer stays open until', 'date', { value: ymd(new Date(v.validUntil || inDays(14))) }) + F('terms', 'Terms', 'textarea', { value: v.terms || '' }) + (newOne ? '' : F('note', 'What changed? (optional)', 'text'));
    const m = W.modal(newOne ? 'New proposal' : 'New version of ' + base.proposalNumber, body, async (d, form) => {
      const items = [...form.querySelectorAll('.pr-item')].map((r) => ({ description: r.querySelector('[data-k=d]').value, qty: r.querySelector('[data-k=q]').value, unitPrice: r.querySelector('[data-k=p]').value }));
      const instalments = [...form.querySelectorAll('.pr-ins')].map((r) => ({ label: r.querySelector('[data-k=l]').value, percentage: r.querySelector('[data-k=s]').value }));
      if (newOne && !d.leadId) throw new Error('Choose the lead this proposal is for.');
      const out = newOne ? await api.post('/proposals', { leadId: d.leadId, items, instalments, validUntil: d.validUntil, terms: d.terms }) : await api.post('/proposals/' + base.id + '/versions', { items, instalments, validUntil: d.validUntil, terms: d.terms, note: d.note, currency: v.currency });
      W.toast(newOne ? 'Proposal created.' : 'Version ' + out.currentVersion + ' saved.'); saved(out);
    }, 'Save');
    const el = m.el, sum = () => { const t = [...el.querySelectorAll('.pr-ins [data-k=s]')].reduce((a, i) => a + (Number(i.value) || 0), 0); const s = el.querySelector('#sum'); s.textContent = 'Total ' + Math.round(t * 100) / 100 + '%'; s.style.color = Math.abs(t - 100) < 0.001 ? 'var(--good)' : 'var(--stop)'; };
    const wire = () => { el.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = () => { const host = b.parentNode.parentNode; if (host.children.length > 1) b.parentNode.remove(); sum(); }; }); el.querySelectorAll('.pr-ins [data-k=s]').forEach((i) => { i.oninput = sum; }); };
    el.querySelector('#addi').onclick = () => { el.querySelector('#items').insertAdjacentHTML('beforeend', rowItem({ description: '', qty: 1, unitPrice: '' })); wire(); };
    el.querySelector('#addn').onclick = () => { el.querySelector('#inss').insertAdjacentHTML('beforeend', rowIns({ label: '', percentage: '' })); wire(); };
    wire(); sum();
  }

  // ---------- list ----------
  reg('/proposals', { perm: ['PRESALES_VIEW', 'LEAD_VIEW_ALL'], render: async (el) => {
    let status = '';
    const draw = async () => {
      const d = await api.get('/proposals?pageSize=100' + (status ? '&status=' + status : '')), rows = d.rows;
      el.querySelector('#count').textContent = rows.length + (rows.length === 1 ? ' proposal' : ' proposals');
      el.querySelector('#body').innerHTML = rows.length ? '<table><thead><tr><th>Proposal</th><th>Client</th><th>Value</th><th>Status</th><th>Offer open until</th></tr></thead><tbody>' + rows.map((r) => { const v = r.versions[0]; return '<tr class="click" data-id="' + esc(r.id) + '" style="cursor:pointer"><td><a href="#/proposal?id=' + esc(r.id) + '"><b>' + esc(r.proposalNumber) + '</b></a> <small>v' + r.currentVersion + '</small></td><td>' + esc(r.lead.companyName) + ' <small class="mono">' + esc(r.lead.leadNumber) + '</small></td><td>' + (v ? esc(num(v.contractValueNet, v.currency)) : '-') + '</td><td>' + tag(r.status) + '</td><td>' + (v && v.validUntil ? day(v.validUntil) : '-') + '</td></tr>'; }).join('') + '</tbody></table>' : '<div class="empty"><b>' + (status ? 'No proposals with this status.' : 'No proposals yet.') + '</b><p>Write a proposal for a lead, send it for approval, then share a link the client can sign.</p><button class="btn primary" id="es-new">New proposal</button></div>';
      el.querySelectorAll('tr.click').forEach((t) => { t.onclick = (e) => { if (!e.target.closest('a')) location.hash = '#/proposal?id=' + t.dataset.id; }; });
      const en = el.querySelector('#es-new'); if (en) en.onclick = () => el.querySelector('#newp').click();
    };
    el.innerHTML = '<h1>Proposals</h1><p class="sub">Write a proposal, get it approved, send the client a link to accept and sign. Accepting creates the customer and the payment schedule.</p><div class="bar"><select class="in" id="st" aria-label="Filter by status"><option value="">All proposals</option>' + Object.keys(STAT).filter((k) => k !== 'expired').map((k) => '<option value="' + k + '">' + STAT[k] + '</option>').join('') + '</select><span id="count" style="color:var(--ink-m)"></span><span style="flex:1"></span><button class="btn primary" id="newp">New proposal</button></div><div id="body"></div>';
    el.querySelector('#st').onchange = (e) => { status = e.target.value; draw(); };
    el.querySelector('#newp').onclick = () => editor({}, (p) => { location.hash = '#/proposal?id=' + p.id; });
    await draw();
  } });

  // ---------- detail ----------
  reg('/proposal', { perm: ['PRESALES_VIEW', 'LEAD_VIEW_ALL'], render: async (el, qp) => {
    if (!qp.id) { el.innerHTML = '<div class="empty">No proposal was chosen. <a href="#/proposals">Back to proposals</a></div>'; return; }
    const me = W.user(), approver = W.can('CONVERSION_CREATE');
    async function draw() {
      const p = await api.get('/proposals/' + qp.id), v = p.versions[0], mine = v.createdBy === me.id, act = async (path, body, msg) => { try { await api.post('/proposals/' + p.id + '/' + path, body || {}); if (msg) W.toast(msg); await draw(); } catch (e) { W.toast(e.message); } };
      const btn = (id, label, cls) => '<button class="btn ' + (cls || '') + '" id="' + id + '">' + label + '</button>';
      let actions = '';
      if (p.status === 'draft') actions = btn('nv', 'Edit as new version') + btn('sub', 'Submit for approval', 'primary');
      if (p.status === 'pending_approval') actions = (approver && !mine ? btn('ok', 'Approve', 'primary') + btn('no', 'Send back') : '') + btn('nv', 'Edit as new version');
      if (p.status === 'approved') actions = btn('nv', 'Edit as new version') + btn('send', 'Send to client', 'primary');
      if (p.status === 'sent') actions = btn('nv', 'Edit as new version') + btn('wd', 'Withdraw');
      const wait = p.status === 'pending_approval' && !(approver && !mine) ? '<div class="alert warn" style="margin-bottom:12px">Waiting for ' + (mine ? 'a different sales manager' : 'a sales manager') + ' to approve. Proposals over ' + num(p.approvalLimit) + ' need a second person.</div>' : '';
      const rej = p.lastRejection && p.status === 'draft' ? '<div class="alert warn" style="margin-bottom:12px"><b>Sent back by ' + esc(p.lastRejection.by) + ':</b> ' + esc(p.lastRejection.reason) + '</div>' : '';
      const sent = p.status === 'sent' && p.link ? '<div class="card" style="margin-bottom:12px"><b>Client link</b><p class="sub" style="margin:4px 0 8px">Share this link. The client reads the proposal and signs without an account.' + (WORKOS_CONFIG.brand.demo ? ' <i>Demo: the link works in this browser.</i>' : '') + '</p><div class="bar" style="margin:0"><input class="in" id="lnk" readonly style="flex:1;min-width:220px" value="' + esc(location.href.split('#')[0] + p.link) + '"><button class="btn" id="cp">Copy</button><a class="btn" target="_blank" rel="noopener" href="' + esc(p.link) + '">Open client view</a></div></div>' : '';
      const done = p.status === 'accepted' && p.acceptance ? '<div class="alert ok" style="margin-bottom:12px"><b>Signed by ' + esc(p.acceptance.name) + '</b> (' + esc(p.acceptance.email) + ') on ' + when(p.acceptance.at) + '. Document fingerprint <code>' + esc(p.acceptance.fingerprint) + '</code>.' + (p.customer ? '<br>Customer: <a href="#/customers?q=' + encodeURIComponent(p.customer.companyName) + '">' + esc(p.customer.companyName) + ' (' + esc(p.customer.clientCode) + ')</a>. The payment schedule is in <a href="#/finance/collections">Collections</a>.' : '') + '</div>' : '';
      el.innerHTML = '<div class="bar" style="margin-bottom:4px"><a href="#/proposals">&larr; Proposals</a></div><h1>' + esc(p.proposalNumber) + ' <small style="font-size:14px;font-weight:400">version ' + p.currentVersion + '</small> ' + tag(p.status) + '</h1><p class="sub">' + esc(p.lead.companyName) + ' &middot; <a href="#/lead?id=' + esc(p.lead.id) + '">' + esc(p.lead.leadNumber) + '</a> &middot; offer open until ' + day(v.validUntil) + '</p>'
        + rej + wait + done + sent + (actions ? '<div class="bar">' + actions + '</div>' : '')
        + '<div class="card" style="margin-bottom:12px"><h3 style="margin-top:0">What the client will see</h3>' + itemsTable(v) + '<h4>Payment schedule</h4>' + schedule(v.instalments, v.contractValueNet, v.currency) + (v.terms ? '<h4>Terms</h4><p>' + esc(v.terms) + '</p>' : '') + '</div>'
        + '<div class="cards"><div class="card"><h3 style="margin-top:0">Versions</h3><table><thead><tr><th>Version</th><th style="text-align:right">Value</th><th>By</th><th>When</th></tr></thead><tbody>' + p.versions.map((x, i) => { const older = p.versions[i + 1], diff = older ? x.contractValueNet - older.contractValueNet : 0; return '<tr><td><b>v' + x.number + '</b>' + (i === 0 ? ' <small>(current)</small>' : '') + (x.note ? '<br><small>' + esc(x.note) + '</small>' : '') + '</td><td style="text-align:right">' + num(x.contractValueNet) + (diff ? '<br><small style="color:' + (diff > 0 ? 'var(--good)' : 'var(--stop)') + '">' + (diff > 0 ? '+' : '-') + num(Math.abs(diff)) + '</small>' : '') + '</td><td>' + esc(x.createdByName) + '</td><td>' + when(x.createdAt) + '</td></tr>'; }).join('') + '</tbody></table></div>'
        + '<div class="card"><h3 style="margin-top:0">History</h3><div class="tl">' + p.events.map((e) => '<div><small>' + when(e.at) + ' &middot; ' + esc(e.who) + '</small><div>' + esc(e.text) + '</div></div>').join('') + '</div></div></div>';
      const q = (id) => el.querySelector(id);
      if (q('#nv')) q('#nv').onclick = () => editor({ base: p }, () => draw());
      if (q('#sub')) q('#sub').onclick = () => act('submit', {}, 'Submitted.');
      if (q('#ok')) q('#ok').onclick = () => act('approve', {}, 'Approved.');
      if (q('#no')) q('#no').onclick = () => W.modal('Send back to the author', F('reason', 'What needs to change?', 'textarea', { required: true }), async (d) => { await api.post('/proposals/' + p.id + '/reject', { reason: d.reason }); W.toast('Sent back.'); await draw(); }, 'Send back');
      if (q('#send')) q('#send').onclick = () => act('send', {}, 'Sent. Copy the client link below.');
      if (q('#wd')) q('#wd').onclick = () => { if (confirm('Withdraw this proposal? The client link will stop working.')) act('withdraw', {}, 'Withdrawn.'); };
      if (q('#cp')) q('#cp').onclick = async () => { try { await navigator.clipboard.writeText(q('#lnk').value); W.toast('Link copied.'); } catch (e) { q('#lnk').select(); W.toast('Press Ctrl+C to copy.'); } };
    }
    await draw();
  } });

  // ---------- public client page: read, accept and sign ----------
  reg('/sign', { render: async (el, qp) => {
    el.innerHTML = '<div class="sign"><div class="sign-box"><div class="empty">Loading...</div></div></div>';
    const box = el.querySelector('.sign-box'), B = WORKOS_CONFIG.brand;
    const shell = (inner) => { box.innerHTML = '<div class="sign-brand"><img src="mark.svg" alt="" width="28" height="28"> <b>' + esc(B.name) + '</b> <small>' + esc(B.company || '') + '</small></div>' + inner; };
    let d; try { d = await api.get('/public/proposal?token=' + encodeURIComponent(qp.t || '')); } catch (e) { shell('<h1>Proposal not available</h1><p>' + esc(e.message) + '</p>'); return; }
    const v = d.version, head = '<h1>Proposal ' + esc(d.number) + '</h1><p class="sub">Prepared for <b>' + esc(d.company) + '</b>' + (d.preparedBy ? ' by ' + esc(d.preparedBy) : '') + '. Open until ' + day(v.validUntil) + '.</p>';
    const doc = itemsTable(Object.assign({ contractValueNet: v.total }, v)) + '<h4>Payment schedule</h4>' + schedule(v.instalments, v.total, v.currency) + (v.terms ? '<h4>Terms</h4><p>' + esc(v.terms) + '</p>' : '');
    if (d.status === 'accepted') { shell(head + '<div class="alert ok">This proposal was accepted' + (d.acceptance ? ' by ' + esc(d.acceptance.name) + ' on ' + when(d.acceptance.at) : '') + '. Nothing more to do.</div>' + doc); return; }
    if (d.status !== 'sent') { shell(head + '<div class="alert warn">' + (d.status === 'expired' ? 'This offer has expired. Ask the sender for a new one.' : d.status === 'rejected' ? 'This proposal was declined.' : 'This proposal is not open for signing right now.') + '</div>'); return; }
    shell(head + doc + '<form id="sg" class="card" style="margin-top:16px"><h3 style="margin-top:0">Accept and sign</h3>' + F('name', 'Your full name (this is your signature)', 'text', { required: true }) + F('email', 'Your email', 'email', { required: true }) + '<label style="display:block;margin:8px 0"><input type="checkbox" name="agree"> I accept this proposal for ' + esc(num(v.total, v.currency)) + ' on the terms and payment schedule above.</label><div id="err"></div><div class="bar"><button class="btn primary">Accept and sign</button><button type="button" class="btn" id="dec">Decline</button></div><small>Document fingerprint ' + esc(d.fingerprint) + '. It changes if anything in the proposal is edited.</small></form>');
    const f = box.querySelector('#sg'), err = (m) => { box.querySelector('#err').innerHTML = '<div class="alert danger" style="margin-bottom:10px">' + esc(m) + '</div>'; };
    f.onsubmit = async (e) => {
      e.preventDefault();
      try { const r = await api.post('/public/proposal/sign', { token: qp.t, name: f.name.value, email: f.email.value, agree: f.agree.checked, fingerprint: d.fingerprint }); shell('<h1>Thank you</h1><div class="alert ok">Proposal ' + esc(r.number) + ' is accepted and signed. A copy of this confirmation is below; keep the fingerprint for your records.</div><p>Signed ' + when(r.at) + '<br>Fingerprint <code>' + esc(r.fingerprint) + '</code></p>'); } catch (er) { err(er.message); }
    };
    box.querySelector('#dec').onclick = () => { const why = prompt('Optional: tell us why you are declining.'); if (why === null) return; api.post('/public/proposal/decline', { token: qp.t, reason: why }).then(() => shell('<h1>Declined</h1><p>Thank you. The sender has been told.</p>')).catch((er) => err(er.message)); };
  } });
})();
