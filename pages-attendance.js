// Attendance: a background activity tracker (runs while punched in) plus the Today and Policy pages.
(() => {
  const W = WorkOS, esc = W.esc, F = W.field, reg = W.register;
  const CHANNEL = 'partnerdesk-attendance', LOCK = 'partnerdesk-attendance-leader';
  const INPUTS = ['mousemove', 'mousedown', 'keydown', 'wheel', 'touchstart', 'scroll'];
  const live = { state: null, offline: false, skewMs: 0 };
  const fire = () => window.dispatchEvent(new CustomEvent('pd-live'));

  // One tab is elected leader and reports; all tabs share activity so a background tab is not "idle" if another is in use.
  function startTracker(policy, hooks) {
    const thresholdMs = (policy.idleThresholdSeconds || 60) * 1000, beatMs = (policy.heartbeatSeconds || 30) * 1000;
    const me = Math.random().toString(36).slice(2), peers = new Map(), ch = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null;
    let lastInput = Date.now(), interacted = true, leader = false, stopped = false, busy = false, sent = null, lastBeat = 0, failures = 0, retryAt = 0, lastShare = 0, release = null;
    const share = () => ch && ch.postMessage({ kind: 'alive', tab: me, visible: document.visibilityState === 'visible', lastInput });
    const compute = () => { const t = Date.now(); let visible = document.visibilityState === 'visible', last = lastInput; peers.forEach((p, id) => { if (t - p.seen > 30000) { peers.delete(id); return; } visible = visible || p.visible; last = Math.max(last, p.lastInput); }); return !visible ? 'hidden' : t - last >= thresholdMs ? 'idle' : 'active'; };
    const tick = async () => {
      if (stopped) return; const state = compute(); hooks.onState(state);
      if (!leader || busy || Date.now() < retryAt) return; busy = true;
      try {
        if (state !== sent) { sent = (await api.post('/attendance/activity/transition', { state })).state; failures = 0; hooks.onOffline(false); hooks.onChanged(); }
        else if (Date.now() - lastBeat >= beatMs) { const i = interacted; interacted = false; lastBeat = Date.now(); sent = (await api.post('/attendance/activity/heartbeat', { interacted: i })).state; failures = 0; hooks.onOffline(false); }
      } catch (e) {
        if (e.status === 409) { stopped = true; hooks.onClosed(); } else { failures++; retryAt = Date.now() + Math.min(60000, 2000 * Math.pow(2, Math.min(failures, 5))); hooks.onOffline(true); }
      } finally { busy = false; }
    };
    const onInput = () => { const t = Date.now(); lastInput = t; interacted = true; if (t - lastShare >= 5000) { lastShare = t; share(); } };
    const onVis = () => { share(); tick(); };
    INPUTS.forEach((n) => window.addEventListener(n, onInput, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', onVis);
    if (ch) ch.onmessage = (e) => { const d = e.data; if (!d) return; if (d.kind === 'alive' && d.tab !== me) peers.set(d.tab, { visible: d.visible, lastInput: d.lastInput, seen: Date.now() }); if (d.kind === 'gone') { peers.delete(d.tab); tick(); } };
    if (navigator.locks && navigator.locks.request) navigator.locks.request(LOCK, () => new Promise((res) => { if (stopped) { res(); return; } leader = true; sent = null; release = res; tick(); })).catch(() => { leader = true; });
    else leader = true;
    share(); tick();
    const t1 = setInterval(tick, 1000), t2 = setInterval(share, 10000);
    return () => { stopped = true; clearInterval(t1); clearInterval(t2); INPUTS.forEach((n) => window.removeEventListener(n, onInput, { capture: true })); document.removeEventListener('visibilitychange', onVis); if (ch) { ch.postMessage({ kind: 'gone', tab: me }); ch.close(); } if (release) release(); };
  }

  // Keeps the tracker in step with the server's view of "am I punched in".
  let stopFn = null, lastSync = 0;
  async function sync(force) {
    const u = W.user(); if (!u || !W.can('ATTENDANCE_SELF')) { if (stopFn) { stopFn(); stopFn = null; } return null; }
    if (!force && Date.now() - lastSync < 60000) return null; lastSync = Date.now();
    let t; try { t = await api.get('/attendance/me/today'); } catch (e) { return null; }
    live.skewMs = new Date(t.serverTime).getTime() - Date.now();
    const open = t.record && t.record.status === 'open';
    if (open && !stopFn) stopFn = startTracker(t.policy, { onState: (s) => { if (live.state !== s) { live.state = s; fire(); } }, onOffline: (o) => { if (live.offline !== o) { live.offline = o; fire(); } }, onClosed: () => { if (stopFn) { stopFn(); stopFn = null; } live.state = null; sync(true); }, onChanged: () => {} });
    if (!open && stopFn) { stopFn(); stopFn = null; live.state = null; fire(); }
    return t;
  }
  window.addEventListener('hashchange', () => sync(false));
  window.addEventListener('load', () => setTimeout(() => sync(true), 300));
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') sync(false); });

  const hhmmss = (s) => { s = Math.max(0, Math.floor(s)); return [Math.floor(s / 3600), Math.floor(s % 3600 / 60), s % 60].map((n) => String(n).padStart(2, '0')).join(':'); };
  const hm = (s) => { s = Math.max(0, Math.floor(s)); return Math.floor(s / 3600) + 'h ' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + 'm'; };
  const LABEL = { active: ['Active in the app', 'Input seen within the idle threshold.'], idle: ['Idle', 'No input in the app. Move the mouse or press a key to resume.'], hidden: ['App hidden', 'Every tab is in the background. Not counted as idle.'] };

  reg('/attendance', { perm: ['ATTENDANCE_SELF'], render: async (el) => {
    let t = await sync(true) || await api.get('/attendance/me/today');
    const draw = () => {
      const r = t.record, open = r && r.status === 'open', done = r && r.status === 'closed';
      const st = live.offline ? ['No contact', 'Reconnecting. The gap is recorded as unclassified.'] : LABEL[live.state] || ['Waiting', ''];
      const tz = (t.policy && t.policy.timezone) || 'UTC', idleS = (t.policy && t.policy.idleThresholdSeconds) || 60, tot = (r && r.totals) || { activeSeconds: 0, idleSeconds: 0, hiddenSeconds: 0, attendanceSeconds: 0 };
      const elapsed = open ? Math.max(0, (Date.now() + live.skewMs - new Date(r.in)) / 1000) : done ? Math.max(0, (new Date(r.out) - new Date(r.in)) / 1000) : 0, seen = tot.activeSeconds + tot.idleSeconds + tot.hiddenSeconds, lost = Math.max(0, elapsed - seen);
      const clock = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
      const cell = (label, value, note, id) => '<div class="att-m"><small>' + label + '</small><div class="att-v"' + (id ? ' id="' + id + '"' : '') + '>' + value + '</div><small>' + note + '</small></div>';
      el.innerHTML = '<h1>Today ' + (open ? '<span class="tag ' + (live.state === 'active' ? 'good' : 'warn') + '" style="font-size:12px;vertical-align:middle">' + esc(st[0]) + '</span>' : '') + '</h1><p class="sub">' + esc(new Date().toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })) + ' &middot; times in ' + esc(tz) + '</p>'
        + '<div class="card" id="att-card" style="padding:0;margin-bottom:12px"><div class="bar" style="margin:0;padding:12px 16px;border-block-end:1px solid var(--hair)"><b>' + (open ? 'Punched in' : done ? 'Day complete' : 'Not punched in') + '</b><span style="flex:1"></span>' + (open ? '<button class="btn primary" id="po">Punch out</button>' : done ? '' : '<button class="btn primary" id="pi">Punch in</button>') + '</div>'
        + (r ? '<div style="padding:16px;display:flex;gap:40px;flex-wrap:wrap"><div><small>Punch-in</small><div class="att-big">' + clock(r.in) + '</div></div>' + (open ? '<div><small>Current activity</small><div class="att-mid">' + esc(st[0]) + '</div><small>' + esc(st[1]) + '</small></div>' : '<div><small>Punch-out</small><div class="att-big">' + clock(r.out) + '</div></div>') + '</div>'
          + '<div class="att-grid">' + cell('Attendance so far', open ? '<span id="el">' + hm(elapsed) + '</span>' : hm(elapsed), 'Punch-in to ' + (open ? 'now' : 'punch-out')) + cell('Observed active', hm(tot.activeSeconds), 'Input inside the app') + cell('Idle', hm(tot.idleSeconds), 'App open, untouched past the threshold') + cell('App hidden', hm(tot.hiddenSeconds), 'Possibly working in another app') + cell('Unclassified', hm(lost), 'Not observed: browser closed or offline') + '</div>' : '<div style="padding:16px"><p class="sub" style="margin:0">Punch in to start today. The app then measures active, idle and hidden time while it is open.</p></div>')
        + '</div>'
        + '<div class="card"><b>How this is measured</b><p style="margin:8px 0;color:var(--ink-m);font-size:14px">These figures are activity the app can observe in its own tabs, not a measure of productivity. Someone is idle after ' + idleS + ' seconds without mouse, keyboard, scroll or touch input in the app. Reading a document without moving the mouse counts as idle. Time with every app tab hidden is counted separately, because the person may be working in another app. Unclassified is time nobody observed.</p><p style="margin:0;font-size:14px"><b>Recorded:</b> punch times, and when you moved between active, idle and hidden. <b>Never recorded:</b> what you typed, which keys you pressed, which pages you opened, or anything outside this app.</p></div>';
      const go = (id, path) => { const b = el.querySelector(id); if (b) b.onclick = async () => { b.disabled = true; try { await api.post(path, {}); t = await sync(true); draw(); } catch (e) { W.toast(e.message); b.disabled = false; } }; };
      go('#pi', '/attendance/punch-in'); go('#po', '/attendance/punch-out');
    };
    draw();
    const timer = setInterval(() => { const card = document.getElementById('att-card'); if (!card) { clearInterval(timer); window.removeEventListener('pd-live', onLive); return; } const e = document.getElementById('el'); if (e && t.record) e.textContent = hm((Date.now() + live.skewMs - new Date(t.record.in)) / 1000); }, 1000);
    const onLive = () => { if (document.getElementById('att-card')) draw(); }; window.addEventListener('pd-live', onLive);
    const refresh = setInterval(async () => { if (!document.getElementById('att-card')) { clearInterval(refresh); return; } if (document.visibilityState === 'visible') { t = await api.get('/attendance/me/today'); draw(); } }, 60000);
  } });

  reg('/attendance/policy', { perm: ['ATTENDANCE_VIEW_ALL'], render: async (el) => {
    const s = await api.get('/settings'), days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    el.innerHTML = '<h1>Attendance policy</h1><p class="sub">How attendance is measured for everyone. Changes are logged.</p><form id="f" style="max-inline-size:460px">'
      + F('timezone', 'Organisation timezone', 'text', { value: s.timezone }) + '<p class="sub" style="margin-top:-8px">The business day is a calendar day in this zone, and reports show times in it.</p>'
      + F('idleThresholdSeconds', 'Idle after (seconds without input)', 'number', { value: s.idleThresholdSeconds }) + F('heartbeatSeconds', 'Heartbeat every (seconds)', 'number', { value: s.heartbeatSeconds })
      + '<div class="fld"><label>Working days</label><div>' + days.map((d, i) => '<label style="margin-right:10px"><input type="checkbox" name="wd" value="' + i + '"' + (s.workingDays.includes(i) ? ' checked' : '') + '> ' + d.slice(0, 3) + '</label>').join('') + '</div></div>'
      + F('shiftStart', 'Shift starts', 'time', { value: s.shiftStart }) + '<div id="msg"></div><button class="btn primary">Save policy</button></form>';
    el.querySelector('#f').onsubmit = async (e) => {
      e.preventDefault(); const f = e.target, msg = el.querySelector('#msg');
      try {
        const idle = Number(f.idleThresholdSeconds.value), beat = Number(f.heartbeatSeconds.value);
        if (!(idle >= 15 && idle <= 3600)) throw new Error('Idle time must be between 15 and 3600 seconds.'); if (!(beat >= 10 && beat <= 300)) throw new Error('Heartbeat must be between 10 and 300 seconds.'); if (beat > idle) throw new Error('The heartbeat should not be longer than the idle time.');
        await api.put('/settings', { timezone: f.timezone.value.trim() || 'UTC', idleThresholdSeconds: idle, heartbeatSeconds: beat, workingDays: [...f.querySelectorAll('[name=wd]:checked')].map((c) => Number(c.value)), shiftStart: f.shiftStart.value });
        msg.innerHTML = '<div class="alert ok" style="margin-bottom:10px">Policy saved. It applies from the next state change.</div>';
      } catch (er) { msg.innerHTML = '<div class="alert danger" style="margin-bottom:10px">' + esc(er.message) + '</div>'; }
    };
  } });
})();
