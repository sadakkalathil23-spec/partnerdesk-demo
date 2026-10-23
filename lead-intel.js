// Lead intelligence: a 0-100 "call first" score and a stuck-in-stage flag. Pure functions, no network.
window.LeadIntel = (() => {
  const STAGE = { new: 5, contacted: 8, qualified: 12, initial_discussion: 14, proposal_sent: 18, negotiation: 20 };
  const PRI = { high: 30, medium: 18, low: 6 };
  const DAY = 86400000;
  const open = (l) => l.statusKey in STAGE && !l.deleted;
  const daysIn = (l, now) => Math.floor(((now || Date.now()) - new Date(l.updatedAt || l.createdAt)) / DAY);
  // Each reason is shown to the user, so a score is never a black box.
  function score(l, now) {
    if (!open(l)) return null;
    now = now || Date.now();
    const why = []; let s = 0;
    const add = (n, text) => { s += n; why.push('+' + n + ' ' + text); };
    add(PRI[l.priority] || 6, (l.priority || 'low') + ' priority');
    const v = Number(l.estimatedValue) || 0;
    if (v >= 500000) add(20, 'large deal'); else if (v >= 100000) add(14, 'medium deal'); else if (v > 0) add(8, 'has a value');
    add(STAGE[l.statusKey], 'stage ' + l.statusKey.replace(/_/g, ' '));
    if (l.nextAction) { const d = (new Date(l.nextAction) - now) / DAY; if (d < 0) add(25, 'follow-up overdue'); else if (d <= 2) add(12, 'follow-up due soon'); }
    if (daysIn(l, now) <= 3) add(10, 'touched in the last 3 days');
    return { value: Math.min(100, s), why, level: s >= 70 ? 'hot' : s >= 45 ? 'warm' : 'cool' };
  }
  // Open leads that have not moved for a week are flagged.
  function stuck(l, now) { if (!open(l) || l.statusKey === 'new') return 0; const d = daysIn(l, now); return d >= 7 ? d : 0; }
  const pill = (l) => { const s = score(l); return s ? '<span class="score ' + s.level + '" title="' + s.why.join(', ') + '">' + s.value + '</span>' : '-'; };
  const stuckTag = (l) => { const d = stuck(l); return d ? ' <span class="tag warn" title="No change for ' + d + ' days">Stuck ' + d + ' d</span>' : ''; };
  // ---- partner integrity checks ----
  const norm = (n) => String(n || '').toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(/\b(the|inc|ltd|llc|llp|pvt|private|limited|co|company|corp|corporation)\b/g, ' ').replace(/\s+/g, ' ').trim();
  // Flags partners whose leads are never worked, and one company submitted under several spellings.
  function integrity(leads, partners, now) {
    now = now || Date.now(); const out = []; const live = leads.filter((l) => !l.deleted);
    partners.forEach((p) => {
      const mine = live.filter((l) => l.partnerId === p.id); if (mine.length < 3) return;
      const idle = mine.filter((l) => l.statusKey === 'new' && (now - new Date(l.createdAt)) / DAY >= 7);
      if (idle.length / mine.length >= 0.6) out.push({ kind: 'idle', partnerId: p.id, partner: p.name, detail: idle.length + ' of ' + mine.length + ' leads are still New after a week.', leads: idle.map((l) => l.id) });
    });
    const groups = {}; live.forEach((l) => { const k = norm(l.company); if (k) (groups[k] = groups[k] || []).push(l); });
    Object.keys(groups).forEach((k) => {
      const g = groups[k], names = [...new Set(g.map((l) => l.company))], owners = [...new Set(g.map((l) => l.partnerId || 'direct'))];
      if (names.length > 1 && (owners.length > 1 || g.some((l) => l.partnerId))) out.push({ kind: 'lookalike', partner: owners.map((o) => (partners.find((p) => p.id === o) || {}).name || 'Direct').join(', '), detail: 'Spelled as ' + names.map((n) => '"' + n + '"').join(', ') + '.', leads: g.map((l) => l.id) });
    });
    return out;
  }
  return { score, stuck, pill, stuckTag, integrity, norm };
})();
