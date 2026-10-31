// Core: helpers, router, sign-in screens and shell. Pages register themselves in pages.js.
const WorkOS = (() => {
  const B = (window.WORKOS_CONFIG && window.WORKOS_CONFIG.brand) || { name: 'PartnerDesk' };
  const app = document.getElementById('app');
  const routes = {};
  let user = null, curPath = '';
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (n, c) => (c || '') + ' ' + Number(n || 0).toLocaleString('en-IN');
  const date = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' }) : '-';
  const can = (p) => !p || (user && user.permissions.includes(p));
  const anyCan = (ps) => !ps || ps.some(can);
  const tagFor = (s) => { const v = String(s).toLowerCase(); const cls = /won|live|active|paid|done|ok|closed|eligible/.test(v) ? 'good' : /lost|overdue|blocked|high|crit|suspend|expired/.test(v) ? 'bad' : /pending|draft|await|hold|new/.test(v) ? 'warn' : 'info'; return '<span class="tag ' + cls + '">' + esc(s) + '</span>'; };
  function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 2600); }
  function modal(title, bodyHtml, onSubmit, submitLabel) {
    const bg = document.createElement('div'); bg.className = 'modal-bg';
    bg.innerHTML = '<form class="modal"><h2>' + esc(title) + '</h2><div class="err"></div>' + bodyHtml + '<div class="row"><button type="button" class="btn" data-x>Cancel</button>' + (onSubmit ? '<button class="btn primary">' + esc(submitLabel || 'Save') + '</button>' : '') + '</div></form>';
    document.body.appendChild(bg);
    const close = () => bg.remove();
    bg.querySelector('[data-x]').onclick = close; bg.onclick = (e) => { if (e.target === bg) close(); };
    bg.querySelector('form').onsubmit = async (e) => {
      e.preventDefault(); if (!onSubmit) return;
      const data = Object.fromEntries(new FormData(e.target).entries());
      try { await onSubmit(data, e.target); close(); } catch (er) { bg.querySelector('.err').innerHTML = '<div class="alert danger" style="margin-bottom:10px">' + esc(er.message || 'Something went wrong') + '</div>'; }
    };
    return { close, el: bg };
  }
  const field = (name, label, type, opts) => {
    opts = opts || {}; const v = opts.value == null ? '' : opts.value;
    let inp;
    if (type === 'select') inp = '<select class="in" name="' + name + '">' + (opts.options || []).map((o) => { const val = o.value != null ? o.value : o; const lab = o.label != null ? o.label : o; return '<option value="' + esc(val) + '"' + (String(val) === String(v) ? ' selected' : '') + '>' + esc(lab) + '</option>'; }).join('') + '</select>';
    else if (type === 'textarea') inp = '<textarea class="in" name="' + name + '" rows="3">' + esc(v) + '</textarea>';
    else inp = '<input class="in" name="' + name + '" type="' + (type || 'text') + '" value="' + esc(v) + '"' + (opts.required ? ' required' : '') + '>';
    return '<div class="fld"><label>' + esc(label) + '</label>' + inp + '</div>';
  };
  const ICONS = {
    Home: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/>',
    Attendance: '<rect x="4" y="3" width="16" height="18" rx="2"/><circle cx="12" cy="10" r="3"/><path d="M7 19c1-3 3-4 5-4s4 1 5 4"/>',
    Sales: '<path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    Work: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/>',
    Partners: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/><path d="M16 5a3 3 0 0 1 0 6M21 20c0-2-1.500-3.500-4-4"/>',
    Money: '<rect x="3" y="6" width="18" height="13" rx="2"/><path d="M3 10h18"/>',
    Admin: '<circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.600 5.600l2.100 2.100M16.300 16.300l2.100 2.100M18.400 5.600l-2.100 2.100M7.700 16.300l-2.100 2.100"/>',
    Partner: '<circle cx="9" cy="8" r="3"/><path d="M3 20c0-3 3-5 6-5s6 2 6 5"/>'
  };
  const LEADV = ['LEAD_VIEW_OWN', 'LEAD_VIEW_TEAM', 'LEAD_VIEW_ALL'], OPSV = ['OPS_VIEW_OWN', 'OPS_VIEW_ALL'], ATT = ['ATTENDANCE_VIEW_TEAM', 'ATTENDANCE_VIEW_ALL'];
  // Each section is one link in the menu; its tabs are the sub-pages shown above the page.
  const NAV = [
    { label: 'Home', items: [['/home', 'This week'], ['/my-day', 'My Day', LEADV], ['/operations/my-work', 'My Work', OPSV], ['/dashboard', 'Dashboard'], ['/report-builder', 'Report builder', ['LEAD_VIEW_OWN', 'LEAD_VIEW_TEAM', 'LEAD_VIEW_ALL', 'OPS_VIEW_OWN', 'OPS_VIEW_ALL', 'PRESALES_VIEW']], ['/notifications', 'Notifications']] },
    { label: 'Attendance', items: [['/attendance', 'Today', ['ATTENDANCE_SELF']], ['/attendance/history', 'My history', ['ATTENDANCE_SELF']], ['/attendance/team', 'Team', ATT], ['/attendance/exceptions', 'Exceptions', ATT], ['/attendance/reports', 'Reports', ATT], ['/attendance/policy', 'Policy', ['ATTENDANCE_VIEW_ALL']]] },
    { label: 'Sales', items: [['/leads', 'Leads', LEADV], ['/leads?view=board', 'Pipeline', LEADV], ['/sales-overview', 'Overview', ['SALES_TARGET_VIEW']], ['/unassigned', 'Unassigned', ['LEAD_ASSIGN']], ['/customers', 'Customers', ['PRESALES_VIEW', 'LEAD_VIEW_ALL']], ['/proposals', 'Proposals', ['PRESALES_VIEW', 'LEAD_VIEW_ALL']], ['/copied-records', 'Copied records', LEADV]] },
    { label: 'Work', items: [['/operations', 'Overview', OPSV], ['/operations/current', 'Current sprint', OPSV], ['/operations/projects', 'Projects', ['OPS_VIEW_ALL']], ['/operations/tasks', 'Tasks', OPSV], ['/operations/general', 'Other work', OPSV], ['/operations/sprints', 'Sprints', OPSV], ['/operations/cycles', 'Cycles', OPSV], ['/operations/team', 'Team', ['OPS_VIEW_ALL']], ['/operations/reports', 'Reports', ['OPS_REPORT_VIEW']], ['/support/contracts', 'Support', ['SUPPORT_VIEW']], ['/support/tickets', 'Tickets', ['SUPPORT_VIEW']]] },
    { label: 'Partners', items: [['/partners', 'Partners', ['PARTNER_VIEW']], ['/conflicts', 'Conflicts', ['PARTNER_CONFLICT_DECIDE']], ['/statement', 'Statements', ['PARTNER_VIEW', 'INCENTIVE_APPROVE']], ['/integrity', 'Integrity checks', ['PARTNER_VIEW']]] },
    { label: 'Money', items: [['/finance/collections', 'Collections', ['PAYMENT_RECORD']], ['/approvals', 'Approvals', ['INCENTIVE_APPROVE']], ['/simulator', 'Simulator', ['INCENTIVE_SIMULATE']], ['/admin/rules', 'Payout rules', ['INCENTIVE_RULE_MANAGE']], ['/admin/what-if', 'Rule what-if', ['INCENTIVE_RULE_MANAGE']]] },
    { label: 'Admin', items: [['/admin/users', 'Users', ['USER_MANAGE']], ['/admin/org', 'Organisation', ['SETTINGS_MANAGE']], ['/admin/roles', 'Roles', ['ROLE_MANAGE']], ['/admin/services', 'Services', ['SERVICE_MANAGE']], ['/admin/lead-statuses', 'Lead statuses', ['SETTINGS_MANAGE']], ['/admin/settings', 'Settings', ['SETTINGS_MANAGE']], ['/admin/audit', 'Audit trail', ['AUDIT_VIEW']]] }
  ];
  const PARTNER_NAV = [{ label: 'Partner', items: [['/partner', 'Overview']] }, { label: 'My leads', icon: 'Partner', items: [['/partner/leads', 'My leads']] }, { label: 'Submit a lead', icon: 'Partner', items: [['/partner/submit', 'Submit a lead']] }, { label: 'Payout statement', icon: 'Money', items: [['/partner/statement', 'Payout statement']] }];
  // Detail pages that live under a tab.
  const ALIAS = { '/copied-record': '/copied-records', '/lead': '/leads', '/proposal': '/proposals', '/sign': '/proposals' };
  const baseOf = (p) => p.split('?')[0];
  const visibleNav = () => (user && user.partner ? PARTNER_NAV : NAV).map((g) => Object.assign({}, g, { items: g.items.filter((i) => anyCan(i[2])) })).filter((g) => g.items.length);
  // Which section and tab the current page belongs to.
  function locate(path, qs) {
    const q = new URLSearchParams(qs || ''), groups = visibleNav(), want = ALIAS[path] || path;
    let best = null, bestScore = -1;
    groups.forEach((g) => g.items.forEach((i) => {
      if (baseOf(i[0]) !== want) return;
      const need = new URLSearchParams(i[0].split('?')[1] || ''); let ok = true, n = 0; need.forEach((v, k) => { if (q.get(k) === v) n++; else ok = false; });
      if (ok && n >= bestScore) { best = { group: g, tab: i }; bestScore = n; }
    }));
    return best;
  }
  const flatNav = () => { const out = []; visibleNav().forEach((g) => g.items.forEach((i) => out.push({ title: i[1], sub: g.label, href: '#' + i[0] }))); return out; };
  function authShell(title, lede, inner) {
    app.innerHTML = '<div class="auth-split"><div class="auth-pane"><div class="auth-panel"><div class="auth-mark"><img src="mark.svg" alt=""><div><div class="auth-mark-name">' + esc(B.name) + '</div><div class="auth-mark-sub">' + esc(B.company || '') + '</div></div></div><h1 class="auth-title">' + esc(title) + '</h1><p class="auth-lede">' + lede + '</p>' + inner + '</div><div class="auth-foot"><span>' + esc(B.company || '') + (B.city ? ' · ' + esc(B.city) : '') + '</span><span class="auth-zone">Times shown in ' + esc(B.timezone || 'UTC') + '</span></div></div><div class="auth-art"><img src="art.svg" alt=""></div></div>';
  }
  function loginScreen() {
    authShell('Sign in', 'Leads, partners and payouts in one workspace.<br>Sign in to continue.',
      '<form class="auth-form" id="lf" novalidate><div id="msg"></div><div class="auth-field"><label for="email">Email</label><input class="auth-input" id="email" type="email" autocomplete="username" required autofocus></div><div class="auth-field"><label for="pw">Password</label><input class="auth-input" id="pw" type="password" autocomplete="current-password" required><p class="auth-caps" id="caps" role="status" aria-live="polite"></p></div><a class="auth-forgot" href="#/forgot-password">Forgot your password?</a><button class="auth-submit" id="go">Sign in</button></form><p class="auth-alt">Need an account? <a href="mailto:' + esc(B.supportEmail || '') + '">Ask your administrator</a></p>');
    const pw = document.getElementById('pw'), caps = document.getElementById('caps');
    const capsFn = (e) => { caps.textContent = e.getModifierState && e.getModifierState('CapsLock') ? 'Caps Lock is on.' : ''; };
    pw.addEventListener('keyup', capsFn); pw.addEventListener('keydown', capsFn);
    document.getElementById('lf').onsubmit = async (e) => {
      e.preventDefault(); const msg = document.getElementById('msg'), go = document.getElementById('go'); msg.innerHTML = ''; go.disabled = true; go.textContent = 'Signing in...';
      try { const r = await api.post('/auth/login', { email: document.getElementById('email').value.trim(), password: pw.value }); user = r.user; location.hash = '#' + (r.user.mustChangePassword ? '/change-password' : (r.user.home || '/home')); }
      catch (er) { const lock = er.status === 403; msg.innerHTML = '<div class="alert ' + (lock ? 'warn' : 'danger') + '"><b>' + (lock ? 'Account unavailable' : 'Sign-in failed') + '</b>' + esc(er.status ? er.message : 'Could not reach the server. Check your connection and try again.') + '</div>'; go.disabled = false; go.textContent = 'Sign in'; }
    };
    if (B.demo && api.demoLogin) {
      const roles = [['Sales manager', 'ravi@example.com'], ['Sales rep', 'asha@example.com'], ['Finance', 'finance@example.com'], ['Partner manager', 'partners@example.com'], ['Partner (portal)', 'partner@example.com'], ['Administrator', 'admin@example.com']];
      document.querySelector('.auth-panel').insertAdjacentHTML('beforeend', '<div class="demo-box"><b>Try the demo</b><p class="sub" style="margin:2px 0 8px">Sample data only. Pick a role to look around; changes stay in this browser.</p><div class="demo-btns">' + roles.map((r) => '<button type="button" class="btn" data-e="' + r[1] + '">' + r[0] + '</button>').join('') + '</div></div>');
      document.querySelectorAll('.demo-btns [data-e]').forEach((b) => { b.onclick = async () => { try { const r = await api.demoLogin(b.dataset.e); user = r.user; location.hash = '#' + (r.user.home || '/home'); } catch (er) { toast('Could not open the demo.'); } }; });
    }
  }
  function forgotScreen() {
    authShell('Reset password', 'Enter your account email and we will send a code you can use to choose a new password.',
      '<form class="auth-form" id="ff"><div id="msg"></div><div class="auth-field" id="s1"><label>Email</label><input class="auth-input" name="email" type="email" required></div><div id="s2" hidden><div class="auth-field"><label>6-digit code</label><input class="auth-input" name="code" inputmode="numeric" maxlength="6"></div><div class="auth-field"><label>New password (12+ characters)</label><input class="auth-input" name="pw" type="password" minlength="12"></div><div class="auth-field"><label>Confirm new password</label><input class="auth-input" name="pw2" type="password"></div></div><button class="auth-submit" id="go">Send code</button></form><p class="auth-alt"><a href="#/login">Back to sign in</a></p>');
    let step = 1;
    document.getElementById('ff').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target, msg = document.getElementById('msg');
      try {
        if (step === 1) { await api.post('/auth/forgot-password', { email: f.email.value }); step = 2; document.getElementById('s2').hidden = false; f.email.readOnly = true; document.getElementById('go').textContent = 'Set new password'; msg.innerHTML = '<div class="alert ok">Check your email for the code.</div>'; }
        else { if (f.pw.value !== f.pw2.value) throw new Error('The two passwords do not match.'); if (f.pw.value.length < 12) throw new Error('Use at least 12 characters.'); await api.post('/auth/reset-password-otp', { email: f.email.value, code: f.code.value, password: f.pw.value }); location.hash = '#/login'; }
      } catch (er) { msg.innerHTML = '<div class="alert danger">' + esc(er.message) + '</div>'; }
    };
  }
  const svg = (name) => '<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || ICONS.Admin) + '</svg>';
  function shell() {
    const groups = visibleNav();
    const links = groups.map((g) => '<a href="#' + g.items[0][0] + '" data-g="' + esc(g.label) + '">' + svg(g.icon || g.label) + '<span>' + esc(g.label) + '</span></a>').join('');
    const role = user.designation || user.profile || '';
    app.innerHTML = '<div class="shell"><nav class="side" aria-label="Sections"><div class="brand"><img src="mark.svg" alt=""><div>' + esc(B.name) + '<small>' + esc(B.company || '') + '</small></div></div>' + links + '<div class="hint">Press <kbd class="kbd">g</kbd> <kbd class="kbd">h</kbd> for Home</div></nav><div class="main"><header class="top"><button class="btn menu-btn" id="menu" aria-label="Open menu">&#9776;</button><div class="crumb"><div class="crumb-t" id="crumb"></div><div class="crumb-s">' + esc(role) + (role ? ' &middot; ' : '') + new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) + '</div></div><span class="grow"></span><div class="gsearch" id="gsearch"></div><a class="chip" id="attchip" href="#/attendance" hidden></a><button class="btn bell" id="bell" title="Notifications">Alerts<span class="badge-n" id="bn" hidden></span></button><div class="umenu"><button class="uhead" id="uhead" aria-haspopup="true" aria-expanded="false"><span class="av">' + esc((user.name || '?').trim().charAt(0).toUpperCase()) + '</span><span class="un"><b>' + esc(user.name) + '</b><small>' + esc(role) + '</small></span></button><div class="upop" id="upop" hidden><div class="upop-h"><b>' + esc(user.name) + '</b><small>' + esc(user.email || '') + '</small></div><a href="#/change-password">Change password</a><button class="btn" id="signout">Sign out</button></div></div></header><nav class="tabs" id="tabs" aria-label="Pages in this section" hidden></nav><main class="content" id="page"></main></div></div>';
    document.getElementById('signout').onclick = async () => { await api.post('/auth/logout', {}); user = null; location.hash = '#/login'; };
    const sh = document.querySelector('.shell'), uh = document.getElementById('uhead'), up = document.getElementById('upop');
    document.getElementById('menu').onclick = () => sh.classList.toggle('open');
    uh.onclick = (e) => { e.stopPropagation(); up.hidden = !up.hidden; uh.setAttribute('aria-expanded', String(!up.hidden)); };
    document.addEventListener('click', (e) => { if (!up.hidden && !up.contains(e.target)) { up.hidden = true; uh.setAttribute('aria-expanded', 'false'); } });
    document.querySelector('.side').insertAdjacentHTML('beforeend', '<div class="ver">' + esc(B.name) + ' v' + esc(B.version || '') + '</div>');
    if (B.demo) { document.querySelector('.side').insertAdjacentHTML('beforeend', '<div class="ver">Demo with sample data, saved only in this browser. <a href="#" id="resetdemo">Reset demo</a></div>'); document.getElementById('resetdemo').onclick = async (e) => { e.preventDefault(); if (confirm('Reset all demo data to the starting sample?')) { await api.post('/auth/logout', {}); api.reset(); location.hash = '#/login'; location.reload(); } }; }
    window.dispatchEvent(new Event('pd-shell'));
    refreshChip();
  }
  // Section highlight, tab bar and breadcrumb for the page being shown.
  function updateNav(path, qs) {
    const at = locate(path, qs), tabs = document.getElementById('tabs'), crumb = document.getElementById('crumb'); if (!tabs || !crumb) return;
    document.querySelectorAll('.side a[data-g]').forEach((a) => { const on = !!at && a.dataset.g === at.group.label; a.classList.toggle('on', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (!at) { tabs.hidden = true; crumb.textContent = ''; return; }
    crumb.innerHTML = at.group.items.length > 1 || at.group.label !== at.tab[1] ? '<span class="crumb-g">' + esc(at.group.label) + '</span> / <b>' + esc(at.tab[1]) + '</b>' : '<b>' + esc(at.tab[1]) + '</b>';
    document.title = at.tab[1] + ' - ' + B.name;
    tabs.hidden = at.group.items.length < 2;
    tabs.innerHTML = at.group.items.map((i) => '<a href="#' + i[0] + '"' + (i === at.tab ? ' class="on" aria-current="page"' : '') + '>' + esc(i[1]) + '</a>').join('');
    const on = tabs.querySelector('a.on'); if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'center' });
  }
  // The small status pill in the header: whether you are punched in, and for how long.
  let chipTimer = 0;
  async function refreshChip() {
    const chip = document.getElementById('attchip'); if (!chip || !user || !can('ATTENDANCE_SELF')) { if (chip) chip.hidden = true; return; }
    try {
      const d = await api.get('/attendance/me/today'), r = d.record, open = r && r.status === 'open';
      const secs = open ? Math.max(0, Math.floor((new Date(d.serverTime) - new Date(r.in)) / 1000)) : 0, h = Math.floor(secs / 3600), m = Math.floor(secs % 3600 / 60);
      const state = open ? ({ active: 'Active', idle: 'Idle', hidden: 'Away' }[r.trackingState] || 'Active') : 'Not punched in';
      chip.hidden = false; chip.className = 'chip ' + (open ? (r.trackingState === 'active' ? 'on' : 'mid') : 'off'); chip.innerHTML = '<i></i>' + esc(state) + (open ? ' &middot; ' + h + 'h ' + String(m).padStart(2, '0') + 'm' : '');
    } catch (e) { chip.hidden = true; }
    clearTimeout(chipTimer); chipTimer = setTimeout(refreshChip, 30000);
  }
  function route() {
    const hash = location.hash.replace(/^#/, '') || '/home'; const [path, qs] = hash.split('?');
    if (path === '/login') { if (user) { location.hash = '#' + (user.home || '/home'); return; } return loginScreen(); }
    if (path === '/forgot-password') return forgotScreen();
    if (path === '/sign' && routes['/sign']) { document.title = 'Proposal - ' + B.name; return Promise.resolve(routes['/sign'].render(app, Object.fromEntries(new URLSearchParams(qs || '')))).catch((er) => { app.innerHTML = '<div class="empty">' + esc(er.message || 'Could not load this page') + '</div>'; }); }
    if (!user) { location.hash = '#/login'; return; }
    if (path === '/change-password') return changePw();
    const portal = path === '/partner' || path.startsWith('/partner/');
    if (user.partner && !portal) { location.hash = '#/partner'; return; }
    if (!user.partner && portal) { location.hash = '#' + (user.home || '/home'); return; }
    if (!document.getElementById('page')) shell();
    const shellEl = document.querySelector('.shell'); if (shellEl) shellEl.classList.remove('open');
    const r = routes[path]; const el = document.getElementById('page'); curPath = path;
    updateNav(path, qs);
    if (!r) { el.innerHTML = '<div class="empty">That page does not exist.</div>'; return; }
    if (r.perm && !anyCan(r.perm)) { el.innerHTML = '<div class="empty">Your access does not include this page.</div>'; return; }
    el.innerHTML = '<div class="empty">Loading...</div>';
    Promise.resolve(r.render(el, Object.fromEntries(new URLSearchParams(qs || '')))).catch((er) => { if (curPath === path) el.innerHTML = '<div class="alert danger">' + esc(er.message || 'Could not load this page') + '</div>'; });
  }
  function changePw() {
    authShell('Change password', 'Choose a new password for your account. You will be signed out afterwards.', '<form class="auth-form" id="cf"><div id="msg"></div><div class="auth-field"><label>Current password</label><input class="auth-input" name="cur" type="password" required></div><div class="auth-field"><label>New password (12+ characters)</label><input class="auth-input" name="pw" type="password" minlength="12" required></div><div class="auth-field"><label>Confirm new password</label><input class="auth-input" name="pw2" type="password" required></div><button class="auth-submit">Change password</button></form>');
    document.getElementById('cf').onsubmit = async (e) => { e.preventDefault(); const f = e.target; try { if (f.pw.value !== f.pw2.value) throw new Error('The two passwords do not match.'); await api.post('/auth/change-password', { current: f.cur.value, password: f.pw.value }); await api.post('/auth/logout', {}); user = null; location.hash = '#/login'; } catch (er) { document.getElementById('msg').innerHTML = '<div class="alert danger">' + esc(er.message) + '</div>'; } };
  }
  async function start() {
    document.title = B.name;
    try { user = await api.get('/auth/me'); } catch (e) { user = null; }
    if (!user && B.demo && api.demoLogin && !location.hash.startsWith('#/login') && !location.hash.startsWith('#/sign')) { try { const r = await api.demoLogin('admin@example.com'); user = r.user; location.hash = '#' + (r.user.home || '/home'); } catch (e) { user = null; } }
    window.addEventListener('hashchange', () => { if (!user || !location.hash.startsWith('#/login')) route(); else route(); });
    if (!user) { if (!location.hash.startsWith('#/sign')) location.hash = '#/login'; } else if (!location.hash) location.hash = '#' + (user.home || '/home');
    route();
  }
  return { nav: flatNav, esc, money, date, can, anyCan, tagFor, toast, modal, field, register: (p, r) => { routes[p] = r; }, start, user: () => user, rerender: route };
})();
