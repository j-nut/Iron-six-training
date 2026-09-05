(() => {
  if (window.__ironSixExerciseVisuals) return;
  window.__ironSixExerciseVisuals = true;

  const G = () => window.IronSixExerciseGuide;
  const esc = value => typeof escapeHtml === 'function'
    ? escapeHtml(String(value ?? ''))
    : String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[char]));

  const style = document.createElement('style');
  style.textContent = `
    .exercise-name-link{display:block;border:0;background:none;color:var(--text);padding:0;text-align:left;font:inherit;font-weight:850;font-size:16px;text-decoration:underline;text-decoration-color:rgba(157,223,104,.48);text-underline-offset:4px;cursor:pointer}.exercise-help-btn{border:0;background:none;color:var(--accent);padding:8px 0 2px;font-size:12px;font-weight:850;cursor:pointer}
    .exercise-guide-panel{margin:0 0 14px;border:1px solid rgba(157,223,104,.28);background:linear-gradient(180deg,rgba(157,223,104,.09),rgba(157,223,104,.025));border-radius:22px;padding:16px;scroll-margin-top:14px;box-shadow:0 18px 42px rgba(0,0,0,.22)}.exercise-guide-panel h2{margin:3px 0 4px;font-size:22px;letter-spacing:-.03em}.guide-target{color:var(--muted);font-size:12px;margin:7px 0 12px;line-height:1.45}.guide-visual{border:1px solid rgba(255,255,255,.09);border-radius:18px;overflow:hidden;background:radial-gradient(circle at 50% 0,rgba(157,223,104,.10),transparent 42%),#0d1015}.guide-visual svg{display:block;width:100%;height:auto;min-height:225px}.guide-stage-row{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin:9px 0 13px}.guide-stage{display:grid;grid-template-columns:30px 1fr;gap:8px;align-items:center;padding:9px 10px;border:1px solid var(--line);background:var(--surface2);border-radius:13px}.guide-stage b{display:grid;place-items:center;width:28px;height:28px;border-radius:9px;background:rgba(157,223,104,.14);color:var(--accent);font-size:12px}.guide-stage strong,.guide-stage small{display:block}.guide-stage strong{font-size:11px}.guide-stage small{color:var(--muted);font-size:9px;line-height:1.25;margin-top:2px}.guide-legend{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:9px 10px;color:var(--muted);font-size:10px;border-top:1px solid rgba(255,255,255,.07)}.guide-legend span{display:inline-flex;align-items:center;gap:5px}.legend-dot{width:8px;height:8px;border-radius:999px;background:var(--accent);box-shadow:0 0 10px rgba(157,223,104,.38)}.legend-dot.equipment{background:#74b9ff;box-shadow:none}.guide-columns{display:grid;grid-template-columns:1fr 1fr;gap:10px}.guide-block{background:var(--surface2);border-radius:12px;padding:10px}.guide-block strong{font-size:11px;text-transform:uppercase;letter-spacing:.05em}.guide-block ol,.guide-block ul{padding-left:18px;margin:7px 0 0;color:var(--muted);font-size:12px;line-height:1.45}.guide-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.guide-note{font-size:10px;color:var(--muted);margin-top:8px;line-height:1.4}
    .iv-card{fill:rgba(255,255,255,.025);stroke:rgba(255,255,255,.08)}.iv-pill{fill:rgba(157,223,104,.13);stroke:rgba(157,223,104,.28)}.iv-label{fill:#c8f2a8;font:800 9px Inter,system-ui,sans-serif;letter-spacing:.08em}.iv-floor{stroke:#303641;stroke-width:2}.iv-limb-back{fill:none;stroke:#68717d;stroke-width:13;stroke-linecap:round;stroke-linejoin:round}.iv-limb{fill:none;stroke:#e8edf2;stroke-width:14;stroke-linecap:round;stroke-linejoin:round}.iv-torso{fill:#3b4350;stroke:#e8edf2;stroke-width:2;stroke-linejoin:round}.iv-head{fill:#e8edf2;stroke:#0d1015;stroke-width:2}.iv-joint{fill:#e8edf2}.iv-muscle{fill:none;stroke:#9ddf68;stroke-width:8;stroke-linecap:round;opacity:.96}.iv-muscle-fill{fill:#9ddf68;opacity:.95}.iv-gear{fill:none;stroke:#74b9ff;stroke-width:5;stroke-linecap:round;stroke-linejoin:round}.iv-band{fill:none;stroke:#74b9ff;stroke-width:3;stroke-dasharray:4 3}.iv-motion{fill:none;stroke:#9ddf68;stroke-width:3.5;stroke-linecap:round;stroke-linejoin:round}.iv-motion-text{fill:#9ddf68;font:800 8px Inter,system-ui,sans-serif;letter-spacing:.08em}.iv-anchor{fill:#74b9ff}.iv-bench{fill:#252b34;stroke:#75808e;stroke-width:3}.iv-pad{fill:#39424e;stroke:#8c98a7;stroke-width:2}
    @media(max-width:520px){.exercise-guide-panel{padding:13px}.guide-visual svg{min-height:200px}.guide-stage{grid-template-columns:25px 1fr;padding:8px}.guide-stage b{width:24px;height:24px}.guide-columns{grid-template-columns:1fr}.guide-legend{gap:9px}}
  `;
  document.head.appendChild(style);

  const line=(a,b,c,d,cls='iv-limb')=>`<path class="${cls}" d="M${a} ${b} L${c} ${d}"/>`;
  const path=(pts,cls='iv-limb')=>`<path class="${cls}" d="M${pts.map(p=>p.join(' ')).join(' L')}"/>`;
  const circle=(x,y,r,cls)=>`<circle class="${cls}" cx="${x}" cy="${y}" r="${r}"/>`;
  const floor='<path class="iv-floor" d="M8 139 H160"/>';
  const dumbbell=(x,y,vertical=false)=>`<g class="iv-gear" transform="rotate(${vertical?90:0} ${x} ${y})"><path d="M${x-8} ${y} H${x+8}"/><path d="M${x-9} ${y-5} V${y+5} M${x+9} ${y-5} V${y+5}"/></g>`;
  const barbell=(x1,y1,x2,y2)=>`<g class="iv-gear"><path d="M${x1} ${y1} L${x2} ${y2}"/><path d="M${x1-2} ${y1-7} L${x1+2} ${y1+7} M${x2-2} ${y2-7} L${x2+2} ${y2+7}"/></g>`;
  const bench=(x,y,w,angle=0)=>`<g transform="rotate(${angle} ${x} ${y})"><rect class="iv-pad" x="${x}" y="${y}" width="${w}" height="9" rx="4"/><path class="iv-bench" d="M${x+12} ${y+9} V${y+34} M${x+w-12} ${y+9} V${y+34}"/></g>`;

  function gearKind(exercise={}){
    const req=Array.isArray(exercise.requires)?exercise.requires:[],n=String(exercise.name||'').toLowerCase();
    if(req.includes('landmine')||/landmine|meadows/.test(n))return 'landmine';
    if(req.includes('bands')||n.includes('band'))return 'band';
    if(req.includes('barbell')||n.includes('barbell'))return 'barbell';
    if(req.includes('dumbbells')||/dumbbell|weighted/.test(n))return 'dumbbell';
    return 'bodyweight';
  }

  function muscleMarkup(target,p,view){
    if(view==='front'){
      const sy=(p.ls[1]+p.rs[1])/2,hy=(p.lh[1]+p.rh[1])/2;
      if(/bench|fly|chest/.test(target))return `<ellipse class="iv-muscle-fill" cx="72" cy="${sy+13}" rx="9" ry="6"/><ellipse class="iv-muscle-fill" cx="88" cy="${sy+13}" rx="9" ry="6"/>`;
      if(/overhead|lateral|rear/.test(target))return circle(p.ls[0],p.ls[1]+2,6,'iv-muscle-fill')+circle(p.rs[0],p.rs[1]+2,6,'iv-muscle-fill');
      if(/row|pullup|lat/.test(target))return line(p.ls[0]+5,p.ls[1]+10,p.lh[0]+3,p.lh[1]-5,'iv-muscle')+line(p.rs[0]-5,p.rs[1]+10,p.rh[0]-3,p.rh[1]-5,'iv-muscle');
      if(/curl|arms/.test(target))return line(p.ls[0],p.ls[1],p.le[0],p.le[1],'iv-muscle')+line(p.rs[0],p.rs[1],p.re[0],p.re[1],'iv-muscle');
      if(/triceps/.test(target))return line(p.le[0],p.le[1],p.lhand[0],p.lhand[1],'iv-muscle')+line(p.re[0],p.re[1],p.rhand[0],p.rhand[1],'iv-muscle');
      if(/squat|split/.test(target))return line(p.lh[0],p.lh[1],p.lk[0],p.lk[1],'iv-muscle')+line(p.rh[0],p.rh[1],p.rk[0],p.rk[1],'iv-muscle');
      if(/calves/.test(target))return line(p.lk[0],p.lk[1],p.la[0],p.la[1],'iv-muscle')+line(p.rk[0],p.rk[1],p.ra[0],p.ra[1],'iv-muscle');
      return `<rect class="iv-muscle-fill" x="72" y="${sy+12}" width="16" height="${Math.max(12,hy-sy-22)}" rx="7"/>`;
    }
    if(/hinge|ham/.test(target))return line(p.hip[0],p.hip[1],p.knee[0],p.knee[1],'iv-muscle');
    if(/hip_thrust|glute/.test(target))return circle(p.hip[0],p.hip[1],8,'iv-muscle-fill');
    if(/squat|split/.test(target))return line(p.hip[0],p.hip[1],p.knee[0],p.knee[1],'iv-muscle');
    if(/bench|fly|chest/.test(target))return line(p.shoulder[0],p.shoulder[1],p.hip[0],p.hip[1],'iv-muscle');
    if(/row|pullup|lat/.test(target))return line(p.shoulder[0]+2,p.shoulder[1]+5,p.hip[0],p.hip[1]-5,'iv-muscle');
    if(/overhead|lateral|rear/.test(target))return circle(p.shoulder[0],p.shoulder[1],7,'iv-muscle-fill');
    if(/curl/.test(target))return line(p.shoulder[0],p.shoulder[1],p.elbow[0],p.elbow[1],'iv-muscle');
    if(/triceps/.test(target))return line(p.elbow[0],p.elbow[1],p.hand[0],p.hand[1],'iv-muscle');
    if(/calves/.test(target))return line(p.knee[0],p.knee[1],p.ankle[0],p.ankle[1],'iv-muscle');
    return circle((p.shoulder[0]+p.hip[0])/2,(p.shoulder[1]+p.hip[1])/2,7,'iv-muscle-fill');
  }

  function frontFigure(p,target){
    const torso=`<path class="iv-torso" d="M${p.ls[0]} ${p.ls[1]} Q80 ${p.ls[1]-5} ${p.rs[0]} ${p.rs[1]} L${p.rh[0]} ${p.rh[1]} Q80 ${p.rh[1]+5} ${p.lh[0]} ${p.lh[1]} Z"/>`;
    return path([p.rs,p.re,p.rhand],'iv-limb-back')+path([p.rh,p.rk,p.ra],'iv-limb-back')+path([p.ls,p.le,p.lhand])+path([p.lh,p.lk,p.la])+torso+muscleMarkup(target,p,'front')+circle(p.head[0],p.head[1],10,'iv-head')+line(p.head[0],p.head[1]+9,80,p.ls[1]-1)+circle(p.le[0],p.le[1],4,'iv-joint')+circle(p.re[0],p.re[1],4,'iv-joint')+circle(p.lk[0],p.lk[1],4,'iv-joint')+circle(p.rk[0],p.rk[1],4,'iv-joint');
  }

  function sideFigure(p,target){
    return path([p.hip,p.backKnee||p.knee,p.backAnkle||p.ankle],'iv-limb-back')+path([p.shoulder,p.backElbow||p.elbow,p.backHand||p.hand],'iv-limb-back')+line(p.shoulder[0],p.shoulder[1],p.hip[0],p.hip[1])+path([p.hip,p.knee,p.ankle])+path([p.shoulder,p.elbow,p.hand])+muscleMarkup(target,p,'side')+circle(p.head[0],p.head[1],10,'iv-head')+line(p.head[0]-4,p.head[1]+9,p.shoulder[0],p.shoulder[1])+circle(p.elbow[0],p.elbow[1],4,'iv-joint')+circle(p.knee[0],p.knee[1],4,'iv-joint');
  }

  function movementVariant(exercise,key){
    const n=String(exercise?.name||'').toLowerCase();
    if(n.includes('pike push-up'))return 'pike_pushup';
    if(n.includes('push-up'))return 'pushup';
    if(n.includes('hamstring walkout'))return 'ham_walkout';
    if(n.includes('ab wheel'))return 'ab_wheel';
    if(n.includes('pallof'))return 'pallof';
    if(n.includes('plank'))return 'plank';
    if(n.includes('rotation'))return 'rotation';
    if(n.includes('lat pulldown'))return 'lat_pulldown';
    if(n.includes('prone lat pull'))return 'prone_pull';
    if(n.includes('face pull'))return 'face_pull';
    if(n.includes('pullover'))return 'pullover';
    if(n.includes('pressdown'))return 'pressdown';
    if(n.includes('skull crusher'))return 'skull_crusher';
    return key;
  }

  function standardFront(key,end,e){
    let p;
    if(key==='squat')p=end?{head:[80,36],ls:[58,54],rs:[102,54],lh:[67,84],rh:[93,84],le:[58,70],re:[102,70],lhand:[72,66],rhand:[88,66],lk:[50,105],rk:[110,105],la:[42,135],ra:[118,135]}:{head:[80,17],ls:[58,36],rs:[102,36],lh:[68,72],rh:[92,72],le:[58,56],re:[102,56],lhand:[72,53],rhand:[88,53],lk:[64,102],rk:[96,102],la:[60,135],ra:[100,135]};
    else if(key==='overhead_press')p={head:[80,18],ls:[59,38],rs:[101,38],lh:[68,76],rh:[92,76],le:end?[58,22]:[55,60],re:end?[102,22]:[105,60],lhand:end?[70,8]:[68,48],rhand:end?[90,8]:[92,48],lk:[66,105],rk:[94,105],la:[62,136],ra:[98,136]};
    else if(key==='lateral_raise'||key==='rear_delt')p={head:[80,17],ls:[59,38],rs:[101,38],lh:[69,75],rh:[91,75],le:end?[35,46]:[56,68],re:end?[125,46]:[104,68],lhand:end?[13,49]:[54,95],rhand:end?[147,49]:[106,95],lk:[67,105],rk:[93,105],la:[62,136],ra:[98,136]};
    else if(key==='curl'||key==='hammer_curl')p={head:[80,17],ls:[59,38],rs:[101,38],lh:[69,75],rh:[91,75],le:[57,68],re:[103,68],lhand:end?[68,48]:[56,98],rhand:end?[92,48]:[104,98],lk:[67,105],rk:[93,105],la:[62,136],ra:[98,136]};
    else if(key==='triceps'||key==='pressdown')p={head:[80,17],ls:[59,38],rs:[101,38],lh:[69,75],rh:[91,75],le:[57,60],re:[103,60],lhand:end?[57,98]:[73,66],rhand:end?[103,98]:[87,66],lk:[67,105],rk:[93,105],la:[62,136],ra:[98,136]};
    else if(key==='fly')p={head:[80,116],ls:[61,91],rs:[99,91],lh:[69,126],rh:[91,126],le:end?[59,58]:[33,91],re:end?[101,58]:[127,91],lhand:end?[70,36]:[18,93],rhand:end?[90,36]:[142,93],lk:[68,133],rk:[92,133],la:[62,138],ra:[98,138]};
    else if(key==='calves')p={head:[80,17],ls:[59,38],rs:[101,38],lh:[69,75],rh:[91,75],le:[57,65],re:[103,65],lhand:[56,96],rhand:[104,96],lk:[67,105],rk:[93,105],la:end?[62,130]:[62,136],ra:end?[98,130]:[98,136]};
    else if(key==='lat_iso')p={head:[80,18],ls:[59,38],rs:[101,38],lh:[69,76],rh:[91,76],le:end?[61,67]:[51,35],re:end?[99,67]:[109,35],lhand:end?[66,94]:[42,12],rhand:end?[94,94]:[118,12],lk:[67,106],rk:[93,106],la:[62,136],ra:[98,136]};
    else p={head:[80,18],ls:[59,38],rs:[101,38],lh:[69,76],rh:[91,76],le:[58,62],re:[102,62],lhand:end?[43,65]:[71,63],rhand:end?[117,65]:[89,63],lk:[67,106],rk:[93,106],la:[62,136],ra:[98,136]};
    let gear='',kind=gearKind(e);
    if(key==='squat'){
      if(kind==='barbell')gear=barbell(34,p.ls[1]+4,126,p.rs[1]+4);else if(kind==='dumbbell')gear=dumbbell(80,p.lhand[1],true);else if(kind==='landmine')gear=`<path class="iv-gear" d="M80 ${p.lhand[1]} L151 135"/>${circle(151,135,5,'iv-anchor')}`;
    }else if(key==='overhead_press'){
      if(kind==='barbell')gear=barbell(46,p.lhand[1],114,p.rhand[1]);else if(kind==='dumbbell')gear=dumbbell(p.lhand[0],p.lhand[1])+dumbbell(p.rhand[0],p.rhand[1]);else if(kind==='landmine')gear=`<path class="iv-gear" d="M${p.rhand[0]} ${p.rhand[1]} L154 136"/>${circle(154,136,5,'iv-anchor')}`;
    }else if(key==='lateral_raise'||key==='rear_delt'){
      gear=kind==='band'?`<path class="iv-band" d="M62 136 L${p.lhand[0]} ${p.lhand[1]} M98 136 L${p.rhand[0]} ${p.rhand[1]}"/>`:dumbbell(p.lhand[0],p.lhand[1])+dumbbell(p.rhand[0],p.rhand[1]);
    }else if(key==='curl'||key==='hammer_curl'){
      if(kind==='barbell')gear=barbell(p.lhand[0],p.lhand[1],p.rhand[0],p.rhand[1]);else if(kind==='band')gear=`<path class="iv-band" d="M62 136 L${p.lhand[0]} ${p.lhand[1]} M98 136 L${p.rhand[0]} ${p.rhand[1]}"/>`;else if(kind==='dumbbell')gear=dumbbell(p.lhand[0],p.lhand[1],key==='hammer_curl')+dumbbell(p.rhand[0],p.rhand[1],key==='hammer_curl');
    }else if(key==='triceps'||key==='pressdown')gear=`<path class="iv-band" d="M${p.lhand[0]} ${p.lhand[1]} L80 7 L${p.rhand[0]} ${p.rhand[1]}"/>${circle(80,7,4,'iv-anchor')}`;
    else if(key==='fly')gear=`<rect class="iv-pad" x="58" y="86" width="44" height="52" rx="7"/>`+dumbbell(p.lhand[0],p.lhand[1])+dumbbell(p.rhand[0],p.rhand[1]);
    else if(key==='calves'){if(kind==='dumbbell')gear=dumbbell(p.lhand[0],p.lhand[1],true)+dumbbell(p.rhand[0],p.rhand[1],true);else if(kind==='barbell')gear=barbell(36,42,124,42);gear+='<path class="iv-motion" d="M137 130 V112" marker-end="url(#iv-arrow)"/>'}
    else if(key==='lat_iso'&&kind==='band')gear=`<path class="iv-band" d="M${p.lhand[0]} ${p.lhand[1]} L80 5 L${p.rhand[0]} ${p.rhand[1]}"/>${circle(80,5,4,'iv-anchor')}`;
    return floor+frontFigure(p,key)+gear;
  }

  function standardSide(key,end,e){
    let p,extra='';
    if(key==='hinge')p=end?{head:[119,43],shoulder:[103,54],hip:[72,78],knee:[68,105],ankle:[62,136],backKnee:[87,106],backAnkle:[93,136],elbow:[107,78],hand:[109,112],backElbow:[96,77],backHand:[99,112]}:{head:[80,18],shoulder:[77,36],hip:[74,75],knee:[69,104],ankle:[62,136],backKnee:[88,104],backAnkle:[94,136],elbow:[72,61],hand:[68,97],backElbow:[84,61],backHand:[85,97]};
    else if(key==='split_squat'){
      p=end?{head:[69,35],shoulder:[65,52],hip:[67,83],knee:[45,106],ankle:[36,136],backKnee:[105,108],backAnkle:[132,136],elbow:[57,76],hand:[52,101],backElbow:[76,76],backHand:[83,101]}:{head:[69,18],shoulder:[66,36],hip:[67,72],knee:[44,101],ankle:[32,136],backKnee:[108,102],backAnkle:[137,136],elbow:[57,61],hand:[53,93],backElbow:[76,61],backHand:[83,93]};
      if(/bulgarian/i.test(e.name||'')){p.backAnkle=[137,111];extra=bench(126,115,32)}
    }else if(key==='row'||key==='rear_delt'){
      p={head:[119,43],shoulder:[103,55],hip:[72,79],knee:[67,106],ankle:[60,136],backKnee:[91,107],backAnkle:[98,136],elbow:end?[83,63]:[106,82],hand:end?[75,84]:[108,115],backElbow:end?[92,66]:[96,83],backHand:end?[86,86]:[97,115]};
    }
    else if(key==='hip_thrust'){
      const hip=end?[87,66]:[83,93];p={head:[30,61],shoulder:[43,72],hip,knee:[116,91],ankle:[132,136],backKnee:[105,94],backAnkle:[112,136],elbow:[61,82],hand:[82,86],backElbow:[58,78],backHand:[79,84]};extra=bench(9,80,45);
    }else if(key==='ham_curl')p={head:[28,83],shoulder:[45,90],hip:[83,96],knee:[112,99],ankle:end?[112,56]:[145,101],backKnee:[108,106],backAnkle:end?[106,65]:[140,110],elbow:[44,116],hand:[62,128]};
    else p={head:[31,88],shoulder:[48,92],hip:[87,95],knee:[113,109],ankle:[132,136],backKnee:[102,111],backAnkle:[111,136],elbow:end?[76,42]:[70,72],hand:end?[76,19]:[76,55],backElbow:end?[91,42]:[91,72],backHand:end?[91,19]:[91,55]};
    let gear=extra,kind=gearKind(e);
    if(key==='bench'){gear+=bench(18,102,104);gear+=kind==='dumbbell'?dumbbell(p.hand[0],p.hand[1])+dumbbell(p.backHand[0],p.backHand[1]):barbell(47,p.hand[1],119,p.backHand[1])}
    else if(key==='hip_thrust'){if(kind==='barbell')gear+=barbell(64,p.hip[1]-4,106,p.hip[1]-4);else if(kind==='dumbbell')gear+=dumbbell(87,p.hip[1]-4);else if(kind==='band')gear+=`<path class="iv-band" d="M62 ${p.hip[1]+3} Q87 ${p.hip[1]-10} 112 ${p.hip[1]+3}"/>`}
    else if(key==='ham_curl')gear+=`<path class="iv-band" d="M${p.ankle[0]} ${p.ankle[1]} L155 136"/>${circle(155,136,4,'iv-anchor')}`;
    else if(key==='row'||key==='rear_delt'){
      if(kind==='dumbbell')gear+=dumbbell(p.hand[0],p.hand[1],true);else if(kind==='band')gear+=`<path class="iv-band" d="M${p.hand[0]} ${p.hand[1]} L155 118"/>${circle(155,118,4,'iv-anchor')}`;else if(kind==='landmine')gear+=`<path class="iv-gear" d="M${p.hand[0]} ${p.hand[1]} L154 136"/>${circle(154,136,5,'iv-anchor')}`;else gear+=barbell(p.hand[0]-24,p.hand[1],p.hand[0]+26,p.hand[1]);
    }else if(key==='hinge'){
      if(kind==='barbell')gear=barbell(p.hand[0]-22,p.hand[1],p.hand[0]+27,p.hand[1]);else if(kind==='dumbbell')gear=dumbbell(p.hand[0],p.hand[1],true)+dumbbell(p.backHand[0],p.backHand[1],true);else if(kind==='landmine')gear=`<path class="iv-gear" d="M${p.hand[0]} ${p.hand[1]} L151 137"/>${circle(151,137,5,'iv-anchor')}`;
    }else if(key==='split_squat'&&kind==='dumbbell')gear+=dumbbell(p.hand[0],p.hand[1],true)+dumbbell(p.backHand[0],p.backHand[1],true);
    return floor+sideFigure(p,key)+gear;
  }

  function specialPose(variant,end,e){
    if(variant==='arms'){
      if(!end)return standardFront('curl',true,e);
      if(/pressdown/i.test(e.name||''))return standardFront('triceps',true,{...e,requires:['bands']});
      return specialPose('pushup',false,e);
    }
    if(variant==='pushup'||variant==='pike_pushup'){
      const p=variant==='pike_pushup'?(end?{head:[41,103],shoulder:[51,91],hip:[91,48],knee:[120,84],ankle:[147,134],elbow:[34,113],hand:[24,136],backElbow:[47,116],backHand:[39,136]}:{head:[56,79],shoulder:[67,72],hip:[99,48],knee:[123,86],ankle:[147,134],elbow:[48,102],hand:[27,136],backElbow:[60,104],backHand:[42,136]}):{head:end?[39,98]:[39,78],shoulder:end?[56,98]:[56,79],hip:end?[94,101]:[94,82],knee:[124,end?104:85],ankle:[151,end?112:93],elbow:end?[47,119]:[59,105],hand:[42,136],backElbow:end?[59,121]:[70,107],backHand:[55,136]};
      return floor+sideFigure(p,variant==='pike_pushup'?'overhead_press':'bench');
    }
    if(variant==='ab_wheel'){
      const p=end?{head:[106,79],shoulder:[92,88],hip:[62,99],knee:[43,120],ankle:[24,136],elbow:[112,104],hand:[130,128],backElbow:[105,107],backHand:[124,131]}:{head:[68,57],shoulder:[63,76],hip:[62,100],knee:[43,121],ankle:[25,136],elbow:[83,96],hand:[98,127],backElbow:[75,98],backHand:[91,130]};
      return floor+sideFigure(p,'core')+`<circle class="iv-gear" cx="${p.hand[0]+2}" cy="132" r="8"/><path class="iv-gear" d="M${p.hand[0]-7} 132 H${p.hand[0]+11}"/>`;
    }
    if(variant==='plank'){
      const p={head:[33,86],shoulder:[51,88],hip:[91,92],knee:[121,98],ankle:[151,109],elbow:[45,116],hand:[27,132],backElbow:[57,117],backHand:[40,132]};return floor+sideFigure(p,'core')+(end?'':'<path class="iv-motion" d="M67 64 H111" marker-end="url(#iv-arrow)"/>');
    }
    if(variant==='pallof'){
      const p={head:[62,18],shoulder:[65,38],hip:[65,76],knee:[66,106],ankle:[61,136],backKnee:[82,106],backAnkle:[88,136],elbow:end?[91,54]:[80,55],hand:end?[126,55]:[78,48],backElbow:end?[91,63]:[80,64],backHand:end?[126,64]:[78,70]};
      return floor+sideFigure(p,'core')+`<path class="iv-band" d="M${p.hand[0]} ${p.hand[1]} L154 55"/>${circle(154,55,4,'iv-anchor')}`;
    }
    if(variant==='face_pull'){
      const p={head:[63,19],shoulder:[65,39],hip:[66,77],knee:[67,106],ankle:[61,136],backKnee:[83,106],backAnkle:[90,136],elbow:end?[84,37]:[91,58],hand:end?[74,31]:[126,52],backElbow:end?[90,47]:[91,68],backHand:end?[80,42]:[126,63]};
      return floor+sideFigure(p,'rear_delt')+`<path class="iv-band" d="M${p.hand[0]} ${p.hand[1]} L154 52"/>${circle(154,52,4,'iv-anchor')}`;
    }
    if(variant==='rotation'){
      const left=end?103:57,right=end?119:73,p={head:[80,18],ls:[59,38],rs:[101,38],lh:[69,76],rh:[91,76],le:[left,56],re:[right,61],lhand:[left+5,70],rhand:[right+5,73],lk:[67,106],rk:[93,106],la:[62,136],ra:[98,136]};
      return floor+frontFigure(p,'core')+`<path class="iv-gear" d="M${p.rhand[0]} ${p.rhand[1]} L151 136"/>${circle(151,136,5,'iv-anchor')}`;
    }
    if(variant==='ham_walkout'){
      const p={head:[27,89],shoulder:[43,94],hip:[68,88],knee:end?[110,104]:[99,91],ankle:end?[143,134]:[126,134],backKnee:[105,108],backAnkle:[136,134],elbow:[43,116],hand:[61,128]};return floor+sideFigure(p,'ham_curl');
    }
    if(variant==='pullup'||variant==='lat_pulldown'){
      const high=end,p=variant==='lat_pulldown'?{head:[80,25],ls:[59,45],rs:[101,45],lh:[69,82],rh:[91,82],le:high?[53,61]:[48,27],re:high?[107,61]:[112,27],lhand:high?[62,67]:[58,9],rhand:high?[98,67]:[102,9],lk:[66,108],rk:[94,108],la:[59,136],ra:[101,136]}:{head:[80,high?36:62],ls:[59,high?51:77],rs:[101,high?51:77],lh:[70,high?86:112],rh:[90,high?86:112],le:[50,33],re:[110,33],lhand:[43,7],rhand:[117,7],lk:[67,high?110:128],rk:[93,high?110:128],la:[58,high?134:139],ra:[102,high?134:139]};
      const gear=variant==='lat_pulldown'?`<path class="iv-band" d="M${p.lhand[0]} ${p.lhand[1]} L80 5 L${p.rhand[0]} ${p.rhand[1]}"/>${circle(80,5,4,'iv-anchor')}`:barbell(28,7,132,7);return frontFigure(p,'pullup')+gear;
    }
    if(variant==='prone_pull'){
      const p={head:[28,91],shoulder:[45,98],hip:[83,104],knee:[115,111],ankle:[148,118],elbow:end?[54,77]:[29,67],hand:end?[76,76]:[14,57],backElbow:end?[60,86]:[34,76],backHand:end?[82,84]:[19,66]};
      return floor+sideFigure(p,'pullup');
    }
    if(variant==='pullover'||variant==='skull_crusher'){
      const p={head:[31,89],shoulder:[48,93],hip:[88,96],knee:[113,110],ankle:[132,136],backKnee:[103,112],backAnkle:[111,136],elbow:variant==='pullover'?(end?[58,57]:[30,55]):[67,55],hand:variant==='pullover'?(end?[72,43]:[16,40]):(end?[78,30]:[45,54]),backElbow:[78,57],backHand:end?[89,32]:[56,56]};return floor+bench(18,102,104)+sideFigure(p,variant==='pullover'?'lat_iso':'triceps')+dumbbell(p.hand[0],p.hand[1]);
    }
    return standardFront(variant,end,e);
  }

  const sideKeys=new Set(['hinge','split_squat','row','rear_delt','hip_thrust','ham_curl','bench']);
  const specialKeys=new Set(['pushup','pike_pushup','ab_wheel','plank','pallof','rotation','face_pull','ham_walkout','pullup','lat_pulldown','prone_pull','pullover','skull_crusher','arms']);
  function poseFor(variant,key,end,e){
    if(specialKeys.has(variant))return specialPose(variant,end,e);
    if(sideKeys.has(variant))return standardSide(variant,end,e);
    return standardFront(key,end,e);
  }

  const copy={
    squat:[['Tall + braced','Load over mid-foot'],['Controlled depth','Knees follow toes']],split_squat:[['Balanced stance','Front foot stays heavy'],['Lower vertically','Pelvis stays square']],hinge:[['Soft knees','Brace before moving'],['Hips travel back','Load stays close']],hip_thrust:[['Hips lowered','Ribs stay controlled'],['Glutes lock out','Torso and thighs align']],ham_curl:[['Leg lengthened','Hips stay quiet'],['Heel curls in','Squeeze hamstrings']],ham_walkout:[['Bridge position','Hips stay lifted'],['Heels walk out','Control each step']],calves:[['Heel lowered','Use full stretch'],['Rise tall','Pause at the top']],bench:[['Lower with control','Upper back stays set'],['Press to stack','Feet remain planted']],pushup:[['Body in one line','Hands under control'],['Chest lowers','Elbows track comfortably']],fly:[['Arms open','Keep a soft elbow'],['Hug inward','Chest drives the motion']],overhead_press:[['Load at shoulders','Ribs stay down'],['Stack overhead','Finish tall']],pike_pushup:[['Hips high','Hands stay planted'],['Head lowers forward','Press the floor away']],lateral_raise:[['Arms at sides','Use a light load'],['Elbows rise','Stop near shoulder height']],rear_delt:[['Arms hang long','Torso stays braced'],['Sweep arms wide','Keep neck relaxed']],face_pull:[['Reach toward anchor','Band stays taut'],['Pull toward face','Elbows finish wide']],row:[['Reach long','Torso stays fixed'],['Elbows to ribs','Pause the pull']],pullup:[['Active hang','Ribs stay controlled'],['Elbows pull down','Chest approaches bar']],lat_pulldown:[['Arms long','Band is secure'],['Elbows to ribs','Do not lean back']],prone_pull:[['Reach overhead','Body stays long'],['Pull elbows down','Squeeze the lats']],lat_iso:[['Arms long','Shoulders controlled'],['Hands sweep down','Elbows stay quiet']],pullover:[['Load behind head','Keep ribs controlled'],['Pull over chest','Use the lats']],curl:[['Arms long','Shoulders stay quiet'],['Curl cleanly','Lower slowly']],hammer_curl:[['Thumbs up','Upper arms stay still'],['Curl without turning','No body swing']],triceps:[['Elbows bent','Upper arms stay fixed'],['Straighten elbows','Control the finish']],pressdown:[['Elbows pinned','Band is secure'],['Hands press down','No torso swing']],skull_crusher:[['Elbows bent','Upper arms stay set'],['Extend the elbows','Do not flare wildly']],core:[['Brace first','Keep breathing'],['Move with control','Ribs and pelvis stay set']],ab_wheel:[['Kneel + brace','Wheel under shoulders'],['Reach only as able','No low-back sag']],pallof:[['Handle at chest','Square your hips'],['Press straight out','Resist rotation']],plank:[['Set a straight line','Elbows under shoulders'],['Hold tension','Breathe behind the brace']],rotation:[['Bar near center','Hips stay controlled'],['Rotate smoothly','Do not yank the bar']],arms:[['Movement A','Complete clean curl reps'],['Movement B','Then complete push-ups']]
  };

  function stageLabels(variant,key,exercise){
    if(variant==='arms'){
      const moves=String(exercise.name||'').split('+').map(x=>x.trim());
      return [[moves[0]||'Movement A','Complete clean reps'],[moves[1]||'Movement B','Then complete clean reps']];
    }
    return copy[variant]||copy[key]||copy.core;
  }

  function motionSvg(exercise,key){
    const variant=movementVariant(exercise,key),labels=stageLabels(variant,key,exercise),stage=(end,x)=>`<g transform="translate(${x} 35)">${poseFor(variant,key,end,exercise)}</g>`;
    return `<svg class="movement-svg" viewBox="0 0 380 205" role="img" aria-labelledby="iv-title-${esc(key)}" preserveAspectRatio="xMidYMid meet"><title id="iv-title-${esc(key)}">${esc(exercise.name)} start and finish position diagram</title><defs><marker id="iv-arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto"><path d="M0 0 L6 3 L0 6 Z" fill="#9ddf68"/></marker></defs><rect class="iv-card" x="4" y="4" width="178" height="188" rx="15"/><rect class="iv-card" x="198" y="4" width="178" height="188" rx="15"/><rect class="iv-pill" x="14" y="13" width="57" height="17" rx="8"/><text class="iv-label" x="42.5" y="24.5" text-anchor="middle">START</text><rect class="iv-pill" x="208" y="13" width="57" height="17" rx="8"/><text class="iv-label" x="236.5" y="24.5" text-anchor="middle">FINISH</text>${stage(false,12)}${stage(true,206)}<path class="iv-motion" d="M184 99 H196" marker-end="url(#iv-arrow)"/><text class="iv-motion-text" x="190" y="91" text-anchor="middle">MOVE</text></svg>`;
  }

  function equipmentLabel(exercise){
    const kind=gearKind(exercise),n=String(exercise.name||'').toLowerCase();
    if(kind==='landmine')return 'landmine bar path';if(kind==='barbell')return 'barbell position';if(kind==='dumbbell')return 'dumbbell position';if(kind==='band')return 'band or anchor line';if(/pull-up|chin-up/.test(n))return 'pull-up bar';if(n.includes('ab wheel'))return 'ab wheel';return 'body position';
  }

  function renderPanel(exercise){
    const guide=G()?.guideFor(exercise);if(!guide)return;
    const host=document.querySelector('#coach .section');if(!host)return;
    let panel=document.getElementById('exerciseGuidePanel');if(!panel){panel=document.createElement('div');panel.id='exerciseGuidePanel';panel.className='exercise-guide-panel';const q=host.querySelector('.section-head');if(q)q.insertAdjacentElement('beforebegin',panel);else host.prepend(panel)}
    const key=G().classify(exercise),variant=movementVariant(exercise,key),labels=stageLabels(variant,key,exercise);
    panel.innerHTML=`<div class="eyebrow">Movement guide</div><h2>${esc(exercise.name)}</h2><div class="guide-target">Targets ${esc(guide.muscles)} • ${esc(exercise.prescription||'')}</div><div class="guide-visual">${motionSvg(exercise,key)}<div class="guide-legend"><span><i class="legend-dot"></i>Working muscles</span><span><i class="legend-dot equipment"></i>${esc(equipmentLabel(exercise))}</span></div></div><div class="guide-stage-row">${labels.map((label,index)=>`<div class="guide-stage"><b>${index+1}</b><div><strong>${esc(label[0])}</strong><small>${esc(label[1])}</small></div></div>`).join('')}</div><div class="guide-columns"><div class="guide-block"><strong>How to do it</strong><ol>${guide.steps.map(x=>`<li>${esc(x)}</li>`).join('')}</ol></div><div class="guide-block"><strong>Best cues</strong><ul>${guide.cues.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><div class="guide-block"><strong>Setup</strong><ul>${guide.setup.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div><div class="guide-block"><strong>Avoid</strong><ul>${guide.mistakes.map(x=>`<li>${esc(x)}</li>`).join('')}</ul></div></div><div class="guide-actions"><a class="btn secondary" href="${guide.videoUrl}" target="_blank" rel="noopener noreferrer">▶ Video demos</a><button type="button" class="btn primary" id="askExerciseFollowup">Ask Coach about this</button></div><div class="guide-note">Use the diagram to understand the movement path, then use the written cues or a qualified demonstration to fine-tune your setup.</div>`;
    panel.querySelector('#askExerciseFollowup').addEventListener('click',()=>{const input=document.getElementById('coachInput');input?.focus();if(input&&!input.value)input.value=`I have a question about ${exercise.name}: `});return panel;
  }

  const baseOpen=window.openExerciseCoach;
  window.openExerciseCoach=function(index){
    const workout=typeof finalWorkout==='function'&&typeof activeUser==='function'?finalWorkout(activeUser()):[],exercise=workout[Number(index)];if(!exercise)return;
    window.__ironSixGuideFocus=true;if(typeof showView==='function')showView('coach');
    let tries=0;const timer=setInterval(()=>{tries++;if(document.querySelector('#coach .section')){clearInterval(timer);const panel=renderPanel(exercise);requestAnimationFrame(()=>panel?.scrollIntoView({behavior:'smooth',block:'start'}))}else if(tries>30)clearInterval(timer)},50);
    if(typeof baseOpen==='function')baseOpen(index);
  };

  window.IronSixVisualDebug={movementVariant,motionSvg,renderPanel};
})();
