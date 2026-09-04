(() => {
  if(window.__ironSixExerciseVisuals)return;window.__ironSixExerciseVisuals=true;
  const G=()=>window.IronSixExerciseGuide;
  const style=document.createElement('style');style.textContent=`
    .exercise-name-link{display:block;border:0;background:none;color:var(--text);padding:0;text-align:left;font:inherit;font-weight:850;font-size:16px;text-decoration:underline;text-decoration-color:rgba(157,223,104,.48);text-underline-offset:4px;cursor:pointer}.exercise-help-btn{border:0;background:none;color:var(--accent);padding:8px 0 2px;font-size:12px;font-weight:850;cursor:pointer}
    .exercise-guide-panel{margin:0 0 14px;border:1px solid rgba(157,223,104,.28);background:linear-gradient(180deg,rgba(157,223,104,.08),rgba(157,223,104,.025));border-radius:18px;padding:15px}.exercise-guide-panel h2{margin:2px 0 4px}.guide-target{color:var(--muted);font-size:12px;margin:8px 0 14px}.guide-sketches{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin:12px 0 4px}.guide-sketch{background:linear-gradient(155deg,var(--surface2),rgba(157,223,104,.045));border:1px solid var(--line);border-radius:14px;padding:7px 7px 9px;text-align:center;overflow:hidden}.guide-sketch svg{width:100%;max-height:190px;display:block}.guide-sketch span{display:block;font-size:11px;color:var(--text);font-weight:850;margin-top:2px}.guide-sketch small{display:block;font-size:9px;color:var(--muted);margin-top:2px;line-height:1.25}.guide-columns{display:grid;grid-template-columns:1fr 1fr;gap:10px}.guide-block{background:var(--surface2);border-radius:12px;padding:10px}.guide-block strong{font-size:11px;text-transform:uppercase;letter-spacing:.05em}.guide-block ol,.guide-block ul{padding-left:18px;margin:7px 0 0;color:var(--muted);font-size:12px;line-height:1.45}.guide-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.guide-note{font-size:10px;color:var(--muted);margin-top:8px}.diagram-body{fill:none;stroke:var(--text);stroke-width:9;stroke-linecap:round;stroke-linejoin:round}.diagram-body .head{fill:var(--text);stroke:var(--surface2);stroke-width:2}.diagram-gear{fill:var(--accent);stroke:var(--accent);stroke-width:4;stroke-linecap:round;stroke-linejoin:round}.diagram-gear .bench{fill:none;stroke:var(--muted);stroke-width:6}.diagram-floor{fill:none;stroke:var(--line);stroke-width:2}.diagram-arrow{fill:none;stroke:var(--accent);stroke-width:3;stroke-linecap:round;stroke-linejoin:round;stroke-dasharray:4 4}@media(max-width:480px){.guide-columns{grid-template-columns:1fr}.guide-sketch svg{max-height:155px}}
  `;document.head.appendChild(style);

  function svg(key,phase,name){
    const end=phase===1,body=[],gear=[];
    const limb=(x1,y1,x2,y2)=>body.push(`<path d="M${x1} ${y1} L${x2} ${y2}"/>`);
    const head=(x,y)=>body.push(`<circle cx="${x}" cy="${y}" r="7" class="head"/>`);
    const floor='<path d="M8 94 H112"/>',arrow=end?'<path class="diagram-arrow" d="M105 77 C115 62 115 43 105 28 M105 28 l-5 7 M105 28 l8 2"/>':'';
    if(key==='squat'){
      const hip=end?57:43,knee=end?70:66;head(60,end?23:16);limb(60,end?31:24,60,hip);limb(60,hip,39,knee);limb(39,knee,30,91);limb(60,hip,80,knee);limb(80,knee,89,91);limb(58,34,38,40);limb(62,34,82,40);gear.push('<path d="M27 38 H93"/><circle cx="23" cy="38" r="7"/><circle cx="97" cy="38" r="7"/>');
    }else if(key==='split_squat'){
      const hip=end?56:43;head(56,end?24:16);limb(56,end?32:24,56,hip);limb(56,hip,36,end?69:66);limb(36,end?69:66,27,91);limb(56,hip,78,end?69:62);limb(78,end?69:62,96,91);limb(53,35,40,58);limb(59,35,72,58);gear.push('<rect x="34" y="56" width="8" height="14" rx="3"/><rect x="70" y="56" width="8" height="14" rx="3"/>');
    }else if(key==='hinge'||key==='row'||key==='rear_delt'||key==='lat_iso'){
      const hx=end?82:60,hy=end?31:16,hip=end?57:45;head(hx,hy);limb(hx-4,hy+8,60,hip);limb(60,hip,42,91);limb(60,hip,73,91);const handY=(key==='row'&&end)?48:70;limb(72,43,92,handY);limb(67,45,82,handY);gear.push(`<path d="M76 ${handY+2} H104"/><circle cx="72" cy="${handY+2}" r="6"/><circle cx="108" cy="${handY+2}" r="6"/>`);
    }else if(key==='bench'||key==='chest_press'||key==='fly'){
      gear.push('<path class="bench" d="M20 70 H94 M28 70 V91 M86 70 V91"/>');head(30,55);limb(38,58,67,58);limb(67,58,87,78);limb(53,59,53,88);if(key==='fly'&&!end){limb(49,55,31,37);limb(57,55,78,37)}else{limb(49,54,49,end?23:39);limb(58,54,58,end?23:39)}gear.push(`<path d="M38 ${end?22:38} H69"/><circle cx="34" cy="${end?22:38}" r="6"/><circle cx="73" cy="${end?22:38}" r="6"/>`);
    }else if(key==='overhead_press'||key==='lateral_raise'){
      head(60,18);limb(60,27,60,60);limb(60,60,45,91);limb(60,60,75,91);if(key==='lateral_raise'){limb(58,38,end?30:42,end?38:59);limb(62,38,end?90:78,end?38:59);gear.push(`<circle cx="${end?26:39}" cy="${end?38:62}" r="5"/><circle cx="${end?94:81}" cy="${end?38:62}" r="5"/>`)}else{limb(57,38,50,end?9:43);limb(63,38,70,end?9:43);gear.push(`<path d="M40 ${end?8:44} H80"/><circle cx="36" cy="${end?8:44}" r="6"/><circle cx="84" cy="${end?8:44}" r="6"/>`)}
    }else if(key==='pullup'){
      const y=end?35:55;gear.push('<path d="M20 9 H100"/>');head(60,y);limb(60,y+8,60,y+34);limb(58,y+15,35,12);limb(62,y+15,85,12);limb(60,y+34,48,Math.min(91,y+54));limb(60,y+34,72,Math.min(91,y+54));
    }else if(key==='hip_thrust'){
      const hip=end?48:68;gear.push('<path class="bench" d="M10 58 H39 M17 58 V90"/>');head(28,45);limb(36,49,60,hip);limb(60,hip,82,78);limb(82,78,91,92);limb(60,hip,49,91);gear.push(`<path d="M50 ${hip-3} H74"/><circle cx="46" cy="${hip-3}" r="6"/><circle cx="78" cy="${hip-3}" r="6"/>`);
    }else{
      head(60,18);limb(60,27,60,61);limb(60,61,46,91);limb(60,61,74,91);limb(58,38,42,end?31:61);limb(62,38,78,end?31:61);gear.push(`<circle cx="39" cy="${end?29:64}" r="5"/><circle cx="81" cy="${end?29:64}" r="5"/>`);
    }
    return `<svg viewBox="0 0 120 100" role="img" aria-label="${escapeHtml(name)} ${end?'finish':'start'} position"><g class="diagram-floor">${floor}</g><g class="diagram-body">${body.join('')}</g><g class="diagram-gear">${gear.join('')}</g>${arrow}</svg>`
  }

  function renderPanel(exercise){
    const guide=G()?.guideFor(exercise);if(!guide)return;
    const host=document.querySelector('#coach .section');if(!host)return;
    let panel=document.getElementById('exerciseGuidePanel');if(!panel){panel=document.createElement('div');panel.id='exerciseGuidePanel';panel.className='exercise-guide-panel';const q=host.querySelector('.section-head');if(q)q.insertAdjacentElement('beforebegin',panel);else host.prepend(panel)}
    const key=G().classify(exercise),labels=[['Start','Set your position'],['Finish','Follow the arrow']];
    panel.innerHTML=`<div class="eyebrow">Exercise guide</div><h2>${escapeHtml(exercise.name)}</h2><div class="guide-sketches">${labels.map((label,p)=>`<div class="guide-sketch">${svg(key,p,exercise.name)}<span>${label[0]}</span><small>${label[1]}</small></div>`).join('')}</div><div class="guide-target">Targets ${escapeHtml(guide.muscles)} • ${escapeHtml(exercise.prescription||'')}</div><div class="guide-columns"><div class="guide-block"><strong>How to do it</strong><ol>${guide.steps.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ol></div><div class="guide-block"><strong>Best cues</strong><ul>${guide.cues.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div><div class="guide-block"><strong>Setup</strong><ul>${guide.setup.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div><div class="guide-block"><strong>Avoid</strong><ul>${guide.mistakes.map(x=>`<li>${escapeHtml(x)}</li>`).join('')}</ul></div></div><div class="guide-actions"><a class="btn secondary" href="${guide.videoUrl}" target="_blank" rel="noopener noreferrer">▶ Video demos</a><button type="button" class="btn primary" id="askExerciseFollowup">Ask Coach about this</button></div><div class="guide-note">The diagram shows the main movement path. Use the written cues and a clear demonstration for exact positioning.</div>`;
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
