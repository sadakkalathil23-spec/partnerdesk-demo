// Records copied through the user's authorized remote-app session.
(() => {
  const W = WorkOS, esc = W.esc;
  const permissions = ['LEAD_VIEW_OWN', 'LEAD_VIEW_TEAM', 'LEAD_VIEW_ALL'];
  const tabs = [['timeline','Timeline'],['overview','Overview'],['requirements','Requirements'],['proposal','Proposal'],['followups','Follow-ups'],['calls','Calls'],['tasks','Tasks']];
  const load = async () => {
    const response = await fetch('/api/captured', { cache: 'no-store' });
    if (!response.ok) throw new Error('The copied records are not available yet.');
    return response.json();
  };
  const href = (id, tab) => '#/copied-record?id=' + encodeURIComponent(id) + '&tab=' + (tab || 'timeline');
  const tag = (text, ready) => '<span class="tag ' + (ready ? 'ok' : '') + '">' + esc(text) + '</span>';
  W.register('/copied-records', { perm: permissions, render: async (el, qp) => {
    const data = await load();
    const query = String(qp.q || '').toLowerCase(), status = qp.status || '', page = Math.max(1, Number(qp.page) || 1), size = 50;
    const matches = data.records.filter(r => (!status || r.Status === status) && (!query || [r.Company,r.Contact,r.Email,r.Phone,r['Lead number'],r['Assigned to']].join(' ').toLowerCase().includes(query)));
    const maxPage = Math.max(1, Math.ceil(matches.length / size)), current = Math.min(page, maxPage);
    const rows = matches.slice((current - 1) * size, current * size);
    const statuses = [...new Set(data.records.map(r => r.Status))].sort();
    const link = patch => { const q = new URLSearchParams(qp); Object.entries(patch).forEach(([k,v]) => v ? q.set(k,v) : q.delete(k)); return '#/copied-records?' + q; };
    el.innerHTML = '<div class="bar"><div><h1>Copied records</h1><p class="sub">Your WorkOS records, copied from the remote computer.</p></div><span class="grow"></span><button class="btn" id="copy-refresh">Refresh</button></div>'
      + '<div class="cards"><div class="card"><small>Leads copied</small><h2>' + data.records.length + '</h2><span>Original export preserved</span></div><div class="card"><small>Expanded records</small><h2>' + data.expandedFields + ' / ' + data.currentTotal + '</h2><span>Fields from the current list</span></div><div class="card"><small>Full histories</small><h2>' + data.fullHistories + ' / ' + data.currentTotal + '</h2><span>All notes and recorded activities</span></div></div>'
      + '<p class="sub">The original 255-row export is preserved. The live app currently lists 252 leads. Expanded fields and latest notes are copied; 52 full histories are saved. Remote capture is stopped; uncaptured documents and files are unavailable.</p>'
      + '<form class="bar" id="copy-filters"><input class="in" name="q" aria-label="Search copied records" placeholder="Company, contact, lead number, phone or email" value="' + esc(qp.q || '') + '" style="flex:1;min-width:220px"><select class="in" name="status" aria-label="Status"><option value="">All statuses</option>' + statuses.map(s => '<option' + (s === status ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select><button class="btn" type="submit">Search</button></form>'
      + '<div class="card" style="overflow:auto"><table><thead><tr><th>Company</th><th>Contact</th><th>Status</th><th>Phone</th><th>Owner</th><th>Details</th></tr></thead><tbody>' + (rows.length ? rows.map(r => '<tr><td><a href="' + href(r['Lead number']) + '"><b>' + esc(r.Company) + '</b></a><br><small class="mono">' + esc(r['Lead number']) + '</small></td><td>' + esc(r.Contact || '—') + '</td><td>' + W.tagFor(r.Status) + '</td><td>' + esc(r.Phone || '—') + '</td><td>' + esc(r['Assigned to'] || '—') + '</td><td>' + tag(r.fullHistory ? 'Full history copied' : r.expandedFields ? 'Expanded fields copied' : r.complete ? '7 tabs copied' : 'Export fields saved', r.fullHistory || r.complete) + '</td></tr>').join('') : '<tr><td colspan="6">No records match this search.</td></tr>') + '</tbody></table></div>'
      + '<div class="bar" style="justify-content:center;margin-top:16px">' + (current > 1 ? '<a class="btn" href="' + link({page:current-1}) + '">Previous</a>' : '') + '<span>Page ' + current + ' of ' + maxPage + ' · ' + matches.length + ' records</span>' + (current < maxPage ? '<a class="btn" href="' + link({page:current+1}) + '">Next</a>' : '') + '</div>';
    el.querySelector('#copy-refresh').onclick = () => W.rerender();
    el.querySelector('#copy-filters').onsubmit = e => { e.preventDefault(); const form = e.target; location.hash = link({q:form.q.value.trim(),status:form.status.value,page:''}); };
  }});
  W.register('/copied-record', { perm: permissions, render: async (el, qp) => {
    const data = await load(), record = data.records.find(r => r['Lead number'] === qp.id);
    if (!record) { el.innerHTML = '<p>This copied record could not be found.</p><a href="#/copied-records">All copied records</a>'; return; }
    const selected = tabs.some(([id]) => id === qp.tab) ? qp.tab : 'timeline';
    const details = record.details || {}, content = details[selected];
    const fields = ['Contact','Phone','Email','Country','Assigned to','Service','Created'];
    el.innerHTML = '<a href="#/copied-records">← Copied records</a><div class="bar" style="margin-top:18px"><div><h1>' + esc(record.Company) + '</h1><p>' + esc(record['Lead number']) + ' · ' + W.tagFor(record.Status) + '</p></div><span class="grow"></span><button class="btn" id="copy-refresh">Refresh details</button></div>'
      + '<div class="card"><dl class="kv">' + fields.map(k => '<dt>' + esc(k === 'Assigned to' ? 'Owner' : k) + '</dt><dd>' + esc(record[k] || '—') + '</dd>').join('') + '</dl></div>'
      + (record.sourceRecord ? '<details class="card" style="margin-top:16px"><summary>All saved source fields</summary><pre style="white-space:pre-wrap;overflow-wrap:anywhere">' + esc(JSON.stringify(record.sourceRecord, null, 2)) + '</pre></details>' : '')
      + '<nav class="bar" aria-label="Copied record details" style="margin-top:20px;border-bottom:1px solid var(--line)">' + tabs.map(([id,name]) => '<a class="btn sm" href="' + href(record['Lead number'],id) + '"' + (id === selected ? ' aria-current="page" style="border-color:var(--b5);color:var(--b6);font-weight:600"' : '') + '>' + name + (details[id] ? ' ✓' : '') + '</a>').join('') + '</nav>'
      + '<section class="card" style="margin-top:16px"><h2>' + tabs.find(([id]) => id === selected)[1] + '</h2>' + (content ? '<div class="copied-text" style="white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.65;font-size:14px">' + esc(content) + '</div>' : '<p>No contents for this tab were saved before capture stopped.</p>') + '</section>';
    el.querySelector('#copy-refresh').onclick = () => W.rerender();
  }});
})();
