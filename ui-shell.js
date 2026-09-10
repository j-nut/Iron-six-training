/* UI shell.
 *
 * Today opened with 2,013px — two and a half phone screens — of setup above the first
 * exercise: duration picker, training mode, a music configuration panel and a readiness form,
 * each with its own explanatory paragraph. That is the screen you hold during a working set.
 *
 * This module owns arrangement only. It does not build controls or fetch anything; it moves
 * what the other modules already built into an order that puts the workout first and folds the
 * settings away until asked for. Every step is idempotent and safe to re-run, because the
 * modules underneath re-render their own contents on every renderAll.
 */
(() => {
  if (window.__ironSixShellLoaded) return;
  window.__ironSixShellLoaded = true;

  const NAV_ORDER = ['today', 'coach', 'plan', 'history', 'profiles'];
  const $ = id => document.getElementById(id);

  function injectStyles() {
    if ($('uiShellStyles')) return;
    const style = document.createElement('style');
    style.id = 'uiShellStyles';
    style.textContent = `
      .shell-panel{border:1px solid var(--line);background:var(--surface);border-radius:16px;margin:0 0 12px;overflow:hidden}
      .shell-toggle{display:flex;width:100%;align-items:center;gap:12px;padding:14px;background:none;border:0;color:var(--text);text-align:left;cursor:pointer;min-height:56px}
      .shell-toggle:hover{background:var(--surface2)}
      .shell-toggle-text{flex:1;min-width:0}
      .shell-toggle-text strong{display:block;font-size:14px;font-weight:800}
      .shell-toggle-text span{display:block;font-size:12px;color:var(--muted);margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .shell-chevron{color:var(--muted);font-size:12px;font-weight:800;flex:0 0 auto;transition:transform .18s ease}
      .shell-panel.open .shell-chevron{transform:rotate(180deg)}
      .shell-body{padding:0 14px 4px}
      .shell-panel:not(.open) .shell-body{display:none}
      .shell-body>.section{border:0;background:none;padding:0;margin:0 0 4px}
      .shell-body>.section:first-child{margin-top:0}
      @media(max-width:390px){.shell-toggle{padding:12px}}
    `;
    document.head.appendChild(style);
  }

  // The coach is the second thing a user wants, not the fourth. Reordering by re-appending in
  // the desired order leaves any button this app did not create (there are none today) at the
  // front rather than dropping it.
  function orderNav() {
    const inner = document.querySelector('.bottom-inner');
    if (!inner) return;
    const buttons = NAV_ORDER.map(view => inner.querySelector(`[data-view="${view}"]`)).filter(Boolean);
    if (buttons.length < 2) return;
    if (buttons.every((b, i) => inner.children[inner.children.length - buttons.length + i] === b)) return;
    buttons.forEach(button => inner.appendChild(button));
  }

  function panel(id, title) {
    let node = $(id);
    if (node) return node;
    node = document.createElement('div');
    node.className = 'shell-panel';
    node.id = id;
    node.innerHTML = `<button class="shell-toggle" type="button" aria-expanded="false"><span class="shell-toggle-text"><strong>${title}</strong><span></span></span><b class="shell-chevron">▾</b></button><div class="shell-body"></div>`;
    const button = node.querySelector('.shell-toggle');
    button.addEventListener('click', () => {
      const open = node.classList.toggle('open');
      button.setAttribute('aria-expanded', String(open));
    });
    return node;
  }

  function setSummary(id, text) {
    const node = $(id);
    if (node) node.querySelector('.shell-toggle-text span').textContent = text;
  }

  const sectionContaining = id => $(id)?.closest('.section') || null;

  function restructureToday() {
    const today = $('today');
    if (!today) return;
    const workout = sectionContaining('exerciseList');
    const hero = today.querySelector('.hero');
    if (!workout || !hero) return;

    const setup = panel('sessionSetup', 'Session setup');
    const music = panel('musicPanel', 'Workout music');
    const setupBody = setup.querySelector('.shell-body');
    const musicBody = music.querySelector('.shell-body');

    // Order: hero, setup, the workout itself, then music.
    if (setup.parentNode !== today || hero.nextElementSibling !== setup) hero.after(setup);
    for (const node of [$('durationSection'), sectionContaining('readinessNote')])
      if (node && node.parentNode !== setupBody) setupBody.appendChild(node);
    if (workout.previousElementSibling !== setup) setup.after(workout);
    const musicSection = $('workoutMusic');
    if (musicSection && musicSection.parentNode !== musicBody) musicBody.appendChild(musicSection);
    if (musicSection && music.parentNode !== today) today.appendChild(music);
  }

  function describeReadiness(user) {
    const energy = Number(user?.readiness?.energy) || 4, soreness = Number(user?.readiness?.soreness) || 1;
    if (soreness >= 4) return 'Sore — volume trimmed';
    if (energy <= 2) return 'Low energy — lighter day';
    if (energy >= 5 && soreness <= 1) return 'Feeling strong';
    return 'Feeling normal';
  }

  function refreshSummaries() {
    const user = typeof activeUser === 'function' ? activeUser() : null;
    if (!user) return;
    const minutes = Number(user.workoutMinutes) || 60;
    const mode = user.trainingMode === 'circuit' ? 'Guided circuit' : 'Traditional';
    setSummary('sessionSetup', `${minutes} min · ${mode} · ${describeReadiness(user)}`);
    const music = window.IronSixMusic;
    setSummary('musicPanel', music && music.nowPlaying ? music.nowPlaying() : 'Free radio, Iron Six originals, or your own service');
  }

  // The Plan tab was six essays about how the engine works, above the two cards that say what
  // it is actually doing. The explanation is worth keeping and worth collapsing.
  function restructurePlan() {
    const plan = $('plan');
    if (!plan || $('planExplainer')) return;
    const sections = [...plan.querySelectorAll(':scope > .section')];
    const reference = sections.filter(section => {
      const heading = section.querySelector('h2')?.textContent.trim();
      return ['Base rotation', 'Load recommendations', 'How adaptation works', 'Time-aware workouts', 'Landmine integration'].includes(heading);
    });
    if (!reference.length) return;
    const explainer = panel('planExplainer', 'How Iron Six builds your training');
    reference[0].before(explainer);
    const body = explainer.querySelector('.shell-body');
    reference.forEach(section => body.appendChild(section));
    setSummary('planExplainer', 'Rotation, load, variation and time — the rules behind the plan');
  }

  function apply() {
    injectStyles();
    orderNav();
    restructureToday();
    restructurePlan();
    refreshSummaries();
  }

  const baseRenderAll = window.renderAll;
  if (typeof baseRenderAll === 'function') window.renderAll = function () { baseRenderAll(); apply(); };
  apply();
  // Music and the circuit player build their sections after first paint; re-run once they have.
  addEventListener('load', apply);
  setTimeout(apply, 1200);
})();
