/* The journal now saves unfinished sets, revisions, and completed sessions alike. */
(() => {
  window.IronSixCloudHistory={syncHistory:()=>window.IronSixCloud?.syncNow(false)};
  window.IronSixJournal?.hydrated.then(()=>{
    for(const u of data.users){IronSixJournal.migrateUser(u);IronSixJournal.restore(u)}
    window.IronSixCloud?.saveLocal();renderAll();
  });
  function loadRuntimeScript(src,datasetKey,loadedFlag){
    if(window[loadedFlag]||document.querySelector(`script[data-${datasetKey}]`))return;
    const script=document.createElement('script');
    script.src=src;script.setAttribute(`data-${datasetKey}`,'true');script.async=false;
    document.body.appendChild(script);
  }
  loadRuntimeScript('coach-recovery.js?v=2','coach-recovery','__ironSixCoachRecoveryLoaded');
  loadRuntimeScript('auth-hardening.js?v=2','auth-hardening','__ironSixAuthHardened');
  loadRuntimeScript('account-polish.js?v=1','account-polish','__ironSixAccountPolish');
  loadRuntimeScript('adaptive-insights.js?v=1','adaptive-insights','__ironSixAdaptiveInsightsLoaded');
})();
