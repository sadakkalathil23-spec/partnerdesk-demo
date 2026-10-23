// v2 features: global search, notifications (bell + page), the full lead page, and CSV import.
(() => {
  const W = WorkOS, esc = W.esc, F = W.field, reg = W.register;
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const when = (d) => d ? new Date(d).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const ago = (d) => { const m = Math.max(0, Math.floor((Date.now() - new Date(d)) / 60000)); return m < 1 ? 'just now' : m < 60 ? m + ' min ago' : m < 1440 ? Math.floor(m / 60) + ' h ago' : Math.floor(m / 1440) + ' d ago'; };

  // ---------------- global search ----------------
  function mountSearch() {
    const host = document.getElementById('gsearch'); if (!host || W.user().partner) return;
    host.innerHTML = '<input class="in" id="gs" type="search" autocomplete="off" placeholder="Search everything  (press /)" aria-label="Search leads, customers, partners, tickets and tasks"><div class="gs-pop" id="gspop" hidden role="listbox"></div>';
    const input = host.querySelector('#gs'), pop = host.querySelector('#gspop'); let timer, seq = 0, items = [], idx = -1;
    const close = () => { pop.hidden = true; idx = -1; };
    const mark = () => pop.querySelectorAll('a').forEach((a, i) => a.classList.toggle('on', i === idx));
    const draw = (groups, q) => { items = []; pop.innerHTML = groups.length ? groups.map((g) => '<div class="gs-g">' + esc(g.label) + '</div>' + g.items.map((it) => { items.push(it); return '<a href="' + esc(it.href) + '" role="option"><b>' + esc(it.title) + '</b><small>' + esc(it.sub) + '</small></a>'; }).join('')).join('') : '<div class="gs-empty">Nothing found for "' + esc(q) + '".</div>'; pop.hidden = false; idx = -1; };
    input.oninput = () => { clearTimeout(timer); const q = input.value.trim(); if (q.length < 2) { close(); return; } timer = setTimeout(async () => { const my = ++seq; try { const r = await api.get('/search?q=' + encodeURIComponent(q)); if (my === seq) draw(r.groups, q); } catch (e) { /* search is optional */ } }, 200); };
    input.onkeydown = (e) => { const links = pop.querySelectorAll('a'); if (e.key === 'Escape') { close(); input.blur(); } else if (e.key === 'ArrowDown' && links.length) { e.preventDefault(); idx = (idx + 1) % links.length; mark(); } else if (e.key === 'ArrowUp' && links.length) { e.preventDefault(); idx = (idx - 1 + links.length) % links.length; mark(); } else if (e.key === 'Enter' && links.length) { e.preventDefault(); (links[idx >= 0 ? idx : 0]).click(); } };
    pop.onclick = (e) => { if (e.target.closest('a')) { close(); input.value = ''; } };
    document.addEventListener('click', (e) => { if (!host.contains(e.target)) close(); });
    document.addEventListener('keydown', (e) => { if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName) && document.getElementById('gs')) { e.preventDefault(); document.getElementById('gs').focus(); } });
  }

  // ---------------- notifications ----------------
  let lastNotif = 0, notif = { items: [], unread: 0 };
  async function loadNotif(force) {
    const bell = document.getElementById('bell'); if (!bell || W.user().partner) { if (bell && W.user().partner) bell.hidden = true; return; }
    if (!force && Date.now() - lastNotif < 20000) return; lastNotif = Date.now();
    try { notif = await api.get('/notifications'); } catch (e) { return; }
    const b = document.getElementById('bn'); if (b) { b.hidden = !notif.unread; b.textContent = notif.unread > 99 ? '99+' : notif.unread; }
  }
  function mountBell() {
    const bell = document.getElementById('bell'); if (!bell || W.user().partner) { if (bell) bell.hidden = true; return; }
    const panel = document.createElement('div'); panel.className = 'bell-pop'; panel.hidden = true; bell.parentNode.insertBefore(panel, bell.nextSibling); bell.setAttribute('aria-haspopup', 'true');
    const draw = () => { panel.innerHTML = '<div class="bar" style="margin:0 0 6px"><b>Notifications</b><span style="flex:1"></span><button class="btn sm" id="mr"' + (notif.unread ? '' : ' disabled') + '>Mark all read</button></div>' + (notif.items.length ? notif.items.slice(0, 8).map((n, i) => '<a href="' + esc(n.href) + '" data-i="' + i + '" class="' + (n.read ? '' : 'unread') + '">' + esc(n.text) + '<small>' + esc(ago(n.at)) + '</small></a>').join('') : '<p class="sub" style="margin:8px 0">You are all caught up.</p>') + '<a href="#/notifications" class="all">See all notifications</a>';
      const mr = panel.querySelector('#mr'); if (mr) mr.onclick = async (e) => { e.stopPropagation(); await api.post('/notifications/read', { all: true }); await loadNotif(true); draw(); };
      panel.querySelectorAll('a[data-i]').forEach((a) => { a.onclick = async () => { const n = notif.items[a.dataset.i]; panel.hidden = true; await api.post('/notifications/read', { ids: [n.id] }); loadNotif(true); }; }); panel.querySelector('.all').onclick = () => { panel.hidden = true; }; };
    bell.onclick = async (e) => { e.stopPropagation(); if (panel.hidden) { await loadNotif(true); draw(); panel.hidden = false; } else panel.hidden = true; };
    document.addEventListener('click', (e) => { if (!panel.contains(e.target) && e.target !== bell) panel.hidden = true; });
    loadNotif(true);
  }
  window.addEventListener('pd-shell', () => { mountSearch(); mountBell(); });
  window.addEventListener('hashchange', () => loadNotif(false));
  setInterval(() => { if (document.visibilityState === 'visible') loadNotif(true); }, 60000);

  reg('/notifications', { render: async (el) => {
    let only = false;
    const draw = async () => {
      const d = await api.get('/notifications'), rows = d.items.filter((n) => !only || !n.read); notif = d; loadNotif(true);
      el.innerHTML = '<h1>Notifications</h1><p class="sub">Things that need your attention. Opening one marks it as read.</p><div class="bar"><label><input type="checkbox" id="un"' + (only ? ' checked' : '') + '> Unread only</label><span style="flex:1"></span><button class="btn" id="mr"' + (d.unread ? '' : ' disabled') + '>Mark all read</button></div>'
        + (rows.length ? '<div class="card" style="padding:4px 0">' + rows.map((n, i) => '<a class="nrow' + (n.read ? '' : ' unread') + '" href="' + esc(n.href) + '" data-i="' + i + '"><span class="tag ' + (n.read ? '' : 'info') + '">' + esc(n.kind) + '</span> ' + esc(n.text) + '<small>' + esc(ago(n.at)) + '</small></a>').join('') + '</div>' : '<div class="empty"><b>' + (only ? 'No unread notifications.' : 'You are all caught up.') + '</b></div>');
      el.querySelector('#un').onchange = (e) => { only = e.target.checked; draw(); };
      el.querySelector('#mr').onclick = async () => { await api.post('/notifications/read', { all: true }); draw(); };
      el.querySelectorAll('a[data-i]').forEach((a) => { a.onclick = () => { api.post('/notifications/read', { ids: [rows[a.dataset.i].id] }); }; });
    };
    await draw();
  } });

  // ---------------- full lead page ----------------
  const KIND = { activity: ['Activity', ''], note: ['Note', 'info'], followup: ['Follow-up', 'good'], proposal: ['Proposal', 'warn'] };
  reg('/lead', { perm: ['LEAD_VIEW_OWN', 'LEAD_VIEW_TEAM', 'LEAD_VIEW_ALL'], render: async (el, qp) => {
    if (!qp.id) { el.innerHTML = '<div class="empty">No lead was chosen. <a href="#/leads">Back to leads</a></div>'; return; }
    const canEdit = W.can('LEAD_EDIT'), canAssign = W.can('LEAD_ASSIGN'), canConvert = W.can('CONVERSION_CREATE'), ST = api.STATUSES;
    const draw = async () => {
      const [d, lk, users] = await Promise.all([api.get('/leads/' + qp.id + '/timeline'), api.get('/services/lookups'), api.get('/users/assignees')]);
      const l = d.lead, key = (ST.find((s) => s.name === l.status) || {}).key, won = l.status === 'Won';
      el.innerHTML = '<p><a href="#/leads">&larr; All leads</a></p><div class="bar"><div style="flex:1"><h1 style="margin:0">' + esc(l.company) + '</h1><p class="sub" style="margin:2px 0 0"><span class="mono">' + esc(l.number) + '</span> &middot; ' + W.tagFor(l.status) + (l.priority === 'high' ? ' <span class="tag warn">High priority</span>' : '') + ' <span class="tag">' + esc(l.leadType) + '</span>' + (l.deleted ? ' ' + W.tagFor('Deleted') : '') + '</p></div>'
        + (canEdit && !won ? '<button class="btn" id="st">Update status</button>' : '') + (canEdit ? '<button class="btn" id="nt">Add note</button><button class="btn" id="fu">Log follow-up</button>' : '') + (canAssign ? '<button class="btn" id="as">Assign</button>' : '') + (canConvert && api.CONVERSION_READY.includes(key) ? '<button class="btn primary" id="cv">Record conversion</button>' : '') + '</div>'
        + '<div class="two" style="align-items:start"><div><div class="card" style="margin-bottom:14px"><b>Details</b><dl class="kv" style="margin-top:8px"><dt>Contact</dt><dd>' + esc(l.contact || '-') + (l.email ? ' &middot; <a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a>' : '') + '</dd><dt>Owner</dt><dd>' + esc(l.ownerName) + '</dd><dt>Source</dt><dd>' + esc(l.source) + '</dd><dt>Service</dt><dd>' + esc(l.service || 'Not decided') + '</dd><dt>Estimated value</dt><dd>' + (l.estimatedValue ? W.money(l.estimatedValue, l.currency) : '-') + '</dd><dt>Next follow-up</dt><dd>' + (l.nextAction ? esc(when(l.nextAction)) : 'None scheduled') + '</dd><dt>Created</dt><dd>' + esc(when(l.createdAt)) + '</dd>' + (l.lossReason ? '<dt>Lost because</dt><dd>' + esc(l.lossReason) + '</dd>' : '') + '</dl></div>'
        + (d.partner ? '<div class="card" style="margin-bottom:14px"><b>Referred by a partner</b><p style="margin:6px 0 0">' + esc(d.partner.name) + ' <small class="mono">' + esc(d.partner.code) + '</small></p><p class="sub" style="margin:4px 0 0">Registered to them until ' + esc(new Date(d.protectedUntil).toLocaleDateString()) + '.</p></div>' : '')
        + (d.proposals.length ? '<div class="card"><b>Proposals</b>' + d.proposals.map((p) => '<div style="margin:6px 0">' + esc(p.proposalNumber) + ' <span class="tag">' + esc(p.status) + '</span></div>').join('') + '</div>' : '') + '</div>'
        + '<div class="card"><b>Timeline</b><p class="sub" style="margin:2px 0 8px;font-size:12px">Everything that has happened on this lead, newest first.</p>' + (d.events.length ? d.events.map((e) => '<div class="tl"><span class="tag ' + KIND[e.kind][1] + '">' + KIND[e.kind][0] + '</span> <small>' + esc(when(e.at)) + (e.who ? ' &middot; ' + esc(e.who) : '') + (e.internal === false ? ' &middot; visible to the partner' : '') + '</small><div>' + esc(e.text) + '</div></div>').join('') : '<p class="sub">Nothing yet.</p>') + '</div></div>';
      const done = async () => { await draw(); };
      const $ = (id) => el.querySelector(id);
      if ($('#nt')) $('#nt').onclick = () => W.modal('Add a note', F('text', 'Note', 'textarea') + '<label><input type="checkbox" name="internal" checked> Internal only (not shown to the partner)</label>', async (v) => { if (!String(v.text).trim()) throw new Error('Write the note first.'); await api.post('/leads/' + l.id + '/notes', { text: v.text.trim(), internal: !!v.internal }); W.toast('Note added.'); done(); }, 'Add note');
      if ($('#fu')) $('#fu').onclick = () => W.modal('Log a follow-up', F('outcome', 'How did it go?', 'textarea') + F('nextFollowUp', 'Next follow-up', 'date', { value: new Date(Date.now() + 864e5).toISOString().slice(0, 10) }), async (v) => { if (!String(v.outcome).trim()) throw new Error('Say how the follow-up went.'); await api.post('/leads/' + l.id + '/followups', { outcome: v.outcome, nextFollowUp: v.nextFollowUp }); W.toast('Logged.'); done(); }, 'Log follow-up');
      if ($('#as')) $('#as').onclick = () => W.modal('Assign ' + l.company, F('assignedUserId', 'Assign to', 'select', { options: [{ value: '', label: 'Choose someone...' }].concat(users.map((u) => ({ value: u.id, label: u.name + ' (' + u.openLeads + ' open)' }))), value: l.assignedTo }), async (v) => { if (!v.assignedUserId) throw new Error('Choose who should own this lead.'); await api.post('/leads/' + l.id + '/assign', { assignedUserId: v.assignedUserId }); W.toast('Assigned.'); done(); }, 'Assign');
      if ($('#cv')) $('#cv').onclick = () => W.modal('Record conversion: ' + l.company, F('amount', 'Final deal value', 'number', { value: l.estimatedValue }), async (v) => { await api.post('/leads/' + l.id + '/convert', { amount: v.amount }); W.toast(l.company + ' is now Won.'); done(); }, 'Record conversion');
      if ($('#st')) $('#st').onclick = () => { const m = W.modal('Update status', F('statusKey', 'Move to', 'select', { options: ST.filter((s) => s.key !== 'won' && (s.isActive !== false || s.key === key)).map((s) => ({ value: s.key, label: s.name })), value: key }) + '<div id="lb" hidden>' + F('lossReasonId', 'Why was it lost?', 'select', { options: [{ value: '', label: 'Choose a reason...' }].concat(lk.lossReasons.map((r) => ({ value: r.id, label: r.name }))) }) + '</div><div id="fb" hidden>' + F('nextFollowUp', 'Next follow-up date', 'date') + '</div>' + F('comment', 'Comment', 'textarea'), async (v) => {
        if (v.statusKey === key) throw new Error('Choose a different status.'); if (v.statusKey === 'lost' && !v.lossReasonId) throw new Error('Choose why the lead was lost.'); if (api.FOLLOWUP_REQUIRED.includes(v.statusKey) && (!v.nextFollowUp || !String(v.comment).trim())) throw new Error('This stage needs a next follow-up date and a comment.');
        await api.post('/leads/' + l.id + '/status', { statusKey: v.statusKey, lossReasonId: v.lossReasonId || undefined, nextFollowUp: v.nextFollowUp || undefined, comment: v.comment }); W.toast('Status updated.'); done(); }, 'Update status');
        const s = m.el.querySelector('[name=statusKey]'), sync = () => { m.el.querySelector('#lb').hidden = s.value !== 'lost'; m.el.querySelector('#fb').hidden = !api.FOLLOWUP_REQUIRED.includes(s.value); }; s.onchange = sync; sync(); };
    };
    await draw();
  } });

  // ---------------- CSV import ----------------
  const ALIAS = { company: ['company', 'company name', 'account', 'organisation', 'organization'], contact: ['contact', 'contact name', 'name', 'person'], email: ['email', 'email address'], estimatedValue: ['value', 'estimated value', 'estimatedvalue', 'amount', 'deal value'], priority: ['priority'], leadType: ['type', 'lead type', 'leadtype'], source: ['source'], service: ['service'] };
  function parseCsv(text) {
    const rows = []; let row = [], cur = '', q = false; text = text.replace(/^﻿/, '');
    for (let i = 0; i < text.length; i++) { const c = text[i]; if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; } else if (c === '"') q = true; else if (c === ',') { row.push(cur); cur = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some((x) => x.trim() !== '')) rows.push(row); row = []; } else cur += c; }
    row.push(cur); if (row.some((x) => x.trim() !== '')) rows.push(row);
    if (!rows.length) return []; const head = rows[0].map((h) => h.trim().toLowerCase()), map = {};
    Object.keys(ALIAS).forEach((k) => { const i = head.findIndex((h) => ALIAS[k].includes(h)); if (i >= 0) map[k] = i; });
    if (map.company == null) throw new Error('The first row must have a "company" column.');
    return rows.slice(1).map((r) => Object.fromEntries(Object.keys(map).map((k) => [k, (r[map[k]] || '').trim()])));
  }
  function importLeads(done) {
    let rows = null;
    const m = W.modal('Import leads from a CSV file', '<p class="sub">The first row must name the columns. Only <b>company</b> is required; contact, email, value, priority, type, source and service are optional. Duplicates (same company or email) are skipped, never overwritten.</p><p><a href="#" id="tpl">Download a template</a></p><div class="fld"><label>CSV file</label><input type="file" id="file" accept=".csv,text/csv" class="in"></div><div id="prev"></div>', async () => {
      if (!rows) throw new Error('Choose a file first.'); const r = await api.post('/leads/import', { rows }); W.toast('Imported ' + plural(r.created, 'lead') + (r.skipped.length ? ', skipped ' + r.skipped.length : '') + '.'); done && done();
    }, 'Import');
    const go = m.el.querySelector('.btn.primary'); go.disabled = true;
    m.el.querySelector('#tpl').onclick = (e) => { e.preventDefault(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob(['company,contact,email,value,priority,type,source,service\nExample Traders,A Person,a.person@example.test,250000,medium,B2C,Direct,Website\n'], { type: 'text/csv' })); a.download = 'leads-template.csv'; a.click(); URL.revokeObjectURL(a.href); };
    m.el.querySelector('#file').onchange = async (e) => {
      const box = m.el.querySelector('#prev'); rows = null; go.disabled = true; box.innerHTML = ''; const f = e.target.files[0]; if (!f) return;
      try { const parsed = parseCsv(await f.text()); const r = await api.post('/leads/import', { rows: parsed, dryRun: true }); rows = parsed; go.disabled = r.willCreate === 0; go.textContent = 'Import ' + plural(r.willCreate, 'lead');
        box.innerHTML = '<div class="alert ' + (r.willCreate ? 'ok' : 'warn') + '"><b>' + plural(r.willCreate, 'lead') + ' will be created</b>' + (r.skipped.length ? plural(r.skipped.length, 'row') + ' will be skipped.' : 'No problems found.') + '</div>' + (r.skipped.length ? '<table style="margin-top:8px"><thead><tr><th>Row</th><th>Company</th><th>Why it is skipped</th></tr></thead><tbody>' + r.skipped.slice(0, 20).map((s) => '<tr><td>' + s.row + '</td><td>' + esc(s.company || '-') + '</td><td>' + esc(s.reason) + '</td></tr>').join('') + '</tbody></table>' + (r.skipped.length > 20 ? '<p class="sub">and ' + (r.skipped.length - 20) + ' more.</p>' : '') : ''); }
      catch (er) { box.innerHTML = '<div class="alert danger"><b>This file cannot be imported</b>' + esc(er.message) + '</div>'; }
    };
  }
  window.PD = { importLeads, parseCsv };
})();
