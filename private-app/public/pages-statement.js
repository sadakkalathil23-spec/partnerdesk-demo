// Partner payout statement: every payout with how it was worked out, CSV download, print, and disputes.
(() => {
  const W = WorkOS, esc = W.esc, F = W.field;
  const n = (v, c) => (c ? c + ' ' : '') + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const day = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  const LABEL = { pending_approval: 'Waiting for approval', awaiting_eligibility: 'Not yet eligible', approved_unpaid: 'Approved, awaiting payment', paid: 'Paid' };
  const csvCell = (v) => { let s = String(v == null ? '' : v); if (/^[=+\-@]/.test(s)) s = "'" + s; return '"' + s.replace(/"/g, '""') + '"'; };

  function csvOf(d) {
    const head = ['Payout', 'Lead', 'Company', 'Service', 'Rule', 'How it was worked out', 'Amount', 'Currency', 'Status', 'Dispute'];
    return [head].concat(d.rows.map((r) => [r.number, r.lead, r.company, r.service, r.rule, r.how, r.amount, r.currency, LABEL[r.status] || r.status, r.dispute ? (r.dispute.resolvedAt ? 'Resolved: ' + r.dispute.resolution : 'Open: ' + r.dispute.reason) : ''])).map((l) => l.map(csvCell).join(',')).join('\r\n');
  }
  const download = (name, text) => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8' })); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); };

  async function view(el, isPartner) {
    const canResolve = W.can('INCENTIVE_APPROVE');
    let partners = [], pid = (location.hash.match(/partnerId=([^&]+)/) || [])[1] || '';
    if (!isPartner) { partners = (await api.get('/partners?pageSize=100')).rows; if (!pid && partners.length) pid = partners[0].id; }
    async function draw() {
      const d = await api.get('/statement' + (isPartner ? '' : '?partnerId=' + encodeURIComponent(pid)));
      const cur = Object.keys(d.totals);
      el.innerHTML = '<div class="no-print"><h1>' + (isPartner ? 'Payout statement' : 'Partner statements') + '</h1><p class="sub">Every payout with the rule and the working behind it. Download it, print it, or raise a question on any line.</p>'
        + (isPartner ? '' : '<div class="bar"><label>Partner <select class="in" id="pp">' + partners.map((p) => '<option value="' + esc(p.id) + '"' + (p.id === pid ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('') + '</select></label></div>')
        + '<div class="bar"><button class="btn" id="csv">Download CSV</button><button class="btn" id="prt">Print or save as PDF</button></div></div>'
        + '<div class="card" style="margin-bottom:12px"><b style="font-size:18px">' + esc(d.partner.name) + '</b> <small>' + esc(d.partner.code || '') + '</small><br><small>Statement created ' + day(d.generatedAt) + '</small>'
        + (cur.length ? '<div class="cards" style="margin-top:10px">' + cur.map((c) => '<div class="card"><small>Paid (' + esc(c) + ')</small><div><b>' + n(d.totals[c].paid) + '</b></div></div><div class="card"><small>Approved, awaiting payment</small><div><b>' + n(d.totals[c].approved) + '</b></div></div><div class="card"><small>Still in review</small><div><b>' + n(d.totals[c].waiting) + '</b></div></div>').join('') + '</div>' : '') + '</div>'
        + (d.rows.length ? '<table><thead><tr><th>Payout</th><th>Deal</th><th>How it was worked out</th><th>Amount</th><th>Status</th><th class="no-print"></th></tr></thead><tbody>' + d.rows.map((r) => '<tr><td><b>' + esc(r.number) + '</b></td><td>' + esc(r.company || r.lead) + '<br><small>' + esc(r.lead + ' · ' + r.service) + '</small></td><td><small>' + esc(r.how) + '</small></td><td><b>' + n(r.amount, r.currency) + '</b></td><td>' + esc(LABEL[r.status] || r.status) + (r.dispute ? '<br><span class="tag ' + (r.dispute.resolvedAt ? 'good' : 'warn') + '">' + (r.dispute.resolvedAt ? 'Dispute resolved' : 'Disputed') + '</span>' : '') + '</td><td class="no-print">' + disputeBtn(r) + '</td></tr>').join('') + '</tbody></table>' : '<div class="empty"><b>No payouts yet.</b><p>Payouts appear here once a referred deal is won and a rule applies.</p></div>');
      el.querySelector('#csv').onclick = () => download('statement-' + (d.partner.code || 'partner') + '-' + new Date().toISOString().slice(0, 10) + '.csv', csvOf(d));
      el.querySelector('#prt').onclick = () => window.print();
      const pp = el.querySelector('#pp'); if (pp) pp.onchange = () => { pid = pp.value; draw(); };
      el.querySelectorAll('[data-dis]').forEach((b) => { b.onclick = () => W.modal('Question payout ' + b.dataset.num, '<p class="sub">Tell us what looks wrong. Our finance team is notified and will reply on this statement.</p>' + F('reason', 'What looks wrong?', 'textarea', { required: true }), async (f) => { await api.post('/incentives/' + b.dataset.dis + '/dispute', { reason: f.reason }); W.toast('Sent to the finance team.'); await draw(); }, 'Send'); });
      el.querySelectorAll('[data-res]').forEach((b) => { b.onclick = () => W.modal('Resolve dispute on ' + b.dataset.num, '<p>' + esc(b.dataset.why) + '</p>' + F('note', 'How was it resolved?', 'textarea', { required: true }), async (f) => { await api.post('/incentives/' + b.dataset.res + '/dispute/resolve', { note: f.note }); W.toast('Dispute resolved.'); await draw(); }, 'Resolve'); });
    }
    const disputeBtn = (r) => isPartner ? (r.dispute && !r.dispute.resolvedAt ? '' : '<button class="btn sm" data-dis="' + esc(r.id) + '" data-num="' + esc(r.number) + '">Question this</button>') : (r.dispute && !r.dispute.resolvedAt && canResolve ? '<button class="btn sm" data-res="' + esc(r.id) + '" data-num="' + esc(r.number) + '" data-why="' + esc(r.dispute.reason) + '">Resolve</button>' : '');
    await draw();
  }
  W.register('/statement', { perm: ['PARTNER_VIEW', 'INCENTIVE_APPROVE'], render: (el) => view(el, false) });
  W.register('/partner/statement', { render: (el) => view(el, true) });
  window.PD = Object.assign(window.PD || {}, { statementCsv: csvOf });
})();
