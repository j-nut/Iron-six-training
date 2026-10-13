// Feature preferences from onboarding: music, camera, voice and sounds. A missing preference must
// leave today's behaviour untouched, and nothing may break when a browser lacks the feature.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {JSDOM} = require('jsdom');

function app(configure) {
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), {url: 'https://iron-six.test/', runScripts: 'outside-only', pretendToBeVisual: true});
  const w = dom.window, context = dom.getInternalVMContext(), errors = [];
  w.confirm = () => true; w.setInterval = () => 0; w.scrollTo = () => {};
  w.HTMLElement.prototype.scrollIntoView = function () {};
  w.URL.createObjectURL = () => 'blob:test';
  w.fetch = async () => ({ok: false, json: async () => ({})});
  w.addEventListener('error', event => errors.push(event.error));
  if (configure) configure(w);
  for (const file of [...w.document.scripts].map(s => s.getAttribute('src').split('?')[0]).filter(x => !['cloud-sync.js', 'cloud-history-sync.js'].includes(x)))
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: file});
  const run = code => vm.runInContext(code, context);
  run("window.toast=function(){};activeUser().trainingMode='traditional';activeUser().today={};activeUser().program.currentWorkoutKey='lower_strength';saveData();renderAll()");
  run("document.getElementById('sessionBeginBtn').click()");
  return {w, run, errors, close: () => dom.window.close()};
}
const withCamera = w => Object.defineProperty(w.navigator, 'mediaDevices', {value: {getUserMedia: () => new Promise(() => {})}, configurable: true});
const tick = () => new Promise(r => setTimeout(r, 15));
const setPrefs = async (a, prefs) => { a.run(`activeUser().preferences=${JSON.stringify(prefs)};renderAll()`); await tick(); };
const bars = a => a.w.document.querySelectorAll('.pose-bar').length;
const openSquat = a => a.w.IronSixPoseSpike.open(a.w.document.querySelector('.pose-bar').closest('[data-exercise-index]'), {name: 'Bodyweight squat', base: 'squat'});

test('camera preference: true turns rep counting on without the URL flag, false and missing leave it off', async () => {
  const missing = app(withCamera);
  try { assert.equal(missing.w.IronSixPoseSpike, undefined); assert.equal(bars(missing), 0); } finally { missing.close(); }
  const off = app(withCamera);
  try { await setPrefs(off, {camera: false}); assert.equal(off.w.IronSixPoseSpike, undefined); assert.equal(bars(off), 0); } finally { off.close(); }
  const on = app(withCamera);
  try {
    assert.equal(on.w.IronSixPoseSpike, undefined, 'nothing loads before the preference says so');
    await setPrefs(on, {camera: true});
    assert(on.w.IronSixPoseSpike, 'camera assistant is available from the preference alone');
    assert(bars(on) > 0);
    assert.equal(on.w.document.querySelector('.pose-open').textContent, 'Camera + form + voice');
    await setPrefs(on, {camera: false});
    assert.equal(bars(on), 0, 'turning the preference off hides the controls again');
  } finally { on.close(); }
});

test('camera preference needs a real camera API and never breaks when it is missing', async () => {
  const a = app();
  try { await setPrefs(a, {camera: true}); assert.equal(a.w.IronSixPoseSpike, undefined); assert.equal(bars(a), 0); assert.deepEqual(a.errors, []); } finally { a.close(); }
});

test('a stored developer flag keeps working, and a false preference still hides the controls', async () => {
  const a = app(w => { withCamera(w); w.localStorage.setItem('ironSixPoseSpike', '1'); });
  try {
    assert(a.w.IronSixPoseSpike, 'stored flag with no preference behaves as before');
    assert(bars(a) > 0);
    await setPrefs(a, {camera: false});
    assert.equal(bars(a), 0);
  } finally { a.close(); }
});

test('voice preference hides the voice controls and the camera sheet respects it', async () => {
  const a = app(withCamera);
  try {
    await setPrefs(a, {camera: true, voice: false});
    assert.equal(a.w.document.querySelector('.pose-open').textContent, 'Camera + form');
    openSquat(a);
    assert.equal(a.w.document.getElementById('poseVoice').hidden, true);
    a.w.IronSixPoseSpike.startVoice();
    assert.match(a.w.document.getElementById('poseVoiceState').textContent, /off/i);
    a.w.IronSixPoseSpike.close();
  } finally { a.close(); }
  const offered = app(withCamera);
  try {
    await setPrefs(offered, {camera: true, voice: true});
    openSquat(offered);
    assert.equal(offered.w.document.getElementById('poseVoice').hidden, false, 'voice true keeps voice offered');
    offered.w.IronSixPoseSpike.close();
  } finally { offered.close(); }
});

async function music(prefs) {
  const dom = new JSDOM('<div id="today"><div class="section"></div></div>', {url: 'https://iron-six.test/', runScripts: 'outside-only'});
  const w = dom.window, context = dom.getInternalVMContext(), fetches = [], plays = [];
  w.HTMLMediaElement.prototype.play = function () { plays.push(this.src); return Promise.resolve(); };
  w.HTMLMediaElement.prototype.pause = function () {};
  w.fetch = async url => { fetches.push(String(url)); return {ok: true, json: async () => ({tracks: [{title: 'T', artist: 'A', stream: 'https://example.test/t.mp3'}], providers: []})}; };
  w.activeUser = () => ({preferences: prefs});
  vm.runInContext(fs.readFileSync('music.js', 'utf8'), context);
  await tick();
  return {w, fetches, plays};
}
const musicCard = m => m.w.document.querySelector('#workoutMusic .music-card');
const optIn = m => m.w.document.getElementById('musicOptIn');

test('music preference off: nothing loads or plays until the user opts in', async () => {
  const m = await music({music: false});
  assert.equal(musicCard(m).hidden, true);
  assert.equal(optIn(m).hidden, false);
  await m.w.IronSixMusic.loadRadio(true);
  m.w.document.querySelector('[data-music-station]').click();
  m.w.document.querySelector('[data-music-play]').click();
  await new Promise(r => setTimeout(r, 20));
  assert.deepEqual(m.fetches, [], 'no request while music is off');
  assert.deepEqual(m.plays, []);
  m.w.document.querySelector('[data-music-optin]').click();
  assert.equal(musicCard(m).hidden, false);
  assert.equal(optIn(m).hidden, true);
  await m.w.IronSixMusic.loadRadio(false);
  assert.equal(m.fetches.length, 1, 'works once the user opts in');
  assert.equal(m.w.localStorage.getItem('ironSixMusicOptIn'), '1');
});

test('music preference on or missing keeps the existing behaviour', async () => {
  for (const prefs of [undefined, {}, {music: true}]) {
    const m = await music(prefs);
    assert.equal(musicCard(m).hidden, false);
    assert.equal(optIn(m).hidden, true);
    await m.w.IronSixMusic.loadRadio(false);
    assert.equal(m.fetches.length, 1);
  }
});

function circuitApp(prefs) {
  let contexts = 0;
  const a = app(w => {
    w.AudioContext = class {
      constructor() { contexts++; this.state = 'running'; this.currentTime = 0; this.destination = {}; }
      resume() { return Promise.resolve(); }
      createOscillator() { return {frequency: {}, connect() {}, start() {}, stop() {}, disconnect() {}}; }
      createGain() { return {gain: {setValueAtTime() {}, exponentialRampToValueAtTime() {}}, connect() {}, disconnect() {}}; }
    };
  });
  a.run(`activeUser().trainingMode='circuit';activeUser().preferences=${JSON.stringify(prefs)};renderAll()`);
  return {a, contexts: () => contexts};
}

test('sounds preference off keeps circuit cues silent; missing keeps them on', async () => {
  const silent = circuitApp({sounds: false});
  try {
    const button = silent.a.w.document.getElementById('circuitSound');
    assert.equal(button.textContent, 'Sound off');
    assert.equal(button.getAttribute('aria-pressed'), 'false');
    silent.a.w.document.getElementById('circuitStart').click();
    await new Promise(r => setTimeout(r, 30));
    assert.equal(silent.contexts(), 0, 'no audio context is created for a silent profile');
    button.click();
    assert.equal(button.textContent, 'Sound on', 'the user can still opt in');
  } finally { silent.a.close(); }
  const normal = circuitApp(undefined);
  try {
    assert.equal(normal.a.w.document.getElementById('circuitSound').textContent, 'Sound on');
    normal.a.w.document.getElementById('circuitStart').click();
    await new Promise(r => setTimeout(r, 30));
    assert.equal(normal.contexts(), 1);
  } finally { normal.a.close(); }
});
