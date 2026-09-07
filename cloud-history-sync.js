/* The journal now saves unfinished sets, revisions, and completed sessions alike. */
(() => {
  window.IronSixCloudHistory={syncHistory:()=>window.IronSixCloud?.syncNow(false)};
  window.IronSixJournal?.hydrated.then(()=>{
    for(const u of data.users){IronSixJournal.migrateUser(u);IronSixJournal.restore(u)}
    window.IronSixCloud?.saveLocal();renderAll();
  });
  if(!window.__ironSixCoachRecoveryLoaded&&!document.querySelector('script[data-coach-recovery]')){
    const script=document.createElement('script');
    script.src='coach-recovery.js?v=1';
    script.dataset.coachRecovery='true';
    script.async=false;
    document.body.appendChild(script);
  }
})();
