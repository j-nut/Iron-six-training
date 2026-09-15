/* Iron Marks UI: trophy case, the earned-mark moment after a workout, and the avatar ring + emblem.
 *
 * All achievement logic lives in iron-marks-engine.js. This module only presents it and stores the
 * two things a person chooses or has already seen — the worn emblem and the marks already shown —
 * in trainerMemory.achievements, which rides the existing profile sync (like the accent theme).
 *
 * No DOM observer: an observer on the workout screen froze interaction on real phones. A light
 * poll re-evaluates only when the history signature changes.
 */
(() => {
  if (window.__ironSixMarksLoaded) return;
  const engine = window.IronSixMarksEngine;
  if (!engine) return;
  window.__ironSixMarksLoaded = true;

  const $ = id => document.getElementById(id);
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const currentUser = () => (typeof activeUser === 'function' ? activeUser() : null);
  const CELEBRATE_WINDOW_MS = 12 * 36e5;

  const ICONS = {
    spark:'<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6.3 6.3l2.4 2.4M15.3 15.3l2.4 2.4M17.7 6.3l-2.4 2.4M8.7 15.3l-2.4 2.4"/>',
    hex:'<path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4z"/><path d="M12 7.6 16 9.9v4.2l-4 2.3-4-2.3V9.9z"/>',
    hammer:'<path d="m13.5 6.5 4 4"/><path d="M11 4h5l3 3-2.5 2.5L13.5 6.5 11 9 9 7z"/><path d="M11.5 8.5 4 16l3 3 7.5-7.5"/>',
    anvil:'<path d="M3.5 7H15c2.6 0 4.6-1 5.5-2.5V8c0 2.3-2 4-4.6 4H14l1.2 3.5H8.8L10 12H8.1C5.3 12 3.5 9.8 3.5 7z"/><path d="M6.5 19.5h11"/>',
    crown:'<path d="M3.5 8.5 8 12.3 12 5.5l4 6.8 4.5-3.8-1.8 10H5.3z"/><path d="M5.5 21h13"/>',
    kettlebell:'<path d="M9 8.2V7a3 3 0 0 1 6 0v1.2"/><path d="M8.2 8.2h7.6l1 2.3a6.2 6.2 0 1 1-9.6 0z"/>',
    compass:'<circle cx="12" cy="12" r="9"/><path d="m15.6 8.4-2.1 5.1-5.1 2.1 2.1-5.1z"/>',
    sunrise:'<path d="M3.5 18.5h17"/><path d="M7 18.5a5 5 0 0 1 10 0"/><path d="M12 4v4M5.3 9.3 7 11M18.7 9.3 17 11"/>',
    gauge:'<path d="M4 16.5a8 8 0 1 1 16 0"/><path d="m12 16.5 4.2-5.2"/><path d="M7 16.5h.01M17 16.5h.01"/>',
    sixsix:'<text x="12" y="16.2" text-anchor="middle" font-size="11" font-weight="900" fill="currentColor" stroke="none" font-family="inherit">66</text><path d="M12 2.8 20 7.4v9.2l-8 4.6-8-4.6V7.4z"/>',
    medal:'<circle cx="12" cy="9" r="5"/><path d="M9.2 13.2 7.5 21l4.5-2.4 4.5 2.4-1.7-7.8"/>',
    ring:'<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="4"/>'
  };
  const icon = (id, size = 20) => `<svg class="im-icon" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${ICONS[id] || ICONS.medal}</svg>`;
  const markIcon = mark => mark.emblem ? icon(mark.emblem, 22) : icon(mark.ring ? 'ring' : 'medal', 22);

  let cache = {sig:null, result:null};
  const signature = u => {
    const h = Array.isArray(u?.history) ? u.history : [];
    return u ? `${u.id}|${h.length}|${h[0]?.ts || 0}|${h[h.length - 1]?.ts || 0}` : '';
  };
  function evaluate(u = currentUser()) {
    if (!u) return null;
    const sig = signature(u);
    if (sig !== cache.sig) cache = {sig, result:engine.evaluate(u)};
    return cache.result;
  }

  function readState(u) {
    const s = u?.trainerMemory?.achievements;
    return {emblem:s?.emblem || null, seen:Array.isArray(s?.seen) ? s.seen : [], introduced:!!s?.introduced};
  }
  function writeState(u, patch) {
    if (!u) return;
    u.trainerMemory = u.trainerMemory && typeof u.trainerMemory === 'object' ? u.trainerMemory : {};
    u.trainerMemory.achievements = {...readState(u), ...patch, version:1};
    u.localUpdatedAt = Date.now();
    if (typeof saveData === 'function') saveData();
    window.IronSixCloud?.syncNow?.(false);
  }

  function injectStyles() {
    if ($('ironMarksStyles')) return;
    const style = document.createElement('style');
    style.id = 'ironMarksStyles';
    style.textContent = `
      .pm-avatar.im-ringed{box-shadow:0 0 0 2px var(--surface2),0 0 0 4px var(--im-ring)}
      .pm-avatar .im-icon{display:block}
      .im-backdrop{position:fixed;inset:0;z-index:95;background:rgba(0,0,0,.68);display:flex;align-items:flex-end;justify-content:center;padding:12px}
      .im-backdrop[hidden]{display:none}
      .im-modal{width:min(100%,560px);max-height:calc(100dvh - 24px);overflow:auto;background:var(--surface);border:1px solid var(--line);border-radius:22px;padding:18px;box-shadow:0 22px 64px rgba(0,0,0,.55)}
      .im-head{display:flex;align-items:center;gap:13px;margin-bottom:14px}
      .im-head h3{margin:0;font-size:19px}.im-head p{margin:3px 0 0;color:var(--muted);font-size:12px;line-height:1.4}
      .im-head .im-close{margin-left:auto;align-self:flex-start}
      .im-close{border:1px solid var(--line);background:var(--surface2);color:var(--text);border-radius:10px;width:38px;height:38px;font-weight:800;cursor:pointer;flex:0 0 auto}
      .im-avatar{width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;background:var(--accent);color:#0b0c0f;font-weight:900;font-size:18px;flex:0 0 auto}
      .im-avatar.im-ringed{box-shadow:0 0 0 3px var(--surface),0 0 0 6px var(--im-ring)}
      .im-section{margin:16px 0 0}
      .im-section h4{margin:0 0 8px;font-size:11px;letter-spacing:.07em;text-transform:uppercase;color:var(--muted)}
      .im-bar{height:6px;border-radius:99px;background:var(--surface2);overflow:hidden;margin-top:6px}
      .im-bar i{display:block;height:100%;border-radius:inherit;background:var(--accent)}
      .im-ringline{font-size:12.5px;color:var(--text)}
      .im-ringline small{color:var(--muted)}
      .im-emblems{display:flex;flex-wrap:wrap;gap:7px}
      .im-emblem{display:flex;align-items:center;gap:6px;min-height:40px;padding:7px 10px;border:1px solid var(--line);border-radius:12px;background:var(--surface2);color:var(--text);font:inherit;font-size:11.5px;font-weight:750;cursor:pointer}
      .im-emblem.active{border-color:var(--accent);box-shadow:inset 0 0 0 1px var(--accent)}
      .im-emblem:disabled{opacity:.38;cursor:not-allowed}
      .im-grid{display:grid;grid-template-columns:1fr;gap:7px}
      .im-card{display:flex;gap:11px;align-items:flex-start;padding:10px 12px;border:1px solid var(--line);border-radius:14px;background:var(--surface2)}
      .im-card .im-badge{width:38px;height:38px;border-radius:11px;display:flex;align-items:center;justify-content:center;flex:0 0 auto;background:var(--surface);color:var(--muted);border:1px solid var(--line)}
      .im-card.earned .im-badge{background:rgba(var(--accent-rgb,46,229,128),.12);color:var(--accent);border-color:rgba(var(--accent-rgb,46,229,128),.35)}
      .im-card.locked .im-body{opacity:.78}
      .im-body{flex:1;min-width:0}
      .im-body strong{display:block;font-size:13px}
      .im-body span{display:block;font-size:11.5px;color:var(--muted);line-height:1.4;margin-top:1px}
      .im-body em{display:block;font-style:normal;font-size:11px;color:var(--accent);margin-top:4px;font-weight:750}
      .im-count{font-size:11px;color:var(--muted);white-space:nowrap}
      .im-earned-list{display:grid;gap:8px;margin:4px 0 14px}
      .im-actions{display:flex;gap:9px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}
      .im-wear{border:1px solid rgba(var(--accent-rgb,46,229,128),.45);background:rgba(var(--accent-rgb,46,229,128),.1);color:var(--accent);border-radius:10px;padding:7px 11px;font:inherit;font-size:11.5px;font-weight:800;cursor:pointer;margin-top:7px}
      @media(min-width:640px){.im-backdrop{align-items:center}.im-grid{grid-template-columns:1fr 1fr}}
    `;
    document.head.appendChild(style);
  }

  function paintAvatar(el, u, fallbackText) {
    if (!el || !u) return;
    injectStyles();
    const result = evaluate(u), avatar = engine.avatarFor(u, result);
    el.classList.toggle('im-ringed', !!avatar.ring);
    if (avatar.ring) el.style.setProperty('--im-ring', avatar.ring.color); else el.style.removeProperty('--im-ring');
    el.dataset.ring = avatar.ring?.id || '';
    el.dataset.emblem = avatar.emblem || '';
    if (avatar.emblem) el.innerHTML = icon(avatar.emblem, el.classList.contains('im-avatar') ? 26 : 17);
    else if (fallbackText != null) el.textContent = fallbackText;
    el.setAttribute('title', [avatar.ring ? `${avatar.ring.label} ring` : '', avatar.emblem ? `${engine.EMBLEMS[avatar.emblem]} emblem` : ''].filter(Boolean).join(' · '));
  }
  // Called by the profile menu after it writes initials, so the emblem simply replaces them.
  function decorateAvatar(el, u) { paintAvatar(el, u, null); }

  function summary(u = currentUser()) {
    const r = evaluate(u);
    return r ? `${r.marks.filter(m => m.unlocked).length} / ${r.marks.length}` : '';
  }

  function ensureModal(id, label) {
    injectStyles();
    let backdrop = $(id);
    if (backdrop) return backdrop;
    backdrop = document.createElement('div');
    backdrop.id = id;
    backdrop.className = 'im-backdrop';
    backdrop.hidden = true;
    backdrop.innerHTML = `<div class="im-modal" role="dialog" aria-modal="true" aria-label="${esc(label)}"></div>`;
    backdrop.addEventListener('click', event => { if (event.target === backdrop) backdrop.hidden = true; });
    document.addEventListener('keydown', event => { if (event.key === 'Escape') backdrop.hidden = true; });
    document.body.appendChild(backdrop);
    return backdrop;
  }

  const initialsOf = u => window.IronSixProfileMenu?.initials?.(u?.name) || String(u?.name || '?').slice(0, 1).toUpperCase();
  const dateOf = ts => { try { return new Date(ts).toLocaleDateString(undefined, {month:'short', day:'numeric', year:'numeric'}); } catch (_) { return ''; } };

  function markCard(mark) {
    if (mark.hidden) return `<div class="im-card locked"><div class="im-badge">${icon('medal', 22)}</div><div class="im-body"><strong>Hidden mark</strong><span>Keep training to reveal it.</span></div></div>`;
    const pct = Math.round(mark.value / mark.target * 100);
    const status = mark.unlocked
      ? `<em>Earned${mark.unlockedAt ? ' ' + esc(dateOf(mark.unlockedAt)) : ''}${mark.emblem ? ` · unlocks the ${esc(engine.EMBLEMS[mark.emblem])} emblem` : ''}${mark.ring ? ' · avatar ring' : ''}</em>`
      : `<div class="im-bar" aria-hidden="true"><i style="width:${pct}%"></i></div>`;
    return `<div class="im-card ${mark.unlocked ? 'earned' : 'locked'}" data-mark="${esc(mark.id)}"><div class="im-badge">${markIcon(mark)}</div><div class="im-body"><strong>${esc(mark.title)}</strong><span>${esc(mark.text)}</span>${status}</div>${mark.unlocked ? '' : `<span class="im-count">${mark.value} / ${mark.target}</span>`}</div>`;
  }

  function open() {
    const u = currentUser(), r = evaluate(u);
    if (!u || !r) return;
    const backdrop = ensureModal('ironMarksModal', 'Iron Marks'), modal = backdrop.querySelector('.im-modal'), state = readState(u);
    const earned = r.marks.filter(m => m.unlocked).length, worn = engine.avatarFor(u, r).emblem;
    const closest = r.marks.filter(m => !m.unlocked && !m.hidden).sort((a, b) => b.value / b.target - a.value / a.target).slice(0, 3);
    const ringLine = r.nextRing
      ? `${r.stats.rotations} full rotation${r.stats.rotations === 1 ? '' : 's'} <small>· ${esc(r.nextRing.label)} ring at ${r.nextRing.rotations}</small><div class="im-bar"><i style="width:${Math.round(r.stats.rotations / r.nextRing.rotations * 100)}%"></i></div>`
      : `${r.stats.rotations} full rotations <small>· every ring earned</small>`;
    const emblemButtons = Object.entries(engine.EMBLEMS).map(([id, label]) => {
      const mark = r.marks.find(m => m.emblem === id), owned = r.emblems.includes(id);
      if (!owned && mark?.hidden) return '';
      return `<button type="button" class="im-emblem ${worn === id ? 'active' : ''}" data-wear="${id}" ${owned ? '' : 'disabled'} title="${esc(owned ? label : `${label}: ${mark?.text || ''}`)}">${icon(id, 17)}<span>${esc(label)}</span></button>`;
    }).join('');
    modal.innerHTML = `<div class="im-head"><div class="im-avatar" id="imAvatarPreview"></div><div><h3>Iron Marks</h3><p>${earned} of ${r.marks.length} earned${r.ring ? ` · ${esc(r.ring.label)} ring` : ''}. Earned from finished sessions; missed days never cost a mark.</p></div><button class="im-close" type="button" aria-label="Close">✕</button></div>`
      + `<div class="im-ringline">${ringLine}</div>`
      + `<div class="im-section"><h4>Profile emblem</h4><div class="im-emblems"><button type="button" class="im-emblem ${worn ? '' : 'active'}" data-wear="">Initials</button>${emblemButtons}</div></div>`
      + (closest.length ? `<div class="im-section"><h4>Closest next</h4><div class="im-grid">${closest.map(markCard).join('')}</div></div>` : '')
      + engine.GROUPS.map(g => `<div class="im-section"><h4>${esc(g.title)}</h4><div class="im-grid">${r.marks.filter(m => m.group === g.id).map(markCard).join('')}</div></div>`).join('');
    paintAvatar(modal.querySelector('#imAvatarPreview'), u, initialsOf(u));
    modal.querySelector('.im-close').addEventListener('click', () => { backdrop.hidden = true; });
    modal.querySelectorAll('[data-wear]').forEach(button => button.addEventListener('click', () => wear(button.dataset.wear || null, true)));
    backdrop.hidden = false;
    if (state.introduced === false) writeState(u, {introduced:true, seen:r.marks.filter(m => m.unlocked).map(m => m.id)});
  }

  function wear(emblem, reopen) {
    const u = currentUser(), r = evaluate(u);
    if (!u || !r || (emblem && !r.emblems.includes(emblem))) return false;
    writeState(u, {emblem:emblem || null});
    window.IronSixProfileMenu?.render?.();
    if (reopen && $('ironMarksModal') && !$('ironMarksModal').hidden) open();
    if (typeof toast === 'function') toast(emblem ? `${engine.EMBLEMS[emblem]} emblem on` : 'Showing your initials');
    return true;
  }

  function celebrate(marks) {
    const u = currentUser();
    const backdrop = ensureModal('ironMarksEarned', 'Iron Mark earned'), modal = backdrop.querySelector('.im-modal');
    const worn = engine.avatarFor(u, evaluate(u)).emblem;
    modal.innerHTML = `<div class="im-head"><div class="im-avatar" id="imEarnedAvatar"></div><div><h3>${marks.length === 1 ? 'Iron Mark earned' : `${marks.length} Iron Marks earned`}</h3><p>From the session you just finished.</p></div><button class="im-close" type="button" aria-label="Close">✕</button></div>`
      + `<div class="im-earned-list">${marks.map(m => `<div class="im-card earned"><div class="im-badge">${markIcon(m)}</div><div class="im-body"><strong>${esc(m.title)}</strong><span>${esc(m.text)}</span>${m.ring ? `<em>Your avatar now wears the ${esc(m.title.replace(/ Ring$/, ''))} ring.</em>` : ''}${m.emblem && m.emblem !== worn ? `<button type="button" class="im-wear" data-wear="${m.emblem}">Wear the ${esc(engine.EMBLEMS[m.emblem])} emblem</button>` : ''}</div></div>`).join('')}</div>`
      + `<div class="im-actions"><button type="button" class="btn secondary" data-all>See all marks</button><button type="button" class="btn primary" data-done>Nice</button></div>`;
    paintAvatar(modal.querySelector('#imEarnedAvatar'), u, initialsOf(u));
    const done = () => { backdrop.hidden = true; };
    modal.querySelector('.im-close').addEventListener('click', done);
    modal.querySelector('[data-done]').addEventListener('click', done);
    modal.querySelector('[data-all]').addEventListener('click', () => { done(); open(); });
    modal.querySelectorAll('[data-wear]').forEach(button => button.addEventListener('click', () => {
      if (wear(button.dataset.wear, false)) { button.textContent = 'Wearing it'; button.disabled = true; paintAvatar(modal.querySelector('#imEarnedAvatar'), currentUser(), initialsOf(currentUser())); }
    }));
    backdrop.hidden = false;
  }

  const midWorkout = u => Object.entries(u?.today || {}).some(([key, set]) => /^\d+-\d+$/.test(key) && set && (set.done || String(set.weight || '').trim() || String(set.reps || '').trim()));

  // Compare earned marks with the ones already shown. First run for a profile records what was
  // already earned without a fanfare; marks that arrive through sync or a restore (not unlocked
  // recently) are recorded quietly too, so nobody is congratulated twice for the same session.
  function check(now = Date.now()) {
    const u = currentUser();
    if (!u || (typeof document !== 'undefined' && document.hidden) || midWorkout(u)) return null;
    if ($('ironMarksEarned') && !$('ironMarksEarned').hidden) return null;
    const r = evaluate(u), state = readState(u), unlocked = r.marks.filter(m => m.unlocked);
    if (!state.introduced) {
      writeState(u, {introduced:true, seen:unlocked.map(m => m.id)});
      if (unlocked.length && typeof toast === 'function') toast(`Iron Marks are here: you have already earned ${unlocked.length}. Find them in your profile menu.`);
      return {introduced:unlocked.length};
    }
    const fresh = unlocked.filter(m => !state.seen.includes(m.id));
    if (!fresh.length) return null;
    writeState(u, {seen:[...new Set([...state.seen, ...fresh.map(m => m.id)])]});
    const recent = fresh.filter(m => m.unlockedAt && now - m.unlockedAt <= CELEBRATE_WINDOW_MS);
    if (recent.length) celebrate(recent);
    window.IronSixProfileMenu?.render?.();
    return {celebrated:recent.map(m => m.id), quiet:fresh.length - recent.length};
  }

  injectStyles();
  setInterval(() => { try { check(); } catch (error) { console.error('[Iron Six] marks check failed', error); } }, 1500);
  addEventListener('load', () => window.IronSixProfileMenu?.render?.());
  window.IronSixMarks = {open, check, wear, summary, evaluate, decorateAvatar, readState};
  window.IronSixProfileMenu?.render?.();
})();
