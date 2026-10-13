/* First-run setup wizard ("Welcome to Iron Six" / "Finish setting up").
 *
 * Everyone goes through it once: a brand-new guest or account, a profile added later, and an
 * existing user who is missing answers the program now needs (goal, days per week, limits...).
 * It asks only for what profile-schema.js says is missing, never wipes history / today / a workout
 * in progress, and saves after every step so a refresh resumes where the person left off.
 *
 * Required steps cannot be skipped. Optional steps (strength check, limits, phone features, music)
 * can, and the skip is recorded in u.onboarding.optionalSkipped so they are not asked again.
 * "Restore a backup" stays available on the first screen of a fresh profile.
 */
(() => {
  if (window.__ironSixOnboardingLoaded) return;
  window.__ironSixOnboardingLoaded = true;

  const $ = id => document.getElementById(id);
  const S = () => window.IronSixProfileSchema;
  const esc = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const REQUIRED_IDS = ['name', 'body', 'level', 'goal', 'days', 'session', 'style', 'equipment'];
  const OPTIONAL_IDS = ['strength', 'limits', 'phone', 'music'];
  // Settings that rebuild the workout. They stay untouched while a session has logged sets.
  const PLAN_LOCKED = ['session', 'style', 'equipment'];
  const SNOOZE_KEY = 'ironSixOnboardingSnoozed';

  let root = null;            // the overlay element while open
  let ctx = null;             // {userId, view, returnToReview, notice, acknowledged}
  let busy = false;
  let firstSeen = 0;
  let settleMs = 1500;        // a fresh profile waits briefly in case a signed-in account's cloud copy is about to replace it
  const snoozed = new Set();
  try { JSON.parse(sessionStorage.getItem(SNOOZE_KEY) || '[]').forEach(id => snoozed.add(id)); } catch (_) { }

  const signedIn = () => { try { return !!window.IronSixCloud?.session()?.user; } catch (_) { return false; } };
  const emailOf = () => { try { return window.IronSixCloud.session().user.email || ''; } catch (_) { return ''; } };
  const userById = id => (typeof data !== 'undefined' && Array.isArray(data?.users)) ? data.users.find(u => u.id === id) : null;
  const inProgress = u => Object.keys(u?.today || {}).length > 0;
  const save = () => { try { return typeof saveData === 'function' ? saveData() : true; } catch (_) { return false; } };

  // ------------------------------------------------------------------ eligibility

  // "Nothing in it" means exactly that: one profile, never trained in, never synced, never restored.
  function accountIsEmpty() {
    if (!Array.isArray(data?.users) || data.users.length !== 1) return false;
    const user = data.users[0];
    return !(user.history || []).length && !Object.keys(user.today || {}).length && !user.cloudId && !user.importedBackupId;
  }

  // The untouched placeholder profile every fresh install starts with.
  function isPristine(u) {
    if (!u || !S()) return false;
    const draft = u.onboardingDraft;
    return u.name === 'My profile' && !u.age && !u.heightIn && (!u.trainingLevel || u.trainingLevel === 'unknown')
      && !u.goal && !u.daysPerWeek && S().isFresh(u) && !u.customEquipment?.length && !S().equipmentCustomised(u)
      && !(draft && Object.keys(draft.confirmed || {}).length);
  }

  function visibleSteps(u, ids) {
    const locked = inProgress(u);
    return ids.filter(id => !(locked && PLAN_LOCKED.includes(id)));
  }

  function plannedSteps(u) {
    const draft = draftOf(u);
    const ids = Array.isArray(draft?.steps) && draft.steps.length ? draft.steps : S().pendingSteps(u);
    return visibleSteps(u, ids);
  }

  // Nothing is written to the profile until the first answer is saved: opening the wizard on a profile
  // that is about to be replaced by its cloud copy must not look like a local edit and cause a conflict.
  const draftOf = u => u?.onboardingDraft || (ctx && u && ctx.userId === u.id ? ctx.draft : null);
  function attachDraft(u) {
    if (!u.onboardingDraft && ctx?.draft) u.onboardingDraft = ctx.draft;
    S().ensureOnboarding(u);
  }

  function otherModalOpen() {
    return !!document.querySelector('#cloudModal.show, #newUserModal.show, #restoreChooser, .modal-backdrop.show:not(#onboardingWizard), #poseSheet.show');
  }

  function snooze(id) {
    snoozed.add(id);
    try { sessionStorage.setItem(SNOOZE_KEY, JSON.stringify([...snoozed])); } catch (_) { }
  }

  // ------------------------------------------------------------------ lifecycle

  function check(options) {
    if (typeof data === 'undefined' || !S() || typeof activeUser !== 'function') return false;
    if (root) {
      // Open: only react to the person (or account) underneath changing.
      const current = activeUser();
      if (!current || !ctx || current.id !== ctx.userId || !userById(ctx.userId)) { teardown(); return check(options); }
      return true;
    }
    const u = activeUser();
    if (!u || busy) return false;
    if (snoozed.has(u.id)) return false;
    if (!S().needsWizard(u)) return false;
    if (otherModalOpen()) return false;
    if (!u.onboardingDraft && data.users.length > 1 && isPristine(u) && data.users.some(other => other !== u && !isPristine(other))) return false;
    if (!plannedSteps(u).length) return false;
    // A never-trained profile may be about to be replaced by the cloud copy of the signed-in account, so
    // give the session and first sync a moment before interrupting. (A saved account scope with no live
    // session yet means sign-in is still in flight: keep waiting, but not forever.)
    if (S().isFresh(u) && !u.onboardingDraft && !(options && options.immediate)) {
      if (!firstSeen) firstSeen = Date.now();
      const waited = Date.now() - firstSeen;
      if (waited < settleMs) return false;
      if (window.ironSixAccountScope && !signedIn() && waited < settleMs + 5000) return false;
    }
    start(u);
    return true;
  }

  // Explicitly start the flow for a profile (used after a profile is added).
  function begin(userId) {
    const u = userById(userId);
    if (!u || !S() || !S().needsWizard(u)) return false;
    delete u.onboardingDraft;
    snoozed.delete(u.id);
    if (typeof data !== 'undefined' && data.activeUserId !== u.id) data.activeUserId = u.id;
    start(u);
    return true;
  }

  function start(u) {
    const schema = S();
    const saved = u.onboardingDraft && Array.isArray(u.onboardingDraft.steps) ? u.onboardingDraft : null;
    const draft = saved || {
      mode: schema.isFresh(u) ? 'full' : 'finish',
      steps: visibleSteps(u, schema.pendingSteps(u)),
      cursor: 'intro',
      confirmed: {},
      startedAt: Date.now()
    };
    ctx = { userId: u.id, draft, view: draft.cursor || 'intro', returnToReview: false, notice: '', acknowledged: false };
    mount();
    paint();
  }

  function teardown() {
    if (root) root.remove();
    root = null; ctx = null;
    document.documentElement.classList.remove('ob-open');
    for (const el of document.querySelectorAll('[data-ob-inert]')) { el.removeAttribute('inert'); el.removeAttribute('data-ob-inert'); }
    if (previousFocus && document.contains(previousFocus)) { try { previousFocus.focus({ preventScroll: true }); } catch (_) { } }
    previousFocus = null;
  }
  let previousFocus = null;

  // ------------------------------------------------------------------ styles + shell

  function injectStyles() {
    if ($('onboardingStyles')) return;
    const style = document.createElement('style');
    style.id = 'onboardingStyles';
    style.textContent = `
      html.ob-open{overflow:hidden}
      #onboardingWizard{position:fixed;inset:0;z-index:25;display:flex;flex-direction:column;background:var(--bg,#0b0c0f);color:var(--text,#f7f8fa);height:100%;height:100dvh;font-family:inherit}
      #onboardingWizard *{box-sizing:border-box}
      .ob-head{flex:none;padding:calc(10px + var(--app-safe-top,0px)) max(16px,env(safe-area-inset-right,0px)) 8px max(16px,env(safe-area-inset-left,0px))}
      .ob-head-inner,.ob-body-inner,.ob-foot-inner{width:100%;max-width:560px;margin:0 auto}
      .ob-bar{display:flex;align-items:center;gap:10px;min-height:44px}
      .ob-back{min-width:44px;min-height:44px;border:1px solid #435466;background:#1a2633;color:#e9eff7;border-radius:12px;font-size:20px;line-height:1;cursor:pointer}
      .ob-back[hidden]{display:none}
      .ob-count{flex:1;font-size:12px;font-weight:760;letter-spacing:.08em;text-transform:uppercase;color:var(--muted,#a4aab8)}
      .ob-track{height:4px;border-radius:4px;background:#2b3947;overflow:hidden;margin-top:6px}
      .ob-fill{display:block;height:100%;background:var(--accent,#2ee580);width:0}
      .ob-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:12px max(16px,env(safe-area-inset-right,0px)) 24px max(16px,env(safe-area-inset-left,0px))}
      .ob-title{margin:6px 0 8px;font-size:clamp(23px,6.4vw,30px);line-height:1.15;font-weight:830;letter-spacing:-.04em;outline:none;text-wrap:balance}
      .ob-lead{margin:0 0 18px;font-size:15px;line-height:1.55;color:var(--muted,#a4aab8)}
      .ob-tag{display:inline-block;margin-bottom:6px;padding:3px 9px;border-radius:99px;border:1px solid #435466;font-size:11px;font-weight:760;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#a4aab8)}
      .ob-field{display:block;margin:0 0 14px}
      .ob-field>span,.ob-group>legend{display:block;margin:0 0 6px;font-size:13.5px;font-weight:720;color:var(--text,#f7f8fa)}
      .ob-field small{display:block;margin-top:5px;font-size:12px;line-height:1.45;color:var(--muted,#a4aab8)}
      .ob-field input[type=text],.ob-field input[type=number],.ob-field select,.ob-notes{width:100%;min-height:50px;padding:10px 14px;font-size:16px;color:var(--text,#f7f8fa);background:#192633;border:1px solid #3c4c5b;border-radius:12px}
      .ob-row{display:flex;gap:10px}.ob-row>*{flex:1 1 0;min-width:0}
      .ob-group{border:0;margin:0 0 16px;padding:0;min-width:0}
      .ob-cards{display:grid;gap:10px}
      .ob-chips{display:grid;grid-template-columns:repeat(auto-fit,minmax(74px,1fr));gap:10px}
      .ob-card,.ob-chip,.ob-check{position:relative;display:block;cursor:pointer}
      .ob-card input,.ob-chip input,.ob-check input{position:absolute;opacity:0;inset:0;width:100%;height:100%;margin:0;cursor:pointer}
      .ob-card-body,.ob-chip-body,.ob-check-body{display:block;border:1px solid #3c4c5b;background:#192633;border-radius:14px;padding:14px 15px;min-height:52px}
      .ob-card-body strong{display:block;font-size:15px;font-weight:780}
      .ob-card-body span{display:block;margin-top:3px;font-size:13px;line-height:1.45;color:var(--muted,#a4aab8)}
      .ob-chip-body{padding:12px 6px;text-align:center;font-weight:760;font-size:15px}
      .ob-check-body{display:flex;gap:12px;align-items:flex-start;padding-left:48px;position:relative}
      .ob-check-body::before{content:"";position:absolute;left:15px;top:16px;width:20px;height:20px;border-radius:6px;border:2px solid #6d7f92;background:transparent}
      .ob-check input:checked+.ob-check-body::before{background:var(--accent,#2ee580);border-color:var(--accent,#2ee580);box-shadow:inset 0 0 0 3px #081017}
      .ob-check-body strong{display:block;font-size:15px;font-weight:760}
      .ob-check-body span{display:block;margin-top:2px;font-size:13px;line-height:1.45;color:var(--muted,#a4aab8)}
      .ob-card input:checked+.ob-card-body,.ob-chip input:checked+.ob-chip-body,.ob-check input:checked+.ob-check-body{border-color:var(--accent,#2ee580);background:rgba(var(--accent-rgb,46,229,128),.12)}
      .ob-card input:focus-visible+.ob-card-body,.ob-chip input:focus-visible+.ob-chip-body,.ob-check input:focus-visible+.ob-check-body,.ob-btn:focus-visible,.ob-back:focus-visible,.ob-link:focus-visible,.ob-field :is(input,select):focus-visible,.ob-notes:focus-visible,.ob-edit:focus-visible{outline:3px solid var(--accent,#2ee580);outline-offset:2px}
      .ob-sub{margin:10px 0 0;padding:14px;border:1px solid #334455;border-radius:14px;background:#141d28}
      .ob-sub[hidden]{display:none}
      .ob-lift{margin:0 0 14px;padding:12px;border:1px solid #334455;border-radius:14px;background:#141d28}
      .ob-lift legend{padding:0 4px;font-weight:760;font-size:14px}
      .ob-lift-inputs{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px}
      .ob-lift-inputs label{display:block}.ob-lift-inputs label>span{display:block;font-size:12px;color:var(--muted,#a4aab8);margin-bottom:3px}
      .ob-lift-inputs select,.ob-lift-inputs input[type=number]{width:100%;min-height:48px;padding:8px 12px;font-size:16px;color:var(--text,#f7f8fa);background:#192633;border:1px solid #3c4c5b;border-radius:12px}
      .ob-lift-inputs .ob-wide{grid-column:1/-1}
      .ob-unsure{display:flex;align-items:center;gap:10px;margin-top:10px;min-height:44px;font-size:14px}
      .ob-unsure input{width:22px;height:22px;accent-color:var(--accent,#2ee580)}
      .ob-note{margin:14px 0 0;padding:12px 14px;border-radius:12px;border:1px solid #435466;background:#141d28;font-size:13.5px;line-height:1.5;color:#c9d3de}
      .ob-error{margin:12px 0 0;padding:12px 14px;border-radius:12px;border:1px solid #a24b4b;background:#2a1717;color:#ffd0d0;font-size:14px;line-height:1.45}
      .ob-error:empty,.ob-live:empty{display:none}
      .ob-live{margin:12px 0 0;padding:12px 14px;border-radius:12px;border:1px solid #435466;background:#141d28;color:#d6dee8;font-size:14px;line-height:1.5}
      .ob-split{margin:12px 0 0;font-size:14px;line-height:1.5;color:#c9d3de;min-height:1.5em}
      .ob-review{list-style:none;margin:0 0 16px;padding:0;display:grid;gap:8px}
      .ob-review li{display:flex;align-items:center;gap:10px;padding:12px 14px;border:1px solid #334455;border-radius:14px;background:#141d28}
      .ob-review .ob-what{flex:1;min-width:0}.ob-review .ob-what b{display:block;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#a4aab8);font-weight:760}
      .ob-review .ob-what span{display:block;margin-top:2px;font-size:15px;overflow-wrap:anywhere}
      .ob-edit{flex:none;min-height:44px;min-width:60px;padding:0 14px;border-radius:11px;border:1px solid #435466;background:#1a2633;color:#e9eff7;font-size:13px;font-weight:720;cursor:pointer}
      .ob-first{margin:0 0 16px;padding:16px;border-radius:16px;border:1px solid rgba(var(--accent-rgb,46,229,128),.4);background:linear-gradient(135deg,rgba(var(--accent-rgb,46,229,128),.14),rgba(var(--accent-rgb,46,229,128),.04));font-size:17px;font-weight:790;line-height:1.35}
      .ob-first small{display:block;margin-top:5px;font-size:13px;font-weight:500;color:#c9d3de}
      .ob-foot{flex:none;padding:12px max(16px,env(safe-area-inset-right,0px)) calc(12px + var(--app-safe-bottom,0px)) max(16px,env(safe-area-inset-left,0px));border-top:1px solid #243140;background:var(--bg,#0b0c0f)}
      .ob-foot-inner{display:grid;gap:8px}
      .ob-btn{min-height:54px;padding:0 18px;border-radius:13px;border:1px solid #435466;background:#1a2633;color:#e9eff7;font-size:15px;font-weight:780;cursor:pointer;width:100%}
      .ob-btn.primary{border-color:rgba(255,255,255,.14);background:linear-gradient(135deg,var(--accent,#2ee580),rgba(var(--accent-rgb,46,229,128),.8));color:#081017}
      .ob-btn[disabled]{opacity:.55;cursor:default}
      .ob-link{min-height:46px;border:0;background:none;color:var(--muted,#a4aab8);font-size:14px;font-weight:650;text-decoration:underline;text-underline-offset:3px;cursor:pointer}
      .ob-sr{position:absolute;width:1px;height:1px;margin:-1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
      @media (max-width:340px){.ob-lift-inputs{grid-template-columns:1fr}.ob-chips{grid-template-columns:repeat(3,1fr)}}
      @media (prefers-reduced-motion:no-preference){.ob-fill{transition:width .25s ease}.ob-card-body,.ob-chip-body,.ob-check-body{transition:border-color .15s,background .15s}.ob-body-inner{animation:obIn .22s ease both}@keyframes obIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}}
    `;
    document.head.appendChild(style);
  }

  function mount() {
    if (root) return;
    injectStyles();
    previousFocus = document.activeElement;
    root = document.createElement('div');
    root.id = 'onboardingWizard';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'obTitle');
    root.innerHTML = `
      <div class="ob-head"><div class="ob-head-inner">
        <div class="ob-bar"><button type="button" class="ob-back" id="obBack" aria-label="Back" hidden>&#8592;</button><div class="ob-count" id="obCount"></div></div>
        <div class="ob-track" role="progressbar" aria-label="Setup progress" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" id="obProgress"><span class="ob-fill" id="obFill"></span></div>
      </div></div>
      <form class="ob-form" id="obForm" novalidate style="display:flex;flex-direction:column;flex:1 1 auto;min-height:0">
        <div class="ob-body" id="obScroll"><div class="ob-body-inner" id="obBody"></div></div>
        <div class="ob-foot"><div class="ob-foot-inner" id="obFoot"></div></div>
      </form>
      <div class="ob-sr" id="obAnnounce" role="status" aria-live="polite"></div>`;
    document.body.appendChild(root);
    document.documentElement.classList.add('ob-open');
    for (const el of document.querySelectorAll('.app, .bottom-nav')) {
      if (!el.hasAttribute('inert')) { el.setAttribute('inert', ''); el.setAttribute('data-ob-inert', '1'); }
    }
    root.querySelector('#obForm').addEventListener('submit', event => { event.preventDefault(); void next(); });
    root.querySelector('#obBack').addEventListener('click', back);
    root.addEventListener('keydown', trapFocus);
  }

  function trapFocus(event) {
    if (event.key !== 'Tab' || !root || document.querySelector('.modal-backdrop.show')) return;
    const items = [...root.querySelectorAll('button:not([disabled]):not([hidden]), input:not([disabled]), select:not([disabled]), textarea, [tabindex]:not([tabindex="-1"])')]
      .filter(el => el.offsetParent !== null || el === document.activeElement);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === $('obTitle'))) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  // ------------------------------------------------------------------ copy + helpers

  const GOAL_COPY = {
    strength: ['Get stronger', 'Heavier weights and lower reps on the big lifts.'],
    muscle: ['Build muscle', 'More volume and moderate reps to add size.'],
    general: ['General fitness', 'A balanced mix of strength, muscle and conditioning.']
  };
  const LEVEL_COPY = [
    ['beginner', 'Beginner', 'New to lifting, or coming back after a long break. We start light and keep it simple.'],
    ['intermediate', 'Intermediate', 'Trained steadily for about 6 months to 2 years and comfortable with the main lifts.'],
    ['advanced', 'Advanced', 'Trained hard for several years and know your working weights well.']
  ];
  const LIFT_LABEL = { squat: 'Squat', bench: 'Bench press', hinge: 'Deadlift / Romanian deadlift', overhead_press: 'Overhead press', row: 'Row' };
  const LIMIT_LABEL = { shoulder: 'Shoulders', elbow: 'Elbows', wrist: 'Wrists', lower_back: 'Lower back', hip: 'Hips', knee: 'Knees' };

  function programText(method, arg) {
    try {
      const value = window.IronSixProgram?.[method]?.(arg);
      if (!value) return '';
      if (typeof value === 'string') return value;
      return String(value.text || value.summary || value.label || value.description || value.name || '');
    } catch (_) { return ''; }
  }
  const goalText = goal => programText('describeGoal', goal) || GOAL_COPY[goal]?.[1] || '';
  const splitText = (u, days) => programText('describeSplit', { ...u, daysPerWeek: days }) || `${days} training days a week. We split your workouts to fit.`;

  const radios = (name, options, selected) => options.map(([value, label, desc]) =>
    `<label class="ob-card"><input type="radio" name="${name}" value="${esc(value)}"${String(selected) === String(value) ? ' checked' : ''}><span class="ob-card-body"><strong>${esc(label)}</strong>${desc ? `<span>${esc(desc)}</span>` : ''}</span></label>`).join('');
  const chips = (name, options, selected) => options.map(([value, label]) =>
    `<label class="ob-chip"><input type="radio" name="${name}" value="${esc(value)}"${String(selected) === String(value) ? ' checked' : ''}><span class="ob-chip-body">${esc(label)}</span></label>`).join('');
  const checkRow = (attrs, label, desc, checked) =>
    `<label class="ob-check"><input type="checkbox" ${attrs}${checked ? ' checked' : ''}><span class="ob-check-body"><span><strong>${esc(label)}</strong>${desc ? `<span>${esc(desc)}</span>` : ''}</span></span></label>`;
  const picked = name => root.querySelector(`input[name="${name}"]:checked`)?.value || '';
  const val = id => ($(id)?.value ?? '').trim();

  // Defaults that look like answers are only pre-selected once the person has confirmed them.
  const preset = (u, step, value) => (S().isFresh(u) && !S().confirmedStrict(u, step)) ? null : value;

  // ------------------------------------------------------------------ steps

  const STEPS = {
    name: {
      title: 'What should we call you?',
      lead: 'This names your profile.',
      render: u => `<label class="ob-field"><span>Name</span><input id="obName" type="text" maxlength="30" autocomplete="nickname" value="${esc(u.name === 'My profile' ? '' : u.name)}" aria-required="true"></label>`,
      read: () => {
        const name = val('obName');
        if (!name) return { error: 'Enter a name so we know who this profile is for.' };
        return { patch: { name }, confirm: ['name'] };
      }
    },
    body: {
      title: 'About your body',
      lead: 'Used for starting weights and bodyweight exercises. It stays on your profile.',
      render: u => {
        const ft = u.heightIn ? Math.floor(u.heightIn / 12) : '', inch = u.heightIn ? Math.round(u.heightIn % 12) : '';
        const weight = (S().isFresh(u) && !u.age && Number(u.weight) === 180) ? '' : (u.weight || '');
        return `<label class="ob-field"><span>Body weight (lb)</span><input id="obWeight" type="number" inputmode="decimal" min="50" max="600" value="${esc(weight)}" aria-required="true"></label>`
          + `<label class="ob-field"><span>Age</span><input id="obAge" type="number" inputmode="numeric" min="13" max="100" value="${esc(u.age || '')}" aria-required="true"></label>`
          + `<div class="ob-field"><span id="obHeightLabel">Height</span><div class="ob-row" role="group" aria-labelledby="obHeightLabel">`
          + `<label><span class="ob-sr">Feet</span><input id="obFeet" type="number" inputmode="numeric" min="4" max="7" placeholder="ft" value="${esc(ft)}" style="width:100%;min-height:50px;padding:10px 14px;font-size:16px;color:inherit;background:#192633;border:1px solid #3c4c5b;border-radius:12px"></label>`
          + `<label><span class="ob-sr">Inches</span><input id="obInches" type="number" inputmode="numeric" min="0" max="11" placeholder="in" value="${esc(inch)}" style="width:100%;min-height:50px;padding:10px 14px;font-size:16px;color:inherit;background:#192633;border:1px solid #3c4c5b;border-radius:12px"></label></div></div>`;
      },
      read: () => {
        const weight = Number(val('obWeight')), age = Number(val('obAge'));
        const feet = Number(val('obFeet')), inches = Number(val('obInches') || 0);
        if (!(weight >= 50 && weight <= 600)) return { error: 'Enter your body weight in pounds (50 to 600).' };
        if (!(age >= 13 && age <= 100)) return { error: 'Enter your age (13 to 100).' };
        const heightIn = feet * 12 + inches;
        if (!val('obFeet') || !(heightIn >= 48 && heightIn <= 90) || inches < 0 || inches > 11) return { error: 'Enter your height, between 4 ft 0 in and 7 ft 6 in.' };
        return { patch: { weight, age, heightIn } };
      }
    },
    level: {
      title: 'How experienced are you?',
      lead: 'Pick the closest match. Your logged sets take over from this guess as you train.',
      render: u => `<fieldset class="ob-group"><legend class="ob-sr">Training level</legend><div class="ob-cards">${radios('obLevel', LEVEL_COPY.map(([v, l, d]) => [v, l, d]), u.trainingLevel)}</div></fieldset>`,
      read: () => picked('obLevel') ? { patch: { trainingLevel: picked('obLevel') } } : { error: 'Choose the training level that fits you best.' }
    },
    goal: {
      title: 'What is your main goal?',
      lead: 'This steers rep ranges and how the program is built. You can change it any time.',
      render: u => `<fieldset class="ob-group"><legend class="ob-sr">Main goal</legend><div class="ob-cards">${radios('obGoal', Object.keys(GOAL_COPY).map(g => [g, GOAL_COPY[g][0], goalText(g)]), u.goal)}</div></fieldset>`,
      read: () => picked('obGoal') ? { patch: { goal: picked('obGoal') } } : { error: 'Choose a goal to continue.' }
    },
    days: {
      title: 'How many days a week can you train?',
      lead: 'Be realistic. A plan you can keep beats a perfect one you skip.',
      render: u => `<fieldset class="ob-group"><legend class="ob-sr">Training days per week</legend><div class="ob-chips">${chips('obDays', [2, 3, 4, 5, 6].map(n => [n, String(n)]), u.daysPerWeek)}</div></fieldset><p class="ob-split" id="obSplit" aria-live="polite">${u.daysPerWeek ? esc(splitText(u, u.daysPerWeek)) : ''}</p>`,
      bind: u => {
        root.querySelectorAll('input[name="obDays"]').forEach(input => input.addEventListener('change', () => { $('obSplit').textContent = splitText(u, Number(input.value)); }));
      },
      read: () => picked('obDays') ? { patch: { daysPerWeek: Number(picked('obDays')) } } : { error: 'Choose how many days a week you can train.' }
    },
    session: {
      title: 'How long should a session be?',
      lead: 'Shorter sessions keep the most important lifts and trim the rest.',
      render: u => {
        const current = preset(u, 'session', u.workoutMinutes);
        const presets = [15, 20, 30, 45, 60, 75, 90];
        const custom = current && !presets.includes(Number(current)) ? current : '';
        return `<fieldset class="ob-group"><legend class="ob-sr">Session length in minutes</legend><div class="ob-chips">${chips('obMinutes', presets.map(n => [n, `${n} min`]), custom ? '' : current)}</div></fieldset>`
          + `<label class="ob-field"><span>Or enter your own (10 to 120 minutes)</span><input id="obCustomMinutes" type="number" inputmode="numeric" min="10" max="120" value="${esc(custom)}"></label>`;
      },
      read: () => {
        const custom = val('obCustomMinutes'), chosen = picked('obMinutes');
        const minutes = custom ? Number(custom) : Number(chosen);
        if (!minutes) return { error: 'Choose a session length.' };
        if (!(minutes >= 10 && minutes <= 120)) return { error: 'Session length must be 10 to 120 minutes.' };
        return { patch: { workoutMinutes: minutes }, confirm: ['session'] };
      }
    },
    style: {
      title: 'How do you like to train?',
      lead: 'Choose a style and how hard the default workout should feel.',
      render: u => {
        const mode = preset(u, 'style', u.trainingMode || 'traditional'), level = preset(u, 'style', u.workoutDifficulty);
        return `<fieldset class="ob-group"><legend>Training style</legend><div class="ob-cards">${radios('obMode', [
          ['traditional', 'Traditional sets', 'Sets and reps with rest between. The classic way.'],
          ['circuit', 'Guided circuit', 'Timed stations that move you along with sound cues. Quicker and lighter on equipment.']], mode)}</div></fieldset>`
          + `<fieldset class="ob-group"><legend>Difficulty</legend><div class="ob-cards">${radios('obDifficulty', [
            ['light', 'Light', 'Leave plenty in the tank. Good for easing in or busy weeks.'],
            ['balanced', 'Balanced', 'Challenging but sustainable. Most people start here.'],
            ['heavy', 'Heavy', 'Push close to your limit on key sets.']], level)}</div></fieldset>`;
      },
      read: () => {
        if (!picked('obMode')) return { error: 'Choose a training style.' };
        if (!picked('obDifficulty')) return { error: 'Choose a difficulty.' };
        return { patch: { trainingMode: picked('obMode'), workoutDifficulty: picked('obDifficulty') }, confirm: ['style'] };
      }
    },
    equipment: {
      title: 'What equipment do you have?',
      lead: 'Tick only what you can really use. We build every workout from this list, so nothing is assumed.',
      render: u => {
        // A never-trained profile starts with nothing ticked. A profile that has been training keeps its
        // current kit ticked, but the load limits (the old silent 30 lb default) are only pre-filled once
        // they have been confirmed or changed from the defaults.
        const confirmedKit = S().confirmedStrict(u, 'equipment') || S().equipmentCustomised(u);
        const known = S().isFresh(u) && !confirmedKit ? null : (u.equipment || {});
        const caps = u.capacities || {};
        const dbMax = confirmedKit ? caps.dumbbellMax : '';
        const bbMax = confirmedKit ? caps.barbellMax : '';
        const stepKnown = confirmedKit;
        const rows = EQUIPMENT.map(([key, label]) => checkRow(`data-ob-equip="${key}"`, label, '', !!known?.[key])).join('');
        return `<fieldset class="ob-group"><legend class="ob-sr">Available equipment</legend><div class="ob-cards">${rows}`
          + checkRow('id="obNoEquip"', 'No equipment, bodyweight only', 'Choose this if none of the above applies.', false)
          + `</div></fieldset>`
          + `<div class="ob-sub" id="obDbSub" hidden><label class="ob-field"><span>Heaviest single dumbbell (lb)</span><input id="obDbMax" type="number" inputmode="decimal" min="5" max="250" value="${esc(dbMax || '')}"><small>The heaviest one you can pick up, not the pair. We never program past this.</small></label>`
          + `<fieldset class="ob-group"><legend>Smallest dumbbell jump</legend><div class="ob-cards">${radios('obDbStep', [['5', '5 lb', 'Standard pairs'], ['2.5', '2.5 lb', 'Adjustable or fractional']], stepKnown ? String(Number(caps.dumbbellStep) === 2.5 ? 2.5 : 5) : '')}</div></fieldset></div>`
          + `<div class="ob-sub" id="obBbSub" hidden><label class="ob-field"><span>Heaviest barbell load, bar included (lb)</span><input id="obBbMax" type="number" inputmode="decimal" min="45" max="1500" value="${esc(bbMax || '')}"><small>Bar plus all the plates you own.</small></label>`
          + `<fieldset class="ob-group"><legend>Smallest barbell jump</legend><div class="ob-cards">${radios('obBbStep', [['5', '5 lb total', 'Using 2.5 lb plates'], ['2.5', '2.5 lb total', 'Using 1.25 lb plates']], stepKnown ? String(Number(caps.barbellStep) === 2.5 ? 2.5 : 5) : '')}</div></fieldset></div>`;
      },
      bind: () => {
        const sync = () => {
          const on = key => !!root.querySelector(`[data-ob-equip="${key}"]`)?.checked;
          $('obDbSub').hidden = !on('dumbbells');
          $('obBbSub').hidden = !on('barbell');
        };
        root.querySelectorAll('[data-ob-equip]').forEach(box => box.addEventListener('change', () => {
          if (box.checked) $('obNoEquip').checked = false;
          sync();
        }));
        $('obNoEquip').addEventListener('change', () => {
          if ($('obNoEquip').checked) root.querySelectorAll('[data-ob-equip]').forEach(box => { box.checked = false; });
          sync();
        });
        sync();
      },
      read: () => {
        const kit = Object.fromEntries(EQUIPMENT.map(([key]) => [key, !!root.querySelector(`[data-ob-equip="${key}"]`).checked]));
        const any = Object.values(kit).some(Boolean);
        if (!any && !$('obNoEquip').checked) return { error: 'Tick what you have, or choose "No equipment, bodyweight only".' };
        const capacities = {};
        if (kit.dumbbells) {
          const max = Number(val('obDbMax'));
          if (!(max >= 5 && max <= 250)) return { error: 'Enter the heaviest single dumbbell you have (5 to 250 lb).' };
          if (!picked('obDbStep')) return { error: 'Choose your smallest dumbbell jump.' };
          capacities.dumbbellMax = max; capacities.dumbbellStep = Number(picked('obDbStep'));
        }
        if (kit.barbell) {
          const max = Number(val('obBbMax'));
          if (!(max >= 45 && max <= 1500)) return { error: 'Enter the heaviest barbell load you can load, bar included (45 to 1500 lb).' };
          if (!picked('obBbStep')) return { error: 'Choose your smallest barbell jump.' };
          capacities.barbellMax = max; capacities.barbellStep = Number(picked('obBbStep'));
        }
        return { patch: { equipment: kit, capacities }, confirm: ['equipment'] };
      }
    },
    strength: {
      title: 'Strength check',
      lead: 'A recent hard set you really completed, like 155 lb for 8 reps. It sets your first weights. Not sure on a lift? Tick "Not sure" and we will learn it from your first sessions.',
      optional: true,
      render: u => `<div>${S().LIFTS.map(lift => {
        const ref = u.strengthRefs?.[lift] || (lift === 'bench' ? S().benchRef(u) : null);
        return `<fieldset class="ob-lift" data-lift="${lift}"><legend>${esc(LIFT_LABEL[lift])}</legend><div class="ob-lift-inputs">`
          + `<label><span>Weight (lb)</span><input id="obRef_${lift}_w" type="number" inputmode="decimal" min="1" max="2000" step="any" value="${esc(ref ? ref.weight : '')}"></label>`
          + `<label><span>Reps</span><input id="obRef_${lift}_r" type="number" inputmode="numeric" min="1" max="50" value="${esc(ref ? ref.reps : '')}"></label>`
          + `<label class="ob-wide"><span>Lifted with</span><select id="obRef_${lift}_e"><option value="barbell"${ref?.equipment !== 'dumbbell' ? ' selected' : ''}>Barbell</option><option value="dumbbell"${ref?.equipment === 'dumbbell' ? ' selected' : ''}>Dumbbells (weight of each one)</option></select></label></div>`
          + `<label class="ob-unsure"><input type="checkbox" id="obRef_${lift}_n"> Not sure</label></fieldset>`;
      }).join('')}</div>`,
      bind: () => {
        for (const lift of S().LIFTS) {
          const box = $(`obRef_${lift}_n`);
          const apply = () => ['w', 'r', 'e'].forEach(k => { $(`obRef_${lift}_${k}`).disabled = box.checked; });
          box.addEventListener('change', apply);
        }
      },
      read: () => {
        const refs = {};
        for (const lift of S().LIFTS) {
          if ($(`obRef_${lift}_n`).checked) continue;
          const w = val(`obRef_${lift}_w`), r = val(`obRef_${lift}_r`);
          if (!w && !r) continue;
          if (!(Number(w) > 0 && Number(w) <= 2000) || !(Number.isInteger(Number(r)) && Number(r) >= 1 && Number(r) <= 50)) {
            return { error: `${LIFT_LABEL[lift]}: enter both a weight and 1 to 50 reps, or tick "Not sure".` };
          }
          refs[lift] = { weight: Number(w), reps: Number(r), equipment: $(`obRef_${lift}_e`).value === 'dumbbell' ? 'dumbbell' : 'barbell' };
        }
        // Nothing entered is the same as skipping: record it as such so it is not asked again.
        if (!Object.keys(refs).length) return { skip: true };
        return { patch: { strengthRefs: refs } };
      }
    },
    limits: {
      title: 'Anything to go easy on?',
      lead: 'Pick any areas that are sore, injured or cranky. Leave all unticked if none.',
      optional: true,
      render: u => `<fieldset class="ob-group"><legend class="ob-sr">Areas to go easy on</legend><div class="ob-cards">${S().LIMITATION_AREAS.map(area => checkRow(`data-ob-limit="${area}"`, LIMIT_LABEL[area], '', (u.limitations || []).includes(area))).join('')}</div></fieldset>`
        + `<p class="ob-note">We start these movements lighter. This is not medical advice. If something hurts, see a doctor or physical therapist.</p>`,
      read: () => ({ patch: { limitations: [...root.querySelectorAll('[data-ob-limit]:checked')].map(box => box.dataset.obLimit) } })
    },
    phone: {
      title: 'Phone features',
      lead: 'Switch on what you would like. Camera and microphone ask your phone for permission; nothing is recorded or uploaded.',
      optional: true,
      render: u => `<div class="ob-cards">`
        + checkRow('id="obCamera"', 'Camera rep counting', 'Counts your reps with the front camera, on this device only. Needs camera permission.', u.preferences?.camera === true)
        + checkRow('id="obVoice"', 'Voice logging', 'Say your weight and reps instead of typing. Needs microphone permission.', u.preferences?.voice === true)
        + checkRow('id="obSounds"', 'Workout sounds', 'Beeps and cues for timers and circuits. No permission needed.', u.preferences?.sounds === true)
        + `</div><div class="ob-live" id="obPermNote" role="status" aria-live="polite"></div>`,
      read: async u => {
        const want = { camera: $('obCamera').checked, voice: $('obVoice').checked, sounds: $('obSounds').checked };
        const notes = [];
        for (const [key, label] of [['camera', 'Camera'], ['voice', 'Microphone']]) {
          if (!want[key] || u.preferences?.[key] === true) continue;
          const result = await requestPermission(key);
          if (result === 'denied') { want[key] = false; $(key === 'camera' ? 'obCamera' : 'obVoice').checked = false; notes.push(`${label} permission was denied, so ${key === 'camera' ? 'camera rep counting' : 'voice logging'} stays off. You can turn it on later in your profile or in phone settings.`); }
          else if (result === 'unavailable') { want[key] = false; $(key === 'camera' ? 'obCamera' : 'obVoice').checked = false; notes.push(`This device cannot use ${key === 'camera' ? 'the camera' : 'voice input'} here, so it stays off.`); }
        }
        if (notes.length && !ctx.acknowledged) { return { hold: true, notice: notes.join(' ') }; }
        return { patch: { preferences: want } };
      }
    },
    music: {
      title: 'Music during workouts?',
      lead: 'Iron Six has built-in workout music. You can change this any time.',
      optional: true,
      render: u => `<fieldset class="ob-group"><legend class="ob-sr">Music</legend><div class="ob-cards">${radios('obMusic', [['on', 'Yes, play music', 'Start music with your workout.'], ['off', 'No, keep it quiet', 'No music unless you start it.']], typeof u.preferences?.music === 'boolean' ? (u.preferences.music ? 'on' : 'off') : '')}</div></fieldset>`,
      read: () => picked('obMusic') ? { patch: { preferences: { music: picked('obMusic') === 'on' } } } : { skip: true }
    }
  };

  // ------------------------------------------------------------------ permissions

  /* Ask the phone for the hardware, then let go of it immediately. Returns:
   *   'granted'     - the permission was given
   *   'denied'      - the person (or system) said no; the caller keeps the feature off
   *   'deferred'    - cannot be checked from here (native speech asks on first use); fine to enable
   *   'unavailable' - this device or browser has no such input */
  async function requestPermission(kind) {
    const md = navigator.mediaDevices;
    const constraints = kind === 'camera' ? { video: true } : { audio: true };
    if (!md || typeof md.getUserMedia !== 'function') {
      if (kind === 'voice' && (window.IronSixNative?.listenVoice || window.SpeechRecognition || window.webkitSpeechRecognition)) return 'deferred';
      return 'unavailable';
    }
    try {
      const stream = await md.getUserMedia(constraints);
      try { stream.getTracks().forEach(track => track.stop()); } catch (_) { }
      return 'granted';
    } catch (error) {
      const name = String(error?.name || '');
      if (name === 'NotFoundError' || name === 'OverconstrainedError' || name === 'NotReadableError') return 'unavailable';
      return 'denied';
    }
  }

  // ------------------------------------------------------------------ navigation + painting

  function sequence(u) {
    return ['intro', ...plannedSteps(u), 'review'];
  }

  function announce(text) { const el = $('obAnnounce'); if (el) el.textContent = text; }

  function persistCursor(u, view) {
    if (u.onboardingDraft) { u.onboardingDraft.cursor = view; save(); }
    else if (ctx?.draft) ctx.draft.cursor = view;
  }

  function go(view) {
    const u = userById(ctx.userId);
    ctx.view = view; ctx.notice = ''; ctx.acknowledged = false;
    if (u) persistCursor(u, view);
    paint();
  }

  function back() {
    const u = userById(ctx?.userId);
    if (!u || busy) return;
    if (ctx.returnToReview) { ctx.returnToReview = false; go('review'); return; }
    const order = sequence(u), index = order.indexOf(ctx.view);
    if (index > 0) go(order[index - 1]);
  }

  function setError(text) {
    const box = $('obError');
    if (box) box.textContent = text || '';
    if (text) { announce(text); }
  }

  function recordSkip(u, id) {
    const state = S().ensureOnboarding(u);
    if (!state.optionalSkipped.includes(id)) state.optionalSkipped.push(id);
  }
  function clearSkip(u, id) {
    const state = S().ensureOnboarding(u);
    state.optionalSkipped = state.optionalSkipped.filter(item => item !== id);
  }

  async function next() {
    if (busy || !ctx) return;
    const u = userById(ctx.userId);
    if (!u) return;
    const view = ctx.view;
    if (view === 'intro') {
      const order = sequence(u);
      go(order[1] || 'review');
      return;
    }
    if (view === 'review') { finish(); return; }
    const step = STEPS[view];
    if (!step) return;
    busy = true;
    setButtonsBusy(true);
    try {
      const result = await step.read(u);
      if (!ctx || ctx.userId !== u.id) return;
      if (result.error) { setError(result.error); focusFirstInvalid(); return; }
      if (result.hold) {
        ctx.acknowledged = true;
        const note = $('obPermNote');
        if (note) note.textContent = result.notice;
        announce(result.notice);
        return;
      }
      attachDraft(u);
      if (result.skip) { recordSkip(u, view); }
      else {
        const outcome = S().commit(u, result.patch);
        if (!outcome.ok) { setError(outcome.error); return; }
        if (OPTIONAL_IDS.includes(view)) clearSkip(u, view);
        for (const id of result.confirm || []) u.onboardingDraft.confirmed[id] = true;
      }
      if (u.onboardingDraft) u.onboardingDraft.cursor = view;
      save();
      advance(u, view);
    } finally {
      busy = false;
      if (ctx) setButtonsBusy(false);
    }
  }

  function advance(u, view) {
    if (ctx.returnToReview) { ctx.returnToReview = false; go('review'); return; }
    const order = sequence(u), index = order.indexOf(view);
    go(order[index + 1] || 'review');
  }

  function skipStep() {
    const u = userById(ctx?.userId);
    if (!u || busy || !STEPS[ctx.view]?.optional) return;
    attachDraft(u);
    recordSkip(u, ctx.view);
    save();
    advance(u, ctx.view);
  }

  function setButtonsBusy(state) {
    root?.querySelectorAll('#obFoot button').forEach(button => { button.disabled = state; });
  }

  function focusFirstInvalid() {
    const target = $('obBody')?.querySelector('input:not([type=radio]):not([type=checkbox]):not(:disabled), input[type=radio], select');
    try { (target || $('obTitle'))?.focus(); } catch (_) { }
  }

  // ------------------------------------------------------------------ review

  const cap = text => text ? text.charAt(0).toUpperCase() + text.slice(1) : text;
  function fmtHeight(inches) { return inches ? `${Math.floor(inches / 12)}′${Math.round(inches % 12)}″` : ''; }

  function summaryFor(u, id) {
    const skipped = (u.onboarding?.optionalSkipped || []).includes(id);
    switch (id) {
      case 'name': return u.name;
      case 'body': return [u.weight ? `${u.weight} lb` : '', u.age ? `${u.age} yrs` : '', fmtHeight(u.heightIn)].filter(Boolean).join(' · ');
      case 'level': return cap(u.trainingLevel);
      case 'goal': return GOAL_COPY[u.goal]?.[0] || '';
      case 'days': return u.daysPerWeek ? `${u.daysPerWeek} days a week` : '';
      case 'session': return u.workoutMinutes ? `${u.workoutMinutes} minutes` : '';
      case 'style': return `${u.trainingMode === 'circuit' ? 'Guided circuit' : 'Traditional sets'} · ${cap(u.workoutDifficulty || 'balanced')}`;
      case 'equipment': {
        const names = EQUIPMENT.filter(([key]) => u.equipment?.[key]).map(([, label]) => label);
        const extra = [];
        if (u.equipment?.dumbbells) extra.push(`dumbbells to ${u.capacities?.dumbbellMax} lb`);
        if (u.equipment?.barbell) extra.push(`barbell to ${u.capacities?.barbellMax} lb`);
        return names.length ? `${names.join(', ')}${extra.length ? ` (${extra.join(', ')})` : ''}` : 'Bodyweight only';
      }
      case 'strength': {
        const refs = u.strengthRefs || {};
        const parts = S().LIFTS.filter(lift => refs[lift]).map(lift => `${LIFT_LABEL[lift].split(' ')[0]} ${refs[lift].weight}×${refs[lift].reps}`);
        return parts.length ? parts.join(', ') : (skipped || !S().benchRef(u) ? 'Skipped' : `Bench ${S().benchRef(u).weight}×${S().benchRef(u).reps}`);
      }
      case 'limits': return Array.isArray(u.limitations) ? (u.limitations.length ? u.limitations.map(a => LIMIT_LABEL[a]).join(', ') : 'None') : 'Skipped';
      case 'phone': {
        const p = u.preferences || {};
        if (!['camera', 'voice', 'sounds'].some(k => typeof p[k] === 'boolean')) return 'Skipped';
        return [`Camera ${p.camera ? 'on' : 'off'}`, `Voice ${p.voice ? 'on' : 'off'}`, `Sounds ${p.sounds ? 'on' : 'off'}`].join(' · ');
      }
      case 'music': return typeof u.preferences?.music === 'boolean' ? (u.preferences.music ? 'Music on' : 'Music off') : 'Skipped';
      default: return '';
    }
  }

  function firstWorkoutLine(u) {
    let name = '';
    try {
      const value = window.IronSixProgram?.describeSplit?.(u);
      if (value && typeof value === 'object') name = String(value.firstWorkout || value.first || value.next || '');
    } catch (_) { }
    if (!name) {
      const key = u.program?.currentWorkoutKey;
      name = (typeof WORKOUT_META !== 'undefined' && WORKOUT_META[key]?.short) || 'your first session';
    }
    return { name, minutes: u.workoutMinutes || 60 };
  }

  function reviewHtml(u) {
    const locked = inProgress(u);
    const rows = [...REQUIRED_IDS, ...OPTIONAL_IDS].map(id => {
      const lockedHere = locked && PLAN_LOCKED.includes(id);
      const title = S().titleOf(id);
      const edit = lockedHere
        ? `<span class="ob-sr">Change after your current workout</span>`
        : `<button type="button" class="ob-edit" data-ob-edit="${id}" aria-label="Edit ${esc(title)}">Edit</button>`;
      return `<li><div class="ob-what"><b>${esc(title)}</b><span>${esc(summaryFor(u, id) || 'Not set')}</span></div>${edit}</li>`;
    }).join('');
    const first = firstWorkoutLine(u);
    const split = programText('describeSplit', u);
    return `<div class="ob-first">Your first workout: ${esc(first.name)} · ~${esc(first.minutes)} min${split ? `<small>${esc(split)}</small>` : ''}</div>`
      + `<ul class="ob-review" aria-label="Your answers">${rows}</ul>`;
  }

  function finish() {
    const u = userById(ctx.userId);
    if (!u) return;
    const locked = inProgress(u);
    const missing = S().missingRequired(u).filter(id => !(locked && PLAN_LOCKED.includes(id)));
    if (missing.length) {
      ctx.returnToReview = true;
      go(missing[0]);
      setError(`${S().titleOf(missing[0])} still needs an answer before you can finish.`);
      return;
    }
    const state = S().ensureOnboarding(u);
    if (S().isComplete(u)) state.completedAt = Date.now();
    delete u.onboardingDraft;
    save();
    const completed = !!state.completedAt;
    teardown();
    if (typeof renderAll === 'function') renderAll();
    if (completed && typeof showView === 'function') showView('today');
    if (typeof toast === 'function') toast(completed ? 'You are set up. Let us train.' : 'Saved. We will finish the rest after your workout.');
  }

  function notNow() {
    const u = userById(ctx?.userId);
    if (!u) return;
    snooze(u.id);
    teardown();
  }

  // ------------------------------------------------------------------ paint

  function paint() {
    const u = userById(ctx.userId);
    if (!u || !root) return;
    const view = ctx.view;
    const order = sequence(u);
    if (!order.includes(view) && !STEPS[view]) { ctx.view = 'intro'; return paint(); }
    const step = STEPS[view];
    const total = order.length - 2; // number of question steps
    const position = order.indexOf(view);
    const mode = draftOf(u)?.mode || 'full';

    $('obBack').hidden = !(view !== 'intro' && (ctx.returnToReview || position > 0));
    $('obCount').textContent = step ? (ctx.returnToReview ? 'Editing' : `Step ${Math.max(1, position)} of ${total}`) : (view === 'review' ? 'Review' : (mode === 'full' ? 'Welcome' : 'Finish setting up'));
    const percent = view === 'intro' ? 0 : view === 'review' ? 100 : Math.max(0, Math.round(position / (order.length - 1) * 100));
    $('obFill').style.width = percent + '%';
    $('obProgress').setAttribute('aria-valuenow', String(percent));

    const body = $('obBody'), foot = $('obFoot');
    let title, lead = '', inner = '', tag = '';
    if (view === 'intro') {
      const who = emailOf();
      if (mode === 'full') {
        title = 'Welcome to Iron Six';
        lead = `${who ? `Signed in as ${who}. ` : ''}A few quick questions, about two minutes, so your first workout fits you. Your answers stay on your profile and you can change any of them later.`;
      } else {
        title = 'Finish setting up';
        lead = 'Your training is saved and nothing changes in it. We are only missing a few things the program now uses:';
        inner = `<ul class="ob-review">${plannedSteps(u).map(id => `<li><div class="ob-what"><span>${esc(S().titleOf(id))}${OPTIONAL_IDS.includes(id) ? ' (optional)' : ''}</span></div></li>`).join('')}</ul>`;
      }
      foot.innerHTML = `<button type="submit" class="ob-btn primary" id="obNext">${mode === 'full' ? 'Get started' : 'Continue'}</button>`
        + (mode === 'full' && window.IronSixBackupRestore ? `<button type="button" class="ob-btn" id="obRestore">Restore a backup instead</button>` : '')
        + (mode !== 'full' ? `<button type="button" class="ob-link" id="obNotNow">Not now</button>` : '');
    } else if (view === 'review') {
      title = 'Check your setup';
      lead = 'Tap Edit to change anything. You can adjust all of this later in your profile.';
      inner = reviewHtml(u);
      foot.innerHTML = `<button type="submit" class="ob-btn primary" id="obNext">Start training</button>`;
    } else {
      title = step.title; lead = step.lead;
      tag = step.optional ? '<span class="ob-tag">Optional</span>' : '';
      inner = step.render(u);
      const last = ctx.returnToReview ? 'Save' : 'Continue';
      foot.innerHTML = `<button type="submit" class="ob-btn primary" id="obNext">${last}</button>`
        + (step.optional ? `<button type="button" class="ob-link" id="obSkipStep">Skip this step</button>` : '');
    }
    body.innerHTML = `${tag}<h2 class="ob-title" id="obTitle" tabindex="-1">${esc(title)}</h2>${lead ? `<p class="ob-lead">${esc(lead)}</p>` : ''}${inner}<div class="ob-error" id="obError" role="alert"></div>`;
    $('obScroll').scrollTop = 0;
    step?.bind?.(u);
    if (ctx.notice) setError(ctx.notice);
    $('obRestore')?.addEventListener('click', restoreBackup);
    $('obNotNow')?.addEventListener('click', notNow);
    $('obSkipStep')?.addEventListener('click', skipStep);
    body.querySelectorAll('[data-ob-edit]').forEach(button => button.addEventListener('click', () => {
      ctx.returnToReview = true; go(button.dataset.obEdit);
    }));
    announce(`${title}. ${$('obCount').textContent}`);
    try { $('obTitle').focus({ preventScroll: true }); } catch (_) { }
  }

  // ------------------------------------------------------------------ restore a backup

  let restoreRequested = false;
  function restoreBackup() {
    restoreRequested = true;
    // The overlay stays up (below the restore dialogs) so cancelling the picker leaves the wizard intact.
    window.IronSixBackupRestore?.pickFile();
  }

  function onRestored(detail) {
    if (typeof data === 'undefined' || !S()) return;
    const ids = (detail && detail.userIds) || [];
    const fromWizard = restoreRequested;
    restoreRequested = false;
    // A restored profile arrives with its own history; any wizard state inside the backup is stale.
    if (detail && detail.mode === 'new') for (const id of ids) { const restored = userById(id); if (restored) delete restored.onboardingDraft; }
    const current = activeUser();
    if (fromWizard && detail && detail.mode === 'new' && ids.length && isPristine(current) && data.users.length > ids.length) {
      // Do not leave the empty placeholder next to the profile that was just restored.
      data.users = data.users.filter(u => u.id !== current.id);
      data.activeUserId = ids.find(id => userById(id)) || data.users[0].id;
    }
    save();
    if (root) teardown();
    if (typeof renderAll === 'function') renderAll();
    const target = activeUser();
    if (target) { delete target.onboardingDraft; snoozed.delete(target.id); }
    if (target && S().needsWizard(target) && plannedSteps(target).length) { start(target); }
    else if (typeof toast === 'function') toast('Backup restored. Your profile is already set up.');
  }
  window.addEventListener('ironsix:backup-restored', event => { try { onRestored(event.detail); } catch (_) { } });

  // ------------------------------------------------------------------ hooks

  const baseRenderAll = window.renderAll;
  if (typeof baseRenderAll === 'function') window.renderAll = function () { baseRenderAll(); check(); };
  // The session and cloud profile arrive after first paint; a short poll catches them.
  const timer = setInterval(() => { try { check(); } catch (_) { } }, 1200);

  window.IronSixOnboarding = {
    check, begin, open: u => start(u || activeUser()), close: teardown, accountIsEmpty, isOpen: () => !!root,
    requestPermission, snooze, firstWorkoutLine, reset: () => { firstSeen = 0; snoozed.clear(); try { sessionStorage.removeItem(SNOOZE_KEY); } catch (_) { } },
    set settleMs(value) { settleMs = Number(value) || 0; },
    get settleMs() { return settleMs; },
    _timer: timer
  };
})();
