// Optional visual check; run from the repository root with Playwright available externally.
// Uses an isolated browser context and synthetic local history. Does not sign in or sync.
// Example: NODE_PATH=/path/to/node_modules IRON_MARKS_CHROMIUM=/path/to/chromium node scripts/verify-iron-marks-depth.cjs
const {chromium}=require('playwright');
const fs=require('fs'),assert=require('node:assert/strict');
(async()=>{
const server=require('http').createServer((req,res)=>{const path=require('path').resolve(process.cwd(),'.'+decodeURIComponent(req.url.split('?')[0]==='/'?'/index.html':req.url.split('?')[0]));if(!path.startsWith(process.cwd()+'/')){res.statusCode=403;res.end();return;}try{res.setHeader('Content-Type',path.endsWith('.js')?'application/javascript':path.endsWith('.css')?'text/css':path.endsWith('.html')?'text/html':'application/octet-stream');res.end(fs.readFileSync(path))}catch{res.statusCode=404;res.end()}}).listen(5178,'127.0.0.1');
const browser=await chromium.launch({executablePath:process.env.IRON_MARKS_CHROMIUM || undefined,args:['--no-sandbox','--disable-gpu','--disable-dev-shm-usage','--no-zygote','--single-process'],headless:true});
fs.mkdirSync('reports/iron-marks-depth',{recursive:true});
const page=await browser.newPage({viewport:{width:375,height:812}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto('http://127.0.0.1:5178');await page.waitForFunction(()=>window.IronSixMarks);
await page.evaluate(()=>{
 const u=activeUser(),R=IronSixMarksEngine.ROTATION,D=864e5,now=Date.now();u.history=Array.from({length:30},(_,i)=>({ts:now-(30-i)*2*D,workoutKey:R[i%6],sets:10,plannedSets:10,readiness:{energy:4,soreness:1},details:[{name:'Dumbbell Bench Press',base:'Horizontal push',seedKey:'bench',sets:Array.from({length:10},()=>({weight:'40',reps:String(i<2?8:i<14?9:10),rir:'2',done:true}))}]})).reverse();u.program.currentWorkoutKey='lower_b';u.today={};u.trainerMemory.achievements={version:2,introduced:true,emblem:'hex',seen:IronSixMarksEngine.evaluate(u).marks.filter(m=>m.unlocked).map(m=>m.id)};saveData();renderAll();IronSixMarks.renderGoal();
});
await page.screenshot({path:'reports/iron-marks-depth/today-mobile.png'});
console.log('Today goal',await page.locator('#ironMarksGoal').innerText());
const begin=await page.locator('#sessionBeginBtn').boundingBox();console.log('Begin visible',begin.y+begin.height<812);assert(begin.y+begin.height<812);
await page.locator('#ironMarksGoal').click();
assert.equal(await page.locator('#ironMarksModal .im-modal').evaluate(e=>e.scrollWidth>e.clientWidth),false);
await page.screenshot({path:'reports/iron-marks-depth/collection-mobile.png'});
await page.locator('[data-custom="ring"]').selectOption('none');
console.log('ring none',await page.locator('#imAvatarPreview').getAttribute('data-ring'));
await page.locator('[data-custom="detail"]').selectOption('2');
await page.locator('[data-custom="title"]').selectOption('progress_maker');
console.log('saved preferences',await page.evaluate(()=>({ring:activeUser().trainerMemory.achievements.ring,detail:activeUser().trainerMemory.achievements.detail,title:activeUser().trainerMemory.achievements.title})));
await page.locator('[data-custom="ring"]').evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:'reports/iron-marks-depth/customization-mobile.png'});
await page.getByText('Your training story',{exact:true}).evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:'reports/iron-marks-depth/block-mobile.png'});
await page.getByText('Personal progress · 2 confirmed',{exact:true}).click();
await page.getByText('Personal progress · 2 confirmed',{exact:true}).evaluate(e=>e.scrollIntoView({block:'start'}));await page.screenshot({path:'reports/iron-marks-depth/evidence-mobile.png'});
await page.keyboard.press('Escape');await page.reload();await page.waitForFunction(()=>window.IronSixMarks);assert.equal(await page.evaluate(()=>activeUser().trainerMemory.achievements.title),'progress_maker');
await page.evaluate(()=>IronSixMarks.open());await page.setViewportSize({width:1200,height:900});await page.screenshot({path:'reports/iron-marks-depth/collection-desktop.png'});
assert.deepEqual(errors,[]);console.log('Browser checks passed');
await browser.close();server.close();
})().catch(e=>{console.error(e);process.exit(1)});
