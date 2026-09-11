// Deterministic synthetic lifter for camera tests: a 3D stick figure (metres; x = the lifter's left,
// y = up, z = forward) rotated to a camera yaw and projected the way MediaPipe reports landmarks —
// x/y normalised to the frame, z on the x scale, far-side joints less visible. Yaw 0 faces the
// camera, 90 is a side view, 180 faces away.
const ASPECT=9/16,SCALE=0.4;
function rng(seed=1){let a=seed>>>0;return()=>{a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296}}
const lerp=(a,b,f)=>a+(b-a)*f,lerp3=(a,b,f)=>({x:lerp(a.x,b.x,f),y:lerp(a.y,b.y,f),z:lerp(a.z,b.z,f)}),add=(a,b)=>({x:a.x+b.x,y:a.y+b.y,z:a.z+b.z});
const ARMS=[[11,13,15,1],[12,14,16,-1]];

function body({pitch=0}={}){
  const c=Math.cos(pitch*Math.PI/180),s=Math.sin(pitch*Math.PI/180),torso=(x,up)=>({x,y:up*c,z:up*s});
  return {0:add(torso(0,0.74),{x:0,y:-0.10*s,z:0.10*c}),11:torso(0.20,0.52),12:torso(-0.20,0.52),23:{x:0.14,y:0,z:0},24:{x:-0.14,y:0,z:0},25:{x:0.13,y:-0.45,z:0.03},26:{x:-0.13,y:-0.45,z:0.03},27:{x:0.13,y:-0.88,z:0},28:{x:-0.13,y:-0.88,z:0}};
}
function hangArms(b){for(const [sh,el,wr,s] of ARMS){b[el]=add(b[sh],{x:s*0.03,y:-0.30,z:0});b[wr]=add(b[sh],{x:s*0.04,y:-0.57,z:0.02})}return b}
function standing(){return hangArms(body())}
// Hip hinge: pitch 0 is standing tall, 85 is a torso near parallel. Arms hang from the shoulders.
function hinge(pitch){return hangArms(body({pitch}))}

// Press keyframes relative to the shoulder (x mirrored per side): rack, mid-press, lockout.
const BARBELL=[{el:{x:0.05,y:-0.19,z:0.23},wr:{x:0.06,y:0.06,z:0.15}},{el:{x:0.14,y:0.02,z:0.12},wr:{x:0.12,y:0.30,z:0.08}},{el:{x:0.09,y:0.29,z:0.03},wr:{x:0.12,y:0.56,z:0.02}}];
const DUMBBELL=[{el:{x:0.25,y:-0.02,z:0.02},wr:{x:0.26,y:0.22,z:0.03}},{el:{x:0.20,y:0.14,z:0.02},wr:{x:0.18,y:0.41,z:0.02}},{el:{x:0.04,y:0.30,z:0.02},wr:{x:0.06,y:0.57,z:0.02}}];
function key(frames,p){return p<=0.5?lerp3(frames[0],frames[1],p/0.5):lerp3(frames[1],frames[2],(p-0.5)/0.5)}
// p: 0 rack .. 1 lockout. bend: 0 straight lockout .. 1 a soft lockout (~150 deg projected face-on).
// rackLift: raises the rack position (bar at the chin rather than the collarbone).
function press(p,{grip=BARBELL,bend=0,rackLift=0}={}){
  const b=body();
  for(const [sh,el,wr,s] of ARMS){
    const e=key(grip.map(k=>k.el),p),w=key(grip.map(k=>k.wr),p);
    e.x+=0.05*bend*p*p;w.y+=rackLift*(1-p);e.y+=rackLift*(1-p)*0.5;
    b[el]=add(b[sh],{x:s*e.x,y:e.y,z:e.z});b[wr]=add(b[sh],{x:s*w.x,y:w.y,z:w.z});
  }
  return b;
}
function mix(a,b,f){const out={};for(const k of Object.keys(a))out[k]=lerp3(a[k],b[k],f);return out}

function frame(points,{yaw=0,aspect=ASPECT,scale=SCALE,cx=0.5,cy=0.62,noise=0,rand=Math.random,farVisibility=null}={}){
  const r=yaw*Math.PI/180,c=Math.cos(r),s=Math.sin(r),j=()=>noise?(rand()*2-1)*noise:0;
  const lm=Array.from({length:33},()=>({x:cx,y:cy,z:0,visibility:0.02,presence:0.02}));
  for(const [k,p] of Object.entries(points)){
    const i=Number(k),qx=p.x*c+p.z*s,qz=-p.x*s+p.z*c;
    let v=i===0?(qz>0?0.95:0.1):Math.max(0.35,Math.min(0.95,0.95+Math.min(0,qz)*2.5));
    if(farVisibility!==null&&i!==0&&qz<-0.1)v=farVisibility;
    lm[i]={x:cx+qx*scale/aspect+j(),y:cy-p.y*scale+j(),z:-qz*scale/aspect,visibility:v,presence:0.99};
  }
  return lm;
}

// Piecewise progress timeline. segments: [[ms, from, to], ...] with cosine easing inside each.
function timeline(segments,fps=24,t0=0){
  const out=[],dt=1000/fps;let start=t0,t=t0;
  for(const [ms,from,to] of segments){const end=start+ms;for(;t<end;t+=dt){const f=ms?(t-start)/ms:1;out.push({t,p:from+(to-from)*(1-Math.cos(Math.PI*f))/2})}start=end}
  return out;
}
// One press rep: settle in the rack, press, lockout pause, lower, reset.
const pressRep=[[800,0,0],[850,0,1],[250,1,1],[1000,1,0],[450,0,0]];

module.exports={ASPECT,SCALE,rng,body,standing,hinge,press,mix,frame,timeline,pressRep,BARBELL,DUMBBELL};
