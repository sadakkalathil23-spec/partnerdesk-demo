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
  const pages = () => [...document.querySelectorAll('.side a[data-p]')].map((a) => ({ title: a.textContent, sub: groupOf(a), href: a.getAttribute('href') }));
  const actions = () => [
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
    const rows = [[['Ctrl', 'K'], 'Open the command palette'], [['/'], 'Search leads, customers, partners'], [['g', 'h'], 'Go to Home'], [['g', 'l'], 'Go to Leads'], [['g', 'd'], 'Go to Dashboard'], [['g', 'n'], 'Go to Notifications'], [['?'], 'Show this list'], [['Esc'], 'Close a window']];
    W.modal('Keyboard shortcuts', '<div class="help-grid">' + rows.map((r) => '<span>' + r[0].map((k) => '<span class="kbd">' + k + '</span>').join(' then ') + '</span><span>' + r[1] + '</span>').join('') + '</div>');
  }
  let chord = 0;
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); palette(); return; }
    if (typing() || e.ctrlKey || e.metaKey || e.altKey || !W.user()) return;
    if (e.key === '?') { e.preventDefault(); help(); return; }
    if (chord && Date.now() - chord < 1500) { const to = { h: '/home', l: '/leads', d: '/dashboard', n: '/notifications' }[e.key]; chord = 0; if (to) location.hash = '#' + to; return; }
    chord = e.key === 'g' ? Date.now() : 0;
  });

  // ---- header buttons ----
  function mountButtons() {
    const out = document.getElementById('signout'); if (!out || document.getElementById('theme')) return;
    out.insertAdjacentHTML('beforebegin', '<button class="btn" id="cmdk" title="Command palette (Ctrl+K)">Jump <span class="kbd">Ctrl K</span></button><button class="btn" id="theme"></button>');
    document.getElementById('theme').onclick = toggleTheme; document.getElementById('cmdk').onclick = palette; applyTheme();
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
