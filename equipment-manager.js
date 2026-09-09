/* Equipment manager modal.
 *
 * Adds a full-screen "Manage equipment" modal on top of the existing profile-editor equipment
 * grid and the old custom-equipment panel (both left untouched — renderCustomEquipmentEditor
 * keeps working). This is the one place that shows coverage, lets a user search the shared
 * catalogue, and fixes reported gaps in a couple of taps. It reads/writes the same
 * user.equipment / user.customEquipment fields as everything else, so all three UIs stay in
 * sync automatically through the normal saveData()/renderAll() cycle.
 */
(() => {
  if (window.__ironSixEquipmentManagerLoaded) return;
  window.__ironSixEquipmentManagerLoaded = true;

  // Same predicate + toast text as coach.js's custom-equipment guard — equipment changes must
  // never invalidate a workout the user is mid-way through logging.
  function hasWorkoutDraft(u) { return Object.values(u.today || {}).some(set => set && (set.done || String(set.weight || '').trim() || String(set.reps || '').trim() || String(set.rir || '').trim())) }
  function builtinItem(key, label) { return { id: `builtin:${key}`, key, name: label, custom: false } }
  function customItem(name) { return { id: `custom:${name.toLowerCase()}`, name, custom: true } }

  // Someone who typed "Cable machine" owns the catalogue item named "Cable machine / functional
  // trainer". Comparing display names would show it unselected and let them add it twice, so
  // ownership and removal both resolve the stored name through the catalogue first.
  // equipment-coverage.js exposes no id-based lookup, so resolve each stored custom name through
  // the catalogue's own alias matching here rather than depending on an export that doesn't exist.
  function ownedIds(u) { const catalog = window.IronSixEquipmentCatalog, ids = new Set(); for (const name of u.customEquipment || []) { const item = catalog?.match(name); if (item) ids.add(item.id) } return ids }
  function isOwned(u, item, ids) { return item.builtinKey ? !!u.equipment?.[item.builtinKey] : (ids || ownedIds(u)).has(item.id) }
  function storedNameFor(u, item) { const catalog = window.IronSixEquipmentCatalog; return (u.customEquipment || []).find(name => catalog?.match(name)?.id === item.id) || item.name }

  function injectStyles() {
    if (document.getElementById('equipmentManagerStyles')) return;
    const style = document.createElement('style');
    style.id = 'equipmentManagerStyles';
    style.textContent = `
      .eqmgr-open-btn{margin-top:10px;width:100%}
      #equipmentBadges.eqmgr-badges{cursor:pointer}
      .eqmgr-edit-affordance{color:var(--accent);font-weight:850}
      .equipment-manager-modal{padding-bottom:16px}
      .eqmgr-coverage{display:flex;gap:14px;align-items:center;padding:14px;border:1px solid var(--line);border-radius:16px;background:var(--surface2);margin-bottom:14px}
      .eqmgr-score{display:flex;align-items:baseline;gap:2px;flex:0 0 auto}
      .eqmgr-score strong{font-size:30px;letter-spacing:-.03em}
      .eqmgr-score span{color:var(--muted);font-size:13px}
      .eqmgr-score-detail{min-width:0}
      .eqmgr-score-count{font-size:12px;color:var(--muted);margin-bottom:3px}
      .eqmgr-score-line{font-size:12.5px;line-height:1.4}
      .eqmgr-search{margin-bottom:14px}
      .eqmgr-search input{width:100%;background:var(--surface2);color:var(--text);border:1px solid var(--line);border-radius:12px;padding:12px;font-size:16px}
      .eqmgr-add-custom-btn{margin-top:8px;width:100%;min-height:42px}
      .eqmgr-section{margin-bottom:16px}
      .eqmgr-section-title{font-size:12px;font-weight:850;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px}
      .eqmgr-chips{display:flex;flex-wrap:wrap;gap:8px}
      .eqmgr-chip{display:inline-flex;align-items:center;gap:6px;background:rgba(157,223,104,.08);border:1px solid rgba(157,223,104,.3);border-radius:999px;padding:8px 6px 8px 12px;font-size:12.5px;min-height:40px}
      .eqmgr-chip>span{display:flex;flex-direction:column;line-height:1.3}
      .eqmgr-chip small{color:var(--muted);font-size:10px;font-weight:700}
      .eqmgr-chip-x{border:0;background:none;color:var(--muted);font-size:17px;line-height:1;cursor:pointer;padding:4px;min-width:32px;min-height:32px}
      .eqmgr-empty{color:var(--muted);font-size:12.5px}
      .eqmgr-item{display:flex;flex-direction:column;align-items:flex-start;gap:4px;text-align:left;border:1px solid var(--line);background:var(--surface2);color:var(--text);border-radius:13px;padding:10px 12px;min-height:40px;cursor:pointer;max-width:100%}
      .eqmgr-item>span{display:flex;flex-wrap:wrap;gap:6px;align-items:baseline;font-size:13px;font-weight:750}
      .eqmgr-item small{color:var(--muted);font-size:10.5px;font-weight:700}
      .eqmgr-item.active{border-color:var(--accent);background:rgba(157,223,104,.12)}
      .eqmgr-fills{color:var(--muted);font-size:11px;margin-top:2px}
      .eqmgr-suggestion{background:rgba(143,184,255,.08);border-color:rgba(143,184,255,.3)}
      .eqmgr-gap{border:1px solid var(--line);border-radius:14px;padding:11px 12px;margin-bottom:8px;background:var(--surface)}
      .eqmgr-gap-head{display:flex;justify-content:space-between;gap:10px;margin-bottom:8px;font-size:12.5px}
      .eqmgr-gap-head span{color:var(--muted)}
      .eqmgr-gap-none{color:var(--muted);font-size:11.5px}
      .eqmgr-status{color:var(--muted);font-size:11.5px;line-height:1.4;margin-top:6px}
      @media(max-width:420px){.eqmgr-item{width:100%}}
    `;
    document.head.appendChild(style);
  }

  function ensureEntryPoints() {
    const grid = document.getElementById('equipmentEditor'), setting = grid?.closest('.setting');
    if (setting && !document.getElementById('openEquipmentManagerBtn')) {
      const btn = document.createElement('button');
      btn.type = 'button'; btn.id = 'openEquipmentManagerBtn'; btn.className = 'btn secondary eqmgr-open-btn'; btn.textContent = 'Manage equipment';
      btn.addEventListener('click', () => openEquipmentManager());
      setting.after(btn);
    }
    const badges = document.getElementById('equipmentBadges');
    if (badges && !badges.dataset.eqmgrBound) {
      badges.dataset.eqmgrBound = 'true';
      badges.classList.add('eqmgr-badges');
      badges.setAttribute('role', 'button'); badges.setAttribute('tabindex', '0'); badges.setAttribute('aria-label', 'Manage equipment');
      badges.addEventListener('click', () => openEquipmentManager());
      badges.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openEquipmentManager() } });
    }
  }

  // renderTodayHeader fully replaces #equipmentBadges' innerHTML every renderAll pass, so the
  // "Edit" affordance has to be re-appended after each pass rather than added once.
  function decorateBadges() {
    const badges = document.getElementById('equipmentBadges');
    if (!badges || badges.querySelector('.eqmgr-edit-affordance')) return;
    const span = document.createElement('span');
    span.className = 'badge eqmgr-edit-affordance'; span.textContent = 'Edit';
    badges.appendChild(span);
  }

  function installEquipmentManager() {
    injectStyles();
    ensureEntryPoints();
    if (document.getElementById('equipmentManagerModal')) return;
    const modal = document.createElement('div');
    modal.className = 'modal-backdrop'; modal.id = 'equipmentManagerModal';
    modal.setAttribute('role', 'dialog'); modal.setAttribute('aria-modal', 'true'); modal.setAttribute('aria-labelledby', 'equipmentManagerTitle');
    modal.innerHTML = `<div class="modal equipment-manager-modal">
      <h3 id="equipmentManagerTitle">Manage equipment</h3>
      <p>Search or tap catalogue items to build your gym. Changes apply immediately.</p>
      <div class="eqmgr-coverage" id="eqmgrCoverage"></div>
      <div class="eqmgr-search">
        <input id="eqmgrSearchInput" type="text" maxlength="48" placeholder="Search equipment (e.g. TRX, cable, kettlebell)…" aria-label="Search equipment">
        <div id="eqmgrAddCustom"></div>
      </div>
      <div class="eqmgr-section"><div class="eqmgr-section-title">Your equipment</div><div class="eqmgr-chips" id="eqmgrOwned"></div></div>
      <div id="eqmgrCatalog"></div>
      <div id="eqmgrGaps"></div>
      <div class="eqmgr-status" id="eqmgrStatus"></div>
      <div class="cta"><button class="btn secondary" id="eqmgrClose" type="button">Close</button></div>
    </div>`;
    document.body.appendChild(modal);
    modal.querySelector('#eqmgrClose').addEventListener('click', () => closeEquipmentManager());
    modal.addEventListener('click', e => { if (e.target === modal) closeEquipmentManager() });
    modal.querySelector('#eqmgrSearchInput').addEventListener('input', () => renderEquipmentManager(false));
  }

  function openEquipmentManager() {
    installEquipmentManager();
    renderEquipmentManager(true);
    document.getElementById('equipmentManagerModal')?.classList.add('show');
    setTimeout(() => document.getElementById('eqmgrSearchInput')?.focus(), 50);
  }
  function closeEquipmentManager() { document.getElementById('equipmentManagerModal')?.classList.remove('show') }
  function managerOpen() { return !!document.getElementById('equipmentManagerModal')?.classList.contains('show') }

  function filterCatalog(catalog, query) {
    const q = catalog.normalize(query);
    if (!q) return catalog.items;
    const exact = catalog.match(query);
    return catalog.items.filter(item => item === exact || catalog.normalize(item.name).includes(q) || item.aliases.some(a => catalog.normalize(a).includes(q)));
  }

  function coverageLine(report) {
    if (report.score >= 100) return 'Every movement slot in this plan has a strength option with your current equipment.';
    const bits = [];
    if (report.empty) bits.push(`${report.empty} movement slot${report.empty === 1 ? '' : 's'} ${report.empty === 1 ? 'has' : 'have'} no option`);
    if (report.thin) bits.push(`${report.thin} slot${report.thin === 1 ? '' : 's'} ${report.thin === 1 ? 'has' : 'have'} only one option`);
    return `${bits.join(' and ')} with your current equipment.`;
  }

  function renderCoverage(report) {
    const el = document.getElementById('eqmgrCoverage'); if (!el) return;
    const gaps = report.empty + report.thin;
    el.innerHTML = `<div class="eqmgr-score"><strong>${report.score}</strong><span>/100</span></div><div class="eqmgr-score-detail"><div class="eqmgr-score-count">${report.healthy} of ${report.total} slots fully covered • ${gaps} gap${gaps === 1 ? '' : 's'}</div><div class="eqmgr-score-line">${escapeHtml(coverageLine(report))}</div></div>`;
  }

  function renderOwned(u) {
    const el = document.getElementById('eqmgrOwned'); if (!el) return;
    const rows = window.IronSixEquipmentCoverage.activeEquipment(u);
    el.innerHTML = rows.length ? rows.map(row => `<span class="eqmgr-chip"><span>${escapeHtml(row.name)}${row.custom && row.recognised === false ? '<small>custom</small>' : ''}${row.conditioning ? '<small>conditioning — no strength exercises</small>' : ''}</span><button type="button" class="eqmgr-chip-x" data-remove="${escapeHtml(row.name)}" data-builtin="${row.builtinKey || ''}" aria-label="Remove ${escapeHtml(row.name)}">×</button></span>`).join('') : '<span class="eqmgr-empty">No equipment selected — bodyweight only</span>';
    el.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', () => {
      const builtinKey = btn.dataset.builtin, name = btn.dataset.remove;
      if (builtinKey) toggleBuiltin(builtinKey, name); else removeCustom(name);
    }));
  }

  function renderSearchAddButton(catalog, filtered) {
    const wrap = document.getElementById('eqmgrAddCustom'), input = document.getElementById('eqmgrSearchInput');
    if (!wrap || !input) return;
    const query = input.value.trim();
    wrap.innerHTML = query && !filtered.length ? `<button type="button" class="btn secondary eqmgr-add-custom-btn" id="eqmgrAddCustomBtn">Add “${escapeHtml(query)}” as custom equipment</button>` : '';
    wrap.querySelector('#eqmgrAddCustomBtn')?.addEventListener('click', () => { input.value = ''; addCustom(query) });
  }

  function renderCatalogItem(u, item, library, weakBases, ids) {
    const owned = isOwned(u, item, ids);
    const addsCount = item.family ? library.namesFor(item.family).length : 0;
    const fills = !owned && item.family ? library.slotsFor(item.family).filter(base => weakBases.has(base)) : [];
    const fillsHtml = fills.length ? `<div class="eqmgr-fills">Fills: ${escapeHtml(fills.slice(0, 3).join(', '))}${fills.length > 3 ? '…' : ''}</div>` : '';
    const tags = `${addsCount ? `<small>+${addsCount} exercises</small>` : ''}${item.conditioning ? '<small>conditioning</small>' : ''}`;
    return `<button type="button" class="eqmgr-item${owned ? ' active' : ''}" data-toggle-item="${item.id}"><span>${escapeHtml(item.name)}${tags}</span>${fillsHtml}</button>`;
  }

  function renderCatalog(u, catalog, library, weakBases, filtered, ids) {
    const el = document.getElementById('eqmgrCatalog'); if (!el) return;
    const groups = catalog.categories.map(cat => ({ cat, items: filtered.filter(i => i.category === cat) })).filter(g => g.items.length);
    el.innerHTML = groups.map(g => `<div class="eqmgr-section"><div class="eqmgr-section-title">${escapeHtml(g.cat)}</div><div class="eqmgr-chips">${g.items.map(item => renderCatalogItem(u, item, library, weakBases, ids)).join('')}</div></div>`).join('');
    el.querySelectorAll('[data-toggle-item]').forEach(btn => btn.addEventListener('click', () => toggleItem(catalog.byId.get(btn.dataset.toggleItem))));
  }

  function renderGaps(report) {
    const el = document.getElementById('eqmgrGaps'); if (!el) return;
    const gaps = report.gaps.filter(g => g.severity === 'empty' || g.severity === 'thin').slice(0, 6);
    if (!gaps.length) { el.innerHTML = ''; return }
    el.innerHTML = `<div class="eqmgr-section"><div class="eqmgr-section-title">Gaps in your plan</div>${gaps.map(gap => `<div class="eqmgr-gap"><div class="eqmgr-gap-head"><strong>${escapeHtml(gap.workoutName)}</strong><span>${escapeHtml(gap.base)}</span></div>${gap.suggestions.length ? `<div class="eqmgr-chips">${gap.suggestions.map(s => `<button type="button" class="eqmgr-item eqmgr-suggestion" data-add-suggestion="${escapeHtml(s.id)}">${escapeHtml(s.name)}</button>`).join('')}</div>` : '<div class="eqmgr-gap-none">No catalogued equipment fills this slot.</div>'}</div>`).join('')}</div>`;
    el.querySelectorAll('[data-add-suggestion]').forEach(btn => btn.addEventListener('click', () => { const item = window.IronSixEquipmentCatalog.byId.get(btn.dataset.addSuggestion); if (item) toggleItem(item) }));
  }

  function renderStatus(u) {
    const el = document.getElementById('eqmgrStatus'); if (!el) return;
    const gen = u.program?.equipmentGeneration || {};
    el.textContent = gen.state === 'loading' ? `Groq is building exercise options for ${gen.equipment || 'your equipment'}…` : gen.state === 'ready' ? (gen.message || 'AI exercise options are ready.') : gen.state === 'error' ? (gen.message || 'AI options will retry the next time equipment is added.') : '';
  }

  function renderUnavailable() {
    const el = document.getElementById('eqmgrCoverage'); if (!el) return;
    el.innerHTML = '<div class="eqmgr-empty">Equipment catalogue is unavailable right now.</div>';
    ['eqmgrOwned', 'eqmgrCatalog', 'eqmgrGaps', 'eqmgrStatus'].forEach(id => { const node = document.getElementById(id); if (node) node.innerHTML = '' });
  }

  // The coverage report runs the full workout engine, so it is computed once per open/change
  // and reused across search keystrokes rather than recomputed on every character typed.
  let cachedReport = null;
  function renderEquipmentManager(refreshReport) {
    const modal = document.getElementById('equipmentManagerModal'); if (!modal) return;
    const catalog = window.IronSixEquipmentCatalog, library = window.IronSixEquipmentLibrary, coverage = window.IronSixEquipmentCoverage;
    if (!catalog || !library || !coverage) { renderUnavailable(); return }
    const u = activeUser();
    if (refreshReport || !cachedReport) cachedReport = coverage.analyze(u);
    const report = cachedReport;
    renderCoverage(report);
    renderOwned(u);
    const query = document.getElementById('eqmgrSearchInput')?.value || '', filtered = filterCatalog(catalog, query);
    renderSearchAddButton(catalog, filtered);
    const weakBases = new Set(report.gaps.filter(g => g.severity !== 'unloaded').map(g => g.base));
    renderCatalog(u, catalog, library, weakBases, filtered, ownedIds(u));
    renderGaps(report);
    renderStatus(u);
  }

  // Batches equipment adds into one Groq request instead of firing per tap.
  let pendingItems = [], pendingUser = null, pendingTimer = null;
  function queueEquipmentRefresh(u, item) {
    if (typeof window.refreshEquipmentExercises !== 'function') return;
    pendingUser = u;
    if (!pendingItems.some(x => x.id === item.id)) pendingItems.push(item);
    clearTimeout(pendingTimer);
    pendingTimer = setTimeout(() => {
      const items = pendingItems.slice(0, 8), user = pendingUser;
      pendingItems = []; pendingUser = null;
      if (items.length) window.refreshEquipmentExercises(user, items);
    }, 600);
  }

  function afterChange(u, removedCustomName) {
    u.coachOverrides = null;
    if (removedCustomName) {
      const lower = removedCustomName.toLowerCase();
      u.program.generatedExercises = (u.program.generatedExercises || []).filter(exercise => exercise.equipmentId !== `custom:${lower}` && !((exercise.requiresCustom || []).some(v => v.toLowerCase() === lower)));
    }
    u.program.generatedExercises = (u.program.generatedExercises || []).filter(exercise => exerciseAvailable(u, exercise));
    clearCurrentSelectionCache(u);
    saveData();
    renderAll();
  }

  function toggleBuiltin(key, label) {
    const u = activeUser();
    if (hasWorkoutDraft(u)) { toast('Finish or reset the current workout before changing equipment'); return }
    const next = !u.equipment?.[key];
    u.equipment = u.equipment || {}; u.equipment[key] = next;
    afterChange(u);
    toast(`${label} ${next ? 'added' : 'removed'}`);
    if (next) queueEquipmentRefresh(u, builtinItem(key, label));
  }

  function addCustom(name) {
    const u = activeUser(), clean = normalizeEquipmentName(name);
    if (!clean) { toast('Enter an equipment name'); return }
    if (hasWorkoutDraft(u)) { toast('Finish or reset the current workout before changing equipment'); return }
    const known = [...EQUIPMENT.map(([, label]) => label), ...(u.customEquipment || [])];
    const resolved = window.IronSixEquipmentCatalog?.match(clean);
    if (known.some(v => v.toLowerCase() === clean.toLowerCase()) || (resolved && isOwned(u, resolved))) { toast('That equipment is already listed'); return }
    if ((u.customEquipment || []).length >= 16) { toast('Custom equipment is limited to 16 items'); return }
    u.customEquipment = [...(u.customEquipment || []), clean];
    afterChange(u);
    toast(`${clean} added • building exercise options`);
    queueEquipmentRefresh(u, customItem(clean));
  }

  function removeCustom(name) {
    const u = activeUser(), clean = normalizeEquipmentName(name);
    if (hasWorkoutDraft(u)) { toast('Finish or reset the current workout before changing equipment'); return }
    u.customEquipment = (u.customEquipment || []).filter(v => v.toLowerCase() !== clean.toLowerCase());
    afterChange(u, clean);
    toast(`${clean} removed`);
  }

  function toggleItem(item) {
    if (!item) return;
    if (item.builtinKey) { toggleBuiltin(item.builtinKey, item.name); return }
    const u = activeUser();
    if (isOwned(u, item)) removeCustom(storedNameFor(u, item)); else addCustom(item.name);
  }

  const baseRenderAll = window.renderAll;
  window.renderAll = function () {
    installEquipmentManager();
    baseRenderAll();
    decorateBadges();
    if (managerOpen()) renderEquipmentManager(true);
  };
  installEquipmentManager();
  renderAll();
})();
