// Fifth batch of mock server rules (v3.3): proposals with versions, approval, sending, accept-and-sign,
// and turning an accepted proposal into a customer, a conversion and instalments.
// Replace with your real backend later (see api-ext.js). The sign-off rules below must run on the server.
(function () {
  const prev = window.MOCK_EXT, DAY = 86400000;
  const has = (u, ks) => ks.some((k) => u.permissions.includes(k));
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const iso = (d) => new Date(Date.now() + d * DAY).toISOString();
  const norm = (s) => String(s || '').toLowerCase().replace(/&/g, ' and ').replace(/\b(pvt|private|ltd|limited|llp|inc|co|company|corp|corporation)\b\.?/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  const plain = (x) => JSON.parse(JSON.stringify(x));
  const fmt = (n) => Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  // A short fingerprint of exactly what was shown to the client, so a later edit can be detected.
  const fingerprint = (v) => { const s = JSON.stringify([v.items, v.terms, v.instalments, v.contractValueNet, v.currency, v.validUntil]); let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0; return h.toString(16).padStart(8, '0'); };
  const totalOf = (items) => Math.round(items.reduce((a, i) => a + i.qty * i.unitPrice, 0) * 100) / 100;

  // The earlier batches create the sample proposals the first time they run, so let them seed before this one reshapes them.
  async function prime(ctx) { if (!ctx.db._v4 && prev) await prev(Object.assign({}, ctx, { p: '/__prime', method: 'GET' })); }
  function ensure(db) {
    if (db._v6 || !db.proposals) return; db._v6 = true;
    db.settings = db.settings || {}; if (db.settings.proposalApprovalLimit == null) db.settings.proposalApprovalLimit = 500000;
    const shape = (v, n, by) => { const val = Number(v.contractValueNet) || 0; return Object.assign({ number: n, items: [{ description: 'Services as discussed', qty: 1, unitPrice: val }], terms: 'Payment as per the schedule below. Prices exclude taxes.', instalments: [{ label: 'On signing', percentage: 50 }, { label: 'On delivery', percentage: 50 }], note: '', createdAt: iso(-10 + n), createdBy: by, createdByName: (db.users.find((x) => x.id === by) || {}).name || '' }, v, { number: n }); };
    db.proposals.forEach((p) => {
      const cur = p.versions[0], list = [shape(cur, p.currentVersion || 1, 'u2')];
      for (let n = (p.currentVersion || 1) - 1; n >= 1; n--) list.push(shape({ contractValueNet: Math.round(cur.contractValueNet * 0.94), currency: cur.currency, validUntil: iso(7) }, n, 'u2'));
      p.versions = list; p.events = [{ at: list[list.length - 1].createdAt, who: list[0].createdByName, text: 'Proposal created' }];
      if (p.status === 'sent') { p.signToken = 'zenith-demo'; p.events.push({ at: iso(-3), who: list[0].createdByName, text: 'Sent to the client' }); }
      if (p.status === 'accepted') { p.acceptance = { name: 'Leena J', email: 'leena@greenfield.example', at: iso(-9), fingerprint: fingerprint(list[0]) }; p.events.push({ at: iso(-9), who: 'Leena J', text: 'Accepted and signed by the client' }); p.customerId = 'c1'; }
    });
  }

  function clean(body, lead) {
    const items = (Array.isArray(body.items) ? body.items : []).map((i) => ({ description: String(i.description || '').trim(), qty: Number(i.qty), unitPrice: Number(i.unitPrice) }));
    if (!items.length || items.some((i) => !i.description)) return { error: 'Describe every line item.' };
    if (items.some((i) => !(i.qty > 0) || !(i.unitPrice >= 0))) return { error: 'Each line needs a quantity above zero and a price of zero or more.' };
    const total = totalOf(items); if (!(total > 0)) return { error: 'The proposal total must be above zero.' };
    const instalments = (Array.isArray(body.instalments) && body.instalments.length ? body.instalments : [{ label: 'On signing', percentage: 100 }]).map((i) => ({ label: String(i.label || '').trim(), percentage: Number(i.percentage) }));
    if (instalments.some((i) => !i.label || !(i.percentage > 0))) return { error: 'Each instalment needs a name and a percentage above zero.' };
    if (Math.abs(instalments.reduce((a, i) => a + i.percentage, 0) - 100) > 0.001) return { error: 'The instalments must add up to 100%.' };
    const until = new Date(body.validUntil); if (isNaN(until)) return { error: 'Choose how long the offer stays open.' };
    if (until < new Date(new Date().toDateString())) return { error: 'The offer must stay open until today or later.' };
    return { v: { items, contractValueNet: total, currency: body.currency || (lead && lead.currency) || 'INR', validUntil: until.toISOString(), terms: String(body.terms || '').trim(), instalments } };
  }
  const detail = (db, p) => {
    const out = plain(p); delete out.signToken; out.link = p.status === 'sent' && p.signToken ? '#/sign?t=' + p.signToken : '';
    const c = p.customerId && db.customers.find((x) => x.id === p.customerId); out.customer = c ? { id: c.id, companyName: c.companyName, clientCode: c.clientCode } : null;
    out.approvalLimit = db.settings.proposalApprovalLimit; return out;
  };
  const row = (p) => { const o = plain(p); delete o.signToken; return o; };
  const ev = (p, who, text) => p.events.unshift({ at: new Date().toISOString(), who, text });

  // ----- public (client) side: no sign-in -----
  window.MOCK_PUBLIC = async function (ctx) {
    const { method, p, q, body, db, delay, fail, save, log, uid } = ctx; await prime(ctx); ensure(db);
    const find = (t) => db.proposals.find((x) => t && x.signToken === t);
    if (p === '/public/proposal' && method === 'GET') {
      const pr = find(q.token); if (!pr) return fail(404, 'This link is not valid. Ask the sender for a new one.');
      const v = pr.versions[0], expired = pr.status === 'sent' && new Date(v.validUntil) < new Date(new Date().toDateString());
      return delay({ number: pr.proposalNumber, company: pr.lead.companyName, status: expired ? 'expired' : pr.status, preparedBy: v.createdByName, version: { number: v.number, items: v.items, total: v.contractValueNet, currency: v.currency, validUntil: v.validUntil, terms: v.terms, instalments: v.instalments.map((i) => Object.assign({ amount: Math.round(v.contractValueNet * i.percentage) / 100 }, i)) }, fingerprint: fingerprint(v), acceptance: pr.acceptance ? { name: pr.acceptance.name, at: pr.acceptance.at } : null });
    }
    if (p === '/public/proposal/decline' && method === 'POST') {
      const pr = find(body.token); if (!pr) return fail(404, 'This link is not valid.'); if (pr.status !== 'sent') return fail(409, 'This proposal is not open any more.');
      pr.status = 'rejected'; pr.declined = { at: new Date().toISOString(), reason: String(body.reason || '').trim() }; ev(pr, 'Client', 'Declined by the client' + (pr.declined.reason ? ': ' + pr.declined.reason : '')); save(); return delay({ ok: true });
    }
    if (p === '/public/proposal/sign' && method === 'POST') {
      const pr = find(body.token); if (!pr) return fail(404, 'This link is not valid.');
      if (pr.status === 'accepted') return fail(409, 'This proposal has already been signed.');
      const v = pr.versions[0];
      if (pr.status !== 'sent') return fail(409, 'This proposal is not open for signing.');
      if (new Date(v.validUntil) < new Date(new Date().toDateString())) return fail(409, 'This offer has expired. Ask the sender for a new one.');
      const name = String(body.name || '').trim(), email = String(body.email || '').trim();
      if (name.length < 3) return fail(400, 'Type your full name to sign.');
      if (!EMAIL.test(email)) return fail(400, 'Enter a valid email address.');
      if (body.agree !== true) return fail(400, 'Tick the box to confirm you accept.');
      if (body.fingerprint && body.fingerprint !== fingerprint(v)) return fail(409, 'This proposal changed after you opened it. Reload to see the latest version.');
      const at = new Date().toISOString(); pr.status = 'accepted'; pr.acceptance = { name, email, at, fingerprint: fingerprint(v) }; ev(pr, name, 'Accepted and signed by the client');
      // ---- what acceptance sets in motion ----
      const lead = db.leads.find((l) => l.id === pr.lead.id), total = v.contractValueNet;
      let customer = db.customers.find((c) => norm(c.companyName) === norm(pr.lead.companyName)), created = false;
      if (!customer) { created = true; customer = { id: uid(), clientCode: 'CUS-' + String(db.customers.length + 1).padStart(3, '0'), companyName: pr.lead.companyName, email, phone: '', accountOwnerId: lead ? lead.assignedTo : '', partnerId: lead ? lead.partnerId : '', createdAt: at, projectNames: [] }; db.customers.unshift(customer); }
      customer.projectNames.push(pr.proposalNumber + ' ' + pr.lead.companyName);
      pr.customerId = customer.id;
      if (lead && lead.status !== 'Won') { lead.status = 'Won'; lead.convertedAt = at; lead.flags = (lead.flags || []).concat('won'); lead.estimatedValue = total; lead.updatedAt = at; lead.activities.unshift({ id: uid(), description: 'Proposal ' + pr.proposalNumber + ' signed by ' + name, at }); }
      const cvNo = 'CV-' + String(db.conversions.length + 1).padStart(4, '0');
      db.conversions.push({ id: uid(), client: pr.lead.companyName, contractValueNet: total, collected: 0, currency: v.currency, proposalId: pr.id });
      let left = total; pr.installmentIds = [];
      v.instalments.forEach((ins, i) => { const last = i === v.instalments.length - 1, amount = last ? Math.round(left * 100) / 100 : Math.round(total * ins.percentage) / 100; left -= amount; const id = uid(); pr.installmentIds.push(id); db.installments.push({ id, clientName: pr.lead.companyName, conversionNumber: cvNo, projectName: '', label: ins.label, percentage: ins.percentage, trigger: i === 0 ? 'on_signing' : 'milestone_accepted', milestone: null, outstanding: amount, currency: v.currency, dueDate: iso(i === 0 ? 7 : 30 * i), status: 'pending', salesOwnerId: lead ? lead.assignedTo : '', triggered: i === 0 }); });
      log('proposal signed', 'proposal', pr.id); save();
      return delay({ ok: true, number: pr.proposalNumber, at, fingerprint: pr.acceptance.fingerprint, customerCreated: created });
    }
  };

  window.MOCK_EXT = async function (ctx) {
    const { method, p, q, body, db, u, delay, fail, save, log, uid } = ctx; await prime(ctx); ensure(db);
    const canSee = has(u, ['PRESALES_VIEW', 'LEAD_VIEW_ALL']);
    if (p === '/proposals' && method === 'GET') {
      if (!canSee) return fail(403, 'You cannot see proposals.');
      const rows = db.proposals.filter((x) => !q.status || x.status === q.status).map(row); return delay({ rows, total: rows.length, page: 1 });
    }
    if (p === '/proposals' && method === 'POST') {
      if (!canSee) return fail(403, 'You cannot write proposals.');
      const lead = db.leads.find((l) => l.id === body.leadId && !l.deleted); if (!lead) return fail(400, 'Choose the lead this proposal is for.');
      if (['Won', 'Lost', 'Not Interested', 'Invalid Number'].includes(lead.status)) return fail(409, 'This lead is already closed.');
      if (db.proposals.some((x) => x.lead.id === lead.id && ['draft', 'pending_approval', 'approved', 'sent'].includes(x.status))) return fail(409, 'This lead already has a proposal in progress. Open it and add a new version instead.');
      const c = clean(body, lead); if (c.error) return fail(400, c.error);
      const pr = { id: uid(), proposalNumber: 'PR-' + (1001 + db.proposals.length), currentVersion: 1, status: 'draft', lead: { id: lead.id, companyName: lead.company, leadNumber: lead.number }, versions: [Object.assign({ number: 1, note: '', createdAt: new Date().toISOString(), createdBy: u.id, createdByName: u.name }, c.v)], events: [] };
      ev(pr, u.name, 'Proposal created'); db.proposals.unshift(pr); log('created proposal', 'proposal', pr.id); save(); return delay(detail(db, pr));
    }
    let m = p.match(/^\/proposals\/([^/]+)(?:\/([a-z]+))?$/);
    if (m && canSee) {
      const pr = db.proposals.find((x) => x.id === m[1]); if (!pr) return fail(404, 'Proposal not found');
      const act = m[2], cur = pr.versions[0], limit = db.settings.proposalApprovalLimit;
      if (!act && method === 'GET') return delay(detail(db, pr));
      if (method !== 'POST') return undefined;
      if (act === 'versions') {
        if (pr.status === 'accepted') return fail(409, 'A signed proposal cannot be changed. Start a new proposal for new terms.');
        const c = clean(body, null); if (c.error) return fail(400, c.error);
        const reset = pr.status !== 'draft'; pr.currentVersion += 1;
        pr.versions.unshift(Object.assign({ number: pr.currentVersion, note: String(body.note || '').trim(), createdAt: new Date().toISOString(), createdBy: u.id, createdByName: u.name }, c.v));
        if (reset) { pr.status = 'draft'; delete pr.signToken; }
        delete pr.lastRejection; ev(pr, u.name, 'Version ' + pr.currentVersion + ' saved (' + fmt(c.v.contractValueNet) + ')' + (reset ? '; approval and the client link were reset' : '')); log('new proposal version', 'proposal', pr.id); save(); return delay(detail(db, pr));
      }
      if (act === 'submit') {
        if (pr.status !== 'draft') return fail(409, 'Only a draft can be submitted.');
        if (cur.contractValueNet < limit) { pr.status = 'approved'; pr.approvedBy = u.name; ev(pr, u.name, 'Approved automatically: under the ' + fmt(limit) + ' limit'); }
        else { pr.status = 'pending_approval'; ev(pr, u.name, 'Submitted for approval: over the ' + fmt(limit) + ' limit'); }
        save(); return delay(detail(db, pr));
      }
      if (act === 'approve' || act === 'reject') {
        if (pr.status !== 'pending_approval') return fail(409, 'This proposal is not waiting for approval.');
        if (!has(u, ['CONVERSION_CREATE'])) return fail(403, 'Only a sales manager can approve proposals.');
        if (cur.createdBy === u.id) return fail(403, 'A different person must approve proposals over ' + fmt(limit) + '.');
        if (act === 'reject') { const why = String(body.reason || '').trim(); if (why.length < 5) return fail(400, 'Say what needs to change (5 characters or more).'); pr.status = 'draft'; pr.lastRejection = { by: u.name, reason: why, at: new Date().toISOString() }; ev(pr, u.name, 'Sent back: ' + why); save(); return delay(detail(db, pr)); }
        pr.status = 'approved'; pr.approvedBy = u.name; ev(pr, u.name, 'Approved'); log('approved proposal', 'proposal', pr.id); save(); return delay(detail(db, pr));
      }
      if (act === 'send') {
        if (pr.status !== 'approved') return fail(409, pr.status === 'draft' ? 'Submit the proposal for approval before sending it.' : 'Only an approved proposal can be sent.');
        if (new Date(cur.validUntil) < new Date(new Date().toDateString())) return fail(409, 'The offer has already expired. Save a new version with a later date.');
        pr.signToken = 'pd-' + uid() + uid(); pr.status = 'sent'; ev(pr, u.name, 'Sent to the client'); log('sent proposal', 'proposal', pr.id); save(); return delay(detail(db, pr));
      }
      if (act === 'withdraw') {
        if (pr.status !== 'sent') return fail(409, 'Only a sent proposal can be withdrawn.');
        pr.status = 'approved'; delete pr.signToken; ev(pr, u.name, 'Withdrawn: the client link no longer works'); save(); return delay(detail(db, pr));
      }
    }
    return prev ? prev(ctx) : undefined;
  };
})();
