// v3 features: dark mode, command palette (Ctrl+K), keyboard shortcuts, first-visit tour.
(() => {
  const W = WorkOS, esc = W.esc, B = (window.WORKOS_CONFIG || {}).brand || {};
  const store = { get(k) { try { return localStorage.getItem('partnerdesk.' + k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem('partnerdesk.' + k, v); } catch (e) { /* private mode */ } } };
  const typing = () => /INPUT|TEXTAREA|SELECT/.test((document.activeElement || {}).tagName || '');

  // ---- theme ----
  const dark = matchMedia('(prefers-color-scheme: dark)');
  const theme = () => store.get('theme') || (dark.matches ? 'dark' : 'light');
  const applyTheme = () => { document.documentElement.dataset.theme = theme(); const b = document.getElementById('theme'); if (b) { b.textContent = theme() === 'dark' ? 'Light' : 'Dark'; b.title = 'Switch to ' + (theme() === 'dark' ? 'light' : 'dark') + ' mode'; } };
  const toggleTheme = () => { store.set('theme', theme() === 'dark' ? 'light' : 'dark'); applyTheme(); };
  applyTheme();

  // ---- command palette ----
  const groupOf = (a) => { let p = a.previousElementSibling; while (p && p.tagName !== 'H4') p = p.previousElementSibling; return p ? p.textContent : ''; };
  const pages = () => W.nav();
  const actions = () => [
    { title: 'Add a new lead', sub: 'Action', run: quickAdd },
    { title: 'Switch light / dark mode', sub: 'Action', run: toggleTheme },
    { title: 'Show keyboard shortcuts', sub: 'Action', run: help },
    { title: 'Take the quick tour', sub: 'Action', run: () => tour(0) },
    { title: 'Print this page', sub: 'Action', run: () => window.print() }
  ];
  function palette() {
    if (document.querySelector('.cmdk-back') || !W.user()) return;
    const back = document.createElement('div'); back.className = 'cmdk-back';
    back.innerHTML = '<div class="cmdk" role="dialog" aria-label="Command palette"><input placeholder="Jump to a page or run an action..." aria-label="Command"><div class="list"></div><div class="foot"><span><span class="kbd">&uarr;</span> <span class="kbd">&darr;</span> move</span><span><span class="kbd">Enter</span> open</span><span><span class="kbd">Esc</span> close</span></div></div>';
    document.body.appendChild(back);
    const input = back.querySelector('input'), list = back.querySelector('.list'); let rows = [], idx = 0;
    const close = () => back.remove();
    const draw = () => {
      const q = input.value.trim().toLowerCase(), all = pages().concat(actions());
      rows = all.filter((r) => !q || (r.title + ' ' + r.sub).toLowerCase().includes(q)).slice(0, 30); idx = Math.min(idx, Math.max(rows.length - 1, 0));
      list.innerHTML = rows.length ? rows.map((r, i) => '<a href="' + esc(r.href || '#') + '" data-i="' + i + '" class="' + (i === idx ? 'on' : '') + '"><span>' + esc(r.title) + '</span><small>' + esc(r.sub) + '</small></a>').join('') : '<div class="none">Nothing matches "' + esc(input.value) + '".</div>';
      const on = list.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
    };
    const go = (r) => { close(); if (r.run) r.run(); else location.hash = r.href; };
    input.oninput = () => { idx = 0; draw(); };
    input.onkeydown = (e) => {
      if (e.key === 'Escape') close();
      else if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(idx + 1, rows.length - 1); draw(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(idx - 1, 0); draw(); }
      else if (e.key === 'Enter' && rows[idx]) { e.preventDefault(); go(rows[idx]); }
    };
    list.onclick = (e) => { const a = e.target.closest('a'); if (a) { e.preventDefault(); go(rows[a.dataset.i]); } };
    back.onclick = (e) => { if (e.target === back) close(); };
    draw(); input.focus();
  }

  // ---- shortcuts help ----
  function help() {
    const rows = [[['Ctrl', 'K'], 'Open the command palette'], [['/'], 'Search leads, customers, partners'], [['g', 'h'], 'Go to Home'], [['g', 'l'], 'Go to Leads'], [['g', 'd'], 'Go to Dashboard'], [['g', 'n'], 'Go to Notifications'], [['n'], 'Add a new lead'], [['?'], 'Show this list'], [['Esc'], 'Close a window']];
    W.modal('Keyboard shortcuts', '<div class="help-grid">' + rows.map((r) => '<span>' + r[0].map((k) => '<span class="kbd">' + k + '</span>').join(' then ') + '</span><span>' + r[1] + '</span>').join('') + '</div>');
  }
  let chord = 0;
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); return; }
    if (typing() || e.ctrlKey || e.metaKey || e.altKey || !W.user()) return;
    if (e.key === '?') { e.preventDefault(); help(); return; }
    if (e.key === 'n' && W.can('LEAD_CREATE') && !W.user().partner && !document.querySelector('.modal-bg')) { e.preventDefault(); quickAdd(); return; }
    if (chord && Date.now() - chord < 1500) { const to = { h: '/home', l: '/leads', d: '/dashboard', n: '/notifications' }[e.key]; chord = 0; if (to) location.hash = '#' + to; return; }
    chord = e.key === 'g' ? Date.now() : 0;
  });

  // ---- undo toast (shared by bulk actions and quick follow-ups) ----
  W.undoToast = (msg, undo) => {
    const t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status');
    t.innerHTML = esc(msg) + ' <button class="btn sm" style="margin-left:8px">Undo</button>'; document.body.appendChild(t);
    const timer = setTimeout(() => t.remove(), 9000);
    t.querySelector('button').onclick = async () => { clearTimeout(timer); t.remove(); try { await undo(); W.toast('Undone.'); } catch (e) { W.toast(e.message || 'Could not undo.'); } };
  };

  // ---- one-click follow-up scheduling ----
  const ymd = (d) => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const plus = (n) => { const d = new Date(); d.setDate(d.getDate() + n); d.setHours(10, 0, 0, 0); return d; };
  const nextMonday = () => { const d = new Date(); d.setDate(d.getDate() + ((8 - d.getDay()) % 7 || 7)); d.setHours(10, 0, 0, 0); return d; };
  function scheduleMenu(anchor, lead, done) {
    document.querySelectorAll('.fu-pop').forEach((n) => n.remove());
    const pop = document.createElement('div'); pop.className = 'fu-pop'; pop.setAttribute('role', 'menu');
    const opts = [['Tomorrow', plus(1)], ['In 3 days', plus(3)], ['Next Monday', nextMonday()], ['In 2 weeks', plus(14)]];
    pop.innerHTML = '<div class="fu-h">Next follow-up for ' + esc(lead.company) + '</div>' + opts.map((o, i) => '<button class="btn sm" data-i="' + i + '">' + o[0] + '</button>').join('') + '<label class="fu-d">Pick a date <input type="date" class="in" min="' + ymd(new Date()) + '"></label>';
    document.body.appendChild(pop);
    const r = anchor.getBoundingClientRect(), h = pop.offsetHeight, below = r.bottom + 4 + h <= window.innerHeight; pop.style.top = (window.scrollY + (below ? r.bottom + 4 : Math.max(8, r.top - h - 4))) + 'px'; pop.style.left = Math.max(8, Math.min(window.scrollX + r.left, window.innerWidth - 240)) + 'px';
    const close = () => { pop.remove(); document.removeEventListener('click', away, true); };
    const away = (e) => { if (!pop.contains(e.target) && e.target !== anchor) close(); };
    setTimeout(() => document.addEventListener('click', away, true), 0);
    const set = async (when) => {
      close();
      try {
        const res = await api.post('/leads/' + lead.id + '/reschedule', { nextFollowUp: when.toISOString() });
        W.undoToast(lead.company + ': follow-up set for ' + when.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' }) + '.', async () => { if (res.was) await api.post('/leads/' + lead.id + '/reschedule', { nextFollowUp: res.was, restore: true }); if (done) await done(); });
        if (done) await done();
      } catch (e) { W.toast(e.message || 'Could not set the follow-up.'); }
    };
    pop.querySelectorAll('[data-i]').forEach((b) => { b.onclick = () => set(opts[b.dataset.i][1]); });
    pop.querySelector('input').onchange = (e) => { if (e.target.value) set(new Date(e.target.value + 'T10:00:00')); };
    pop.addEventListener('keydown', (e) => { if (e.key === 'Escape') { close(); anchor.focus(); } });
    const first = pop.querySelector('button'); if (first) first.focus();
  }
  window.PD = Object.assign(window.PD || {}, { scheduleMenu });

  // ---- quick-add lead ----
  function quickAdd() {
    const F = W.field, me = W.user();
    return W.modal('New lead', F('company', 'Company', 'text', { required: true }) + F('contact', 'Contact person', 'text') + F('email', 'Email', 'email') + F('estimatedValue', 'Estimated value', 'number') + F('priority', 'Priority', 'select', { options: [{ value: 'high', label: 'High' }, { value: 'medium', label: 'Medium' }, { value: 'low', label: 'Low' }], value: 'medium' }) + '<p class="sub">The lead is assigned to you and its first follow-up is set for tomorrow.</p>', async (d) => {
      d.estimatedValue = Number(d.estimatedValue) || 0; d.assignedTo = me.id;
      const lead = await api.post('/leads', d);
      W.undoToast(lead.company + ' added.', async () => { await api.post('/leads/bulk-delete', { leadIds: [lead.id] }); W.rerender(); });
      W.rerender();
    }, 'Add lead');
  }

  // ---- header buttons ----
  function mountButtons() {
    const out = document.getElementById('bell'); if (!out || document.getElementById('theme')) return;
    out.insertAdjacentHTML('beforebegin', (W.can('LEAD_CREATE') && !W.user().partner ? '<button class="btn primary" id="qadd" title="Add a lead (press n)">+ Lead</button>' : '') + '<button class="btn" id="cmdk" title="Command palette (Ctrl+K)">Jump <span class="kbd">Ctrl K</span></button><button class="btn" id="theme"></button>');
    document.getElementById('theme').onclick = toggleTheme; document.getElementById('cmdk').onclick = palette; const qa = document.getElementById('qadd'); if (qa) qa.onclick = quickAdd; applyTheme();
  }

  // ---- first-visit tour ----
  const steps = [
    ['Welcome to ' + (B.name || 'PartnerDesk'), 'Leads, partners, payouts and attendance in one workspace. This 30-second tour shows the best shortcuts.'],
    ['Jump anywhere', 'Press Ctrl+K (or the Jump button) to open any page or action by typing a few letters.'],
    ['Search everything', 'Press / to search leads, customers, partners, tickets and tasks at once.'],
    ['Work your way', 'Use the Dark button for night mode, and press ? any time to see every shortcut.']
  ];
  function tour(i) {
    const old = document.querySelector('.tour'); if (old) old.remove();
    if (i >= steps.length) { store.set('toured', '1'); return; }
    const t = document.createElement('div'); t.className = 'tour'; t.setAttribute('role', 'dialog');
    t.innerHTML = '<h3>' + esc(steps[i][0]) + '</h3><p>' + esc(steps[i][1]) + '</p><div class="row"><span class="dots">' + (i + 1) + ' of ' + steps.length + '</span><button class="btn" id="tskip">Skip</button><button class="btn primary" id="tnext">' + (i === steps.length - 1 ? 'Done' : 'Next') + '</button></div>';
    document.body.appendChild(t);
    t.querySelector('#tskip').onclick = () => { t.remove(); store.set('toured', '1'); };
    t.querySelector('#tnext').onclick = () => tour(i + 1);
  }
  window.addEventListener('pd-shell', () => {
    mountButtons(); applyTheme();
    if (!store.get('toured') && !W.user().partner) setTimeout(() => { if (!document.querySelector('.tour') && !store.get('toured')) tour(0); }, 800);
  });
})();
