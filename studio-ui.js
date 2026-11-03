/* Iron Six Studio: semantic view enhancements only. No DOM observer, no
   state writes and no workout rerenders. Existing logging remains authoritative. */
(()=>{
  'use strict';
  if(window.__ironSixStudioLoaded)return;
  window.__ironSixStudioLoaded=true;
  let applying=false;
  function electricChrome(){
    const brand=document.querySelector('.topbar .brand');
    if(brand&&!brand.querySelector('.ix-brand-lockup')){
      const lockup=document.createElement('span');lockup.className='ix-brand-lockup';lockup.setAttribute('aria-hidden','true');
      lockup.innerHTML='<span class="ix-brand-emblem">VI</span><span class="ix-brand-copy"><span class="ix-brand-name">IRON SIX</span><span class="ix-brand-line">MAKE YOUR MARK</span></span>';
      brand.appendChild(lockup);
    }
    const quick=document.getElementById('coachQuick');
    if(quick&&!document.getElementById('ixCoachPrompts')){
      const details=document.createElement('details');details.id='ixCoachPrompts';details.className='ix-quick-questions';
      const summary=document.createElement('summary');summary.textContent='Quick questions';details.appendChild(summary);
      quick.before(details);details.appendChild(quick);
    }
    document.querySelectorAll('#profiles fieldset.pr-profile-group').forEach(group=>{
      if(group.querySelector('.ix-profile-details'))return;
      const legend=group.querySelector('legend');if(!legend)return;
      const details=document.createElement('details');details.className='ix-profile-details';
      const summary=document.createElement('summary');summary.textContent=legend.textContent.trim();details.appendChild(summary);
      const content=document.createElement('div');content.className='ix-profile-content';
      [...group.children].filter(n=>n!==legend).forEach(n=>content.appendChild(n));
      details.appendChild(content);group.appendChild(details);
    });
    const inventory=document.getElementById('dumbbellInventoryEditor'),equipment=document.querySelector('#profiles .pr-equipment-group .ix-profile-content');
    if(inventory&&equipment&&inventory.parentNode!==equipment)equipment.appendChild(inventory);
  }
  function apply(){
    // JSDOM and native navigation can close a view before a queued callback runs.
    // Do not keep work alive after its document is gone.
    if(typeof document==='undefined'||!document?.getElementById||applying)return;
    applying=true;
    try{
      electricChrome();
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
  window.IronSixStudio={apply,version:4,release:'electric'};
  schedule();
  addEventListener('load',apply);
})();
