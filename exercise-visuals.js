(() => {
  if(window.__ironSixExerciseVisuals)return;window.__ironSixExerciseVisuals=true;
  const G=()=>window.IronSixExerciseGuide;
  const style=document.createElement('style');style.textContent=`
    .exercise-name-link{display:block;border:0;background:none;color:var(--text);padding:0;text-align:left;font:inherit;font-weight:850;font-size:16px;text-decoration:underline;text-decoration-color:rgba(157,223,104,.48);text-underline-offset:4px;cursor:pointer}.exercise-help-btn{border:0;background:none;color:var(--accent);padding:8px 0 2px;font-size:12px;font-weight:850;cursor:pointer}
    .exercise-guide-panel{margin:0 0 14px;border:1px solid rgba(157,223,104,.28);background:linear-gradient(180deg,rgba(157,223,104,.08),rgba(157,223,104,.025));border-radius:18px;padding:15px}.exercise-guide-panel h2{margin:2px 0 4px}.guide-target{color:var(--muted);font-size:12px;margin-bottom:12px}.guide-sketches{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;margin:12px 0}.guide-sketch{background:var(--surface2);border:1px solid var(--line);border-radius:12px;padding:5px;text-align:center}.guide-sketch svg{width:100%;height:auto;display:block}.guide-sketch span{font-size:10px;color:var(--muted);font-weight:750}.guide-columns{display:grid;grid-template-columns:1fr 1fr;gap:10px}.guide-block{background:var(--surface2);border-radius:12px;padding:10px}.guide-block strong{font-size:11px;text-transform:uppercase;letter-spacing:.05em}.guide-block ol,.guide-block ul{padding-left:18px;margin:7px 0 0;color:var(--muted);font-size:12px;line-height:1.45}.guide-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.guide-note{font-size:10px;color:var(--muted);margin-top:8px}@media(max-width:480px){.guide-columns{grid-template-columns:1fr}}
  `;document.head.appendChild(style);

  function svg(key,phase){
    const p=Math.max(0,Math.min(2,phase));
    let body='';
    const common='<circle cx="50" cy="18" r="7" fill="none" stroke="currentColor" stroke-width="4"/>';
    if(key==='squat'){const hip=p===1?55:45,knee=p===1?70:62;body=`${common}<path d="M50 27 L50 ${hip} M50 ${hip} L34 ${knee} L28 90 M50 ${hip} L66 ${knee} L72 90 M50 34 L32 48 M50 34 L68 48"/>`}
    else if(key==='split_squat'){const hip=p===1?57:45;body=`${common}<path d="M50 27 L50 ${hip} M50 ${hip} L30 70 L20 90 M50 ${hip} L70 70 L84 88 M50 35 L35 48 M50 35 L66 48"/>`}
    else if(key==='hinge'){const y=p===1?47:27,x=p===1?72:50;body=`<circle cx="${x}" cy="${p===1?38:18}" r="7" fill="none" stroke="currentColor" stroke-width="4"/><path d="M${p===1?'67 44 L48 58':'50 27 L50 48'} M48 58 L35 88 M48 58 L63 88 M${p===1?'62 47 L78 63':'50 35 L32 50'}"/>`}
    else if(key==='bench'||key==='chest_press'||key==='fly'){body=`<path d="M15 70 H86" stroke-width="5"/><circle cx="30" cy="55" r="7" fill="none" stroke="currentColor" stroke-width="4"/><path d="M37 56 L62 56 M62 56 L78 72 M48 56 L48 82 M${p===1?'43 51 L43 29 M58 51 L58 29':'43 51 L28 39 M58 51 L74 39'}"/>`}
    else if(key==='overhead_press'||key==='lateral_raise'){const arms=key==='lateral_raise'?(p===1?'M50 38 L22 38 M50 38 L78 38':'M50 38 L34 58 M50 38 L66 58'):(p===1?'M47 35 L47 8 M53 35 L53 8':'M47 35 L34 52 M53 35 L66 52');body=`${common}<path d="M50 27 L50 60 M50 60 L35 90 M50 60 L65 90 ${arms}"/>`}
    else if(key==='row'||key==='rear_delt'||key==='lat_iso'){body=`<circle cx="65" cy="28" r="7" fill="none" stroke="currentColor" stroke-width="4"/><path d="M60 35 L40 55 L33 88 M40 55 L58 88 M${p===1?'50 44 L75 50':'50 44 L82 66'}"/>`}
    else if(key==='pullup'){const y=p===1?35:58;body=`<path d="M15 8 H85" stroke-width="5"/><circle cx="50" cy="${y}" r="7" fill="none" stroke="currentColor" stroke-width="4"/><path d="M50 ${y+7} L50 ${y+34} M50 ${y+15} L28 10 M50 ${y+15} L72 10 M50 ${y+34} L38 ${Math.min(94,y+55)} M50 ${y+34} L62 ${Math.min(94,y+55)}"/>`}
    else if(key==='curl'||key==='hammer_curl'||key==='triceps'||key==='arms'){body=`${common}<path d="M50 27 L50 62 M50 62 L37 90 M50 62 L63 90 M50 38 L35 ${p===1?30:58} M50 38 L65 ${p===1?30:58}"/>`}
    else if(key==='hip_thrust'){const hip=p===1?48:68;body=`<path d="M12 58 H38" stroke-width="6"/><circle cx="28" cy="45" r="7" fill="none" stroke="currentColor" stroke-width="4"/><path d="M35 49 L58 ${hip} L78 82 M58 ${hip} L42 82"/>`}
    else{body=`<circle cx="30" cy="35" r="7" fill="none" stroke="currentColor" stroke-width="4"/><path d="M37 39 L62 ${p===1?50:60} L82 65 M48 51 L38 82 M62 ${p===1?50:60} L70 85"/>`}
    return `<svg viewBox="0 0 100 100" role="img" aria-label="Motion sketch" style="color:var(--accent)"><g fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round">${body}</g></svg>`
  }

  function renderPanel(exercise){
    const guide=G()?.guideFor(exercise);if(!guide)return;
    const host=document.querySelector('#coach .section');if(!host)return;
    let panel=document.getElementById('exerciseGuidePanel');if(!panel){panel=document.createElement('div');panel.id='exerciseGuidePanel';panel.className='exercise-guide-panel';const q=host.querySelector('.section-head');if(q)q.insertAdjacentElement('beforebegin',panel);else host.prepend(panel)}
    const key=G().classify(exercise),labels=['Setup','Working position','Finish'];
    panel.innerHTML=`<div class="eyebrow">Exercise guide</div><h2>${escapeHtml(exercise.name)}</h2><div class="guide-target">Targets ${escapeHtml(guide.muscles)} • ${escapeHtml(exercise.prescription||'')}</div><div class="guide-sketches">${[0,1,2].map((p,i)=>`<div class="guide-sketch">${svg(key,p)}<span>${labels[i]}</span></div>`).join('')}</div><div class="guide-columns"><div class="guide-block"><strong>How to do it</strong><ol>${guide.steps.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ol></div><div class="guide-block"><strong>Best cues</strong><ul>${guide.cues.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div><div class="guide-block"><strong>Setup</strong><ul>${guide.setup.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div><div class="guide-block"><strong>Avoid</strong><ul>${guide.mistakes.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div></div><div class="guide-actions"><a class="btn secondary" href="${guide.videoUrl}" target="_blank" rel="noopener noreferrer">▶ Video demos</a><button type="button" class="btn primary" id="askExerciseFollowup">Ask Coach about this</button></div><div class="guide-note">Motion sketches are simplified orientation guides. Use the written cues and a clear demonstration for exact positioning.</div>`;
    panel.querySelector('#askExerciseFollowup').addEventListener('click',()=>{const input=document.getElementById('coachInput');input?.focus();if(input&&!input.value)input.value=`I have a question about ${exercise.name}: `});
  }

  const baseOpen=window.openExerciseCoach;
  window.openExerciseCoach=function(index){
    const workout=typeof finalWorkout==='function'&&typeof activeUser==='function'?finalWorkout(activeUser()):[],exercise=workout[Number(index)];if(!exercise)return;
    if(typeof showView==='function')showView('coach');
    let tries=0;const timer=setInterval(()=>{tries++;if(document.querySelector('#coach .section')){clearInterval(timer);renderPanel(exercise)}else if(tries>30)clearInterval(timer)},50);
    if(typeof baseOpen==='function')baseOpen(index)
  };
})();
