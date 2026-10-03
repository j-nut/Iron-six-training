/* Difficulty is a saved preference plus an explicit, session-scoped adjustment.
 * Changing today's level never archives the session or replaces entered set values. */
(() => {
  if (window.IronSixDifficultyUI) return;
  window.__ironSixDifficultyUILoaded=true;
  window.IronSixDifficulty?.installLoadAdjustment?.();
  const $ = id => document.getElementById(id);
  const LEVELS = ['light', 'balanced', 'heavy'];
  const LABELS = {light:'Light', balanced:'Balanced', heavy:'Heavy'};
  const COPY = {
    light:'Bodyweight and lighter loads, with more effort left in reserve.',
    balanced:'A varied mix of bodyweight, free weights and available machines.',
    heavy:'More barbell and machine work using your available equipment. Heavy does not mean maximal.'
  };
  const normal = value => LEVELS.includes(value) ? value : 'balanced';
  const current = () => typeof activeUser === 'function' ? activeUser() : null;
  const effective = user => window.IronSixDifficulty?.effectiveFor(user) || normal(user?.workoutDifficulty);
  const override = (user, level) => ({level,workoutKey:user.program.currentWorkoutKey,exposure:Number(user.program.exposures?.[user.program.currentWorkoutKey])||0});
  const hasOverride = user => LEVELS.includes(user.sessionDifficulty?.level) && user.sessionDifficulty.workoutKey === user.program.currentWorkoutKey && user.sessionDifficulty.exposure === (Number(user.program.exposures?.[user.program.currentWorkoutKey])||0);
  let message = '', context = null;

  function ownsControls() {
    const user = current();
    return user && context && context.user === user && context.scope === window.ironSixAccountScope;
  }
  function announce(text) {
    message = text;
    if ($('difficultyStatus')) $('difficultyStatus').textContent = text;
    if (typeof toast === 'function') toast(text);
  }
  function invalidate(user) {
    if (typeof calibrationRequest === 'number') calibrationRequest++;
    user.sessionCalibration = null;
    user.coachOverrides = null;
    if (typeof invalidateRoutineReview === 'function') invalidateRoutineReview(user);
  }

  function changeToday(value, makeDefault = false) {
    if (!ownsControls()) return false;
    const user = current(), level = normal(value), oldPlan = finalWorkout(user),previousDefault=normal(user.workoutDifficulty);
    const helper = window.IronSixDifficulty;
    if (!helper?.replanRemaining || !window.IronSixJournal?.replacePlan) {
      announce('Difficulty controls are still loading. Try again in a moment.');render();return false;
    }
    const fields = {
      difficulty:level,
      sessionDifficulty:makeDefault ? null : override(user,level),
      workoutDifficulty:makeDefault ? level : normal(user.workoutDifficulty)
    };
    if (!user.workoutDraft && Object.keys(user.today || {}).length) window.IronSixJournal.ensure(user,oldPlan);
    if (user.workoutDraft) {
      const plan = makeDefault && level === effective(user) ? oldPlan : helper.replanRemaining(user,level,oldPlan);
      if (!window.IronSixJournal.replacePlan(user,plan,fields)) {
        render();announce('Difficulty was not changed. Your current workout is kept.');return false;
      }
      invalidate(user);
      if (user.trainingMode === 'circuit') window.IronSixCircuit?.rebuild?.();
      if (saveData() === false && makeDefault) {
        user.workoutDifficulty=previousDefault;renderAll();
        announce(`${LABELS[level]} for this session. Your default could not be saved.`);return false;
      }
    } else {
      const prior={workoutDifficulty:user.workoutDifficulty,sessionDifficulty:user.sessionDifficulty};
      user.workoutDifficulty=fields.workoutDifficulty;user.sessionDifficulty=fields.sessionDifficulty;
      if (saveData() === false) {
        Object.assign(user,prior);render();announce('Difficulty was not changed. Your current workout is kept.');return false;
      }
      invalidate(user);saveData();
    }
    renderAll();
    const hasEntries = Object.keys(user.today || {}).length > 0;
    announce(makeDefault
      ? `${LABELS[level]} saved as your default. ${hasEntries ? 'Entered sets are kept.' : 'Your workout is ready.'}`
      : `${LABELS[level]} for this session. ${hasEntries ? 'Entered sets are kept; remaining work is adjusted.' : 'Your workout is adjusted.'}`);
    return true;
  }

  function changeDefault(value) {
    if (!ownsControls()) return false;
    const user = current(), level = normal(value), previous = normal(user.workoutDifficulty);
    if (level === previous) return true;
    if (user.workoutDraft) {
      const fields = {workoutDifficulty:level,difficulty:effective(user),sessionDifficulty:user.sessionDifficulty || null};
      if (!window.IronSixJournal?.replacePlan?.(user,finalWorkout(user),fields)) {
        render();announce('Your default was not changed. Your current workout is kept.');return false;
      }
    } else {
      user.workoutDifficulty = level;
    }
    if (user.workoutDraft) {
      if (typeof calibrationRequest === 'number') calibrationRequest++;
      if (typeof invalidateRoutineReview === 'function') invalidateRoutineReview(user);
    } else invalidate(user);
    if (saveData() === false) {
      user.workoutDifficulty = previous;renderAll();
      announce('Your default could not be saved. Your current workout is kept.');return false;
    }
    renderAll();
    announce(`${LABELS[level]} saved as your default.${user.workoutDraft ? ' Your current session keeps its chosen level.' : ''}`);
    return true;
  }

  function styles() {
    if ($('workoutDifficultyStyles')) return;
    const style = document.createElement('style');style.id='workoutDifficultyStyles';
    style.textContent = `
      .app #today #workoutDifficulty{margin-top:14px;padding-top:14px;border-top:1px solid var(--line);text-align:left}
      .app #today .wd-controls{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
      .app #today .wd-label{flex:1;min-width:120px;font-size:14px;font-weight:750;color:var(--text);line-height:1.4}
      .app #today #todayDifficulty{width:auto;min-width:128px;min-height:44px;padding:9px 34px 9px 12px;font-size:14px;border:1px solid var(--line);border-radius:10px;background:var(--surface2);color:var(--text)}
      .app #today .wd-copy{font-size:14px;line-height:1.5;color:var(--muted);margin:8px 0 0}
      .app #today .wd-footer{display:flex;align-items:center;gap:8px 14px;flex-wrap:wrap;margin-top:5px}
      .app #today .wd-default{font-size:13px;line-height:1.5;color:var(--muted)}
      .app #today .wd-action{min-height:44px;padding:5px 0;font:inherit;font-size:13px;font-weight:650;border:0;background:transparent;color:var(--accent);text-decoration:underline;text-underline-offset:3px;cursor:pointer}
      .app #today #difficultyStatus{margin-top:4px;font-size:13px;line-height:1.5;color:var(--muted)}
      .app #today #difficultyStatus:empty{display:none}
      .app #today .wd-action[hidden]{display:none}
      .app #today #todayDifficulty:focus-visible,.app #today .wd-action:focus-visible{outline:2px solid var(--text);outline-offset:3px}
      .app #profileDifficultySetting .helper{font-size:14px;line-height:1.5;margin-top:6px}
      @media(max-width:390px){.app #today .wd-controls{gap:8px}.app #today #todayDifficulty{min-width:122px}.app #today .wd-label{min-width:105px}}
    `;
    document.head.appendChild(style);
  }

  function mountToday() {
    const hero = document.querySelector('#today > .hero');
    if (!hero) return null;
    let node = $('workoutDifficulty');
    if (!node) {
      node = document.createElement('div');node.id='workoutDifficulty';
      node.innerHTML='<div class="wd-controls"><label class="wd-label" for="todayDifficulty">Today’s difficulty</label><select id="todayDifficulty" aria-describedby="difficultyDescription difficultyDefault"><option value="light">Light</option><option value="balanced">Balanced</option><option value="heavy">Heavy</option></select></div><div class="wd-copy" id="difficultyDescription"></div><div class="wd-footer"><span class="wd-default" id="difficultyDefault"></span><button class="wd-action" id="difficultyUseDefault" type="button">Use saved default</button><button class="wd-action" id="difficultySaveDefault" type="button">Make this my default</button></div><div id="difficultyStatus" role="status" aria-live="polite"></div>';
      node.querySelector('#todayDifficulty').addEventListener('change',event=>changeToday(event.target.value));
      node.querySelector('#difficultyUseDefault').addEventListener('click',()=>changeToday(normal(current()?.workoutDifficulty),true));
      node.querySelector('#difficultySaveDefault').addEventListener('click',()=>changeToday(effective(current()),true));
    }
    if (node.parentNode !== hero) hero.appendChild(node);
    return node;
  }

  function mountProfile() {
    const anchor = $('trainingLevel')?.closest('.setting');
    if (!anchor) return;
    let node = $('profileDifficultySetting');
    if (!node) {
      node=document.createElement('div');node.className='setting';node.id='profileDifficultySetting';
      node.innerHTML='<label for="profileWorkoutDifficulty">Default workout difficulty</label><select id="profileWorkoutDifficulty" aria-describedby="profileDifficultyHelp"><option value="light">Light — bodyweight and lighter loads</option><option value="balanced">Balanced — a varied mix</option><option value="heavy">Heavy — barbell and machines</option></select><div class="helper" id="profileDifficultyHelp">Saves automatically to this profile. Adjust Today’s difficulty whenever you need a different level for one session.</div>';
      node.querySelector('select').addEventListener('change',event=>changeDefault(event.target.value));
      anchor.after(node);
    }
  }

  function renderEffortNote(user,level) {
    const note=$('readinessNote');if(!note||level!=='light')return;
    // The normal readiness renderer includes an equipment-gap suffix. Keep that explanation
    // while replacing its generic near-failure coaching with the selected session effort.
    const nodes=[...note.childNodes],gap=nodes.findIndex(node=>node.nodeName==='STRONG'&&node.textContent.trim()==='Equipment limits:');
    const suffix=gap>=0?nodes.slice(Math.max(0,gap-1)):[];
    const heading=document.createElement('strong');heading.textContent='Light effort.';
    const copy=document.createTextNode(' Keep movement controlled and stop with about 4 reps still in reserve. Use comfortable resistance throughout this session.');
    note.replaceChildren(heading,copy,...suffix);
  }

  function render() {
    const user=current();if(!user)return;
    const session=[user.program.currentWorkoutKey,Number(user.program.exposures?.[user.program.currentWorkoutKey])||0,user.workoutDraft?.id||''].join(':');
    if (!context || context.user!==user || context.scope!==window.ironSixAccountScope || context.session!==session) message='';
    context={user,scope:window.ironSixAccountScope,session};
    styles();mountProfile();
    const node=mountToday();if(!node)return;
    const level=effective(user),saved=normal(user.workoutDifficulty);
    renderEffortNote(user,level);
    $('todayDifficulty').value=level;
    $('profileWorkoutDifficulty').value=saved;
    $('difficultyDescription').textContent=COPY[level];
    const temporary=level!==saved || hasOverride(user);
    $('difficultyDefault').textContent=temporary ? `${LABELS[saved]} default · This session only` : `${LABELS[saved]} is your saved default`;
    $('difficultyUseDefault').hidden=!temporary;
    $('difficultySaveDefault').hidden=level===saved;
    $('difficultyStatus').textContent=message;
  }

  const baseRender=window.renderAll;
  if(typeof baseRender==='function')window.renderAll=function(){const result=baseRender.apply(this,arguments);render();return result;};
  window.IronSixDifficultyUI={render,changeToday,changeDefault};
  render();
  addEventListener('load',render);
})();
