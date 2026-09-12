/* Real-device continuity glue for the opt-in camera assistant.
   Keeps form observation aligned with the rep counter's brief-dropout tolerance while preserving
   an immediate hard reset when the user explicitly taps Re-lock. No camera/network/storage. */
(() => {
  if(typeof window==='undefined')return;
  const formApi=window.IronSixFormCoach,counterApi=window.IronSixRepCounter;
  if(!formApi||!counterApi||formApi.__ironSixContinuityTuned)return;

  // The tracker is already wrapped by pose-form-coach.js. Add a form-specific hard-reset marker
  // without weakening its subject-association or bystander ambiguity rules.
  const createTracker=counterApi.createTracker;
  counterApi.createTracker=(rule,options)=>{
    const tracker=createTracker(rule,options),reset=tracker.reset.bind(tracker);
    tracker.reset=()=>{counterApi.__ironSixForceFormInterrupt=true;return reset()};
    return tracker;
  };

  const createEvaluator=formApi.createEvaluator;
  formApi.createEvaluator=(rule,options)=>{
    const evaluator=createEvaluator(rule,options);
    if(!evaluator?.interrupt||!evaluator?.push)return evaluator;
    const hardInterrupt=evaluator.interrupt.bind(evaluator),push=evaluator.push.bind(evaluator);
    let softInterrupts=0;
    evaluator.push=frame=>{
      if(frame?.landmarks)softInterrupts=0;
      return push(frame);
    };
    evaluator.interrupt=(logCount,hard=false)=>{
      if(hard||counterApi.__ironSixForceFormInterrupt){
        counterApi.__ironSixForceFormInterrupt=false;softInterrupts=0;
        return hardInterrupt(logCount);
      }
      softInterrupts++;
      if(softInterrupts>=15){softInterrupts=0;return hardInterrupt(logCount)}
      return evaluator.state();
    };
    return evaluator;
  };
  formApi.__ironSixContinuityTuned=true;
})();
