/* Compact trainer interpretation after a logged set. */
(() => {
  if (window.__ironSixSetCoachFeedbackLoaded) return;
  window.__ironSixSetCoachFeedbackLoaded = true;

  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function injectStyle(){
    if(document.getElementById('setCoachFeedbackStyle')) return;
    const style=document.createElement('style');
    style.id='setCoachFeedbackStyle';
    style.textContent=`
      #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-head{display:grid!important;grid-template-columns:minmax(0,1.08fr) minmax(150px,.92fr);gap:12px!important;align-items:start!important}
      .set-coach-cue{display:none;align-self:start;border:1px solid rgba(46,229,128,.22);background:linear-gradient(180deg,rgba(46,229,128,.08),rgba(46,229,128,.025));border-radius:12px;padding:9px 10px;min-width:0}
      .set-coach-cue.show{display:block}
      .set-coach-cue .scf-label{font-size:9px;line-height:1;text-transform:uppercase;letter-spacing:.08em;color:var(--accent);font-weight:850;margin-bottom:5px}
      .set-coach-cue .scf-text{font-size:11px;line-height:1.35;color:var(--text);font-weight:700}
      .set-coach-cue.up{border-color:rgba(46,229,128,.34)}
      .set-coach-cue.down{border-color:rgba(255,166,87,.36);background:linear-gradient(180deg,rgba(255,166,87,.08),rgba(255,166,87,.025))}
      .set-coach-cue.pain{border-color:rgba(255,91,91,.42);background:linear-gradient(180deg,rgba(255,91,91,.09),rgba(255,91,91,.025))}
      @media(max-width:385px){
        #exerciseList.awc-focus .exercise:not(.sc-hidden) .exercise-head{grid-template-columns:1fr!important;gap:8px!important}
        .set-coach-cue{padding:7px 9px}
      }
    `;
    document.head.appendChild(style);
  }

  function latestSetFor(card){
    if(typeof activeUser!=='function') return null;
    const user=activeUser();
    const ei=Number(card.dataset.exerciseIndex);
    if(!Number.isInteger(ei)) return null;
    const rows=[...card.querySelectorAll('.set-row')];
    let latest=null;
    for(let i=0;i<rows.length;i++){
      const set=user.today?.[`${ei}-${i}`];
      if(set?.done) latest={set,index:i,user,ei};
    }
    return latest;
  }

  function recommendation(latest,exercise){
    if(!latest||!exercise||!latest.set?.feedback) return null;
    const {set,user,ei}=latest;
    let rec=null;
    try{ if(typeof nextSetRecommendation==='function') rec=nextSetRecommendation(user,exercise,ei); }catch(_){ }
    const feedback=String(set.feedback||'').toLowerCase();
    const rirText=String(set.rir??'').trim();
    const rir=rirText===''?null:Number(rirText);

    if(feedback==='pain') return {tone:'pain',text:'Pain noted · stop or swap this movement rather than pushing the next set.'};
    if(rec?.label){
      const target=rec.load&&rec.reps?`${rec.load} lb × about ${rec.reps}`:null;
      let lead=rec.label.replace(/\s*[—-]\s*/g,' · ');
      if(feedback==='right') lead='On target';
      else if(feedback==='easy'&&rec.direction==='up') lead='You had more available';
      else if(feedback==='hard'&&rec.direction==='down') lead='Back off slightly';
      return {tone:rec.direction||'hold',text:target?`${lead} · next: ${target}`:lead};
    }
    if(feedback==='easy') return {tone:'up',text:Number.isFinite(rir)&&rir>=3?'Easy with reserve · add a little load or reps next set.':'Easy · progress the next set slightly.'};
    if(feedback==='hard') return {tone:'down',text:Number.isFinite(rir)&&rir<=1?'Hard with little reserve · reduce the next set slightly.':'Hard · hold or trim the next set.'};
    return {tone:'hold',text:'On target · repeat this effort on the next set.'};
  }

  function updateCard(card){
    if(!card) return;
    const head=card.querySelector('.exercise-head');
    if(!head) return;
    let cue=head.querySelector('.set-coach-cue');
    if(!cue){
      cue=document.createElement('div');
      cue.className='set-coach-cue';
      cue.setAttribute('role','status');
      cue.innerHTML='<div class="scf-label">Trainer</div><div class="scf-text"></div>';
      head.appendChild(cue);
    }
    let exercise=null;
    try{ exercise=typeof finalWorkout==='function'&&typeof activeUser==='function'?finalWorkout(activeUser())[Number(card.dataset.exerciseIndex)]:null; }catch(_){ }
    const rec=recommendation(latestSetFor(card),exercise);
    cue.classList.remove('show','up','down','hold','pain');
    if(!rec){ cue.querySelector('.scf-text').textContent=''; return; }
    cue.querySelector('.scf-text').innerHTML=esc(rec.text);
    cue.classList.add('show',rec.tone||'hold');
  }

  function update(){
    injectStyle();
    document.querySelectorAll('#exerciseList [data-exercise-index]').forEach(updateCard);
  }

  document.addEventListener('click',event=>{
    if(event.target.closest?.('.done,[data-set-feedback],#sessionCardNav,#sessionCardFoot,.exercise-swap-btn,.awc-swap-btn')) setTimeout(update,0);
  });
  document.addEventListener('change',event=>{
    if(event.target.matches?.('.rir,.weight,.reps')) setTimeout(update,0);
  });
  document.addEventListener('input',event=>{
    if(event.target.matches?.('.weight,.reps')) setTimeout(update,0);
  });

  setTimeout(update,0);
  addEventListener('load',update);
  window.IronSixSetCoachFeedback={update};
})();
