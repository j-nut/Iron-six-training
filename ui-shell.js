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
  const NAV_ICONS = {
    today:'<path d="M6 7v10M3 9v6M18 7v10M21 9v6M6 12h12"/>',
    coach:'<path d="M20 11a8 8 0 0 1-8 8H5l-3 3V11a9 9 0 0 1 18 0Z"/><path d="M7 10h8M7 14h5"/>',
    plan:'<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18M8 15h3M8 18h6"/>',
    history:'<path d="M4 4v16h17M8 15l4-5 4 3 4-7"/>',
    profiles:'<circle cx="12" cy="8" r="4"/><path d="M4 21v-2a8 8 0 0 1 16 0v2"/>'
  };

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
      #cardioCompanion{padding-top:12px!important;border-top:1px solid var(--line)!important;margin-top:8px!important}
      @media(max-width:390px){.shell-toggle{padding:12px}}
    `;
    document.head.appendChild(style);
  }

  function orderNav() {
    const inner = document.querySelector('.bottom-inner');
    if (!inner) return;
    const buttons = NAV_ORDER.map(view => inner.querySelector(`[data-view="${view}"]`)).filter(Boolean);
    inner.parentElement.setAttribute('aria-label', 'Main navigation');
    buttons.forEach(button => {
      if (!button.querySelector('.pr-nav-icon')) {
        const label = button.textContent.trim();
        button.innerHTML = `<svg class="pr-nav-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${NAV_ICONS[button.dataset.view]}</svg><span>${label}</span>`;
      }
      if (button.classList.contains('active')) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
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

    if (setup.parentNode !== today || hero.nextElementSibling !== setup) hero.after(setup);
    for (const node of [$('durationSection'), sectionContaining('readinessNote'), $('cardioCompanion')])
      if (node && node.parentNode !== setupBody) setupBody.appendChild(node);

    // Startup order is deliberate: hero -> setup -> Begin workout -> workout details.
    // session-cards creates #sessionStart later, so preserve it whenever this shell reapplies.
    const start = $('sessionStart');
    if (start && start.parentNode === today) {
      if (setup.nextElementSibling !== start) setup.after(start);
      if (start.nextElementSibling !== workout) start.after(workout);
    } else if (workout.previousElementSibling !== setup) {
      setup.after(workout);
    }

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
    const cardio = user?.program?.cardio?.enabled === true ? 'Cardio on' : 'Cardio off';
    setSummary('sessionSetup', `${minutes} min · ${mode} · ${describeReadiness(user)} · ${cardio}`);
    const music = window.IronSixMusic;
    setSummary('musicPanel', music && music.nowPlaying ? music.nowPlaying() : 'Free radio, Iron Six originals, or your own service');
  }

  function restructurePlan() {
    const plan = $('plan');
    if (!plan) return;
    const current = $('adaptiveCoachStatus')?.closest('.section');
    const hero = plan.querySelector('.hero');
    if (hero && current && hero.nextElementSibling !== current) hero.after(current);
    const signals = [$('trainingBlockStatus'), $('rollingProgramIntelligence')].filter(Boolean);
    if (!signals.length || !current) return;
    let details = $('planSignals');
    if (!details) {
      details = document.createElement('details');details.id = 'planSignals';details.className = 'pr-analysis';
      details.innerHTML = '<summary><span><strong>Training signals</strong><small>Fatigue estimates, balance and planning priorities</small></span></summary>';
      current.after(details);
    }
    signals.forEach(node => { if(node.parentNode !== details) details.appendChild(node); });
  }

  function sessionSummary() {
    const user = typeof activeUser === 'function' ? activeUser() : null;
    const hero = $('today')?.querySelector('.hero');
    if (!hero || !user || typeof finalWorkout !== 'function') return;
    let summary = $('sessionAtAGlance');
    if (!summary) {
      summary = document.createElement('div');summary.id = 'sessionAtAGlance';summary.className = 'pr-session-summary';
      summary.setAttribute('aria-label', 'Session at a glance');
      summary.innerHTML = '<div><strong data-summary="minutes"></strong><span>Minutes available</span></div><div><strong data-summary="exercises"></strong><span>Exercises</span></div><div><strong data-summary="sets"></strong><span>Working sets</span></div>';
    }
    const workout = finalWorkout(user);
    summary.querySelector('[data-summary="minutes"]').textContent = String(user.workoutMinutes || 60);
    summary.querySelector('[data-summary="exercises"]').textContent = String(workout.length);
    summary.querySelector('[data-summary="sets"]').textContent = String(workout.reduce((sum, exercise) => sum + (Number(exercise.sets) || 0), 0));
    // Keep this in the header; the setup -> Begin -> workout relationship is preserved.
    if (summary.parentNode !== hero) hero.appendChild(summary);
  }

  function organizeHistory() {
    const history = $('history');
    const browser = $('historyList')?.closest('.section');
    const hero = history?.querySelector('.hero');
    if (!history || !browser || !hero) return;
    if (hero.nextElementSibling !== browser) hero.after(browser);
    for (const [id, title, description] of [
      ['progressInsights','Progress insights','Strength trends, consistency and volume'],
      ['recoveryInsights','Training freshness','Estimates from recent work, alongside how you feel']
    ]) {
      const section = $(id);
      if (!section) continue;
      let details = $(id+'Disclosure');
      if (!details) {
        details = document.createElement('details');details.id=id+'Disclosure';details.className='pr-analysis';
        details.innerHTML=`<summary><span><strong>${title}</strong><small>${description}</small></span></summary>`;
        history.appendChild(details);
      }
      if (section.parentNode !== details) details.appendChild(section);
    }
  }

  function pageChrome() {
    document.querySelectorAll('.view > .hero').forEach(hero => hero.classList.add('pr-page-hero'));
    const top = document.querySelector('.topbar');
    if (top && !top.querySelector('.pr-brand-context')) {
      const context = document.createElement('span');context.className='pr-brand-context';context.textContent='TRAINING SYSTEM';
      top.querySelector('.brand')?.appendChild(context);
    }
  }

  function apply() {
    injectStyles();
    orderNav();
    restructureToday();
    restructurePlan();
    refreshSummaries();
    sessionSummary();
    organizeHistory();
    pageChrome();
  }

  const baseRenderAll = window.renderAll;
  if (typeof baseRenderAll === 'function') window.renderAll = function () { baseRenderAll(); apply(); };
  const baseShowView = window.showView;
  if (typeof baseShowView === 'function') window.showView = function (id) { baseShowView(id); orderNav(); };
  apply();
  addEventListener('load', apply);
  setTimeout(apply, 1200);
  window.IronSixUIShell = { apply, refreshSummaries, restructureToday };
})();
