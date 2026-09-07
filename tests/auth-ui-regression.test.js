// Regression coverage for the account surface: provider discovery must work on every
// origin the app ships to, the submitted action must come from declared state rather
// than a button label, and the workout card must keep the set table above the demo.
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

const PROD='https://iron-six-training.vercel.app';
const flush=()=>new Promise(r=>setTimeout(r,0));

function socialDom(url,fetchImpl){
  const dom=new JSDOM(`<!doctype html><body>
    <div id="accountTabs"></div>
    <button id="accountSubmit">Sign in</button>
  </body>`,{url,runScripts:'outside-only'});
  const w=dom.window;
  if(!w.AbortSignal.timeout)w.AbortSignal.timeout=()=>undefined;
  w.fetch=fetchImpl;
  w.eval(fs.readFileSync('social-auth.js','utf8'));
  w.IronSixSocialAuth.install({
    client:{auth:{}},config:{url:'https://stub.supabase.co',publishableKey:'k'},
    session:()=>null,isBusy:()=>false,setBusy(){},saveLocal:()=>true,notify(){}
  });
  return dom;
}
const okStatus=()=>({ok:true,status:200,json:async()=>({iron:{github:true},nomad:{google:true}})});

test('provider discovery asks this origin first so previews and native builds work',async()=>{
  const urls=[];
  const dom=socialDom('https://preview-abc.vercel.app/',async u=>{urls.push(String(u));return okStatus()});
  await flush();await flush();
  assert.equal(urls[0],'/api/auth-status','the first attempt must be same-origin, not a hardcoded host');
  assert(!urls[0].startsWith('http'),'a same-origin request must stay relative so the native bridge can rewrite it');
  const w=dom.window;
  assert.equal(w.document.getElementById('socialAvailability').textContent,'','a successful lookup must not show an error');
  assert.equal(w.document.getElementById('social-github').hidden,false,'an enabled provider must be offered');
  dom.window.close();
});

test('provider discovery falls back to production for static hosts with no API routes',async()=>{
  const urls=[];
  const dom=socialDom('https://j-nut.github.io/',async u=>{
    urls.push(String(u));
    if(String(u).startsWith('/'))return {ok:false,status:404,json:async()=>({})};
    return okStatus();
  });
  await flush();await flush();
  assert.equal(urls[0],'/api/auth-status');
  assert.equal(urls[1],PROD+'/api/auth-status','a static host must still reach the production settings endpoint');
  assert.equal(dom.window.document.getElementById('social-github').hidden,false);
  dom.window.close();
});

test('a total discovery failure degrades to email sign-in instead of throwing',async()=>{
  const dom=socialDom('https://preview-abc.vercel.app/',async()=>{throw Error('offline')});
  await flush();await flush();
  const text=dom.window.document.getElementById('socialAvailability').textContent;
  assert.match(text,/Email sign-in still works/,'email sign-in must remain offered when discovery fails');
  dom.window.close();
});

function hardenedDom(client,{label,declared}){
  const dom=new JSDOM(`<!doctype html><body>
    <p id="accountStatus"></p>
    <form id="accountForm">
      <input id="accountEmail" type="email" value="person@example.com">
      <input id="accountPassword" type="password">
      <input id="accountConfirm" type="password">
      <button id="accountSubmit" type="submit">${label}</button>
    </form></body>`,{url:'https://localhost',runScripts:'outside-only'});
  const w=dom.window;
  w.IronSixCloud={client:()=>client};
  if(declared)w.document.getElementById('accountForm').dataset.authMode=declared;
  w.eval(fs.readFileSync('auth-hardening.js','utf8'));
  return dom;
}

test('the submitted action comes from declared state, not the button label',async()=>{
  const calls=[];
  const client={auth:{
    signInWithPassword:async v=>{calls.push(['login',v]);return {data:{session:{}},error:null}},
    resetPasswordForEmail:async(email,options)=>{calls.push(['reset',{email,options}]);return {data:{},error:null}}
  }};
  // A stale or relabelled button must never turn a password reset into a sign-in.
  const dom=hardenedDom(client,{label:'Sign in',declared:'reset'}),w=dom.window;
  w.document.getElementById('accountForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await flush();
  assert.equal(calls.length,1);
  assert.equal(calls[0][0],'reset','the declared mode must win over the visible label');
  assert.equal(calls[0][1].options.redirectTo,PROD+'/?auth=email','email callbacks stay on production HTTPS');
  dom.window.close();
});

test('an unknown declared mode still falls back to the label map',async()=>{
  const calls=[];
  const client={auth:{signInWithPassword:async v=>{calls.push(v);return {data:{session:{}},error:null}}}};
  const dom=hardenedDom(client,{label:'Sign in',declared:'not-a-mode'}),w=dom.window;
  w.document.getElementById('accountPassword').value='correct horse battery';
  w.document.getElementById('accountForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await flush();
  assert.equal(calls.length,1,'an unrecognised mode must not block sign-in');
  dom.window.close();
});

test('the account UI publishes its mode and marks the matching tab',()=>{
  const source=fs.readFileSync('cloud-sync.js','utf8');
  assert(source.includes("dataset.authMode=mode"),'renderAccount must publish the active mode for the hardened handler');
  assert(source.includes("classList.toggle('is-active'"),'the active auth mode must be marked in the UI');
  assert(source.includes('preventScroll:true'),'opening the sheet must not scroll its own heading out of view');
  const polish=fs.readFileSync('account-polish.js','utf8');
  assert(!polish.includes("btn.className='account-mode-link'"),'polish must not overwrite classes the account UI sets');
});

test('the workout card keeps the set table above the demonstration',()=>{
  const css=fs.readFileSync('style.css','utf8');
  assert(/\.exercise\{display:flex;flex-direction:column\}/.test(css),'the card must be a flex column so it can be reordered');
  assert(/\.sets\{order:1\}/.test(css),'sets must render before the media block');
  assert(/\.exercise-media,\.exercise-media-missing\{order:2\}/.test(css),'media must render after the sets');
  // The legacy compact rule used to outrank the motion stage and left dead space in
  // every demo. It must stay scoped to the frame grid it was written for.
  assert(!/\.exercise-media\.compact img\{/.test(css),'the compact rule must not target every image');
  assert(css.includes('.exercise-media.compact .exercise-media-frames img{height:150px}'),'compact sizing stays scoped to the frame grid');
  assert(css.includes('.motion-stage img'),'the motion stage must size its own frames');
});
