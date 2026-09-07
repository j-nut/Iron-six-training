const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const {JSDOM}=require('jsdom');

function setup(client){
  const dom=new JSDOM(`<!doctype html><body>
    <p id="accountStatus"></p>
    <form id="accountForm">
      <input id="accountEmail" type="email">
      <input id="accountPassword" type="password">
      <input id="accountConfirm" type="password">
      <button id="accountSubmit" type="submit">Sign in</button>
    </form>
  </body>`,{url:'https://localhost',runScripts:'outside-only'});
  dom.window.IronSixCloud={client:()=>client};
  dom.window.IronSixNative={redirectTo:'com.ironsix.training://auth/callback'};
  dom.window.eval(fs.readFileSync('auth-hardening.js','utf8'));
  return dom;
}

const flush=()=>new Promise(resolve=>setImmediate(resolve));
const PROD_REDIRECT='https://iron-six-training.vercel.app/?auth=email';

test('email/password sign in submits to Supabase and reports success',async()=>{
  const calls=[];
  const client={auth:{signInWithPassword:async value=>{calls.push(value);return {data:{session:{user:{id:'u1'}}},error:null}}}};
  const dom=setup(client),w=dom.window;
  w.document.getElementById('accountEmail').value='person@example.com';
  w.document.getElementById('accountPassword').value='correct horse battery staple';
  w.document.getElementById('accountForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await flush();
  assert.equal(calls.length,1);
  assert.equal(calls[0].email,'person@example.com');
  assert.equal(calls[0].password,'correct horse battery staple');
  assert.match(w.document.getElementById('accountStatus').textContent,/Signed in/);
  dom.window.close();
});

test('account creation uses production HTTPS rather than a localhost or native email callback',async()=>{
  const calls=[];
  const client={auth:{signUp:async value=>{calls.push(value);return {data:{user:{identities:[]},session:null},error:null}}}};
  const dom=setup(client),w=dom.window;
  w.document.getElementById('accountSubmit').textContent='Create account';
  w.document.getElementById('accountEmail').value='existing@example.com';
  w.document.getElementById('accountPassword').value='twelve characters plus';
  w.document.getElementById('accountConfirm').value='twelve characters plus';
  w.document.getElementById('accountForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await flush();
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.emailRedirectTo,PROD_REDIRECT);
  assert(!calls[0].options.emailRedirectTo.includes('localhost'));
  assert(!calls[0].options.emailRedirectTo.startsWith('com.ironsix.training:'));
  assert.match(w.document.getElementById('accountStatus').textContent,/already exists/i);
  dom.window.close();
});

test('password recovery always requests the production Iron Six redirect',async()=>{
  const calls=[];
  const client={auth:{resetPasswordForEmail:async(email,options)=>{calls.push({email,options});return {data:{},error:null}}}};
  const dom=setup(client),w=dom.window;
  w.document.getElementById('accountSubmit').textContent='Send password reset';
  w.document.getElementById('accountEmail').value='person@example.com';
  w.document.getElementById('accountForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await flush();
  assert.equal(calls.length,1);
  assert.equal(calls[0].options.redirectTo,PROD_REDIRECT);
  assert(!calls[0].options.redirectTo.includes('localhost'));
  assert.match(w.document.getElementById('accountStatus').textContent,/Password-reset email sent/);
  dom.window.close();
});

test('magic-link sign-in uses the same production email callback and cannot create users',async()=>{
  const calls=[];
  const client={auth:{signInWithOtp:async value=>{calls.push(value);return {data:{},error:null}}}};
  const dom=setup(client),w=dom.window;
  w.document.getElementById('accountSubmit').textContent='Send sign-in link';
  w.document.getElementById('accountEmail').value='person@example.com';
  w.document.getElementById('accountForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await flush();
  assert.equal(calls[0].options.emailRedirectTo,PROD_REDIRECT);
  assert.equal(calls[0].options.shouldCreateUser,false);
  dom.window.close();
});

test('auth hardening blocks mismatched signup passwords before the network call',async()=>{
  let called=false;
  const client={auth:{signUp:async()=>{called=true;return {data:{},error:null}}}};
  const dom=setup(client),w=dom.window;
  w.document.getElementById('accountSubmit').textContent='Create account';
  w.document.getElementById('accountEmail').value='new@example.com';
  w.document.getElementById('accountPassword').value='twelve characters plus';
  w.document.getElementById('accountConfirm').value='does not match at all';
  w.document.getElementById('accountForm').dispatchEvent(new w.Event('submit',{bubbles:true,cancelable:true}));
  await flush();
  assert.equal(called,false);
  assert.match(w.document.getElementById('accountStatus').textContent,/matching passwords/i);
  dom.window.close();
});
