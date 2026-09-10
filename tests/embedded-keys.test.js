// A Supabase anon key is a signed JWT, so a single corrupted character in the payload leaves a
// token that still looks entirely plausible — right length, right shape, right prefix — and is
// rejected by the server every single time.
//
// That is exactly what happened: api/verify-nomad-google.js carried a key whose payload read
// "supaase" instead of "supabase", with the header and signature byte-identical to the good
// copy. Nomad returned 401 to every verification, the bridge turned that into 401, and Google
// sign-in could never succeed. Eyeballing a 200-character token does not catch this. Decoding
// it does.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const decode=segment=>{
  const padded=segment+'='.repeat((4-segment.length%4)%4);
  return JSON.parse(Buffer.from(padded,'base64url').toString('utf8'));
};

function embeddedJwts(){
  const found=[];
  const roots=['.','api'];
  for(const dir of roots){
    for(const file of fs.readdirSync(dir)){
      const full=path.join(dir,file);
      if(!/\.(js|mjs|ts)$/.test(file)||!fs.statSync(full).isFile())continue;
      const source=fs.readFileSync(full,'utf8');
      for(const match of source.matchAll(/eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g))
        found.push({file:full,token:match[0]});
    }
  }
  return found;
}

test('every embedded JWT decodes to a well-formed Supabase key',()=>{
  const tokens=embeddedJwts();
  assert(tokens.length>0,'expected at least one embedded key to check');
  for(const {file,token} of tokens){
    const [header,payload]=token.split('.');
    let head,body;
    assert.doesNotThrow(()=>{head=decode(header);body=decode(payload)},`${file}: key is not decodable`);
    assert.equal(head.typ,'JWT',`${file}: header is not a JWT`);
    // The failure that shipped: one dropped character inside the payload.
    assert.equal(body.iss,'supabase',`${file}: issuer is "${body.iss}" — the key payload is corrupted`);
    assert.match(String(body.ref||''),/^[a-z]{20}$/,`${file}: project ref "${body.ref}" is malformed`);
    assert(['anon','service_role'].includes(body.role),`${file}: unexpected role "${body.role}"`);
    assert(Number(body.exp)>Date.now()/1000,`${file}: key has expired`);
  }
});

test('the same project key is byte-identical everywhere it is embedded',()=>{
  const byRef=new Map();
  for(const {file,token} of embeddedJwts()){
    const ref=decode(token.split('.')[1]).ref;
    if(!byRef.has(ref))byRef.set(ref,[]);
    byRef.get(ref).push({file,token});
  }
  for(const [ref,copies] of byRef){
    const distinct=new Set(copies.map(c=>c.token));
    assert.equal(distinct.size,1,
      `project ${ref} has ${distinct.size} different keys across ${copies.map(c=>c.file).join(', ')} — one of them is wrong`);
  }
});

test('the Nomad verifier and the auth-status probe agree on the Nomad key',()=>{
  const keyIn=file=>(fs.readFileSync(file,'utf8').match(/NOMAD_KEY\s*=\s*'([^']+)'/)||[])[1];
  const verifier=keyIn('api/verify-nomad-google.js'), status=keyIn('api/auth-status.js');
  assert(verifier&&status,'both files must embed a Nomad key');
  assert.equal(verifier,status,'the Google bridge verifies against Nomad with this key; a mismatch means every sign-in is rejected');
});
