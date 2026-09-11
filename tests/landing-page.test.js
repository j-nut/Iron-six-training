// The landing page makes promises to people who have not opened the app yet. The failures that
// matter here are commercial ones: quoting a price that is no longer true, or advertising a
// feature a visitor could not find after paying. Both are cheap to guard and expensive to ship.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync('welcome.html','utf8');
const text=html.replace(/<style[\s\S]*?<\/style>/g,' ').replace(/<[^>]+>/g,' ').replace(/&mdash;/g,'—').replace(/\s+/g,' ');

test('the page quotes the current price and never calls the app free',()=>{
  assert.match(text,/\$1\.99 a month/,'the monthly price must be on the page');
  assert.match(text,/\$20 a year|\$20 \b/,'the yearly price must be on the page');
  assert.equal(/\bfree\b/i.test(text),false,'Iron Six is paid — nothing on the page may say otherwise');
  assert.equal(/\bfree\b/i.test(html.match(/<meta name="description"[^>]*>/)[0]),false,'the search-result snippet must not say free either');
});

test('the yearly price is actually cheaper than twelve months',()=>{
  const monthly=1.99,yearly=20;
  assert(yearly<monthly*12,'a yearly plan that costs more than monthly is a bug in the offer');
  assert.match(text,/about \$1\.67 a month/,'the per-month equivalent must match 20/12');
  assert.equal(Math.round(yearly/12*100)/100,1.67);
});

test('opt-in features are labelled as opt-in, not as things that just work',()=>{
  // pose-spike.js refuses to start unless ironSixPoseSpike is set. Describing the camera and
  // voice features as always-on would be a promise the app does not keep.
  const spike=fs.readFileSync('pose-spike.js','utf8');
  assert.match(spike,/if\(!readFlag\(\)\)return/,'this test exists because the camera spike is flag-gated');
  for(const feature of ['Camera','Voice'])
    assert.match(text,new RegExp(feature+' beta'),feature+' is gated, so the page must mark it beta');
  assert.match(text,/opt-in/,'the page must say these are opt-in');
});

test('every asset the page points at exists',()=>{
  for(const [,src] of html.matchAll(/(?:src|href)="((?!https?:|#|\.\/|mailto:)[^"]+)"/g))
    assert(fs.existsSync(path.join('.',src)),'missing asset: '+src);
});

test('the markup is balanced — an unclosed wrapper silently breaks the layout',()=>{
  const open=(html.match(/<div\b/g)||[]).length,close=(html.match(/<\/div>/g)||[]).length;
  assert.equal(open,close,'unbalanced <div> in welcome.html');
  assert.equal((html.match(/<section\b/g)||[]).length,(html.match(/<\/section>/g)||[]).length);
  assert.equal(/class="[a-z-]+ style="/.test(html),false,'a quote was dropped inside a class attribute');
});

test('the app is reachable from the page and the page from the app',()=>{
  assert.match(html,/href="\.\/"/,'the landing page must link into the app');
  assert.match(fs.readFileSync('index.html','utf8'),/href="welcome"/,'the app must link back to the pitch');
});
