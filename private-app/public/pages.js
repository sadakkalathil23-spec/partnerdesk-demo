// Page definitions. All data goes through window.api (mock by default).
(() => {
  const W = WorkOS, esc = W.esc, reg = W.register, F = W.field;
  const head = (t, s, extra) => '<h1>' + esc(t) + '</h1><p class="sub">' + esc(s || '') + '</p>' + (extra || '');
  const uname = (users, id) => { const u = users.find((x) => x.id === id); return u ? u.name : 'Unassigned'; };
  const table = (cols, rows, rowAttr) => rows.length ? '<table><thead><tr>' + cols.map((c) => '<th>' + esc(c[0]) + '</th>').join('') + '</tr></thead><tbody>' + rows.map((r, i) => '<tr' + (rowAttr ? ' class="click" data-i="' + i + '"' : '') + '>' + cols.map((c) => '<td>' + c[1](r) + '</td>').join('') + '</tr>').join('') + '</tbody></table>' : '';
  const rowsOf = (r) => Array.isArray(r) ? r : r.rows;

  // Generic list page: search, filters, create form, row actions, paging.
  function list(cfg) {
    reg(cfg.path, { perm: cfg.perm, render: async (el) => {
      let q = '', page = 1, filters = {};
      const users = (await api.get('/users/assignees')).slice();
      const draw = async () => {
        const params = new URLSearchParams(Object.assign({ q, page, pageSize: 10 }, filters)).toString();
        const res = await api.get(cfg.endpoint + (cfg.endpoint.includes('?') ? '&' : '?') + params);
        let rows = rowsOf(res); const total = Array.isArray(res) ? rows.length : res.total;
        if (Array.isArray(res)) rows = rows.filter((r) => !q || JSON.stringify(r).toLowerCase().includes(q.toLowerCase()));
        const cols = cfg.cols(users).concat(cfg.actions ? [['', (r) => cfg.actions.map((a, i) => '<button class="btn sm' + (a[2] ? ' ' + a[2] : '') + '" data-a="' + i + '" data-id="' + esc(r.id) + '">' + esc(a[0]) + '</button>').join(' ')]] : []);
        const body = el.querySelector('#body');
        body.innerHTML = rows.length ? table(cols, rows) + '<div class="pager">' + total + ' total <button class="btn sm" id="pv"' + (page < 2 ? ' disabled' : '') + '>Previous</button> Page ' + page + ' <button class="btn sm" id="nx"' + (page * 10 >= total ? ' disabled' : '') + '>Next</button></div>' : '<div class="empty">' + esc(cfg.empty || 'Nothing here yet.') + '</div>';
        body.querySelectorAll('[data-a]').forEach((b) => { b.onclick = async () => { const row = rows.find((r) => String(r.id) === b.dataset.id); try { await cfg.actions[b.dataset.a][1](row, users); await draw(); } catch (e) { W.toast(e.message); } }; });
        const pv = body.querySelector('#pv'), nx = body.querySelector('#nx');
        if (pv) pv.onclick = () => { page--; draw(); }; if (nx) nx.onclick = () => { page++; draw(); };
      };
      el.innerHTML = head(cfg.title, cfg.sub) + '<div class="bar">' + (cfg.search === false ? '' : '<input class="in" id="q" placeholder="Search ' + esc(cfg.title.toLowerCase()) + '">') + (cfg.filters || []).map((f) => '<select class="in" data-f="' + f.key + '"><option value="">' + esc(f.label) + '</option>' + f.options.map((o) => '<option>' + esc(o) + '</option>').join('') + '</select>').join('') + '<span style="flex:1"></span>' + (cfg.create ? '<button class="btn primary" id="new">' + esc(cfg.create.label) + '</button>' : '') + '</div><div id="body"></div>';
      let timer; const qi = el.querySelector('#q'); if (qi) qi.oninput = () => { clearTimeout(timer); timer = setTimeout(() => { q = qi.value; page = 1; draw(); }, 200); };
      el.querySelectorAll('[data-f]').forEach((s) => { s.onchange = () => { filters[s.dataset.f] = s.value; page = 1; draw(); }; });
      const nb = el.querySelector('#new');
      if (nb) nb.onclick = () => W.modal(cfg.create.label, cfg.create.fields(users).join(''), async (d) => { await api.post(cfg.create.post || cfg.endpoint.split('?')[0], cfg.create.map ? cfg.create.map(d) : d); W.toast('Saved'); draw(); });
      await draw();
    } });
  }


  // ---- Dashboards ----
  const card = (label, value, note, cls) => '<div class="card ' + (cls || '') + '"><small>' + esc(label) + '</small><strong>' + esc(value) + '</strong><em>' + esc(note || '') + '</em></div>';
})();
