// Admin: users, organisation, roles, services, settings, audit log.
(() => {
  const W = WorkOS, esc = W.esc, F = W.field, reg = W.register;
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const head = (t, s, meta) => '<h1>' + esc(t) + (meta ? ' <small style="font-size:14px;font-weight:400;color:var(--ink-m)">' + esc(meta) + '</small>' : '') + '</h1><p class="sub">' + esc(s) + '</p>';
  const when = (d) => d ? new Date(d).toLocaleString(undefined, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Never';
  const human = (s) => { const t = String(s).replace(/[._]+/g, ' ').trim(); return t.charAt(0).toUpperCase() + t.slice(1); };
  const opt = (list, blank, val) => '<option value="">' + esc(blank) + '</option>' + list.map((x) => '<option value="' + esc(x.id) + '"' + (val === x.id ? ' selected' : '') + '>' + esc(x.name || x.label) + '</option>').join('');

  // ---------------- users ----------------
  reg('/admin/users', { perm: ['USER_MANAGE'], render: async (el) => {
    const me = W.user(), [org, matrix, everyone] = await Promise.all([api.get('/org'), api.get('/users/permission-matrix'), api.get('/users?pageSize=200')]);
    const deps = org.departments, desigs = (depId) => (deps.find((d) => d.id === depId) || { designations: [] }).designations, roles = matrix.roles.filter((r) => r.key !== 'partner');
    const managers = everyone.rows.filter((x) => !x.partner && x.status === 'Active');
    let f = { q: '', departmentId: '', designationId: '', roleKey: '', status: '', del: false }, rows = [];
    const load = async () => { const p = new URLSearchParams(); ['q', 'departmentId', 'designationId', 'roleKey', 'status'].forEach((k) => { if (f[k]) p.set(k, f[k]); }); if (f.del) p.set('includeDeleted', 'true'); rows = (await api.get('/users?' + p.toString())).rows; };
    const draw = () => {
      const body = el.querySelector('#body');
      el.querySelector('#meta').textContent = plural(rows.length, 'user');
      body.innerHTML = rows.length ? '<table><thead><tr><th>Name</th><th>Department</th><th>Manager</th><th>Access profile</th><th>Status</th><th>Last sign-in</th><th></th></tr></thead><tbody>' + rows.map((r) => '<tr' + (r.deletedAt ? ' style="background:#FDF1F0"' : '') + '><td><b>' + esc(r.name) + '</b>' + (r.partner ? ' <span class="tag info">Partner account</span>' : '') + '<br><small>' + esc(r.email) + '</small></td><td>' + esc(r.department || 'Not classified') + (r.designation ? '<br><small>' + esc(r.designation) + '</small>' : '') + '</td><td>' + esc(r.managerName || '-') + '</td><td>' + esc(r.role.name) + '</td><td>' + (r.deletedAt ? W.tagFor('Deleted') : W.tagFor(r.status)) + (r.lockedUntil && new Date(r.lockedUntil) > new Date() ? '<br><small>Locked until ' + esc(when(r.lockedUntil)) + '</small>' : '') + '</td><td>' + esc(when(r.lastSignIn)) + '</td><td>' + (r.deletedAt ? '' : '<button class="btn sm" data-e="' + r.id + '">Edit</button>' + (r.lockedUntil && new Date(r.lockedUntil) > new Date() ? ' <button class="btn sm" data-ul="' + r.id + '">Unlock</button>' : '') + (r.id !== me.id ? ' <button class="btn sm danger" data-d="' + r.id + '">Delete</button>' : '')) + '</td></tr>').join('') + '</tbody></table>' : '<div class="empty"><b>No users match these filters.</b><p>' + (f.q ? 'Nothing matches "' + esc(f.q) + '" with the filters above. Clear the search or a filter to see more people.' : 'Clear a filter above to see more people.') + '</p></div>';
      body.querySelectorAll('[data-e]').forEach((b) => { b.onclick = () => edit(rows.find((r) => r.id === b.dataset.e)); });
      body.querySelectorAll('[data-ul]').forEach((b) => { b.onclick = async () => { await api.post('/users/' + b.dataset.ul + '/unlock', {}); W.toast('Account unlocked.'); await load(); draw(); }; });
      body.querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => { const r = rows.find((x) => x.id === b.dataset.d); W.modal('Delete ' + r.name + '?', '<p>They disappear from the directory and every assignee list, and are signed out of every device. Their leads, payments and audit entries are kept.</p>', async () => { await api.del('/users/' + r.id); W.toast(r.name + ' deleted.'); await load(); draw(); }, 'Delete user'); }; });
    };
    const fields = (v, isNew) => '<h4>Who they are</h4>' + (isNew ? F('email', 'Email (the setup link goes here; no password is ever sent)', 'email', { value: v.email }) : '') + F('name', 'Name (shown exactly as typed)', 'text', { value: v.name }) + F('phone', 'Phone', 'text', { value: v.phone })
      + '<h4>Where they work</h4><div class="fld"><label>Department</label><select class="in" name="departmentId">' + opt(deps, isNew ? 'Select a department...' : 'Not classified', v.departmentId) + '</select></div><div class="fld"><label>Designation (job title; it does not affect access)</label><select class="in" name="designationId"></select></div><div class="fld"><label>Manager (whose team list this user\'s leads appear in)</label><select class="in" name="managerId">' + opt(managers.map((m2) => ({ id: m2.id, name: m2.name + ' · ' + m2.role.name })), 'No manager', v.managerId) + '</select></div>'
      + '<h4>Access</h4><div class="fld"><label>Access profile' + (isNew ? '' : ' (changing this signs the user out of every device)') + '</label><select class="in" name="roleKey">' + roles.map((r) => '<option value="' + r.key + '"' + (r.key === v.roleKey ? ' selected' : '') + '>' + esc(r.label) + '</option>').join('') + '</select></div>' + F('timezone', 'Timezone (Region/City, e.g. Asia/Kolkata)', 'text', { value: v.timezone || 'Asia/Kolkata' });
    const wireDesig = (root, v) => { const d = root.querySelector('[name=departmentId]'), g = root.querySelector('[name=designationId]'); const sync = (keep) => { g.disabled = !d.value; g.innerHTML = '<option value="">' + (d.value ? 'Select a designation...' : 'Pick a department first') + '</option>' + desigs(d.value).map((x) => '<option value="' + x.id + '"' + (keep && x.id === v.designationId ? ' selected' : '') + '>' + esc(x.name) + '</option>').join(''); }; d.onchange = () => sync(false); sync(true); };
    function create() {
      const v = { email: '', name: '', phone: '', departmentId: '', designationId: '', managerId: '', roleKey: 'sales_executive', timezone: 'Asia/Kolkata' }; let deleted = null;
      const m = W.modal('New user', '<div id="warn"></div>' + fields(v, true), async (d) => {
        if (!d.email) throw new Error('Still needed: email.'); if (!d.name.trim()) throw new Error('Still needed: name.'); if (!d.designationId) throw new Error('Still needed: department and designation.');
        try { if (deleted) { await api.post('/users/' + deleted.id + '/restore', d); W.toast('Account restored and the details applied. It returns inactive; activate it from the directory.'); } else { await api.post('/users', d); W.toast('User created. A setup link will be sent to ' + d.email + '.'); } }
        catch (e) { if (e.deletedAccount) { deleted = e.deletedAccount; m.el.querySelector('#warn').innerHTML = '<div class="alert warn" style="margin-bottom:10px"><b>This email belongs to a deleted account</b><strong>' + esc(deleted.name) + '</strong> · ' + esc(deleted.roleName) + (deleted.deletedAt ? ', deleted ' + esc(when(deleted.deletedAt)) : '') + '. The address cannot be given to a second account, because everything it created still points at it.' + (deleted.partner ? ' This is the partner login for ' + esc(deleted.partner.companyName) + '; restoring brings it back as it was.' : ' Restoring brings the account back and applies the details entered here. It returns inactive.') + '</div>'; m.el.querySelector('.btn.primary').textContent = deleted.partner ? 'Restore account' : 'Restore and apply these details'; throw new Error('Review the notice above, then restore the account.'); } throw e; }
        await load(); draw();
      }, 'Create user'); wireDesig(m.el, v);
      m.el.querySelector('[name=email]').oninput = () => { deleted = null; m.el.querySelector('#warn').innerHTML = ''; m.el.querySelector('.btn.primary').textContent = 'Create user'; };
    }
    function edit(r) {
      const m = W.modal('Edit ' + r.name, (r.partner ? '<div class="alert ok" style="margin-bottom:10px"><b>Partner account</b>This login belongs to ' + esc(r.partner.companyName) + '. Its access profile is fixed, and it has no department or designation.</div>' : '') + (r.partner ? F('name', 'Name', 'text', { value: r.name }) : fields(r, false)) + F('status', 'Status (anything other than Active signs the user out immediately)', 'select', { options: ['Active', 'Suspended', 'Pending', 'Inactive'], value: r.status }) + '<p class="sub">Account: ' + esc(r.email) + ' · Last sign-in: ' + esc(when(r.lastSignIn)) + '</p>', async (d) => {
        if (!r.partner && d.departmentId && !d.designationId) throw new Error('Choose a designation for the selected department.');
        const res = await api.patch('/users/' + r.id, r.partner ? { name: d.name, status: d.status } : d); W.toast(res.signedOut ? 'Saved. ' + r.name + ' was signed out of every device.' : 'Changes saved.'); await load(); draw();
      }, 'Save changes'); if (!r.partner) wireDesig(m.el, r);
    }
    el.innerHTML = head('Users', 'Everyone who can sign in.', '') + '<div class="bar"><input class="in" id="q" placeholder="Search users (press Enter)" style="min-width:220px"><select class="in" id="dep">' + opt(deps, 'All departments') + '</select><select class="in" id="des"><option value="">All designations</option></select><select class="in" id="rk"><option value="">All access profiles</option>' + roles.map((r) => '<option value="' + r.key + '">' + esc(r.label) + '</option>').join('') + '</select><select class="in" id="st"><option value="">All statuses</option>' + ['Active', 'Suspended', 'Pending', 'Inactive'].map((s) => '<option>' + s + '</option>').join('') + '</select><label><input type="checkbox" id="del"> Show deleted</label><span id="meta" style="color:var(--ink-m)"></span><span style="flex:1"></span><button class="btn primary" id="new">New user</button></div><div id="body"></div>';
    const set = async (k, v) => { f[k] = v; await load(); draw(); };
    el.querySelector('#q').onkeydown = (e) => { if (e.key === 'Enter') set('q', e.target.value); };
    el.querySelector('#dep').onchange = (e) => { f.designationId = ''; el.querySelector('#des').innerHTML = '<option value="">All designations</option>' + desigs(e.target.value).map((g) => '<option value="' + g.id + '">' + esc(g.name) + '</option>').join(''); set('departmentId', e.target.value); };
    el.querySelector('#des').onchange = (e) => set('designationId', e.target.value); el.querySelector('#rk').onchange = (e) => set('roleKey', e.target.value); el.querySelector('#st').onchange = (e) => set('status', e.target.value); el.querySelector('#del').onchange = (e) => set('del', e.target.checked);
    el.querySelector('#new').onclick = create;
    await load(); draw();
  } });

  // ---------------- organisation ----------------
  reg('/admin/org', { perm: ['SETTINGS_MANAGE'], render: async (el) => {
    let showRetired = false;
    const draw = async () => {
      const org = await api.get('/org?includeRetired=' + showRetired), deps = org.departments;
      el.querySelector('#body').innerHTML = deps.length ? deps.map((d) => '<div class="card" style="margin-bottom:12px"><div class="bar" style="margin:0"><b>' + esc(d.name) + '</b> ' + (d.retired ? W.tagFor('Retired') : '') + '<span style="flex:1"></span><button class="btn sm" data-ed="' + d.id + '">Edit</button><button class="btn sm" data-rd="' + d.id + '" data-r="' + (d.retired ? '0' : '1') + '">' + (d.retired ? 'Restore' : 'Retire') + '</button><button class="btn sm danger" data-dd="' + d.id + '">Delete</button></div>' + (d.designations.length ? '<table><thead><tr><th>Designation</th><th></th></tr></thead><tbody>' + d.designations.map((g) => '<tr><td>' + esc(g.name) + ' ' + (g.retired ? W.tagFor('Retired') : '') + '</td><td><button class="btn sm" data-eg="' + g.id + '">Edit</button> <button class="btn sm" data-rg="' + g.id + '" data-r="' + (g.retired ? '0' : '1') + '">' + (g.retired ? 'Restore' : 'Retire') + '</button> <button class="btn sm danger" data-dg="' + g.id + '">Delete</button></td></tr>').join('') + '</tbody></table>' : '<p class="sub">' + (showRetired ? 'No designations.' : 'Every designation here is retired, or none exist. Tick "Show retired" to see them.') + '</p>') + '</div>').join('') : '<div class="empty">No departments yet.</div>';
      const find = (id) => deps.find((d) => d.id === id), findG = (id) => deps.flatMap((d) => d.designations).find((g) => g.id === id);
      const act = (fn) => async () => { try { await fn(); await draw(); } catch (e) { W.toast(e.message); } };
      el.querySelectorAll('[data-rd]').forEach((b) => { b.onclick = act(async () => { await api.patch('/org/departments/' + b.dataset.rd, { retired: b.dataset.r === '1' }); W.toast(b.dataset.r === '1' ? 'Retired. It stops being offered, and can be restored later.' : 'Restored.'); }); });
      el.querySelectorAll('[data-rg]').forEach((b) => { b.onclick = act(async () => { await api.patch('/org/designations/' + b.dataset.rg, { retired: b.dataset.r === '1' }); W.toast(b.dataset.r === '1' ? 'Retired. It stops being offered, and can be restored later.' : 'Restored.'); }); });
      el.querySelectorAll('[data-dd]').forEach((b) => { b.onclick = () => { if (confirm('Delete "' + find(b.dataset.dd).name + '" permanently?')) act(async () => { await api.del('/org/departments/' + b.dataset.dd); W.toast('Department deleted.'); })(); }; });
      el.querySelectorAll('[data-dg]').forEach((b) => { b.onclick = () => { if (confirm('Delete "' + findG(b.dataset.dg).name + '" permanently?')) act(async () => { await api.del('/org/designations/' + b.dataset.dg); W.toast('Designation deleted.'); })(); }; });
      el.querySelectorAll('[data-ed]').forEach((b) => { b.onclick = () => W.modal('Edit department', F('name', 'Name', 'text', { value: find(b.dataset.ed).name }), async (v) => { await api.patch('/org/departments/' + b.dataset.ed, { name: v.name }); draw(); }, 'Save department'); });
      el.querySelectorAll('[data-eg]').forEach((b) => { b.onclick = () => W.modal('Edit designation', F('name', 'Name', 'text', { value: findG(b.dataset.eg).name }), async (v) => { await api.patch('/org/designations/' + b.dataset.eg, { name: v.name }); draw(); }, 'Save designation'); });
      el.querySelector('#ng').onclick = () => W.modal('New designation', F('departmentId', 'Department', 'select', { options: deps.filter((d) => !d.retired).map((d) => ({ value: d.id, label: d.name })) }) + F('name', 'Name', 'text'), async (v) => { await api.post('/org/designations', v); draw(); }, 'Save designation');
    };
    el.innerHTML = head('Organisation', 'Departments and the job titles inside them.') + '<div class="bar"><label><input type="checkbox" id="sr"> Show retired</label><span style="flex:1"></span><button class="btn" id="ng">New designation</button><button class="btn primary" id="nd">New department</button></div><div id="body"></div>';
    el.querySelector('#sr').onchange = (e) => { showRetired = e.target.checked; draw(); };
    el.querySelector('#nd').onclick = () => W.modal('New department', F('name', 'Name', 'text'), async (v) => { await api.post('/org/departments', v); draw(); }, 'Save department');
    await draw();
  } });

  // ---------------- roles ----------------
  reg('/admin/roles', { perm: ['ROLE_MANAGE'], render: async (el) => {
    let data = await api.get('/users/permission-matrix'), roleId = data.roles[0].id, sel = new Set();
    const cur = () => data.roles.find((r) => r.id === roleId), dirty = () => { const r = cur(); return r.permissionIds.length !== sel.size || r.permissionIds.some((x) => !sel.has(x)); };
    const pick = (id) => { if (roleId !== id && dirty() && !confirm('You have unsaved changes to ' + cur().label + '. Choosing another role discards them.')) return; roleId = id; sel = new Set(cur().permissionIds); draw(); };
    const draw = () => {
      const r = cur(), sa = r.key === 'super_admin', d = dirty();
      el.innerHTML = head('Roles', 'The permissions each role holds: what its users are allowed to see and do. A permission belongs to a role, never to one person.') + '<div class="bar"><span>Role to view or edit</span>' + data.roles.map((x) => '<button class="btn sm" data-r="' + x.id + '"' + (x.id === roleId ? ' style="border-color:var(--b5);color:var(--b6);font-weight:600"' : '') + '>' + esc(x.label) + '</button>').join('') + '</div>' + (d ? '<p class="sub">You have unsaved changes to ' + esc(r.label) + '. Choosing another role discards them.</p>' : '')
        + (sa ? '<div class="alert ok" style="margin-bottom:12px"><b>The Super Admin role cannot be edited</b>It always holds every permission, so there is always someone who cannot be locked out.</div>' : '')
        + '<div class="card"><b>' + esc(r.label) + '</b> <span class="tag">' + plural(sa ? data.permissions.length : sel.size, 'permission') + '</span> <span class="tag">' + (r.isSystem ? 'Built-in role' : 'Custom role') + '</span>' + data.modules.map((mod) => { const ps = data.permissions.filter((p) => p.module === mod), all = ps.every((p) => sel.has(p.id)); return '<div style="margin-top:14px"><div class="bar" style="margin:0"><b>' + esc(human(mod)) + '</b>' + (sa ? '' : '<button class="btn sm" data-mod="' + mod + '" data-on="' + (all ? '0' : '1') + '">' + (all ? 'Clear all in ' : 'Select all in ') + esc(human(mod)) + '</button>') + '</div>' + ps.map((p) => '<label style="display:block;margin:4px 0"><input type="checkbox" data-p="' + p.id + '"' + (sa || sel.has(p.id) ? ' checked' : '') + (sa ? ' disabled' : '') + '> ' + esc(human(p.key)) + ' <small class="mono">' + esc(p.key) + '</small></label>').join('') + '</div>'; }).join('')
        + (sa ? '' : '<div class="bar" style="margin-top:14px"><span class="sub">' + (d ? 'Saving signs out everyone with the ' + esc(r.label) + ' role. They get the new permissions when they sign in again.' : 'No unsaved changes.') + '</span><span style="flex:1"></span>' + (d ? '<button class="btn" id="undo">Undo changes</button>' : '') + '<button class="btn primary" id="save"' + (d ? '' : ' disabled') + '>Save role</button></div>') + '</div>';
      el.querySelectorAll('[data-r]').forEach((b) => { b.onclick = () => pick(b.dataset.r); });
      el.querySelectorAll('[data-p]').forEach((c) => { c.onchange = () => { c.checked ? sel.add(c.dataset.p) : sel.delete(c.dataset.p); draw(); }; });
      el.querySelectorAll('[data-mod]').forEach((b) => { b.onclick = () => { data.permissions.filter((p) => p.module === b.dataset.mod).forEach((p) => { b.dataset.on === '1' ? sel.add(p.id) : sel.delete(p.id); }); draw(); }; });
      const u = el.querySelector('#undo'); if (u) u.onclick = () => { sel = new Set(cur().permissionIds); draw(); };
      const s = el.querySelector('#save'); if (s) s.onclick = async () => { try { await api.post('/users/roles/' + r.id + '/permissions', { permissionIds: [...sel] }); W.toast(r.label + ' updated. Everyone with this role is signed out and picks it up on next sign-in.'); data = await api.get('/users/permission-matrix'); sel = new Set(cur().permissionIds); draw(); } catch (e) { W.toast(e.message); } };
    };
    sel = new Set(cur().permissionIds); draw();
  } });

  // ---------------- services ----------------
  const amt = (v) => { const s = String(v == null ? '' : v).replace(/[,\s]/g, ''); return !s ? '' : /^\d+(\.\d{1,2})?$/.test(s) ? Number(s) : NaN; };
  reg('/admin/services', { perm: ['SERVICE_MANAGE'], render: async (el) => {
    let showArchived = false;
    const draw = async () => {
      const all = (await api.get('/services?pageSize=200')).rows, rows = all.filter((s) => showArchived || !s.archived);
      el.querySelector('#body').innerHTML = rows.length ? '<table><thead><tr><th>Service</th><th>Category</th><th>Default amount</th><th>Default payout %</th><th></th><th></th></tr></thead><tbody>' + rows.map((r) => '<tr><td><b>' + esc(r.name) + '</b></td><td>' + esc(r.category || '-') + '</td><td>' + Number(r.defaultAmount || 0).toLocaleString('en-IN') + '</td><td>' + (r.defaultPct != null ? r.defaultPct + '%' : '-') + '</td><td>' + (r.archived ? W.tagFor('Archived') : '') + '</td><td><button class="btn sm" data-e="' + r.id + '">Edit</button> <button class="btn sm" data-a="' + r.id + '">' + (r.archived ? 'Restore' : 'Archive') + '</button></td></tr>').join('') + '</tbody></table>' : '<div class="empty"><b>' + (all.length ? 'Every service is archived.' : 'No services yet.') + '</b><p>' + (all.length ? 'Tick "Show archived" to see them, or add a new service.' : 'Add one to make it selectable on leads and conversions.') + '</p></div>';
      el.querySelectorAll('[data-e]').forEach((b) => { b.onclick = () => form(all.find((r) => r.id === b.dataset.e)); });
      el.querySelectorAll('[data-a]').forEach((b) => { b.onclick = () => { const r = all.find((x) => x.id === b.dataset.a); if (!r.archived) { W.modal('Archive ' + r.name + '?', '<p>It stops being selectable on new leads, conversions and partner referrals straight away. Existing records keep it.</p>', async () => { await api.patch('/services/' + r.id, { archived: true }); draw(); }, 'Archive service'); } else api.patch('/services/' + r.id, { archived: false }).then(draw); }; });
    };
    const form = (s) => W.modal(s ? 'Edit ' + s.name : 'New service', F('name', 'Name', 'text', { value: s ? s.name : '' }) + F('category', 'Category', 'text', { value: s ? s.category : '' }) + F('defaultAmount', 'Default amount (type the full amount, for example 10000)', 'text', { value: s ? s.defaultAmount : '' }) + F('defaultPct', 'Default payout percentage (used when no rule fits)', 'text', { value: s ? s.defaultPct : '' }), async (d) => {
      const need = [!d.name.trim() && 'name', !d.category.trim() && 'category'].filter(Boolean); if (need.length) throw new Error('Still needed: ' + need.join(' and ') + '.');
      const a = amt(d.defaultAmount), p = d.defaultPct === '' ? '' : Number(d.defaultPct); if (Number.isNaN(a)) throw new Error('One of the amounts could not be read. Type each as a full amount, for example 10000 or 100.50.'); if (p !== '' && !(p >= 0 && p <= 100)) throw new Error('The payout percentage must be between 0 and 100.');
      const body = { name: d.name.trim(), category: d.category.trim(), defaultAmount: a === '' ? 0 : a, defaultPct: p === '' ? 0 : p };
      if (s) await api.patch('/services/' + s.id, body); else await api.post('/services', Object.assign(body, { archived: false })); W.toast(s ? 'Service updated.' : 'Service created.'); draw();
    }, s ? 'Save changes' : 'Create service');
    el.innerHTML = head('Services', 'What you sell. Archived services stay on old records but cannot be picked for new ones.') + '<div class="bar"><label><input type="checkbox" id="sa"> Show archived</label><span style="flex:1"></span><button class="btn primary" id="new">New service</button></div><div id="body"></div>';
    el.querySelector('#sa').onchange = (e) => { showArchived = e.target.checked; draw(); }; el.querySelector('#new').onclick = () => form(null);
    await draw();
  } });

  // ---------------- settings ----------------
  const SETTINGS = [
    ['lead_protection_days', 'Lead protection window', 'number', 'days', 'Leads and attribution', 'How long a partner keeps the claim on a referred account. After it lapses the company is free for a new claim; it does not strip attribution from a live lead.'],
    ['protection_resets_on_activity', 'Activity resets the protection clock', 'boolean', '', 'Leads and attribution', 'On: a qualifying touch restarts the window, so a worked lead never lapses mid-conversation.'],
    ['csv_import_max_rows', 'CSV import row limit', 'number', 'rows', 'Leads and attribution', 'Files with more rows than this are rejected before any row is written.'],
    ['lead_default_assignee_email', 'New leads are assigned to', 'email', '', 'Leads and attribution', 'The email of the active internal user every new lead goes to. Clear it to send new leads to the unassigned queue.'],
    ['unassigned_amber_hours', 'Unassigned turns amber at', 'number', 'hours', 'Queues and follow-ups', 'How long a lead may sit unassigned before the queue badge turns amber as a warning.'],
    ['unassigned_red_hours', 'Unassigned turns red at', 'number', 'hours', 'Queues and follow-ups', 'How long before the badge turns red. Keep it comfortably above the amber value.'],
    ['followup_escalation_hours', 'Follow-up escalates after', 'number', 'hours', 'Queues and follow-ups', 'An overdue follow-up notifies the sales manager once this much time has passed.']
  ];
  reg('/admin/settings', { perm: ['SETTINGS_MANAGE'], render: async (el) => {
    const s = await api.get('/settings'), groups = [...new Set(SETTINGS.map((x) => x[4]))];
    el.innerHTML = head('Settings', 'Company-wide rules. Changes are logged.') + '<form id="f" style="max-inline-size:620px"><div id="msg"></div>' + groups.map((g) => '<div class="card" style="margin-bottom:14px"><b>' + esc(g) + '</b>' + SETTINGS.filter((x) => x[4] === g).map((x) => '<div class="fld" style="margin-top:12px"><label>' + esc(x[1]) + (x[3] ? ' (' + x[3] + ')' : '') + '</label>' + (x[2] === 'boolean' ? '<label><input type="checkbox" name="' + x[0] + '"' + (s[x[0]] ? ' checked' : '') + '> On</label>' : '<input class="in" name="' + x[0] + '" type="' + (x[2] === 'email' ? 'email' : 'text') + '" value="' + esc(s[x[0]] == null ? '' : s[x[0]]) + '">') + '<small class="sub">' + esc(x[5]) + '</small></div>').join('') + '</div>').join('') + '<button class="btn primary">Save settings</button></form>';
    el.querySelector('#f').onsubmit = async (e) => { e.preventDefault(); const f = e.target, body = {}; SETTINGS.forEach((x) => { body[x[0]] = x[2] === 'boolean' ? f[x[0]].checked : f[x[0]].value.trim(); }); try { await api.put('/settings', body); el.querySelector('#msg').innerHTML = '<div class="alert ok" style="margin-bottom:12px">Settings saved.</div>'; } catch (er) { el.querySelector('#msg').innerHTML = '<div class="alert danger" style="margin-bottom:12px"><b>Not saved</b>' + esc(er.message) + '</div>'; } };
  } });

  // ---------------- audit ----------------
  const TYPES = ['lead', 'partner', 'user', 'role', 'service', 'conversion', 'payment', 'incentive', 'incentive_rule', 'partner_payout', 'system_setting', 'org', 'attendance', 'sales_target', 'support_ticket', 'support_contract', 'task'];
  const NOTABLE = /(deleted|restored|voided|rejected|approved|paid|permissions)/;
  reg('/admin/audit', { perm: ['AUDIT_VIEW'], render: async (el) => {
    let f = { entityType: '', action: '', entityId: '' }, page = 1;
    const draw = async () => {
      const p = new URLSearchParams({ page: String(page) }); Object.keys(f).forEach((k) => { if (f[k]) p.set(k, f[k]); }); const d = await api.get('/audit?' + p.toString()), rows = d.rows;
      el.querySelector('#meta').textContent = plural(d.total, 'entry').replace('entrys', 'entries');
      el.querySelector('#body').innerHTML = rows.length ? '<table><thead><tr><th>When</th><th>Done by</th><th>Action</th><th>Record type</th><th>Reason</th><th></th></tr></thead><tbody>' + rows.map((r) => '<tr><td>' + esc(when(r.createdAt)) + '</td><td>' + (r.actor ? esc(r.actor.name) : 'System') + '</td><td>' + esc(human(r.action)) + (NOTABLE.test(r.action) ? ' <span class="tag warn" title="A delete, restore, approval, payment or permission change">Notable</span>' : '') + '</td><td>' + esc(human(r.entityType)) + '</td><td>' + (r.reason ? esc(r.reason) : '-') + '</td><td><button class="btn sm" data-v="' + r.id + '">View details</button></td></tr>').join('') + '</tbody></table><div class="pager"><button class="btn sm" id="pv"' + (page <= 1 ? ' disabled' : '') + '>Previous</button> Page ' + d.page + ' of ' + d.pageCount + ' <button class="btn sm" id="nx"' + (page >= d.pageCount ? ' disabled' : '') + '>Next</button></div>' : '<div class="empty"><b>' + (Object.values(f).some(Boolean) ? 'No audit entries match these filters.' : 'No audit entries yet.') + '</b><p>' + (Object.values(f).some(Boolean) ? 'Use Clear filters above to see every entry.' : '') + '</p></div>';
      el.querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => { const r = rows.find((x) => x.id === b.dataset.v); W.modal('Audit entry', '<pre style="background:var(--sunk);padding:12px;border-radius:8px;font-size:12px;overflow:auto">' + esc(JSON.stringify(r, null, 2)) + '</pre>', null).el.querySelector('[data-x]').textContent = 'Close'; }; });
      const pv = el.querySelector('#pv'), nx = el.querySelector('#nx'); if (pv) pv.onclick = () => { page--; draw(); }; if (nx) nx.onclick = () => { page++; draw(); };
    };
    el.innerHTML = head('Audit log', 'A record of every important change: who did what, and when. Entries cannot be edited or removed by anyone.') + '<div class="bar"><input class="in" id="a" placeholder="Action contains, e.g. deleted (press Enter)"><select class="in" id="t"><option value="">All record types</option>' + TYPES.map((t) => '<option value="' + t + '">' + esc(human(t)) + '</option>').join('') + '</select><input class="in" id="i" placeholder="Record ID"><button class="btn" id="c">Clear filters</button><span id="meta" style="color:var(--ink-m)"></span></div><div id="body"></div>';
    const apply = () => { page = 1; draw(); };
    el.querySelector('#a').onkeydown = (e) => { if (e.key === 'Enter') { f.action = e.target.value; apply(); } };
    el.querySelector('#t').onchange = (e) => { f.entityType = e.target.value; apply(); };
    el.querySelector('#i').onkeydown = (e) => { if (e.key === 'Enter') { f.entityId = e.target.value; apply(); } };
    el.querySelector('#c').onclick = () => { f = { entityType: '', action: '', entityId: '' }; ['#a', '#i', '#t'].forEach((s) => { el.querySelector(s).value = ''; }); apply(); };
    await draw();
  } });
})();
