// Leads: table + pipeline board, filters kept in the page address, saved views, bulk actions.
(() => {
  const W = WorkOS, esc = W.esc, F = W.field;
  const ST = api.STATUSES, stName = (k) => (ST.find((s) => s.key === k) || {}).name || k, stKey = (n) => (ST.find((s) => s.name === n) || {}).key;
  const PRI = [['high', 'High'], ['medium', 'Medium'], ['low', 'Low']];
  const FOCUS = { untouched: 'Leads not yet contacted (still New)', updated: 'Leads that were updated', won: 'Leads that were won', calls_done: 'Leads with a call completed', calls_pending: 'Leads with a call pending', followups_done: 'Leads with a follow-up completed', followups_pending: 'Leads with a follow-up pending', messages_done: 'Leads with a message sent', meetings_done: 'Leads with a meeting completed' };
  const VIEWS = 'partnerdesk.leadViews', FACETS = 'partnerdesk.leadFacets';
  const FILTERS = ['q', 'statusId', 'serviceId', 'leadType', 'leadSourceId', 'assignedUserId', 'priority', 'createdFrom', 'createdTo', 'unassigned'];
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch (e) { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } };
  const dt = (d) => d ? new Date(d).toLocaleString(undefined, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-';

  WorkOS.register('/leads', { perm: ['LEAD_VIEW_OWN', 'LEAD_VIEW_TEAM', 'LEAD_VIEW_ALL'], render: async (el, qp) => {
    const canEdit = W.can('LEAD_EDIT'), canConvert = W.can('CONVERSION_CREATE'), canAssign = W.can('LEAD_ASSIGN'), canDelete = W.can('LEAD_DELETE'), canExport = W.can('LEAD_EXPORT'), canCreate = W.can('LEAD_CREATE');
    const board = qp.view === 'board', sortBy = qp.sortBy || 'updatedAt', sortDir = qp.sortDir || 'desc', pageSize = qp.pageSize || '25';
    const focus = FOCUS[qp.focus] ? qp.focus : '';
    const [lk, assignees] = await Promise.all([api.get('/services/lookups'), api.get('/users/assignees')]);
    const lossReasons = lk.lossReasons || [], owner = (id) => (assignees.find((u) => u.id === id) || {}).name || 'Unassigned';
    let views = read(VIEWS, []), data = null, sel = new Set(), open = false;
    const active = () => FILTERS.filter((k) => qp[k] && qp[k] !== 'false').length;
    const query = () => { const p = new URLSearchParams(); FILTERS.forEach((k) => { if (qp[k]) p.set(k, qp[k]); }); if (qp.includeDeleted === 'true') p.set('includeDeleted', 'true'); ['focus', 'focusFrom', 'focusTo'].forEach((k) => { if (focus && qp[k]) p.set(k, qp[k]); }); return p; };
    const go = (patch, keepPage) => { const p = new URLSearchParams(qp); Object.keys(patch).forEach((k) => { const v = patch[k]; if (v === undefined || v === '' || v === false) p.delete(k); else p.set(k, String(v)); }); if (!keepPage) p.delete('page'); location.hash = '#/leads' + (p.toString() ? '?' + p.toString() : ''); };
    const applyView = (qs) => { const p = new URLSearchParams(qs); if (board) p.set('view', 'board'); location.hash = '#/leads' + (p.toString() ? '?' + p.toString() : ''); };
    const here = () => { const p = new URLSearchParams(); FILTERS.forEach((k) => { if (qp[k]) p.set(k, qp[k]); }); return p.toString(); };
    const load = async () => { const p = query(); p.set('page', qp.page || '1'); p.set('pageSize', board ? '100' : pageSize); p.set('sortBy', sortBy); p.set('sortDir', sortDir); data = await api.get('/leads?' + p.toString()); };
    const toastErr = (e) => W.toast(e.message || 'Something went wrong');

    // ---------- shell of the page ----------
    const chips = [{ name: 'All leads', query: '' }].concat(lk.statuses.map((s) => ({ name: s.name, query: 'statusId=' + s.id })));
    const facet = (id, label, hint, applied, inner) => { const col = read(FACETS, {})[id]; return '<details data-facet="' + id + '"' + (col ? '' : ' open') + ' style="margin-bottom:10px"><summary style="cursor:pointer;font-weight:500" title="' + esc(hint || '') + '">' + esc(label) + (applied ? ' <span class="tag info">' + esc(applied) + '</span>' : '') + '</summary><div style="margin-top:6px">' + inner + '</div></details>'; };
    const sel_ = (key, label, opts, value) => '<select class="in" data-q="' + key + '" aria-label="' + esc(label) + '"><option value="">' + esc(label) + '</option>' + opts.map((o) => '<option value="' + esc(o[0]) + '"' + (String(value) === String(o[0]) ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
    const nm = (list, id) => (list.find((x) => x.id === id) || {}).name;
    const panel = () => facet('status', 'Status', 'Where the lead stands, from New to Won or Lost.', (ST.find((s) => s.key === qp.statusId) || {}).name, sel_('statusId', 'All statuses', ST.map((s) => [s.key, s.name]), qp.statusId))
      + facet('owner', 'Owner', '', qp.unassigned ? 'Unassigned' : nm(assignees, qp.assignedUserId), sel_('assignedUserId', 'All owners', assignees.map((u) => [u.id, u.name]), qp.assignedUserId) + (canAssign ? '<label style="display:block;margin-top:6px"><input type="checkbox" data-q="unassigned"' + (qp.unassigned ? ' checked' : '') + '> Unassigned only</label>' : ''))
      + facet('source', 'Source', '', qp.leadSourceId, sel_('leadSourceId', 'All sources', lk.sources.map((s) => [s.id, s.name]), qp.leadSourceId))
      + facet('type', 'Becomes', 'The kind of customer this lead becomes if won: our own client (B2C) or a partner\'s client (B2B).', qp.leadType, sel_('leadType', 'All lead types', [['B2C', 'B2C: our own client'], ['B2B', 'B2B: a partner\'s client']], qp.leadType))
      + facet('priority', 'Priority', '', (PRI.find((p) => p[0] === qp.priority) || [])[1], sel_('priority', 'All priorities', PRI, qp.priority))
      + facet('service', 'Service', '', nm(lk.services, qp.serviceId), sel_('serviceId', 'All services', lk.services.map((s) => [s.id, s.name]), qp.serviceId))
      + facet('created', 'Created', '', qp.createdFrom || qp.createdTo ? (qp.createdFrom || '...') + ' to ' + (qp.createdTo || '...') : '', '<input class="in" type="date" data-q="createdFrom" value="' + esc(qp.createdFrom || '') + '" aria-label="Created from"> <input class="in" type="date" data-q="createdTo" value="' + esc(qp.createdTo || '') + '" aria-label="Created to">')
      + (canDelete ? '<label><input type="checkbox" data-q="includeDeleted"' + (qp.includeDeleted === 'true' ? ' checked' : '') + '> Show deleted</label>' : '');
    el.innerHTML = '<h1>Leads <small id="meta" style="font-size:14px;color:var(--ink-m);font-weight:400"></small></h1><p class="sub">Every lead you can see. Click a row for a quick look.</p>'
      + '<div class="bar">' + (canExport ? '<button class="btn" id="exp" title="Download the leads matching the current filters as a CSV file">Export</button>' : '') + '<span style="flex:1"></span>' + (canCreate ? '<button class="btn" id="imp">Import CSV</button><button class="btn primary" id="new">New lead</button>' : '') + '</div>'
      + '<nav class="bar" aria-label="Saved views">' + chips.map((c) => '<button class="btn sm" data-v="' + esc(c.query) + '"' + (here() === c.query ? ' style="border-color:var(--b5);color:var(--b6)"' : '') + '>' + esc(c.name) + '</button>').join('') + views.map((v) => '<span><button class="btn sm" data-v="' + esc(v.query) + '"' + (here() === v.query ? ' style="border-color:var(--b5);color:var(--b6)"' : '') + '>' + esc(v.name) + '</button><button class="btn sm" data-dv="' + esc(v.name) + '" aria-label="Delete the ' + esc(v.name) + ' view">&times;</button></span>').join('') + (active() && !views.some((v) => v.query === here()) ? '<button class="btn sm" id="sv">Save this view</button>' : '') + '</nav>'
      + (focus ? '<div class="alert ok" style="margin-bottom:12px">' + esc(FOCUS[focus]) + (qp.focusFrom ? '. Opened from the sales overview.' : '.') + ' <button class="btn sm" id="cf">Show all leads</button></div>' : '')
      + '<div class="bar"><button class="btn" id="fb" aria-expanded="false"' + (active() ? ' style="font-weight:600;border-color:var(--b5)"' : '') + '>Filters' + (active() ? ' &middot; ' + active() : '') + '</button><input class="in" id="q" placeholder="Company, contact, lead number, email (press Enter)" value="' + esc(qp.q || '') + '" style="min-width:260px" aria-label="Search leads">' + (active() ? '<button class="btn" id="ca">Clear ' + plural(active(), 'filter') + '</button>' : '') + '<span class="tag" role="group" aria-label="Arrangement"><a data-view="table" style="text-decoration:none;cursor:pointer;' + (board ? '' : 'font-weight:600') + '">Table</a> | <a data-view="board" style="text-decoration:none;cursor:pointer;' + (board ? 'font-weight:600' : '') + '">Board</a></span><span id="cnt" style="color:var(--ink-m)"></span>' + (board ? '' : '<select class="in" id="ps" aria-label="Rows per page">' + ['25', '50', '100'].map((n) => '<option value="' + n + '"' + (pageSize === n ? ' selected' : '') + '>' + n + ' rows</option>').join('') + '</select>') + '</div>'
      + '<div id="fp" class="card" hidden style="margin-bottom:12px;max-width:520px">' + panel() + '</div><div id="body"></div><div id="pg"></div><div id="bulk" class="card" hidden style="position:sticky;bottom:12px;display:flex;gap:8px;align-items:center;box-shadow:0 8px 24px rgb(15 27 42/.15)"></div>';

    // ---------- table ----------
    const drawBulk = () => { const b = el.querySelector('#bulk'); b.hidden = !sel.size; if (!sel.size) return; b.style.display = 'flex'; b.innerHTML = '<b>' + plural(sel.size, 'lead') + ' selected</b>' + (canAssign ? '<button class="btn" id="b-as">Assign...</button><button class="btn" id="b-rq">Return to unassigned queue</button>' : '') + (canDelete ? '<button class="btn danger" id="b-del">Delete...</button>' : '') + '<button class="btn" id="b-cl">Clear</button>';
      const ids = () => [...sel];
      const q = (id) => b.querySelector(id);
      if (q('#b-cl')) q('#b-cl').onclick = () => { sel.clear(); drawBody(); };
      if (q('#b-as')) q('#b-as').onclick = () => W.modal('Assign ' + plural(sel.size, 'lead'), F('who', 'Assign to', 'select', { options: [{ value: '', label: 'Choose an owner...' }].concat(assignees.map((u) => ({ value: u.id, label: u.name }))) }) + '<p class="sub">Each new owner is notified, and every lead keeps its own history.</p>', async (d) => { if (!d.who) throw new Error('Choose an owner to assign.'); await api.post('/users/bulk-reassign', { leadIds: ids(), assignedUserId: d.who }); W.toast(plural(sel.size, 'lead') + ' reassigned.'); sel.clear(); await refresh(); }, 'Assign');
      if (q('#b-rq')) q('#b-rq').onclick = async () => { try { await api.post('/users/bulk-reassign', { leadIds: ids(), returnToQueue: true }); W.toast(plural(sel.size, 'lead') + ' returned to the queue.'); sel.clear(); await refresh(); } catch (e) { toastErr(e); } };
      if (q('#b-del')) q('#b-del').onclick = () => W.modal('Delete ' + plural(sel.size, 'lead') + '?', '<p>They leave the lead list, the unassigned queue and every dashboard figure. Pending follow-ups on them are cancelled.</p><p>The records are hidden, not erased: notes, activity and history are kept, and a Super Admin can restore them with "Show deleted" on.</p><p>Any converted lead in the selection is kept, and you will be told which.</p>' + F('reason', 'Reason (optional, 5 characters or more)', 'text') + '<label><input type="checkbox" name="ack"> I understand these leads will disappear from every queue and report.</label>', async (d) => {
        if (!d.ack) throw new Error('Tick the box to confirm.'); if (d.reason && d.reason.trim().length < 5) throw new Error('A reason needs at least 5 characters.');
        const r = await api.post('/leads/bulk-delete', { leadIds: ids(), reason: (d.reason || '').trim() || undefined });
        const kept = r.skipped.slice(0, 3).map((s) => s.companyName + ' (' + s.reason.toLowerCase() + ')').join(', ') + (r.skipped.length > 3 ? ' and ' + (r.skipped.length - 3) + ' more' : '');
        W.toast(!r.skipped.length ? plural(r.deleted, 'lead') + ' deleted.' : r.deleted ? plural(r.deleted, 'lead') + ' deleted. Kept ' + kept + '.' : 'Nothing deleted. Kept ' + kept + '.'); sel.clear(); await refresh();
      }, 'Delete ' + plural(sel.size, 'lead')); };
    const th = (label, key) => '<th data-sort="' + key + '" style="cursor:pointer" title="Click to sort">' + label + (sortBy === key ? (sortDir === 'desc' ? ' &darr;' : ' &uarr;') : '') + '</th>';
    const drawTable = (rows) => {
      const all = rows.length && rows.every((r) => sel.has(r.id));
      return '<table><thead><tr><th><input type="checkbox" id="all"' + (all ? ' checked' : '') + ' aria-label="Select every lead on this page"></th><th>Lead</th>' + th('Company', 'company') + '<th>Contact</th><th>Status</th><th>Priority</th><th title="Call-first score: higher means call sooner">Score</th>' + th('Est. value', 'estimatedValue') + th('Last updated', 'updatedAt') + (canDelete && qp.includeDeleted === 'true' ? '<th>Restore</th>' : '') + '</tr></thead><tbody>' + rows.map((r) => '<tr class="click" data-id="' + r.id + '"><td data-stop><input type="checkbox" data-sel="' + r.id + '"' + (sel.has(r.id) ? ' checked' : '') + ' aria-label="Select ' + esc(r.company) + '"></td><td>' + esc(r.number) + '</td><td><b>' + esc(r.company) + '</b>' + (r.hasNewNote && r.latestNote ? ' <button class="btn sm" data-note="' + r.id + '" data-stop title="New note: click to read it">New note</button>' : '') + (r.deleted ? ' ' + W.tagFor('Deleted') : '') + LeadIntel.stuckTag(r) + '</td><td>' + esc(r.contact) + '</td><td>' + W.tagFor(r.status) + '</td><td>' + (r.priority === 'high' ? '<span class="tag warn">High</span>' : esc((PRI.find((p) => p[0] === r.priority) || [])[1] || r.priority)) + '</td><td>' + LeadIntel.pill(r) + '</td><td>' + (r.estimatedValue ? W.money(r.estimatedValue, '') : '-') + '</td><td>' + dt(r.updatedAt) + '</td>' + (canDelete && qp.includeDeleted === 'true' ? '<td data-stop>' + (r.deleted ? '<button class="btn sm" data-restore="' + r.id + '">Restore</button>' : '-') + '</td>' : '') + '</tr>').join('') + '</tbody></table>';
    };

    // ---------- board ----------
    let dragging = null;
    const mustFollowUp = (k) => api.FOLLOWUP_REQUIRED.includes(k);
    const canDrop = (lead, to) => canEdit && lead.statusKey !== to && to !== 'won' && lead.statusKey !== 'won';
    const move = async (lead, to, lossReasonId) => {
      const prev = lead.status, prevKey = lead.statusKey; lead.status = stName(to); lead.statusKey = to; drawBody();
      try { await api.post('/leads/' + lead.id + '/status', { statusKey: to, lossReasonId }); W.toast(lead.company + ' moved to ' + stName(to)); await load(); drawBody(); }
      catch (e) { lead.status = prev; lead.statusKey = prevKey; drawBody(); toastErr(e); }
    };
    const requestMove = (lead, to) => {
      if (to === 'lost') { W.modal('Mark ' + lead.company + ' as lost', F('reason', 'Why was it lost?', 'select', { options: [{ value: '', label: 'Choose a reason...' }].concat(lossReasons.map((r) => ({ value: r.id, label: r.name }))) }) + '<p class="sub">Saved on the lead and counted in the lost-lead reports.</p>', async (d) => { if (!d.reason) throw new Error('Choose a reason to continue.'); await move(lead, 'lost', d.reason); }, 'Mark as lost'); return; }
      if (mustFollowUp(to)) { W.toast(stName(to) + ' needs a next follow-up date and a comment. Open ' + lead.company + ' and use Update lead.'); return; }
      move(lead, to);
    };
    const drawBoard = (rows) => '<div class="board" data-testid="lead-pipeline">' + ST.map((s) => { const here_ = rows.filter((r) => r.statusKey === s.key); if (!here_.length && !s.isActive) return ''; const tgt = dragging && canDrop(dragging, s.key), inert = dragging && !tgt && dragging.statusKey !== s.key;
      return '<section class="col' + (tgt ? ' target' : '') + (inert ? ' inert' : '') + '" data-s="' + s.key + '"><h3>' + esc(s.name) + '<span>' + here_.length + '</span></h3>' + (here_.length ? here_.map((r) => '<div class="pcard' + (dragging && dragging.id === r.id ? ' lifting' : '') + '" tabindex="0" draggable="' + (canEdit && r.statusKey !== 'won') + '" data-id="' + r.id + '"><b>' + esc(r.company) + '</b>' + (r.priority === 'high' ? ' <span class="tag warn">High</span>' : '') + LeadIntel.stuckTag(r) + ' ' + LeadIntel.pill(r) + '<small>' + esc(r.contact) + '</small>' + (r.estimatedValue ? '<small>' + W.money(r.estimatedValue, r.currency) + '</small>' : '') + '<small>' + esc(owner(r.assignedTo)) + ' &middot; ' + new Date(r.createdAt).toLocaleDateString() + '</small>' + (canConvert && api.CONVERSION_READY.includes(r.statusKey) ? '<div style="margin-top:6px"><button class="btn sm" data-conv="' + r.id + '">Record conversion</button></div>' : '') + '</div>').join('') : '<small style="color:var(--ink-m)">' + (tgt ? 'Drop here.' : s.key === 'won' ? 'A lead becomes Won when its conversion is recorded.' : 'No leads at this stage.') + '</small>') + '</section>'; }).join('') + '</div>';

    // ---------- drawing ----------
    function drawBody() {
      const rows = data.rows, box = el.querySelector('#body');
      el.querySelector('#meta').textContent = plural(data.total, 'lead');
      el.querySelector('#cnt').textContent = data.total === 0 ? 'No leads' : board ? rows.length + ' of ' + data.total : ((data.page - 1) * data.pageSize + 1) + '-' + Math.min(data.page * data.pageSize, data.total) + ' of ' + data.total;
      if (!rows.length) box.innerHTML = '<div class="empty"><b>' + (active() ? 'No leads match these filters.' : 'No leads to show.') + '</b><p>' + (active() ? plural(active(), 'filter is') .replace('filters is', 'filters are') + ' applied. Clear a filter to widen the search.' : 'Leads appear here once they are created or a partner submits one.') + '</p></div>';
      else box.innerHTML = (board && data.total > rows.length ? '<p class="sub">Showing the first ' + rows.length + ' of ' + data.total + '. Narrow the filters to put the whole pipeline on the board.</p>' : '') + (board ? drawBoard(rows) : drawTable(rows));
      el.querySelector('#pg').innerHTML = !board && data.pageCount > 1 ? '<div class="pager"><button class="btn sm" id="pv"' + (data.page <= 1 ? ' disabled' : '') + '>Previous</button> Page ' + data.page + ' of ' + data.pageCount + ' <button class="btn sm" id="nx"' + (data.page >= data.pageCount ? ' disabled' : '') + '>Next</button></div>' : '';
      wire(); drawBulk();
    }
    function wire() {
      const box = el.querySelector('#body'), byId = (id) => data.rows.find((r) => r.id === id);
      box.querySelectorAll('[data-stop]').forEach((c) => { c.onclick = (e) => e.stopPropagation(); });
      box.querySelectorAll('tr.click').forEach((tr) => { tr.onclick = () => quickLook(tr.dataset.id); });
      box.querySelectorAll('[data-sel]').forEach((c) => { c.onchange = () => { c.checked ? sel.add(c.dataset.sel) : sel.delete(c.dataset.sel); drawBulk(); const a = box.querySelector('#all'); if (a) a.checked = data.rows.every((r) => sel.has(r.id)); }; });
      const all = box.querySelector('#all'); if (all) all.onchange = () => { if (all.checked) data.rows.forEach((r) => sel.add(r.id)); else sel.clear(); drawBody(); };
      box.querySelectorAll('[data-sort]').forEach((h) => { h.onclick = () => go({ sortBy: h.dataset.sort, sortDir: sortBy === h.dataset.sort && sortDir === 'desc' ? 'asc' : 'desc' }); });
      box.querySelectorAll('[data-restore]').forEach((b) => { b.onclick = async () => { try { await api.post('/leads/' + b.dataset.restore + '/restore', {}); W.toast('Lead restored.'); await refresh(); } catch (e) { toastErr(e); } }; });
      box.querySelectorAll('[data-note]').forEach((b) => { b.onclick = () => { const r = byId(b.dataset.note); r.hasNewNote = false; api.post('/leads/' + r.id + '/notes/seen', {}).catch(() => {}); const n = r.latestNote; W.modal('Latest note: ' + r.company, '<p><small>' + esc(n.author || 'Unknown') + ' &middot; ' + dt(n.at) + ' &middot; ' + (n.internal ? 'Internal' : 'Visible to the partner') + '</small></p><p>' + esc(n.text) + '</p>', null).el.querySelector('[data-x]').textContent = 'Close'; drawBody(); }; });
      box.querySelectorAll('[data-conv]').forEach((b) => { b.onclick = (e) => { e.stopPropagation(); const r = byId(b.dataset.conv); W.modal('Record conversion: ' + r.company, F('amount', 'Final deal value', 'number', { value: r.estimatedValue }) + F('note', 'Note', 'textarea'), async (d) => { await api.post('/leads/' + r.id + '/convert', { amount: d.amount, note: d.note }); W.toast(r.company + ' is now Won.'); await refresh(); }, 'Record conversion'); }; });
      // board drag and drop + keyboard
      box.querySelectorAll('.pcard').forEach((c) => { const lead = byId(c.dataset.id);
        c.ondragstart = (e) => { e.dataTransfer.setData('text/plain', lead.id); e.dataTransfer.effectAllowed = 'move'; dragging = lead; setTimeout(drawBody, 0); };
        c.ondragend = () => { dragging = null; drawBody(); };
        c.onkeydown = (e) => { if (!(e.ctrlKey || e.metaKey) || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault(); const dir = e.key === 'ArrowRight' ? 1 : -1; let i = ST.findIndex((s) => s.key === lead.statusKey) + dir; for (; i >= 0 && i < ST.length; i += dir) if (canDrop(lead, ST[i].key)) { requestMove(lead, ST[i].key); return; } };
      });
      box.querySelectorAll('.col').forEach((col) => { const to = col.dataset.s;
        col.ondragover = (e) => { if (dragging && canDrop(dragging, to)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('over'); } };
        col.ondragleave = () => col.classList.remove('over');
        col.ondrop = (e) => { e.preventDefault(); const l = dragging; dragging = null; if (l && canDrop(l, to)) requestMove(l, to); else drawBody(); };
      });
      const pv = el.querySelector('#pv'), nx = el.querySelector('#nx');
      if (pv) pv.onclick = () => go({ page: String(data.page - 1) }, true); if (nx) nx.onclick = () => go({ page: String(data.page + 1) }, true);
    }
    async function quickLook(id) {
      const l = await api.get('/leads/' + id);
      const needs = (k) => api.FOLLOWUP_REQUIRED.includes(k);
      const m = W.modal(l.number + ' · ' + l.company, '<dl class="kv"><dt>Contact</dt><dd>' + esc(l.contact) + (l.email ? ' · <a href="mailto:' + esc(l.email) + '">' + esc(l.email) + '</a>' : '') + '</dd><dt>Status</dt><dd>' + W.tagFor(l.status) + (l.lossReason ? ' <small>(' + esc(l.lossReason) + ')</small>' : '') + '</dd><dt>Priority</dt><dd>' + esc(l.priority) + '</dd><dt>Becomes</dt><dd>' + esc(l.leadType) + '</dd><dt>Owner</dt><dd>' + esc(owner(l.assignedTo)) + '</dd><dt>Source</dt><dd>' + esc(l.source) + '</dd><dt>Service</dt><dd>' + esc(l.service || 'Not decided') + '</dd><dt>Estimated value</dt><dd>' + (l.estimatedValue ? W.money(l.estimatedValue, l.currency) : '-') + '</dd><dt>Next follow-up</dt><dd>' + (l.nextAction ? dt(l.nextAction) : 'None scheduled') + '</dd></dl>'
        + (l.activities.length ? '<h4>Latest activity</h4>' + l.activities.slice(0, 3).map((a) => '<div><small>' + dt(a.at) + '</small> ' + esc(a.description) + '</div>').join('') : '')
        + (l.notes.length ? '<h4>Notes</h4>' + l.notes.slice().reverse().slice(0, 3).map((n) => '<div>' + esc(n.text) + ' <small>(' + (n.internal ? 'internal' : 'visible to partner') + ')</small></div>').join('') : '')
        + (canEdit && l.status !== 'Won' ? '<h4>Update lead</h4>' + F('statusKey', 'Move to', 'select', { options: ST.filter((s) => s.key !== 'won').map((s) => ({ value: s.key, label: s.name })), value: l.statusKey }) + '<div id="lossbox" hidden>' + F('lossReasonId', 'Why was it lost?', 'select', { options: [{ value: '', label: 'Choose a reason...' }].concat(lossReasons.map((r) => ({ value: r.id, label: r.name }))) }) + '</div><div id="fubox" hidden>' + F('nextFollowUp', 'Next follow-up date', 'date') + '</div>' + F('comment', 'Comment', 'textarea') : '')
        + '<p><a href="#/lead?id=' + l.id + '">Open the full lead page</a></p>'
        + (canAssign ? '<p><button type="button" class="btn sm" id="qa">Assign...</button></p>' : ''), canEdit && l.status !== 'Won' ? async (d) => {
        const changed = d.statusKey !== l.statusKey;
        if (changed) { if (d.statusKey === 'lost' && !d.lossReasonId) throw new Error('Choose why the lead was lost.'); if (needs(d.statusKey) && (!d.nextFollowUp || !String(d.comment || '').trim())) throw new Error(stName(d.statusKey) + ' needs a next follow-up date and a comment.'); await api.post('/leads/' + l.id + '/status', { statusKey: d.statusKey, lossReasonId: d.lossReasonId || undefined, nextFollowUp: d.nextFollowUp || undefined, comment: d.comment }); }
        else if (String(d.comment || '').trim()) await api.post('/leads/' + l.id + '/notes', { text: d.comment, internal: true });
        W.toast('Saved'); await refresh();
      } : null, 'Update lead');
      const st = m.el.querySelector('[name=statusKey]');
      if (st) { const sync = () => { m.el.querySelector('#lossbox').hidden = st.value !== 'lost'; m.el.querySelector('#fubox').hidden = !needs(st.value); }; st.onchange = sync; sync(); }
      const qa = m.el.querySelector('#qa'); if (qa) qa.onclick = () => { m.close(); sel = new Set([l.id]); drawBody(); el.querySelector('#b-as') && el.querySelector('#b-as').click(); };
    }
    async function refresh() { await load(); drawBody(); }

    // ---------- events ----------
    const fb = el.querySelector('#fb'), fp = el.querySelector('#fp');
    const closePanel = () => { fp.hidden = true; fb.setAttribute('aria-expanded', 'false'); };
    fb.onclick = () => { fp.hidden = !fp.hidden; fb.setAttribute('aria-expanded', String(!fp.hidden)); };
    if (window.__leadsEsc) document.removeEventListener('keydown', window.__leadsEsc);
    window.__leadsEsc = (e) => { if (e.key === 'Escape') closePanel(); }; document.addEventListener('keydown', window.__leadsEsc);
    fp.querySelectorAll('[data-q]').forEach((c) => { c.onchange = () => go({ [c.dataset.q]: c.type === 'checkbox' ? (c.dataset.q === 'includeDeleted' ? (c.checked ? 'true' : '') : c.checked) : c.value }); });
    fp.querySelectorAll('[data-facet]').forEach((d) => { d.ontoggle = () => { const s = read(FACETS, {}); s[d.dataset.facet] = !d.open; write(FACETS, s); }; });
    el.querySelector('#q').onkeydown = (e) => { if (e.key === 'Enter') go({ q: e.target.value }); };
    el.querySelectorAll('[data-view]').forEach((a) => { a.onclick = () => go({ view: a.dataset.view === 'board' ? 'board' : '' }); });
    el.querySelectorAll('[data-v]').forEach((b) => { b.onclick = () => applyView(b.dataset.v); });
    el.querySelectorAll('[data-dv]').forEach((b) => { b.onclick = () => { views = views.filter((v) => v.name !== b.dataset.dv); write(VIEWS, views); W.rerender(); }; });
    const ps = el.querySelector('#ps'); if (ps) ps.onchange = () => go({ pageSize: ps.value });
    const ca = el.querySelector('#ca'); if (ca) ca.onclick = () => applyView('');
    const cf = el.querySelector('#cf'); if (cf) cf.onclick = () => go({ focus: '', focusFrom: '', focusTo: '' });
    const sv = el.querySelector('#sv'); if (sv) sv.onclick = () => W.modal('Save this view', F('name', 'Name', 'text', { required: true }), async (d) => { if (!d.name.trim()) throw new Error('Give the view a name.'); views.push({ name: d.name.trim(), query: here() }); write(VIEWS, views); W.rerender(); }, 'Save view');
    const im = el.querySelector('#imp'); if (im) im.onclick = () => window.PD.importLeads(refresh);
    const nw = el.querySelector('#new'); if (nw) nw.onclick = () => W.modal('New lead', F('company', 'Company', 'text', { required: true }) + F('contact', 'Contact person', 'text') + F('email', 'Email', 'email') + F('estimatedValue', 'Estimated value', 'number') + F('priority', 'Priority', 'select', { options: PRI.map((p) => ({ value: p[0], label: p[1] })), value: 'medium' }) + F('leadType', 'Becomes', 'select', { options: [{ value: 'B2C', label: 'B2C: our own client' }, { value: 'B2B', label: 'B2B: a partner\'s client' }] }) + F('source', 'Source', 'select', { options: lk.sources.map((s) => s.name) }) + F('assignedTo', 'Owner', 'select', { options: [{ value: '', label: 'Unassigned' }].concat(assignees.map((u) => ({ value: u.id, label: u.name }))) }), async (d) => { d.estimatedValue = Number(d.estimatedValue) || 0; await api.post('/leads', d); W.toast('Lead created'); await refresh(); });
    const ex = el.querySelector('#exp'); if (ex) ex.onclick = async () => { try { const p = query(); p.set('pageSize', '200'); p.set('sortBy', sortBy); p.set('sortDir', sortDir); let rows = [], page = 1, d; do { p.set('page', String(page)); d = await api.get('/leads?' + p.toString()); rows = rows.concat(d.rows); page++; } while (page <= d.pageCount); const csv = ['number,company,contact,status,priority,estimated_value'].concat(rows.map((r) => [r.number, r.company, r.contact, r.status, r.priority, r.estimatedValue].map((v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"').join(','))).join('\n'); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' })); a.download = 'leads-' + new Date().toISOString().slice(0, 10) + '.csv'; a.click(); URL.revokeObjectURL(a.href); } catch (e) { W.toast('Could not export these leads'); } };
    await load(); drawBody();
  } });
})();
