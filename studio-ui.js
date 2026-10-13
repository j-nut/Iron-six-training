/* Iron Six Studio: semantic view enhancements only. No DOM observer, no
   state writes and no workout rerenders. Existing logging remains authoritative. */
(()=>{
  'use strict';
  if(window.__ironSixStudioLoaded)return;
  window.__ironSixStudioLoaded=true;
  let applying=false;
  function apply(){
    // JSDOM and native navigation can close a view before a queued callback runs.
    // Do not keep work alive after its document is gone.
    if(typeof document==='undefined'||!document?.getElementById||applying)return;
    applying=true;
    try{
      const list=document.getElementById('exerciseList');
      if(list){
        list.closest('.section')?.classList.add('ix-active-workout-section');
        const cards=[...list.querySelectorAll('[data-exercise-index]')];
        const total=cards.length;
        for(const card of cards){
          const title=card.querySelector('.exercise-title');
          if(title){
            let kicker=title.querySelector('.ix-movement-index');
            if(!kicker){kicker=document.createElement('span');kicker.className='ix-movement-index';title.prepend(kicker);}
            const number=Number(card.dataset.exerciseIndex)+1;
            kicker.textContent='MOVEMENT '+String(Number.isFinite(number)?number:1).padStart(2,'0')+' / '+String(total).padStart(2,'0');
            kicker.setAttribute('aria-hidden','true');
          }
          const sets=card.querySelector('.sets');
          if(sets&&!sets.querySelector('.ix-set-summary')){
            const head=document.createElement('div');
            head.className='ix-set-summary';
            head.innerHTML='<b>Working sets</b><span>Tap or hold to adjust</span>';
            sets.prepend(head);
          }
        }
      }
      // Add a non-interactive accessibility label for the active tab and
      // preserve the existing navigation implementation and button events.
      for(const button of document.querySelectorAll('.bottom-nav .navbtn')){
        if(!button.getAttribute('aria-label')){
          const label=button.querySelector('span')?.textContent||button.textContent;
          button.setAttribute('aria-label',label.trim());
        }
      }
    }finally{applying=false;}
  }
  function schedule(){setTimeout(apply,0);}
  for(const name of ['renderExercises','renderAll']){
    if(typeof window[name]!=='function'||window[name].__ixStudioWrapped)continue;
    const base=window[name];
    const wrapped=function(){const value=base.apply(this,arguments);schedule();return value;};
    wrapped.__ixStudioWrapped=true;
    window[name]=wrapped;
  }
  document.addEventListener('click',event=>{
    if(event.target?.closest?.('#sessionBeginBtn,#sessionCardNav,.navbtn,.duration-btn'))schedule();
  });
  window.IronSixStudio={apply,version:3,release:'preview'};
  schedule();
  addEventListener('load',apply);
})();
