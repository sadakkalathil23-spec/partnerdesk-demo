// Rule what-if: try a draft payout rule against the partner deals you already have, before you publish it.
(() => {
  const W = WorkOS, esc = W.esc, F = W.field;
  const money = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const signed = (n) => (n > 0 ? '+' : n < 0 ? '-' : '') + money(Math.abs(n));
  W.register('/admin/what-if', { perm: ['INCENTIVE_RULE_MANAGE'], render: async (el) => {
    const rules = await api.get('/incentive-rules'), lk = await api.get('/services/lookups');
    el.innerHTML = '<h1>Rule what-if</h1><p class="sub">Try a new payout rule on the partner deals you already have, and see what each partner would be paid, before you publish anything. Nothing here is saved.</p>'
      + '<form class="card" id="wf" style="max-width:640px;margin-bottom:16px">'
      + F('replaceId', 'What does the draft do?', 'select', { options: [{ value: '', label: 'Add as an extra rule' }].concat(rules.filter((r) => r.status === 'active').map((r) => ({ value: r.id, label: 'Replace: ' + r.name }))) })
      + '<div id="scope">' + F('serviceId', 'Only for this service (optional)', 'select', { options: [{ value: '', label: 'Any service' }].concat(lk.services.map((s) => ({ value: s.id, label: s.name }))) }) + F('partnerId', 'Only for this partner (optional)', 'select', { options: [{ value: '', label: 'Any partner' }].concat(lk.partners.map((p) => ({ value: p.id, label: p.name }))) }) + '</div><p class="sub" id="inherit" hidden>A replacement keeps the scope of the rule it replaces.</p>'
      + F('calculationType', 'How is it calculated?', 'select', { options: [{ value: 'percentage', label: 'Percentage of the deal' }, { value: 'fixed', label: 'Fixed amount' }] })
      + '<div id="pctbox">' + F('percentage', 'Percentage', 'number', { value: '5' }) + '</div><div id="fixbox" hidden>' + F('fixedAmount', 'Fixed amount', 'number') + '</div>'
      + F('minDealValue', 'Only for deals of at least (optional)', 'number')
      + F('eligibilityCondition', 'Paid when', 'select', { options: [{ value: 'on_conversion', label: 'The deal is won' }, { value: 'on_first_payment', label: 'The first payment arrives' }, { value: 'on_full_payment', label: 'The deal is fully paid' }] })
      + '<label style="display:block;margin:8px 0"><input type="checkbox" name="includeOpen" checked> Include deals still in progress (shown as projected)</label>'
      + '<button class="btn primary" id="go">Replay deals</button></form><div id="out"></div>';
    const f = el.querySelector('#wf'), g = (n) => f.querySelector('[name=' + n + ']'), out = el.querySelector('#out');
    const sync = () => { const rep = !!g('replaceId').value; el.querySelector('#scope').hidden = rep; el.querySelector('#inherit').hidden = !rep; }; g('replaceId').onchange = sync; sync();
    g('calculationType').onchange = () => { const p = g('calculationType').value === 'percentage'; el.querySelector('#pctbox').hidden = !p; el.querySelector('#fixbox').hidden = p; };
    f.onsubmit = async (e) => {
      e.preventDefault(); out.innerHTML = '<div class="empty">Replaying...</div>';
      try {
        const draft = { name: 'Draft rule', calculationType: g('calculationType').value, percentage: g('percentage').value, fixedAmount: g('fixedAmount').value, minDealValue: g('minDealValue').value, eligibilityCondition: g('eligibilityCondition').value, serviceId: g('replaceId').value ? '' : g('serviceId').value, partnerId: g('replaceId').value ? '' : g('partnerId').value };
        const r = await api.post('/incentive-rules/what-if', { draft, replaceId: g('replaceId').value, includeOpen: g('includeOpen').checked });
        if (!r.rows.length) { out.innerHTML = '<div class="empty"><b>No deals to replay yet.</b><p>' + esc(r.note) + '</p></div>'; return; }
        const t = r.totals;
        out.innerHTML = '<div class="cards" style="margin-bottom:12px"><div class="card"><small>Paid today</small><div style="font-size:22px"><b>' + money(t.current) + '</b></div></div><div class="card"><small>Would be paid</small><div style="font-size:22px"><b>' + money(t.proposed) + '</b></div></div><div class="card"><small>Difference</small><div style="font-size:22px"><b class="' + (t.change > 0 ? 'wf-up' : t.change < 0 ? 'wf-down' : '') + '">' + signed(t.change) + '</b></div><small>' + t.affected + ' deals use the draft; ' + t.increases + ' up, ' + t.decreases + ' down</small></div></div>'
          + '<table><thead><tr><th>Deal</th><th>Partner</th><th>Deal value</th><th>Rule today</th><th>Paid today</th><th>With draft</th><th>Change</th></tr></thead><tbody>' + r.rows.map((x) => '<tr><td><b>' + esc(x.company) + '</b><br><small>' + esc(x.number) + (x.actual ? '' : ' &middot; projected') + '</small></td><td>' + esc(x.partner) + '</td><td>' + money(x.dealValue) + '</td><td>' + esc(x.currentRule) + '</td><td>' + (x.currentEligible ? money(x.current) : '<small>not yet eligible</small>') + '</td><td>' + (x.proposedEligible ? money(x.proposed) : '<small>not yet eligible</small>') + (x.draftApplies ? '' : ' <small>(draft not used)</small>') + '</td><td class="' + (x.change > 0 ? 'wf-up' : x.change < 0 ? 'wf-down' : '') + '">' + signed(x.change) + '</td></tr>').join('') + '</tbody></table><p class="sub">Every deal is assumed fully paid. Projected deals are replayed as if they were won at their estimated value.</p>';
      } catch (er) { out.innerHTML = '<div class="alert danger">' + esc(er.message) + '</div>'; }
    };
  } });
})();
