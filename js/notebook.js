/*
 * No Safe Harbor: the case notebook.
 *
 * notebookModel(game) gathers your progress: score, a working theory of the
 * case, what you know so far, open and finished leads, a log of what you've
 * done lately, the evidence, the people you've met and the places you've been.
 * renderNotebook(game) turns that into HTML for the notebook panel.
 *
 * Pure string-building with no DOM, so it also runs under Node for tests.
 */
(function (root) {
  'use strict';

  const LOG_SHOWN = 12;
  const LOG_LABEL = { evidence: 'Evidence', person: 'Met', place: 'First time at', lead: 'New lead', done: 'Done' };

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function notebookModel(game) {
    const st = game.state;
    const w = game.world;
    const clueIds = Object.keys(game.clues).filter((id) => id !== 'solved');
    const found = st.found.filter((id) => id !== 'solved');
    const places = Object.values(game.rooms).filter((r) => r.map);
    const leadState = st.leads || {};
    const leads = w.leads || [];
    const log = st.log || [];
    return {
      score: st.score,
      maxScore: w.maxScore,
      rank: game.rank(),
      turns: st.turns,
      over: st.over,
      theory: w.theory ? w.theory(game) : '',
      summary: w.summary ? w.summary(game) : [],
      openLeads: leads.filter((l) => leadState[l.id] === 'open').map((l) => l.text),
      doneLeads: leads.filter((l) => leadState[l.id] === 'done').map((l) => l.text),
      log: log.slice(-LOG_SHOWN).reverse(),
      logTotal: log.length,
      evidence: found.map((id) => ({ id, title: game.clues[id].title, note: game.clues[id].note, points: game.clues[id].points })),
      evidenceTotal: clueIds.length,
      people: Object.keys(st.met || {}).filter((id) => game.npcs[id]).map((id) => {
        const n = game.npcs[id];
        return { id, name: n.name, role: n.role || '', where: game.rooms[n.loc] ? game.rooms[n.loc].name : '' };
      }),
      places: places.filter((r) => st.visited[r.id]).map((r) => r.name),
      placesTotal: places.length,
      carrying: game.contentsOf('inv').map((id) => game.items[id].name)
    };
  }

  function renderNotebook(game) {
    const m = notebookModel(game);
    const pct = Math.round((m.score / m.maxScore) * 100);
    const out = [];
    out.push('<div class="nb">');

    out.push('<header class="nb-head">');
    out.push('<div class="nb-title">CASE NOTEBOOK <span class="nb-claim">Claim #NM-1187 · Dale Haugen</span></div>');
    out.push(`<div class="nb-bar" role="progressbar" aria-valuemin="0" aria-valuemax="${m.maxScore}" aria-valuenow="${m.score}" aria-label="Case progress"><span style="width:${pct}%"></span></div>`);
    out.push(`<div class="nb-stats"><strong>${m.score}</strong> of ${m.maxScore} points · ${esc(m.rank)} · turn ${m.turns}</div>`);
    out.push(`<div class="nb-stats">Evidence ${m.evidence.length}/${m.evidenceTotal} · People met ${m.people.length} · Places ${m.places.length}/${m.placesTotal}</div>`);
    out.push('</header>');

    out.push('<div class="nb-cols"><section class="nb-col">');

    out.push('<h3>Working theory</h3>');
    out.push(`<p class="nb-theory">${esc(m.theory)}</p>`);

    out.push('<h3>Leads</h3>');
    if (!m.openLeads.length && !m.doneLeads.length) out.push('<p class="nb-empty">No leads yet.</p>');
    out.push('<ul class="nb-leads">');
    for (const t of m.openLeads) out.push(`<li class="nb-open"><span class="nb-box" aria-hidden="true">☐</span> ${esc(t)}</li>`);
    for (const t of m.doneLeads) out.push(`<li class="nb-done"><span class="nb-box" aria-hidden="true">☑</span> <s>${esc(t)}</s></li>`);
    out.push('</ul>');

    out.push('<h3>Latest</h3>');
    if (!m.log.length) out.push('<p class="nb-empty">Nothing yet. Your notes fill in as you go.</p>');
    out.push('<ol class="nb-log">');
    m.log.forEach((e, i) => {
      out.push(`<li class="nb-log-${esc(e.kind)}${i === 0 ? ' nb-latest' : ''}"><span class="nb-turn">T${e.turn}</span> <span class="nb-kind">${esc(LOG_LABEL[e.kind] || e.kind)}:</span> ${esc(e.text)}</li>`);
    });
    out.push('</ol>');
    if (m.logTotal > m.log.length) out.push(`<p class="nb-empty">…and ${m.logTotal - m.log.length} older entries.</p>`);

    out.push('<h3>What you know</h3>');
    out.push('<ul class="nb-summary">');
    for (const line of m.summary) out.push(`<li>${esc(line)}</li>`);
    out.push('</ul>');

    out.push('</section><section class="nb-col">');

    out.push(`<h3>Evidence <span class="nb-count">${m.evidence.length} of ${m.evidenceTotal}</span></h3>`);
    out.push('<ul class="nb-evidence">');
    for (const c of m.evidence) out.push(`<li><div class="nb-ev-title">${esc(c.title)} <span class="nb-pts">+${c.points}</span></div><div class="nb-ev-note">${esc(c.note)}</div></li>`);
    for (let i = m.evidence.length; i < m.evidenceTotal; i++) out.push('<li class="nb-missing" aria-label="Not found yet">? ? ?</li>');
    out.push('</ul>');

    out.push('<h3>People</h3>');
    if (!m.people.length) out.push('<p class="nb-empty">You haven\'t talked to anyone yet.</p>');
    out.push('<ul class="nb-people">');
    for (const p of m.people) out.push(`<li><strong>${esc(p.name)}</strong>${p.role ? ' — ' + esc(p.role) : ''}${p.where ? ` <span class="nb-where">(${esc(p.where)})</span>` : ''}</li>`);
    out.push('</ul>');

    out.push(`<h3>Places <span class="nb-count">${m.places.length} of ${m.placesTotal}</span></h3>`);
    out.push(`<p class="nb-places">${m.places.map(esc).join(' · ')}</p>`);

    out.push('<h3>In your pockets</h3>');
    out.push(`<p class="nb-places">${m.carrying.length ? m.carrying.map(esc).join(' · ') : 'Nothing.'}</p>`);

    out.push('</section></div></div>');
    return out.join('\n');
  }

  root.NSH = root.NSH || {};
  root.NSH.renderNotebook = renderNotebook;
  root.NSH.notebookModel = notebookModel;
  if (typeof module === 'object' && module.exports) module.exports = { renderNotebook, notebookModel };
})(typeof window !== 'undefined' ? window : globalThis);
