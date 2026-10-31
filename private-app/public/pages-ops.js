// Operations: tasks (list + board), overview, sprints.
(() => {
  const W = WorkOS, esc = W.esc, F = W.field, reg = W.register;
  const COLS = ['To do', 'In progress', 'Blocked', 'Done'];
  const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
  const date = (d) => d ? new Date(d).toLocaleDateString(undefined, { day: '2-digit', month: 'short' }) : '-';
  const isOverdue = (t) => t.status !== 'Done' && new Date(t.deadline) < new Date();

  function taskPage(path, title, sub, mine) {
    reg(path, { perm: ['OPS_VIEW_OWN', 'OPS_VIEW_ALL'], render: async (el, qp) => {
      const me = W.user(), users = await api.get('/users/assignees'), projects = (await api.get('/operations/projects?pageSize=100')).rows;
      const board = qp.view === 'board', FILT = ['q', 'project', 'assignee', 'status', 'priority', 'type', 'overdue', 'blocked', 'extended', 'unassigned'];
      const go = (patch) => { const p = new URLSearchParams(qp); Object.keys(patch).forEach((k) => { const v = patch[k]; if (v === '' || v === undefined || v === false) p.delete(k); else p.set(k, String(v)); }); location.hash = '#' + path + (p.toString() ? '?' + p.toString() : ''); };
      const params = () => { const p = new URLSearchParams(); FILT.forEach((k) => { if (qp[k]) p.set(k, qp[k]); }); if (mine) p.set('assignee', me.id); p.set('pageSize', '100'); return p.toString(); };
      const nActive = FILT.filter((k) => qp[k]).length;
      let data, dragging = null, local = {};
      const status = (t) => local[t.id] || t.status;
      const load = async () => { data = await api.get('/operations/tasks?' + params()); local = {}; };
      const owner = (id) => (users.find((u) => u.id === id) || {}).name || 'Unassigned';
      const patch = async (t, body, okMsg) => { try { await api.patch('/operations/tasks/' + t.id, body); if (okMsg) W.toast(okMsg); await load(); draw(); } catch (e) { delete local[t.id]; draw(); W.toast(e.message || 'Could not move that task'); } };
      const askBlocked = (t) => W.modal('What is blocking "' + t.title + '"?', F('why', 'Say what is blocking it', 'textarea'), async (d) => { if (!String(d.why).trim()) throw new Error('Say what is blocking it before marking it blocked.'); await patch(t, { status: 'Blocked', blockedReason: d.why.trim() }, 'Marked as blocked'); }, 'Mark as blocked');
      const move = (t, to) => { if (to === 'Blocked') { askBlocked(t); return; } local[t.id] = to; draw(); patch(t, { status: to }, 'Moved to ' + to); };
      const canDrop = (t, to) => status(t) !== to;
      const card = (t) => '<div class="pcard" tabindex="0" draggable="true" data-id="' + t.id + '"><b>' + esc(t.title) + '</b> ' + (t.type === 'General' ? '<span class="tag">General</span>' : '') + (t.carryOverCount ? ' <span class="tag warn">carried over ' + t.carryOverCount + 'x</span>' : '') + '<small>' + esc(t.project || 'General work') + '</small><small>' + esc(owner(t.assignee)) + ' &middot; ' + (isOverdue(t) ? '<span style="color:var(--stop)">overdue ' : 'due ') + date(t.deadline) + (isOverdue(t) ? '</span>' : '') + '</small>' + (t.status === 'Blocked' && t.blockedReason ? '<small style="color:var(--stop)">&#9632; ' + esc(t.blockedReason) + '</small>' : '') + '</div>';
      function draw() {
        const rows = data.rows, box = el.querySelector('#body');
        el.querySelector('#note').innerHTML = data.total > rows.length ? '<div class="alert ok" style="margin-bottom:12px">Showing the first ' + rows.length + ' of ' + data.total + ' tasks. Narrow the list with a filter or the search to see the rest.</div>' : '';
        if (!rows.length) { box.innerHTML = '<div class="empty"><b>' + (nActive ? 'No tasks match these filters.' : 'No tasks yet.') + '</b><p>' + (nActive ? 'Try removing a filter, or clear them all.' : 'Tasks are added from a sprint or the New task button.') + '</p></div>'; return; }
        if (board) {
          box.innerHTML = '<p class="sub">Drag a card to another column to change its status. With a keyboard, select a card and press Ctrl (or Cmd) with the left or right arrow.</p><div class="board">' + COLS.map((c) => { const here = rows.filter((t) => status(t) === c), tgt = dragging && canDrop(dragging, c), inert = dragging && !tgt && status(dragging) !== c; return '<section class="col' + (tgt ? ' target' : '') + (inert ? ' inert' : '') + '" data-s="' + c + '"><h3>' + c + '<span>' + here.length + '</span></h3>' + (here.length ? here.map(card).join('') : '<small>' + (tgt ? 'Drop here.' : 'No tasks.') + '</small>') + '</section>'; }).join('') + '</div>';
          box.querySelectorAll('.pcard').forEach((c) => { const t = rows.find((x) => x.id === c.dataset.id);
            c.ondragstart = (e) => { e.dataTransfer.setData('text/plain', t.id); e.dataTransfer.effectAllowed = 'move'; dragging = t; setTimeout(draw, 0); };
            c.ondragend = () => { dragging = null; draw(); }; c.onclick = () => detail(t);
            c.onkeydown = (e) => { if (!(e.ctrlKey || e.metaKey) || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return; e.preventDefault(); const dir = e.key === 'ArrowRight' ? 1 : -1; for (let i = COLS.indexOf(status(t)) + dir; i >= 0 && i < COLS.length; i += dir) if (canDrop(t, COLS[i])) { move(t, COLS[i]); return; } }; });
          box.querySelectorAll('.col').forEach((col) => { const to = col.dataset.s; col.ondragover = (e) => { if (dragging && canDrop(dragging, to)) { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; col.classList.add('over'); } }; col.ondragleave = () => col.classList.remove('over'); col.ondrop = (e) => { e.preventDefault(); const t = dragging; dragging = null; if (t && canDrop(t, to)) move(t, to); else draw(); }; });
        } else {
          box.innerHTML = '<table><thead><tr><th>Task</th><th>Project</th><th>Sprint</th><th>Assignee</th><th>Priority</th><th>Status</th><th>Progress</th><th>Deadline</th></tr></thead><tbody>' + rows.map((t) => '<tr class="click" data-id="' + t.id + '"><td><b>' + esc(t.title) + '</b> ' + (t.type === 'General' ? '<span class="tag">General</span>' : '') + (t.carryOverCount ? ' <span class="tag warn">carried over ' + t.carryOverCount + 'x</span>' : '') + (t.status === 'Blocked' && t.blockedReason ? '<br><small style="color:var(--stop)">&#9632; ' + esc(t.blockedReason) + '</small>' : '') + '</td><td>' + esc(t.project || '-') + '</td><td>' + esc(t.sprint || 'Backlog') + '</td><td>' + esc(owner(t.assignee)) + '</td><td>' + W.tagFor(t.priority) + '</td><td>' + W.tagFor(t.status) + '</td><td>' + t.progress + '%</td><td>' + date(t.deadline) + (isOverdue(t) ? ' ' + W.tagFor('Overdue') : '') + (t.extended ? ' <span class="tag info">extended</span>' : '') + '</td></tr>').join('') + '</tbody></table>';
          box.querySelectorAll('tr.click').forEach((tr) => { tr.onclick = () => detail(rows.find((x) => x.id === tr.dataset.id)); });
        }
      }
      function detail(t) {
        W.modal(t.title, F('status', 'Status', 'select', { options: COLS, value: t.status }) + '<div id="why" hidden>' + F('blockedReason', 'What is blocking it?', 'textarea', { value: t.blockedReason }) + '</div>' + F('assignee', 'Assignee', 'select', { options: [{ value: '', label: 'Unassigned' }].concat(users.map((u) => ({ value: u.id, label: u.name }))), value: t.assignee }) + F('priority', 'Priority', 'select', { options: ['Normal', 'High'], value: t.priority }) + F('deadline', 'Deadline', 'date', { value: (t.deadline || '').slice(0, 10) }) + F('progress', 'Progress (%)', 'number', { value: t.progress }), async (d) => {
          if (d.status === 'Blocked' && !String(d.blockedReason).trim()) throw new Error('Say what is blocking it before marking it blocked.');
          await api.patch('/operations/tasks/' + t.id, { status: d.status, blockedReason: d.blockedReason, assignee: d.assignee, priority: d.priority, deadline: d.deadline, progress: Number(d.progress) || 0 }); W.toast('Task updated.'); await load(); draw();
        }, 'Save').el.querySelector('[name=status]').addEventListener('change', (e) => { document.querySelector('#why').hidden = e.target.value !== 'Blocked'; });
      }
      const sel = (key, label, opts) => '<select class="in" data-f="' + key + '" aria-label="' + label + '"><option value="">' + label + '</option>' + opts.map((o) => '<option value="' + esc(o[0]) + '"' + (qp[key] === o[0] ? ' selected' : '') + '>' + esc(o[1]) + '</option>').join('') + '</select>';
      const TOG = [['overdue', 'Overdue'], ['blocked', 'Blocked'], ['extended', 'Deadline extended'], ['unassigned', 'Unassigned']];
      el.innerHTML = '<h1>' + esc(title) + '</h1><p class="sub">' + esc(sub) + '</p><div class="bar"><input class="in" id="q" placeholder="Search tasks" value="' + esc(qp.q || '') + '">' + (mine ? '' : sel('project', 'All projects', projects.map((p) => [p.name, p.name])) + sel('assignee', 'All assignees', users.map((u) => [u.id, u.name]))) + sel('status', 'All statuses', COLS.map((c) => [c, c])) + sel('priority', 'All priorities', [['High', 'High'], ['Normal', 'Normal']]) + sel('type', 'All types', [['Project', 'Project'], ['General', 'General']]) + '<span class="tag"><a data-view="list" style="text-decoration:none;cursor:pointer;' + (board ? '' : 'font-weight:600') + '">List</a> | <a data-view="board" style="text-decoration:none;cursor:pointer;' + (board ? 'font-weight:600' : '') + '">Board</a></span><span style="flex:1"></span>' + (mine ? '' : '<button class="btn primary" id="new">New task</button>') + '</div><div class="bar">' + TOG.map((t) => '<button class="btn sm" data-t="' + t[0] + '" aria-pressed="' + (qp[t[0]] === 'true') + '"' + (qp[t[0]] === 'true' ? ' style="border-color:var(--b5);color:var(--b6);font-weight:600"' : '') + '>' + t[1] + '</button>').join('') + (nActive ? '<button class="btn sm" id="clr">Clear all filters</button>' : '') + '</div><div id="note"></div><div id="body"></div>';
      el.querySelector('#q').onkeydown = (e) => { if (e.key === 'Enter') go({ q: e.target.value }); };
      el.querySelectorAll('[data-f]').forEach((s) => { s.onchange = () => go({ [s.dataset.f]: s.value }); });
      el.querySelectorAll('[data-t]').forEach((b) => { b.onclick = () => go({ [b.dataset.t]: qp[b.dataset.t] === 'true' ? '' : 'true' }); });
      el.querySelectorAll('[data-view]').forEach((a) => { a.onclick = () => go({ view: a.dataset.view === 'board' ? 'board' : '' }); });
      const clr = el.querySelector('#clr'); if (clr) clr.onclick = () => { location.hash = '#' + path + (board ? '?view=board' : ''); };
      const nw = el.querySelector('#new'); if (nw) nw.onclick = () => W.modal('New task', F('title', 'Title', 'text', { required: true }) + F('project', 'Project', 'select', { options: [{ value: '', label: 'General work (no project)' }].concat(projects.map((p) => p.name)) }) + F('assignee', 'Assignee', 'select', { options: [{ value: '', label: 'Unassigned' }].concat(users.map((u) => ({ value: u.id, label: u.name }))) }) + F('priority', 'Priority', 'select', { options: ['Normal', 'High'] }) + F('deadline', 'Deadline', 'date'), async (d) => { await api.post('/operations/tasks', d); W.toast('Task added.'); await load(); draw(); });
      await load(); draw();
    } });
  }
  taskPage('/operations/tasks', 'Tasks', 'Every task, across all sprints. Filter the list or switch to the board.', false);
  taskPage('/operations/my-work', 'My work', 'Tasks assigned to you.', true);

  const card = (label, value, note, tone) => '<div class="card ' + (tone || '') + '"><small>' + esc(label) + '</small><strong>' + value + '</strong><em>' + esc(note || '') + '</em></div>';
  reg('/operations', { perm: ['OPS_VIEW_OWN', 'OPS_VIEW_ALL'], render: async (el) => {
    const d = await api.get('/operations/dashboard'), sp = d.sprints;
    el.innerHTML = '<h1>Operations</h1><p class="sub">What needs doing, who is doing it, and whether the work is on track.</p><div class="cards">' + card('Overdue', '<a href="#/operations/tasks?overdue=true">' + d.overdue + '</a>', 'tasks past their deadline', d.overdue ? 'bad' : '') + card('Blocked', '<a href="#/operations/tasks?blocked=true">' + d.blocked + '</a>', 'tasks waiting on someone', d.blocked ? 'warn' : '') + card('Due today', d.dueToday, '') + card('Extended', '<a href="#/operations/tasks?extended=true">' + d.extended + '</a>', 'tasks whose deadline was extended') + card('Active tasks', d.active, '') + card('Completed', d.completed, '') + card('Active projects', d.activeProjects, '') + '</div><h3>Current sprints</h3>' + (sp.length ? '<div class="cards">' + sp.map((s) => '<div class="card"><small>' + (s.kind === 'daily' ? 'Current daily sprint' : 'Current weekly sprint') + '</small><strong>' + esc(s.name) + '</strong><em>' + plural(s.taskCount, 'task') + ' &middot; ' + esc(s.start) + (s.end !== s.start ? ' to ' + esc(s.end) : '') + '</em></div>').join('') + '</div>' : '<div class="empty">No sprint is running right now.</div>');
  } });
  reg('/operations/sprints', { perm: ['OPS_VIEW_OWN', 'OPS_VIEW_ALL'], render: async (el) => {
    const rows = await api.get('/operations/sprints');
    el.innerHTML = '<h1>Sprints</h1><p class="sub">Short work periods the team plans tasks into.</p>' + (rows.length ? '<table><thead><tr><th>Sprint</th><th>Kind</th><th>Dates</th><th>Tasks</th><th></th></tr></thead><tbody>' + rows.map((s) => '<tr><td><b>' + esc(s.name) + '</b></td><td>' + esc(s.kind) + '</td><td>' + esc(s.start) + (s.end !== s.start ? ' to ' + esc(s.end) : '') + '</td><td>' + s.taskCount + '</td><td>' + (s.current ? W.tagFor('Current') : W.tagFor('Previous')) + '</td></tr>').join('') + '</tbody></table>' : '<div class="empty">No sprints yet.</div>');
  } });
  reg('/operations/current', { perm: ['OPS_VIEW_OWN', 'OPS_VIEW_ALL'], render: async (el) => {
    const sp = (await api.get('/operations/dashboard')).sprints.find((s) => s.kind === 'weekly') || null;
    el.innerHTML = '<h1>Current sprint</h1><p class="sub">The sprint the team is working in right now.</p>' + (sp ? '<div class="card"><strong>' + esc(sp.name) + '</strong><em>' + esc(sp.start) + ' to ' + esc(sp.end) + ' &middot; ' + plural(sp.taskCount, 'task') + '</em><p><a href="#/operations/tasks?view=board">Open the task board</a></p></div>' : '<div class="empty">No sprint is running right now.</div>');
  } });
})();
