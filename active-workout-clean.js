/* Temporarily disabled: the first simplified active-workout layer used a MutationObserver on the exercise list and could create an interaction/render loop after buttons changed card classes. Keep this runtime file present so existing loaders do not 404, but do not modify the workout DOM until the simplified UI is reintroduced with explicit render hooks. */
(() => {
  window.__ironSixActiveWorkoutCleanLoaded = true;
  window.IronSixActiveWorkoutClean = { disabled: true, reason: 'interaction-freeze-regression' };
})();
