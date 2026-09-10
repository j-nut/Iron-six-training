from pathlib import Path


def replace_once(path, old, new, label):
    p = Path(path)
    s = p.read_text()
    if old not in s:
        if new in s:
            return
        raise SystemExit(f"{label}: expected text not found in {path}")
    p.write_text(s.replace(old, new, 1))


replace_once(
    "pose-spike.js",
    "minPoseDetectionConfidence:0.7,minPosePresenceConfidence:0.7,minTrackingConfidence:0.7",
    "minPoseDetectionConfidence:0.45,minPosePresenceConfidence:0.45,minTrackingConfidence:0.5",
    "MediaPipe thresholds",
)
replace_once(
    "pose-spike.js",
    "Tracking v3 · One working side is measured.",
    "Tracking v4 · Motion-aware subject association; one working side is measured.",
    "camera helper version",
)
replace_once(
    "pose-spike.js",
    "Tracking v3 · opt-in · check the log",
    "Tracking v4 · opt-in · motion-aware lock",
    "camera button version",
)
replace_once(
    "pose-spike.js",
    "trackingVersion:2",
    "trackingVersion:4",
    "diagnostic tracker version",
)

replace_once(
    "pose-form-coach.js",
    """      let choices=scored.filter(x=>x.candidate.quality>=config.highConfidence&&x.cost<=config.highCost),tier='high';
      if(!choices.length){choices=scored.filter(x=>x.candidate.quality>=config.lowConfidence&&x.overlap>=2&&x.cost<=config.lowCost);tier='low'}
      if(!choices.length)return hold('Lock held · pose confidence dipped.',t);
      if(choices.length>1&&choices[1].cost-choices[0].cost<config.ambiguityMargin){stats.ambiguities++;return hold('Two people overlap the predicted track. Counting paused until the view separates.',t)}
      const best=choices[0];return accept(best.candidate,t,aspect,tier,best.cost,best.overlap);""",
    """      const choices=scored.filter(x=>(x.candidate.quality>=config.highConfidence&&x.cost<=config.highCost)||(x.candidate.quality>=config.lowConfidence&&x.overlap>=2&&x.cost<=config.lowCost)).sort((a,b)=>a.cost-b.cost);
      if(!choices.length)return hold('Lock held · pose confidence dipped.',t);
      if(choices.length>1&&choices[1].cost-choices[0].cost<config.ambiguityMargin){stats.ambiguities++;return hold('Two people overlap the predicted track. Counting paused until the view separates.',t)}
      const best=choices[0],tier=best.candidate.quality>=config.highConfidence?'high':'low';return accept(best.candidate,t,aspect,tier,best.cost,best.overlap);""",
    "association priority",
)

p = Path("tests/pose-assistant-v3.test.js")
s = p.read_text()
old = """test('pose tracking tuning supports side-on acquisition and brief confidence flicker',()=>{
  const source=fs.readFileSync('pose-form-coach.js','utf8');
  assert(source.includes('confidence:0.58'));
  assert(source.includes('acquireMs:650'));
  assert(source.includes('lossMs:900'));
  assert(source.includes('softInterrupts>=15'));
  assert(source.includes('__ironSixForceInterrupt'));
  assert(source.includes('squat:500'));
  assert(source.includes('__ironSixTrackingTuned'));
});"""
new = """test('pose tracking v4 uses motion association, side-on confidence tiers and brief-dropout tolerance',()=>{
  const source=fs.readFileSync('pose-form-coach.js','utf8');
  assert(source.includes('lowConfidence:0.18'));
  assert(source.includes('highConfidence:0.48'));
  assert(source.includes('acquireMs:420'));
  assert(source.includes('maxCoastMs:950'));
  assert(source.includes('subjectAssociation'));
  assert(source.includes('softInterrupts>=15'));
  assert(source.includes('__ironSixForceInterrupt'));
  assert(source.includes('squat:500'));
  assert(source.includes('__ironSixSubjectTrackerV4'));
});"""
if old in s:
    s = s.replace(old, new, 1)
elif new not in s:
    raise SystemExit("old tracker assertion block not found")
marker = "  assert(source.includes('assistantVersion:3'));"
extra = """  assert(source.includes('assistantVersion:3'));
  assert(source.includes('trackingVersion:4'));
  assert(source.includes('minPoseDetectionConfidence:0.45'));
  assert(source.includes('minPosePresenceConfidence:0.45'));
  assert(source.includes('minTrackingConfidence:0.5'));"""
if "trackingVersion:4" not in s:
    if marker not in s:
        raise SystemExit("assistant version assertion not found")
    s = s.replace(marker, extra, 1)
p.write_text(s)

print("pose tracker v4 integration patch applied")
