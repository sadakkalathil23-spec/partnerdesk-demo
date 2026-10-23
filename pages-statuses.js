// Admin: lead statuses. Rename the extra ones, set where each sits in the 6-step sales journey, switch them on or off.
(() => {
  const W = WorkOS, esc = W.esc, F = W.field;
  W.register('/admin/lead-statuses', { perm: ['SETTINGS_MANAGE'], render: async (el) => {
    async function draw() {
      const d = await api.get('/lead-statuses'), steps = Array.from({ length: d.steps }, (_, i) => i + 1);
      el.innerHTML = '<h1>Lead statuses</h1><p class="sub">The stages a lead moves through. Each status sits at a step in the sales journey, shown on every lead as "2/' + d.steps + '". Built-in statuses keep their names because other screens rely on them; the ones you add can be renamed and switched off.</p><div class="bar"><span style="flex:1"></span><button class="btn primary" id="add">Add a status</button></div>'
        + '<table><thead><tr><th>Status</th><th>Step</th><th style="text-align:right">Leads</th><th>Shown</th><th></th></tr></thead><tbody>' + d.rows.map((s) => '<tr><td><b>' + esc(s.name) + '</b> ' + (s.system ? '<small>built in</small>' : '') + '</td><td><select class="in" data-step="' + esc(s.key) + '" aria-label="Step for ' + esc(s.name) + '">' + steps.map((n) => '<option' + (n === s.step ? ' selected' : '') + '>' + n + '</option>').join('') + '</select> <small>of ' + d.steps + '</small></td><td style="text-align:right">' + s.leads + '</td><td>' + (s.active ? 'On' : '<span class="tag warn">Off</span>') + '</td><td>' + (s.system ? '' : '<button class="btn sm" data-ren="' + esc(s.key) + '" data-name="' + esc(s.name) + '">Rename</button> <button class="btn sm" data-tog="' + esc(s.key) + '" data-on="' + (s.active ? '1' : '') + '">' + (s.active ? 'Switch off' : 'Switch on') + '</button>') + '</td></tr>').join('') + '</tbody></table>';
      el.querySelector('#add').onclick = () => W.modal('Add a status', F('name', 'Name', 'text', { required: true }) + F('step', 'Step in the journey', 'select', { options: steps.map((n) => ({ value: n, label: n + ' of ' + d.steps })), value: 2 }), async (f) => { await api.post('/lead-statuses', { name: f.name, step: f.step }); W.toast('Status added.'); await draw(); }, 'Add status');
      el.querySelectorAll('[data-step]').forEach((s) => { s.onchange = async () => { try { await api.patch('/lead-statuses/' + s.dataset.step, { step: s.value }); W.toast('Step saved.'); } catch (e) { W.toast(e.message); await draw(); } }; });
      el.querySelectorAll('[data-ren]').forEach((b) => { b.onclick = () => W.modal('Rename status', F('name', 'New name', 'text', { value: b.dataset.name, required: true }), async (f) => { await api.patch('/lead-statuses/' + b.dataset.ren, { name: f.name }); W.toast('Renamed. Leads in this status were updated.'); await draw(); }, 'Rename'); });
      el.querySelectorAll('[data-tog]').forEach((b) => { b.onclick = async () => { try { await api.patch('/lead-statuses/' + b.dataset.tog, { active: !b.dataset.on }); await draw(); } catch (e) { W.toast(e.message); } }; });
    }
    await draw();
  } });
})();
