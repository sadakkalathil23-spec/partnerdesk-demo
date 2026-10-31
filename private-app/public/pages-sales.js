// Sales overview: targets (company / team / person), monthly plan, stage chances, forecast vs won.
(() => {
  const W = WorkOS, esc = W.esc, F = W.field;
  const num = (n) => Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
  const parse = (v) => { const s = String(v == null ? '' : v).replace(/[,\s]/g, ''); return /^\d+(\.\d{1,2})?$/.test(s) ? Number(s) : NaN; };
  const PERIODS = { half_year: ['Half year', 6], quarter: ['Quarter', 3], year: ['Full year', 12], custom: ['Custom', 0] };
  const SCOPES = { company: 'Whole company', team: 'A manager\'s team', user: 'One representative' };
  const today = () => new Date().toISOString().slice(0, 10);
  const addMonths = (ym, n) => { let [y, m] = ym.split('-').map(Number); m += n; while (m > 12) { m -= 12; y++; } while (m < 1) { m += 12; y--; } return y + '-' + String(m).padStart(2, '0'); };
  const monthName = (ym) => new Date(ym + '-01T12:00:00').toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
  const lastDay = (ym) => { const [y, m] = ym.split('-').map(Number); return ym + '-' + String(new Date(y, m, 0).getDate()).padStart(2, '0'); };
  const split = (total, n) => { const base = Math.floor(total / n), out = Array(n).fill(base); out[0] += total - base * n; return out; };

  W.register('/sales-overview', { perm: ['SALES_TARGET_VIEW'], render: async (el, qp) => {
    const [targets, opts] = await Promise.all([api.get('/sales-targets' + (qp.archived === '1' ? '?includeArchived=true' : '')), api.get('/sales-targets/options')]);
    const go = (patch) => { const p = new URLSearchParams(qp); Object.keys(patch).forEach((k) => { patch[k] ? p.set(k, patch[k]) : p.delete(k); }); location.hash = '#/sales-overview' + (p.toString() ? '?' + p.toString() : ''); };
    const modal = (t) => targetForm(t, opts, async () => { W.rerender(); });
    if (!targets.length) {
      el.innerHTML = '<h1>Sales targets</h1><p class="sub">Plan the revenue you want to win, then follow progress here.</p><div class="empty"><b>No sales targets yet.</b><p>Create a target to see won value, forecast and stage health against a plan.</p>' + (opts.canManageCompany || opts.people.length ? '<button class="btn primary" id="new">New sales target</button>' : '') + '</div>';
      const b = el.querySelector('#new'); if (b) b.onclick = () => modal(null); return;
    }
    const t0 = today(), covering = targets.filter((t) => t.status === 'active' && t.periodStart + '-01' <= t0 && lastDay(t.periodEnd) >= t0), rank = { company: 0, team: 1, user: 2 };
    const target = targets.find((t) => t.id === qp.target) || covering.sort((a, b) => rank[a.scope] - rank[b.scope])[0] || targets.find((t) => t.status === 'active') || targets[0];
    const tr = qp.trange || 'whole'; let from = target.periodStart + '-01', to = lastDay(target.periodEnd);
    if (tr === 'todate' && t0 >= from) to = t0 < to ? t0 : to; else if (/^\d{4}-\d{2}$/.test(tr) && target.months.some((m) => m.month === tr)) { from = tr + '-01'; to = lastDay(tr); }
    const pq = new URLSearchParams({ from, to }); if (qp.rep) pq.set('userId', qp.rep); if (qp.source) pq.set('leadSourceId', qp.source);
    const perf = await api.get('/sales-targets/' + target.id + '/performance?' + pq.toString());
    const people = opts.people, who = target.scope === 'company' ? 'Whole company' : (people.find((x) => x.id === target.ownerId) || {}).name || '';
    const attain = perf.planned.revenue ? Math.min(100, Math.round(perf.won.amount * 100 / perf.planned.revenue)) : 0;
    el.innerHTML = '<h1>Sales targets</h1><p class="sub">Won value, forecast and stage health against the plan.</p>'
      + '<div class="bar"><select class="in" id="tsel" aria-label="Target">' + targets.map((t) => '<option value="' + t.id + '"' + (t.id === target.id ? ' selected' : '') + '>' + esc(t.name) + (t.status === 'archived' ? ' (archived)' : '') + '</option>').join('') + '</select>'
      + '<select class="in" id="range"><option value="whole">Whole period</option><option value="todate"' + (tr === 'todate' ? ' selected' : '') + '>Period to date</option>' + target.months.map((m) => '<option value="' + m.month + '"' + (tr === m.month ? ' selected' : '') + '>' + monthName(m.month) + '</option>').join('') + '</select>'
      + (target.scope !== 'user' ? '<select class="in" id="rep"><option value="">Everyone</option>' + people.map((x) => '<option value="' + x.id + '"' + (qp.rep === x.id ? ' selected' : '') + '>' + esc(x.name) + '</option>').join('') + '</select>' : '')
      + '<select class="in" id="src"><option value="">All sources</option><option' + (qp.source === 'Direct' ? ' selected' : '') + '>Direct</option><option' + (qp.source === 'Partner' ? ' selected' : '') + '>Partner</option></select>'
      + '<label><input type="checkbox" id="arch"' + (qp.archived === '1' ? ' checked' : '') + '> Show archived</label><span style="flex:1"></span>'
      + '<button class="btn" id="pipe">Pipeline settings</button><button class="btn" id="edit">Edit</button><button class="btn" id="arc">' + (target.status === 'archived' ? 'Restore' : 'Archive') + '</button><button class="btn primary" id="new">New target</button></div>'
      + '<p class="sub" style="margin-top:-6px">' + esc(target.name) + ' &middot; ' + esc(SCOPES[target.scope]) + (target.scope !== 'company' ? ': ' + esc(who) : '') + ' &middot; ' + monthName(target.periodStart) + ' to ' + monthName(target.periodEnd) + '</p>'
      + '<div class="cards"><div class="card"><small>Target for this range</small><strong>' + num(perf.planned.revenue) + '</strong><em>' + perf.planned.deals + ' deals</em></div><div class="card"><small>Won</small><strong>' + num(perf.won.amount) + '</strong><em><a href="#/leads?focus=won&focusFrom=' + from + '&focusTo=' + to + '">' + perf.won.deals + (perf.won.deals === 1 ? ' deal won' : ' deals won') + '</a></em></div><div class="card"><small>Still to win</small><strong>' + num(Math.max(0, perf.planned.revenue - perf.won.amount)) + '</strong><em>' + attain + '% of target reached</em></div><div class="card"><small>Forecast, not booked</small><strong>' + num(perf.forecast.weighted) + '</strong><em>open pipeline ' + num(perf.forecast.unweighted) + ', weighted by stage chance</em></div></div>'
      + '<div class="card" style="margin-bottom:14px"><small>Progress</small><div style="background:var(--sunk);border-radius:6px;margin-top:8px"><div style="height:14px;border-radius:6px;background:var(--b5);width:' + attain + '%"></div></div></div>'
      + '<div class="card" style="margin-bottom:14px"><b>By month</b><table><thead><tr><th>Month</th><th>Revenue target</th><th>Won</th><th>Deals target</th><th>Deals won</th><th>Reached</th></tr></thead><tbody>' + perf.byMonth.map((m) => '<tr><td>' + monthName(m.month) + '</td><td>' + num(m.revenueTarget) + '</td><td>' + num(m.wonAmount) + '</td><td>' + m.dealsTarget + '</td><td>' + m.wonDeals + '</td><td>' + (m.revenueTarget ? Math.round(m.wonAmount * 100 / m.revenueTarget) : 0) + '%</td></tr>').join('') + '</tbody></table></div>'
      + '<div class="card"><b>Open pipeline by stage</b><p class="sub" style="margin:2px 0 8px;font-size:12px">A lead is flagged when it has had no update for longer than the stage\'s day limit.</p><table><thead><tr><th>Stage</th><th>Leads</th><th>Value</th><th>Chance of winning</th><th>Flag after</th><th>Flagged</th></tr></thead><tbody>' + perf.byStage.map((s) => '<tr><td><a href="#/leads?statusId=' + s.key + '">' + esc(s.name) + '</a></td><td>' + s.count + '</td><td>' + num(s.value) + '</td><td>' + s.probability + '%</td><td>' + s.days + ' days</td><td>' + (s.flagged ? W.tagFor(s.flagged + ' flagged') : '-') + '</td></tr>').join('') + '</tbody></table></div>';
    el.querySelector('#tsel').onchange = (e) => go({ target: e.target.value, trange: '' });
    el.querySelector('#range').onchange = (e) => go({ trange: e.target.value === 'whole' ? '' : e.target.value });
    const rep = el.querySelector('#rep'); if (rep) rep.onchange = () => go({ rep: rep.value });
    el.querySelector('#src').onchange = (e) => go({ source: e.target.value });
    el.querySelector('#arch').onchange = (e) => go({ archived: e.target.checked ? '1' : '' });
    el.querySelector('#new').onclick = () => modal(null); el.querySelector('#edit').onclick = () => modal(target);
    el.querySelector('#arc').onclick = async () => { const arch = target.status !== 'archived'; try { await api.post('/sales-targets/' + target.id + '/' + (arch ? 'archive' : 'restore'), {}); W.toast('"' + target.name + '" ' + (arch ? 'archived. Its figures are unchanged.' : 'restored.')); W.rerender(); } catch (e) { W.toast(e.message); } };
    el.querySelector('#pipe').onclick = () => pipelineForm(opts.pipeline, () => W.rerender());
  } });

  function pipelineForm(cfg, done) {
    const names = { new: 'New', contacted: 'Contacted', qualified: 'Qualified', initial_discussion: 'Initial Discussion', proposal_sent: 'Proposal Sent', negotiation: 'Negotiation' };
    W.modal('Pipeline settings', '<p class="sub">The chance of winning weights the forecast. A lead is flagged when it has not been updated for the number of days shown.</p><table><thead><tr><th>Stage</th><th>Chance of winning</th><th>Flag after</th></tr></thead><tbody>' + Object.keys(cfg).map((k) => '<tr><td>' + names[k] + '</td><td><input class="in" name="p_' + k + '" inputmode="decimal" value="' + cfg[k].probability + '" size="5"> %</td><td><input class="in" name="d_' + k + '" inputmode="numeric" value="' + cfg[k].days + '" size="4"> days</td></tr>').join('') + '</tbody></table>', async (d) => {
      const body = {}; Object.keys(cfg).forEach((k) => { body[k] = { probability: d['p_' + k], days: d['d_' + k] }; });
      await api.put('/sales-targets/pipeline-settings', body); W.toast('Pipeline settings saved.'); done();
    }, 'Save settings');
  }

  function targetForm(t, opts, done) {
    const cur = (opts.pipeline && 'INR') || 'INR';
    const ym = new Date().toISOString().slice(0, 7);
    const st = { type: t ? t.periodType : 'half_year', start: t ? t.periodStart : ym, end: t ? t.periodEnd : addMonths(ym, 5), months: t ? t.months.map((m) => ({ month: m.month, revenue: String(m.revenueTarget), deals: String(m.dealsTarget) })) : [] };
    const A = t ? t.assumptions : { opportunityRate: 30, proposalRate: 50, winRate: 25 };
    const build = () => { const n = st.type === 'custom' ? 0 : PERIODS[st.type][1]; if (n) st.end = addMonths(st.start, n - 1); const list = []; let m = st.start; while (m <= st.end && list.length < 25) { list.push(m); m = addMonths(m, 1); } return list; };
    const regrid = (revTotal, dealTotal) => { const ms = build(); const rv = split(revTotal, ms.length), dl = split(dealTotal, ms.length); st.months = ms.map((m, i) => ({ month: m, revenue: String(rv[i]), deals: String(dl[i]) })); };
    if (!t) regrid(6000000, 60);
    const people = opts.people.filter((p) => p.reportCount > 0 || p.designation === 'Manager' || true);
    const body = () => F('name', 'Name', 'text', { value: t ? t.name : '', required: true }) + '<div class="two">' + F('scope', 'Whose target', 'select', { options: Object.keys(SCOPES).filter((k) => k !== 'company' || opts.canManageCompany).map((k) => ({ value: k, label: SCOPES[k] })), value: t ? t.scope : opts.canManageCompany ? 'company' : 'team' }) + '<div id="ownerbox">' + F('ownerId', 'Owner', 'select', { options: [{ value: '', label: 'Choose...' }].concat(people.map((p) => ({ value: p.id, label: p.name }))), value: t ? t.ownerId : '' }) + '</div></div>'
      + '<div class="two">' + F('periodType', 'Period', 'select', { options: Object.keys(PERIODS).map((k) => ({ value: k, label: PERIODS[k][0] })), value: st.type }) + F('start', 'First month', 'month', { value: st.start }) + '</div><div id="endbox">' + F('end', 'Last month', 'month', { value: st.end }) + '</div>'
      + '<div class="two">' + F('total', 'Revenue target (' + cur + ')', 'text', { value: String(st.months.reduce((s, m) => s + (parse(m.revenue) || 0), 0)) }) + F('deals', 'Deals to win', 'text', { value: String(st.months.reduce((s, m) => s + (Number(m.deals) || 0), 0)) }) + '</div>' + F('average', 'Average deal value', 'text', { value: t ? String(t.averageDealValue) : '100000' })
      + '<b>Month by month</b><div id="grid"></div><b>How leads turn into wins</b><div class="two">' + F('opp', 'Contacts that become opportunities (%)', 'text', { value: A.opportunityRate }) + F('prop', 'Opportunities that get a proposal (%)', 'text', { value: A.proposalRate }) + '</div>' + F('win', 'Proposals that are won (%)', 'text', { value: A.winRate }) + '<p id="plan" class="sub"></p>' + F('notes', 'Notes', 'textarea', { value: t ? t.notes || '' : '' }) + (t ? '<p class="sub">Changing a target changes only the plan. What was sold is read from the leads and stays as it is.</p>' : '');
    const m = W.modal(t ? 'Edit sales target' : 'New sales target', body(), async (d) => {
      const rev = parse(d.total), avg = parse(d.average), deals = /^\d+$/.test(d.deals.trim()) ? Number(d.deals) : NaN;
      const rates = { opportunityRate: Number(d.opp), proposalRate: Number(d.prop), winRate: Number(d.win) };
      if (d.name.trim().length < 2) throw new Error('Give the target a name, such as "H2 2026-27".');
      if (d.scope !== 'company' && !d.ownerId) throw new Error(d.scope === 'team' ? 'Choose the manager whose team this is.' : 'Choose the representative.');
      if (st.end < st.start) throw new Error('The last month is before the first.'); if (st.months.length > 24) throw new Error('A target covers at most 24 months.');
      if (!(rev > 0)) throw new Error('Enter the revenue target, such as 6000000.'); if (!(avg > 0)) throw new Error('Enter the average deal value, such as 100000.'); if (!(deals >= 1)) throw new Error('Enter at least one deal.');
      if (!Object.values(rates).every((r) => r > 0 && r <= 100)) throw new Error('Each rate is above 0 and at most 100.');
      const months = st.months.map((x) => ({ month: x.month, revenueTarget: parse(x.revenue), dealsTarget: /^\d+$/.test(String(x.deals)) ? Number(x.deals) : NaN }));
      if (months.some((x) => !(x.revenueTarget > 0) || Number.isNaN(x.dealsTarget))) throw new Error('Every month needs an amount and a whole number of deals.');
      const payload = { name: d.name.trim(), scope: d.scope, ownerId: d.scope === 'company' ? '' : d.ownerId, periodType: st.type, periodStart: st.start, periodEnd: st.end, currency: cur, averageDealValue: avg, months, assumptions: rates, notes: d.notes.trim() };
      if (t) await api.put('/sales-targets/' + t.id, payload); else await api.post('/sales-targets', payload);
      W.toast('"' + payload.name + '" ' + (t ? 'saved.' : 'created.')); done();
    }, t ? 'Save changes' : 'Create target');
    const root = m.el, q = (n) => root.querySelector('[name=' + n + ']');
    const drawGrid = () => { root.querySelector('#grid').innerHTML = st.months.map((x, i) => '<div class="bar"><span style="width:90px">' + monthName(x.month) + '</span><input class="in" data-r="' + i + '" value="' + esc(x.revenue) + '" size="12" aria-label="Revenue for ' + x.month + '"><input class="in" data-d="' + i + '" value="' + esc(x.deals) + '" size="5" aria-label="Deals for ' + x.month + '"></div>').join(''); root.querySelectorAll('[data-r]').forEach((i) => { i.oninput = () => { st.months[i.dataset.r].revenue = i.value.replace(/[^\d.]/g, ''); q('total').value = String(st.months.reduce((s, x) => s + (parse(x.revenue) || 0), 0)); plan(); }; }); root.querySelectorAll('[data-d]').forEach((i) => { i.oninput = () => { st.months[i.dataset.d].deals = i.value.replace(/\D/g, ''); q('deals').value = String(st.months.reduce((s, x) => s + (Number(x.deals) || 0), 0)); plan(); }; }); };
    const plan = () => { const dl = Number(q('deals').value), o = Number(q('opp').value) / 100, p = Number(q('prop').value) / 100, w = Number(q('win').value) / 100; const el2 = root.querySelector('#plan'); if (!(dl >= 1 && o > 0 && p > 0 && w > 0 && o <= 1 && p <= 1 && w <= 1)) { el2.textContent = ''; return; } const props = Math.ceil(dl / w), opps = Math.ceil(props / p), contacts = Math.ceil(opps / o); el2.innerHTML = 'This plan needs about <b>' + opps + '</b> opportunities, <b>' + props + '</b> proposals and <b>' + dl + '</b> deals won' + (st.months.length > 1 ? ' &middot; about ' + Math.ceil(contacts / st.months.length) + ' contact attempts a month' : '') + '.'; };
    const owner = () => { root.querySelector('#ownerbox').hidden = q('scope').value === 'company'; if (t) q('scope').disabled = q('ownerId').disabled = true; };
    q('scope').onchange = owner; owner();
    const periodChange = () => { st.type = q('periodType').value; st.start = q('start').value || st.start; if (st.type === 'custom') st.end = q('end').value || st.end; regrid(parse(q('total').value) || 0, Number(q('deals').value) || 0); q('end').value = st.end; root.querySelector('#endbox').hidden = st.type !== 'custom'; drawGrid(); plan(); };
    ['periodType', 'start', 'end'].forEach((n) => { q(n).onchange = periodChange; });
    q('total').oninput = () => { const v = parse(q('total').value); if (v > 0) { regrid(v, Number(q('deals').value) || 0); drawGrid(); } plan(); };
    q('deals').oninput = () => { const v = Number(q('deals').value); if (v >= 0) { const rv = st.months.reduce((s, x) => s + (parse(x.revenue) || 0), 0); regrid(rv, v); drawGrid(); } plan(); };
    ['opp', 'prop', 'win'].forEach((n) => { q(n).oninput = plan; });
    root.querySelector('#endbox').hidden = st.type !== 'custom'; drawGrid(); plan();
  }
})();
