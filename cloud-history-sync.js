/* The journal now saves unfinished sets, revisions, and completed sessions alike. */
(() => {
  window.IronSixCloudHistory={syncHistory:()=>window.IronSixCloud?.syncNow(false)};
  window.IronSixJournal?.hydrated.then(()=>{
    for(const u of data.users){IronSixJournal.migrateUser(u);IronSixJournal.restore(u)}
    window.IronSixCloud?.saveLocal();renderAll();
  });
})();
