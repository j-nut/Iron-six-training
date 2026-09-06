(() => {
  if (window.__ironSixExerciseVisuals) return;
  window.__ironSixExerciseVisuals = true;

  const G = () => window.IronSixExerciseGuide;
  const esc = value => typeof escapeHtml === 'function'
    ? escapeHtml(String(value ?? ''))
    : String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

  const style = document.createElement('style');
  style.textContent = `
    .exercise-name-link{display:block;border:0;background:none;color:var(--text);padding:0;text-align:left;font:inherit;font-weight:850;font-size:16px;text-decoration:underline;text-decoration-color:rgba(157,223,104,.48);text-underline-offset:4px;cursor:pointer}.exercise-help-btn{border:0;background:none;color:var(--accent);padding:8px 0 2px;font-size:12px;font-weight:850;cursor:pointer}
    .exercise-guide-panel{margin:0 0 14px;border:1px solid rgba(157,223,104,.28);background:linear-gradient(180deg,rgba(157,223,104,.09),rgba(157,223,104,.025));border-radius:22px;padding:16px;scroll-margin-top:14px;box-shadow:0 18px 42px rgba(0,0,0,.22)}.exercise-guide-panel h2{margin:3px 0 4px;font-size:22px;letter-spacing:-.03em}.guide-target{color:var(--muted);font-size:12px;margin:7px 0 12px;line-height:1.45}.guide-visual{border:1px solid rgba(255,255,255,.09);border-radius:18px;overflow:hidden;background:radial-gradient(circle at 50% 0,rgba(157,223,104,.10),transparent 42%),#0d1015}.guide-visual svg{display:block;width:100%;height:auto;min-height:225px}.guide-stage-row{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:9px 0 13px}.guide-stage{display:grid;grid-template-columns:30px 1fr;gap:8px;align-items:center;padding:9px 10px;border:1px solid var(--line);background:var(--surface2);border-radius:13px}.guide-stage b{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:rgba(157,223,104,.14);color:var(--accent);font-size:12px}.guide-stage strong,.guide-stage small{display:block}.guide-stage strong{font-size:11px}.guide-stage small{color:var(--muted);font-size:9px;line-height:1.25;margin-top:2px}.guide-legend{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:9px 10px;color:var(--muted);font-size:10px;border-top:1px solid rgba(255,255,255,.07)}.guide-legend span{display:inline-flex;align-items:center;gap:5px}.legend-dot{width:8px;height:8px;border-radius:999px;background:var(--accent);box-shadow:0 0 10px rgba(157,223,104,.38)}.legend-dot.equipment{background:#74b9ff;box-shadow:none}.guide-columns{display:grid;grid-template-columns:1fr 1fr;gap:10px}.guide-block{background:var(--surface2);border-radius:12px;padding:10px}.guide-block strong{font-size:11px;text-transform:uppercase;letter-spacing:.05em}.guide-block ol,.guide-block ul{padding-left:18px;margin:7px 0 0;color:var(--muted);font-size:12px;line-height:1.45}.guide-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.guide-note{font-size:10px;color:var(--muted);margin-top:8px;line-height:1.4}
    .iv-card{fill:rgba(255,255,255,.025);stroke:rgba(255,255,255,.08)}.iv-pill{fill:rgba(157,223,104,.13);stroke:rgba(157,223,104,.28)}.iv-label{fill:#c8f2a8;font:800 9px Inter,system-ui,sans-serif;letter-spacing:.08em}.iv-floor{stroke:#303641;stroke-width:2}.iv-limb-back{fill:none;stroke:#68717d;stroke-width:13;stroke-linecap:round;stroke-linejoin:round}.iv-limb{fill:none;stroke:#e8edf2;stroke-width:14;stroke-linecap:round;stroke-linejoin:round}.iv-torso{fill:#3b4350;stroke:#e8edf2;stroke-width:2;stroke-linejoin:round}.iv-head{fill:#e8edf2;stroke:#0d1015;stroke-width:2}.iv-joint{fill:#e8edf2}.iv-muscle{fill:none;stroke:#9ddf68;stroke-width:8;stroke-linecap:round;opacity:.96}.iv-muscle-fill{fill:#9ddf68;opacity:.95}.iv-gear{fill:none;stroke:#74b9ff;stroke-width:5;stroke-linecap:round;stroke-linejoin:round}.iv-band{fill:none;stroke:#74b9ff;stroke-width:3;stroke-dasharray:4 3}.iv-motion{fill:none;stroke:#9ddf68;stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round}.iv-motion-text{fill:#9ddf68;font:800 8px Inter,system-ui,sans-serif;letter-spacing:.08em}.iv-anchor{fill:#74b9ff}.iv-bench{fill:#252b34;stroke:#75808e;stroke-width:3}.iv-pad{fill:#39424e;stroke:#8c98a7;stroke-width:2}
    @media(max-width:520px){.exercise-guide-panel{padding:13px}.guide-visual svg{min-height:200px}.guide-stage{grid-template-columns:25px 1fr;padding:8px}.guide-stage b{width:24px;height:24px}.guide-columns{grid-template-columns:1fr}.guide-legend{gap:9px}}
  `;
  document.head.appendChild(style);

  function renderPanel(exercise){
    const guide=G()?.guideFor(exercise);if(!guide)return;
    const host=document.querySelector('#coach .section');if(!host)return;
    let panel=document.getElementById('exerciseGuidePanel');if(!panel){panel=document.createElement('div');panel.id='exerciseGuidePanel';panel.className='exercise-guide-panel';const q=host.querySelector('.section-head');if(q)q.insertAdjacentElement('beforebegin',panel);else host.prepend(panel)}
    panel.innerHTML=`<div class="eyebrow">Movement guide</div><h2>${esc(exercise.name)}</h2><div class="guide-target">Targets ${esc(guide.muscles)} • ${esc(exercise.prescription||'')}</div>${window.IronSixMediaView.gallery(exercise)}<div class="guide-columns"><div class="guide-block"><strong>How to do it</strong><ol>${guide.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div><div class="guide-block"><strong>Best cues</strong><ul>${guide.cues.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><div class="guide-block"><strong>Setup</strong><ul>${guide.setup.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><div class="guide-block"><strong>Avoid</strong><ul>${guide.mistakes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></div><div class="guide-actions"><a class="btn secondary" href="${guide.videoUrl}" target="_blank" rel="noopener noreferrer">▶ Video demos</a><button type="button" class="btn primary" id="askExerciseFollowup">Ask Coach about this</button></div><div class="guide-note">Open an image to enlarge it. Use the written cues and a qualified demonstration to check your setup.</div>`;
    panel.querySelector('#askExerciseFollowup').addEventListener('click',()=>{const input=document.getElementById('coachInput');input?.focus();if(input&&!input.value)input.value=`I have a question about ${exercise.name}: `});return panel;
  }

  const baseOpen=window.openExerciseCoach;
  window.openExerciseCoach=function(index){
    const workout=typeof finalWorkout==='function'&&typeof activeUser==='function'?finalWorkout(activeUser()):[],exercise=workout[Number(index)];if(!exercise)return;
    window.__ironSixGuideFocus=true;if(typeof showView==='function')showView('coach');
    let tries=0;const timer=setInterval(()=>{tries++;if(document.querySelector('#coach .section')){clearInterval(timer);const panel=renderPanel(exercise);requestAnimationFrame(()=>panel?.scrollIntoView({behavior:'smooth',block:'start'}))}else if(tries>30)clearInterval(timer)},50);
    if(typeof baseOpen==='function')baseOpen(index);
  };

  window.IronSixVisualDebug={renderPanel};
})();
