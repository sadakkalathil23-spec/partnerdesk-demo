// Partners (tabs, onboarding stages, delete with undo) and payout approvals.
(() => {
  const W = WorkOS, esc = W.esc, F = W.field, reg = W.register;
  const ONBOARDING = ['Pending', 'Contacted', 'In discussion', 'Documents pending', 'Under review'];
  const ALL = ONBOARDING.concat(['Active', 'Suspended', 'Inactive', 'Rejected']);
  const date = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  const tone = (s) => ['Active'].includes(s) ? 'good' : ['Suspended', 'Rejected'].includes(s) ? 'bad' : ['Inactive'].includes(s) ? '' : 'info';
  const undoToast = (msg, fn) => { const t = document.createElement('div'); t.className = 'toast'; t.innerHTML = esc(msg) + ' <button class="btn sm" style="margin-left:8px">Undo</button>'; t.querySelector('button').onclick = () => { t.remove(); fn(); }; document.body.appendChild(t); setTimeout(() => t.remove(), 8000); };

  reg('/partners', { perm: ['PARTNER_VIEW'], render: async (el) => {
    const canCreate = W.can('PARTNER_CREATE'), canDelete = W.can('PARTNER_DELETE');
    let status = '', q = '', tab = 'all', showDeleted = false, res = null;
    const load = async () => { const p = new URLSearchParams({ pageSize: '100' }); if (status) p.set('status', status); if (q) p.set('q', q); if (showDeleted) p.set('includeDeleted', 'true'); res = await api.get('/partners?' + p.toString()); };
    const restore = async (id, name) => { try { await api.post('/partners/' + id + '/restore', {}); W.toast(name + ' restored, and left inactive until you reactivate it.'); await load(); draw(); } catch (e) { W.toast(e.message); } };
    const del = (r) => W.modal('Delete ' + r.name + '?', '<p>The partner is hidden from lists, but its leads, history and earned payouts are kept. You can restore it from "Show deleted".</p>' + F('reason', 'Reason (optional)', 'text'), async (d) => { await api.del('/partners/' + r.id, d.reason && d.reason.trim() ? { reason: d.reason.trim() } : undefined); undoToast(r.name + ' deleted.', () => restore(r.id, r.name)); await load(); draw(); }, 'Delete partner');
    function draw() {
      const all = res.rows, counts = { all: all.length, onboarding: all.filter((r) => ONBOARDING.includes(r.status)).length, active: all.filter((r) => r.status === 'Active').length, rejected: all.filter((r) => r.status === 'Rejected').length };
      const rows = tab === 'onboarding' ? all.filter((r) => ONBOARDING.includes(r.status)) : tab === 'active' ? all.filter((r) => r.status === 'Active') : tab === 'rejected' ? all.filter((r) => r.status === 'Rejected') : all;
      const filtered = !!status || !!q;
      el.querySelector('#meta').textContent = res.total + (filtered ? ' matching' : ' in total');
      el.querySelector('#tabs').innerHTML = [['all', 'All partners'], ['onboarding', 'Onboarding'], ['active', 'Active'], ['rejected', 'Rejected']].map((t) => '<button class="btn sm" data-tab="' + t[0] + '"' + (tab === t[0] ? ' style="border-color:var(--b5);color:var(--b6);font-weight:600"' : '') + '>' + t[1] + ' (' + counts[t[0]] + ')</button>').join('');
      const parts = []; if (tab !== 'all') parts.push('the "' + tab + '" tab'); if (status) parts.push('the stage filter "' + status + '"'); if (q) parts.push('the search "' + q + '"');
      el.querySelector('#body').innerHTML = rows.length ? '<table><thead><tr><th>Company</th><th>Code</th><th>Contact</th><th>Stage</th><th>Owned by</th><th>Tier</th><th>Leads</th><th>Conversions</th><th>Agreement ends</th>' + (canDelete ? '<th></th>' : '') + '</tr></thead><tbody>' + rows.map((r) => { const exp = r.expires && new Date(r.expires) < new Date(), soon = r.expires && !exp && new Date(r.expires) - Date.now() < 30 * 864e5; return '<tr><td><b>' + esc(r.name) + '</b>' + (r.deleted ? ' ' + W.tagFor('Deleted') : '') + '</td><td class="mono">' + esc(r.code) + '</td><td>' + esc(r.contact) + '</td><td><span class="tag ' + tone(r.status) + '">' + esc(r.status) + '</span></td><td>' + (r.ownerName ? esc(r.ownerName) : '<span style="color:var(--ink-m)">Unassigned</span>') + '</td><td>' + esc(r.tier || '-') + '</td><td>' + r._count.leads + '</td><td>' + r._count.conversions + '</td><td>' + (r.expires ? date(r.expires) : '-') + (exp ? ' ' + W.tagFor('Expired') : '') + (soon ? ' <span class="tag warn">Expiring soon</span>' : '') + '</td>' + (canDelete ? '<td>' + (r.deleted ? '<button class="btn sm" data-r="' + r.id + '">Restore</button>' : '<button class="btn sm danger" data-d="' + r.id + '">Delete</button>') + '</td>' : '') + '</tr>'; }).join('') + '</tbody></table>'
        : '<div class="empty"><b>' + (tab !== 'all' || filtered || showDeleted ? 'No partners match.' : 'No partners yet.') + '</b><p>' + (!parts.length ? (canCreate ? 'Add the first one with New partner.' : '') : 'Nothing fits ' + parts.join(' together with ') + '. ' + (tab !== 'all' && status ? 'The tab and the stage filter both apply. Switch to All partners or set the stage to All stages.' : tab !== 'all' ? 'Switch to All partners to see the rest.' : 'Clear the filter or the search to see the rest.')) + '</p></div>';
      el.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; draw(); }; });
      el.querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => del(rows.find((r) => r.id === b.dataset.d)); });
      el.querySelectorAll('[data-r]').forEach((b) => { b.onclick = () => { const r = rows.find((x) => x.id === b.dataset.r); restore(r.id, r.name); }; });
    }
    el.innerHTML = '<h1>Partners <small id="meta" style="font-size:14px;font-weight:400;color:var(--ink-m)"></small></h1><p class="sub">Firms that refer leads to us, from first conversation to live partnership.</p><div class="bar"><input class="in" id="q" placeholder="Search partners"><select class="in" id="st"><option value="">All stages</option>' + ALL.map((s) => '<option>' + s + '</option>').join('') + '</select>' + (canDelete ? '<label><input type="checkbox" id="sd"> Show deleted</label>' : '') + '<span style="flex:1"></span>' + (canCreate ? '<button class="btn primary" id="new">New partner</button>' : '') + '</div><nav class="bar" id="tabs" aria-label="Partner views"></nav><div id="body"></div>';
    let timer; el.querySelector('#q').oninput = (e) => { clearTimeout(timer); timer = setTimeout(async () => { q = e.target.value; await load(); draw(); }, 200); };
    el.querySelector('#st').onchange = async (e) => { status = e.target.value; await load(); draw(); };
    const sd = el.querySelector('#sd'); if (sd) sd.onchange = async () => { showDeleted = sd.checked; await load(); draw(); };
    const nw = el.querySelector('#new'); if (nw) nw.onclick = () => W.modal('New partner', F('name', 'Firm name', 'text', { required: true }) + F('contact', 'Contact person', 'text') + F('status', 'Stage', 'select', { options: ALL, value: 'Pending' }) + F('category', 'Category', 'select', { options: ['Consultancy', 'Reseller'] }) + F('tier', 'Tier', 'select', { options: [{ value: '', label: 'No tier yet' }, 'Silver', 'Gold'] }), async (d) => { await api.post('/partners', d); W.toast('Partner added.'); await load(); draw(); });
    await load(); draw();
  } });

  const STATE = { pending_approval: 'Eligible', awaiting_eligibility: 'Not eligible yet' };
  reg('/approvals', { perm: ['INCENTIVE_APPROVE'], render: async (el) => {
    const draw = async () => {
      const rows = await api.get('/incentives/approval-queue'), ready = rows.filter((r) => r.status === 'pending_approval'), waiting = rows.filter((r) => r.status === 'awaiting_eligibility');
      el.innerHTML = '<h1>Payout approvals</h1><p class="sub">Partner payouts waiting for a decision. You see how each amount was worked out before you approve.</p>' + (ready.length ? '<table><thead><tr><th>Payout</th><th>Partner</th><th>Lead</th><th>Service</th><th>Amount</th><th>Rule</th><th>Waiting</th><th></th></tr></thead><tbody>' + ready.map((r) => '<tr><td class="mono">' + esc(r.incentiveNumber) + '</td><td>' + esc(r.partner) + '</td><td>' + esc(r.lead) + '</td><td>' + esc(r.service) + '</td><td>' + esc(r.currency + ' ' + Number(r.amount).toLocaleString('en-IN')) + '</td><td>' + esc(r.rule) + '</td><td>' + r.daysWaiting + ' d</td><td>' + (r.canApprove ? '<button class="btn sm primary" data-a="' + r.id + '">Approve</button>' : '<span class="tag" title="' + esc(r.blockedReason) + '">Blocked for you</span> <small>' + esc(r.blockedReason) + '; a second approver is required</small>') + '</td></tr>').join('') + '</tbody></table>' : '<div class="empty"><b>No payouts awaiting approval.</b></div>')
        + (waiting.length ? '<p class="sub" style="margin-top:14px">' + waiting.length + (waiting.length === 1 ? ' payout is' : ' payouts are') + ' not eligible yet, usually because a payment has not arrived. ' + (waiting.length === 1 ? 'It appears' : 'They appear') + ' here once eligible.</p>' : '<p class="sub" style="margin-top:14px">No payout is waiting to become eligible either.</p>');
      el.querySelectorAll('[data-a]').forEach((b) => { b.onclick = async () => { try { await api.post('/incentives/' + b.dataset.a + '/approve', {}); W.toast('Payout approved.'); draw(); } catch (e) { W.toast(e.message); } }; });
    };
    await draw();
  } });
})();
