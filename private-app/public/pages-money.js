// Payout rules (admin) and the payout simulator.
(() => {
  const W = WorkOS, esc = W.esc, F = W.field, reg = W.register;
  const COND = { on_conversion: 'On conversion', on_first_payment: 'On first payment', on_full_payment: 'On full payment', on_payment_percentage: 'At a collection percentage' };
  const parseAmount = (v) => { const s = String(v == null ? '' : v).replace(/[,\s]/g, ''); if (!s) return ''; return /^\d+(\.\d{1,2})?$/.test(s) ? Number(s) : NaN; };
  const AMOUNT_ERR = 'One of the amounts could not be read. Type each as a full amount, for example 40000 or 40000.50.';
  const head = (t, s) => '<h1>' + esc(t) + '</h1><p class="sub">' + esc(s) + '</p>';
  const money = (n, c) => (c ? c + ' ' : '') + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });

  // ---------------- rules ----------------
  reg('/admin/rules', { perm: ['INCENTIVE_RULE_MANAGE'], render: async (el) => {
    const lk = await api.get('/services/lookups'), canDelete = W.can('INCENTIVE_RULE_DELETE');
    let showArchived = false;
    const nameOf = (list, id) => (list.find((x) => x.id === id) || {}).name || id;
    const matches = (r) => [r.partnerId && 'Partner: ' + nameOf(lk.partners, r.partnerId), r.partnerCategoryId && 'Category: ' + r.partnerCategoryId, r.partnerTierId && 'Tier: ' + r.partnerTierId, r.serviceId && 'Service: ' + nameOf(lk.services, r.serviceId), r.serviceCategoryId && 'Service type: ' + r.serviceCategoryId, r.handlingType && 'Handling: ' + r.handlingType].filter(Boolean).join(' · ') || 'Any partner, any service';
    const calc = (r) => r.calculationType === 'percentage' ? r.percentage + '%' : r.calculationType === 'fixed' ? money(r.fixedAmount, r.currency) : (r.tierMode === 'graduated' ? 'Graduated bands' : 'Banded rate') + ' (' + (r.tiers || []).length + ')';
    const range = (r) => r.minDealValue === '' && r.maxDealValue === '' ? 'Any size' : (r.minDealValue === '' ? '0' : money(r.minDealValue)) + ' to ' + (r.maxDealValue === '' ? 'no limit' : money(r.maxDealValue));
    const draw = async () => {
      const rows = await api.get('/incentive-rules' + (showArchived ? '?includeArchived=true' : ''));
      const box = el.querySelector('#body');
      if (!rows.length) { box.innerHTML = '<div class="empty"><b>No payout rules yet.</b><p>Without a rule, a deal falls back to the default payout set on its service.' + (showArchived ? '' : ' Archived rules are hidden. Tick "Show archived" to see them.') + '</p></div>'; return; }
      box.innerHTML = '<table><thead><tr><th>Rule</th><th>Applies to</th><th>Calculation</th><th>Deal size</th><th>Payable when</th><th>Effective</th><th>Status</th><th></th></tr></thead><tbody>' + rows.map((r) => '<tr><td><b>' + esc(r.name) + '</b></td><td>' + esc(matches(r)) + '</td><td>' + esc(calc(r)) + '</td><td>' + esc(range(r)) + '</td><td>' + esc(COND[r.eligibilityCondition] + (r.eligibilityCondition === 'on_payment_percentage' ? ' (' + r.eligibilityThresholdPct + '%)' : '')) + '</td><td>' + esc(r.effectiveFrom) + (r.effectiveUntil ? ' to ' + esc(r.effectiveUntil) : '') + '</td><td>' + W.tagFor(r.status[0].toUpperCase() + r.status.slice(1)) + '</td><td><button class="btn sm" data-e="' + r.id + '">Edit</button> <button class="btn sm" data-ar="' + r.id + '">' + (r.status === 'archived' ? 'Restore' : 'Archive') + '</button>' + (canDelete ? ' <button class="btn sm danger" data-d="' + r.id + '">Delete</button>' : '') + '</td></tr>').join('') + '</tbody></table>';
      box.querySelectorAll('[data-e]').forEach((b) => { b.onclick = () => form(rows.find((r) => r.id === b.dataset.e)); });
      box.querySelectorAll('[data-ar]').forEach((b) => { b.onclick = async () => { const r = rows.find((x) => x.id === b.dataset.ar); await api.patch('/incentive-rules/' + r.id, { status: r.status === 'archived' ? 'active' : 'archived' }); W.toast(r.name + (r.status === 'archived' ? ' restored.' : ' archived. It no longer applies to new deals.')); draw(); }; });
      box.querySelectorAll('[data-d]').forEach((b) => { b.onclick = async () => { const r = rows.find((x) => x.id === b.dataset.d); if (!confirm('Delete "' + r.name + '" permanently? Archiving keeps its history.')) return; try { await api.del('/incentive-rules/' + r.id); W.toast(r.name + ' deleted.'); draw(); } catch (e) { W.toast(e.message); } }; });
    };
    const sel = (name, label, opts, value) => F(name, label, 'select', { options: [{ value: '', label: 'Any' }].concat(opts.map((o) => (typeof o === 'string' ? { value: o, label: o } : { value: o.id, label: o.name }))), value });
    function form(rule) {
      const r = rule || { name: '', description: '', partnerId: '', partnerCategoryId: '', partnerTierId: '', serviceId: '', serviceCategoryId: '', handlingType: '', calculationType: 'percentage', percentage: '', fixedAmount: '', tiers: [{ min: 0, max: null, rate: '' }], tierMode: 'flat', minDealValue: '', maxDealValue: '', currency: '', eligibilityCondition: 'on_conversion', eligibilityThresholdPct: '', effectiveFrom: new Date().toISOString().slice(0, 10), effectiveUntil: '', status: 'active' };
      const tierRow = (t) => '<div class="bar tier"><input class="in" name="tmin" placeholder="From" value="' + esc(t.min) + '" size="8"><input class="in" name="tmax" placeholder="No upper limit" value="' + esc(t.max == null ? '' : t.max) + '" size="10"><input class="in" name="trate" placeholder="Rate %" value="' + esc(t.rate) + '" size="6"><button type="button" class="btn sm" data-rm>Remove</button></div>';
      const m = W.modal(rule ? 'Edit ' + rule.name : 'New payout rule',
        F('name', 'Name', 'text', { value: r.name, required: true }) + F('description', 'Description', 'text', { value: r.description })
        + '<div class="two">' + sel('partnerId', 'Partner', lk.partners, r.partnerId) + sel('partnerCategoryId', 'Partner category', lk.partnerCategories, r.partnerCategoryId) + sel('partnerTierId', 'Partner tier', lk.partnerTiers, r.partnerTierId) + sel('serviceId', 'Service', lk.services, r.serviceId) + sel('serviceCategoryId', 'Service type', lk.serviceCategories, r.serviceCategoryId) + F('handlingType', 'Handling type', 'text', { value: r.handlingType }) + '</div>'
        + F('calculationType', 'Calculation', 'select', { options: [{ value: 'percentage', label: 'Percentage of the deal' }, { value: 'fixed', label: 'Fixed amount' }, { value: 'tiered', label: 'Bands by deal size' }], value: r.calculationType })
        + '<div id="g-pct">' + F('percentage', 'Percentage', 'text', { value: r.percentage }) + '</div><div id="g-fix">' + F('fixedAmount', 'Fixed amount (full amount, e.g. 40000)', 'text', { value: r.fixedAmount }) + '</div>'
        + '<div id="g-tier">' + F('tierMode', 'How bands apply', 'select', { options: [{ value: 'flat', label: 'The matching band rate applies to the whole amount' }, { value: 'graduated', label: 'Each band rate applies to its own slice' }], value: r.tierMode }) + '<div id="tiers">' + (r.tiers && r.tiers.length ? r.tiers : [{ min: 0, max: null, rate: '' }]).map(tierRow).join('') + '</div><button type="button" class="btn sm" id="addtier">Add band</button></div>'
        + '<div class="two">' + F('minDealValue', 'Minimum deal value', 'text', { value: r.minDealValue }) + F('maxDealValue', 'Maximum deal value', 'text', { value: r.maxDealValue }) + '</div>'
        + F('currency', 'Currency', 'select', { options: [{ value: '', label: 'Any currency' }, 'INR', 'AED', 'USD'], value: r.currency }) + '<p class="sub" style="margin-top:-8px">Leave on Any currency to apply in every currency.</p>'
        + F('eligibilityCondition', 'Payable when', 'select', { options: Object.keys(COND).map((k) => ({ value: k, label: COND[k] })), value: r.eligibilityCondition }) + '<div id="g-thr">' + F('eligibilityThresholdPct', 'Collection percentage needed', 'text', { value: r.eligibilityThresholdPct }) + '</div>'
        + '<div class="two">' + F('effectiveFrom', 'Effective from', 'date', { value: r.effectiveFrom, required: true }) + F('effectiveUntil', 'Effective until', 'date', { value: r.effectiveUntil }) + '</div>' + F('status', 'Status', 'select', { options: ['active', 'inactive', 'archived'], value: r.status }),
        async (d, f) => {
          const bad = []; const num = (v) => { const x = parseAmount(v); if (Number.isNaN(x)) bad.push(1); return x; };
          const out = Object.assign({}, d); out.fixedAmount = d.calculationType === 'fixed' ? num(d.fixedAmount) : ''; out.minDealValue = num(d.minDealValue); out.maxDealValue = num(d.maxDealValue);
          out.percentage = d.calculationType === 'percentage' ? Number(d.percentage) : ''; if (d.calculationType === 'percentage' && !(out.percentage > 0 && out.percentage <= 100)) throw new Error('The percentage must be above 0 and at most 100.');
          const mins = f.querySelectorAll('[name=tmin]'), maxs = f.querySelectorAll('[name=tmax]'), rates = f.querySelectorAll('[name=trate]');
          out.tiers = d.calculationType === 'tiered' ? [...mins].map((x, i) => ({ min: num(x.value) || 0, max: maxs[i].value.trim() ? num(maxs[i].value) : null, rate: Number(rates[i].value) })) : [];
          if (bad.length) throw new Error(AMOUNT_ERR);
          if (d.calculationType === 'tiered' && out.tiers.some((t) => !(t.rate > 0 && t.rate <= 100))) throw new Error('Each band rate must be above 0 and at most 100.');
          if (d.eligibilityCondition === 'on_payment_percentage') { out.eligibilityThresholdPct = Number(d.eligibilityThresholdPct); if (!(out.eligibilityThresholdPct > 0 && out.eligibilityThresholdPct <= 100)) throw new Error('Enter the collection percentage needed, above 0 and at most 100.'); } else out.eligibilityThresholdPct = '';
          if (out.effectiveUntil && out.effectiveUntil < out.effectiveFrom) throw new Error('The end date is before the start date.');
          if (rule) { await api.patch('/incentive-rules/' + rule.id, out); W.toast(out.name + ' updated.'); } else { await api.post('/incentive-rules', out); W.toast(out.name + ' created. Simulate it before it meets a real deal.'); }
          draw();
        }, rule ? 'Save changes' : 'Create rule');
      const root = m.el, show = () => { const c = root.querySelector('[name=calculationType]').value, e = root.querySelector('[name=eligibilityCondition]').value; root.querySelector('#g-pct').hidden = c !== 'percentage'; root.querySelector('#g-fix').hidden = c !== 'fixed'; root.querySelector('#g-tier').hidden = c !== 'tiered'; root.querySelector('#g-thr').hidden = e !== 'on_payment_percentage'; };
      root.querySelector('[name=calculationType]').onchange = show; root.querySelector('[name=eligibilityCondition]').onchange = show; show();
      root.querySelector('#addtier').onclick = () => { root.querySelector('#tiers').insertAdjacentHTML('beforeend', tierRow({ min: '', max: null, rate: '' })); };
      root.querySelector('#tiers').onclick = (e) => { if (e.target.hasAttribute('data-rm') && root.querySelectorAll('.tier').length > 1) e.target.closest('.tier').remove(); };
    }
    el.innerHTML = head('Payout rules', 'How partner payouts are worked out. The most specific matching rule wins.') + '<div class="bar"><label><input type="checkbox" id="arch"> Show archived</label><span style="flex:1"></span><button class="btn primary" id="new">New rule</button></div><div id="body"></div>';
    el.querySelector('#arch').onchange = (e) => { showArchived = e.target.checked; draw(); };
    el.querySelector('#new').onclick = () => form(null);
    await draw();
  } });

  // ---------------- simulator ----------------
  reg('/simulator', { perm: ['INCENTIVE_SIMULATE'], render: async (el) => {
    const lk = await api.get('/services/lookups');
    el.innerHTML = head('Payout simulator', 'Try a partner, service and deal value to see which rule would apply, why, and the amount. Nothing is saved.')
      + '<div class="two"><div class="card"><h3 style="margin-top:0">Inputs</h3>'
      + F('partnerId', 'Partner', 'select', { options: [{ value: '', label: 'Choose a partner...' }].concat(lk.partners.map((p) => ({ value: p.id, label: p.name }))) })
      + F('serviceId', 'Service', 'select', { options: [{ value: '', label: 'Choose a service...' }].concat(lk.services.map((s) => ({ value: s.id, label: s.name }))) })
      + F('dealValue', 'Net deal value', 'text', { value: '500000' }) + F('currency', 'Currency', 'select', { options: ['INR', 'AED', 'USD'] })
      + F('evaluationDate', 'Evaluate on (optional)', 'date') + F('collected', 'Amount collected so far (optional)', 'text')
      + '<div id="need" class="sub"></div><button class="btn primary" id="run" disabled>Run simulation</button></div><div id="out"><div class="empty"><b>Nothing simulated yet.</b><p>Choose a partner and a service, then run the simulation.</p></div></div></div>';
    const g = (n) => el.querySelector('[name=' + n + ']'), run = el.querySelector('#run');
    const need = () => { const dv = parseAmount(g('dealValue').value), col = parseAmount(g('collected').value); const miss = [!g('partnerId').value && 'a partner', !g('serviceId').value && 'a service', (dv === '' || Number.isNaN(dv)) && 'a deal value', Number.isNaN(col) && 'a valid collected amount'].filter(Boolean); el.querySelector('#need').textContent = miss.length ? 'Choose ' + miss.join(' and ') + ' first.' : ''; run.disabled = miss.length > 0; };
    ['partnerId', 'serviceId', 'dealValue', 'collected'].forEach((n) => { g(n).oninput = need; g(n).onchange = need; });
    g('partnerId').addEventListener('change', () => { const p = lk.partners.find((x) => x.id === g('partnerId').value); if (p) g('currency').value = p.defaultCurrency; });
    need();
    run.onclick = async () => {
      const out = el.querySelector('#out'); out.innerHTML = '<div class="empty">Running...</div>';
      try {
        const r = await api.post('/incentive-rules/simulate', { partnerId: g('partnerId').value, serviceId: g('serviceId').value, dealValue: parseAmount(g('dealValue').value), currency: g('currency').value, evaluationDate: g('evaluationDate').value ? new Date(g('evaluationDate').value).toISOString() : undefined, collected: parseAmount(g('collected').value) || undefined });
        const cur = r.currency;
        if (!r.matched) { out.innerHTML = '<div class="alert danger"><b>No rule matches</b>' + esc(r.message || '') + (r.rejected && r.rejected.length ? '<ul>' + r.rejected.slice(0, 6).map((x) => '<li>' + esc(x.name) + ': ' + esc(x.reason) + '</li>').join('') + '</ul>' : '') + '</div>'; return; }
        const w = r.winner;
        out.innerHTML = '<div class="card"><small>Winning rule</small><strong>' + esc(w.name) + '</strong><p>' + W.tagFor('Specificity ' + w.score) + '</p><p>Matched on: ' + esc(w.matchedDimensions.length ? w.matchedDimensions.join(', ') : 'nothing specific (this is the general fallback rule)') + '</p><p class="sub">When several rules fit, the most specific one applies. A rule written for this exact partner and service scores higher than a general one.</p>'
          + (w.isServiceDefault ? '<p>' + W.tagFor('Service default: used because no more specific rule fits') + '</p>' : '')
          + (!r.eligibility.eligible ? '<div class="alert warn"><b>Would not be eligible yet</b>' + esc(r.eligibility.reason) + '</div>' : '')
          + (r.tieBreakApplied ? '<div class="alert warn" style="margin-top:8px"><b>Two rules tied, and one was picked by the tie-break order</b>' + esc(r.tieBreakNote) + ' Two rules with the same score usually means one of them is set up wrongly and should be corrected.</div>' : '') + '</div>'
          + '<div class="card" style="margin-top:12px"><small>How this amount was calculated</small><dl class="kv"><dt>Rule</dt><dd>' + esc(w.name) + '</dd><dt>Deal value</dt><dd>' + esc(money(parseAmount(g('dealValue').value), cur)) + '</dd><dt>Eligible base</dt><dd>' + esc(money(r.eligibility.eligibleBase, cur)) + '</dd><dt>Payable when</dt><dd>' + esc(COND[w.eligibilityCondition]) + '</dd>' + (r.calculation.effectiveRate != null ? '<dt>Effective rate</dt><dd>' + esc(Number(r.calculation.effectiveRate).toFixed(2)) + '%</dd>' : '') + r.calculation.steps.map((s) => '<dt>' + esc(s.label) + '</dt><dd>' + esc(typeof s.value === 'number' ? money(s.value, cur) : s.value) + '</dd>').join('') + '<dt><b>Payout</b></dt><dd><b>' + esc(money(r.calculation.amount, cur)) + '</b></dd></dl></div>'
          + '<div class="card" style="margin-top:12px"><small>Other rules that fit</small>' + (r.runnersUp.length ? r.runnersUp.map((x) => '<div style="margin-top:6px"><b>' + esc(x.name) + '</b><br><small>' + esc(x.lostBecause) + '</small></div>').join('') : '<p class="sub">No other rule matched this combination.</p>') + '</div>'
          + '<div class="bar" style="margin-top:12px"><button class="btn" id="cp"><span aria-live="polite">Copy result</span></button></div>';
        out.querySelector('#cp').onclick = () => { const t = w.name + ' · specificity ' + w.score + ' · amount ' + r.calculation.amount + ' ' + cur; (navigator.clipboard ? navigator.clipboard.writeText(t) : Promise.reject()).then(() => { out.querySelector('#cp span').textContent = 'Copied'; setTimeout(() => { const s = out.querySelector('#cp span'); if (s) s.textContent = 'Copy result'; }, 2000); }).catch(() => W.toast('Could not copy')); };
      } catch (e) { out.innerHTML = '<div class="alert danger"><b>Simulation failed</b>' + esc(e.message) + '</div>'; }
    };
  } });
})();
