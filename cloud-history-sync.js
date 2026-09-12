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
  loadRuntimeScript('load-progression-v2.js?v=1','load-progression-v2','__ironSixLoadProgressionV2Loaded');
  loadRuntimeScript('bodyweight-load-fix.js?v=1','bodyweight-load-fix','__ironSixBodyweightLoadFix');
  loadRuntimeScript('adaptive-insights.js?v=1','adaptive-insights','__ironSixAdaptiveInsightsLoaded');
  loadRuntimeScript('trainer-intelligence-v2.js?v=3','trainer-intelligence-v2','__ironSixTrainerIntelligenceV2Loaded');
  loadRuntimeScript('progress-analytics-v2.js?v=2','progress-analytics-v2','__ironSixProgressAnalyticsV2Loaded');
  loadRuntimeScript('session-adaptation-v3.js?v=2','session-adaptation-v3','__ironSixSessionAdaptationV3Loaded');
  loadRuntimeScript('media-experience-v2.js?v=1','media-experience-v2','__ironSixMediaExperienceV2Loaded');
  loadRuntimeScript('music-originals.js?v=1','music-originals','__ironSixMusicOriginalsLoaded');
  loadRuntimeScript('music.js?v=1','music-originals-ui','__ironSixMusicLoaded');
  loadRuntimeScript('session-resume.js?v=1','session-resume','__ironSixSessionResumeLoaded');
  loadRuntimeScript('active-workout-clean.js?v=1','active-workout-clean','__ironSixActiveWorkoutCleanLoaded');
})();
