// Wearable Core pins the pure-logic layer: BLE packet parsing, the live buffer, downsampling,
// set/HR alignment, daily readiness math and watch-export file parsing. No DOM/network/timers.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const {JSDOM} = require('jsdom');
const core = require('../wearable-core.js');

function u8(...bytes) { return Uint8Array.from(bytes); }

// ---- parseHeartRateMeasurement ----------------------------------------------------------------

test('uint8 bpm, no optional fields', () => {
  const r = core.parseHeartRateMeasurement(u8(0x00, 72));
  assert.deepEqual(r, {bpm: 72, contactDetected: null, energyKJ: null, rrIntervalsMs: null});
});

test('uint16 LE bpm', () => {
  const r = core.parseHeartRateMeasurement(u8(0x01, 0xc8, 0x00)); // 200
  assert.equal(r.bpm, 200);
});

test('sensor contact states: unsupported, detected false, detected true', () => {
  assert.equal(core.parseHeartRateMeasurement(u8(0x00, 70)).contactDetected, null); // bits 00
  assert.equal(core.parseHeartRateMeasurement(u8(0x02, 70)).contactDetected, null); // bits 01 -> not supported
  assert.equal(core.parseHeartRateMeasurement(u8(0x04, 70)).contactDetected, false); // bits 10
  assert.equal(core.parseHeartRateMeasurement(u8(0x06, 70)).contactDetected, true); // bits 11
});

test('energy expended present (uint16 LE, kJ)', () => {
  const r = core.parseHeartRateMeasurement(u8(0x08, 70, 0x2c, 0x01)); // 300 kJ
  assert.equal(r.energyKJ, 300);
});

test('single RR interval converted from 1/1024s to rounded ms', () => {
  const r = core.parseHeartRateMeasurement(u8(0x10, 70, 0x00, 0x04)); // 1024 -> 1000ms
  assert.deepEqual(r.rrIntervalsMs, [1000]);
});

test('multiple RR intervals, plus energy, plus uint16 bpm together', () => {
  const bytes = u8(
    0x01 | 0x08 | 0x10, // uint16 bpm, energy, RR present
    0x64, 0x00,         // bpm 100
    0x0a, 0x00,         // energy 10 kJ
    0x00, 0x02,         // RR 512 -> 500ms
    0x00, 0x04          // RR 1024 -> 1000ms
  );
  const r = core.parseHeartRateMeasurement(bytes);
  assert.equal(r.bpm, 100);
  assert.equal(r.energyKJ, 10);
  assert.deepEqual(r.rrIntervalsMs, [500, 1000]);
});

test('accepts DataView and ArrayBuffer and plain arrays', () => {
  const arr = [0x00, 65];
  const ab = Uint8Array.from(arr).buffer;
  const dv = new DataView(ab);
  assert.equal(core.parseHeartRateMeasurement(arr).bpm, 65);
  assert.equal(core.parseHeartRateMeasurement(ab).bpm, 65);
  assert.equal(core.parseHeartRateMeasurement(dv).bpm, 65);
});

test('too short, malformed, or invalid bpm returns null without throwing', () => {
  assert.equal(core.parseHeartRateMeasurement(u8()), null);
  assert.equal(core.parseHeartRateMeasurement(u8(0x00)), null); // missing bpm byte
  assert.equal(core.parseHeartRateMeasurement(u8(0x01, 0x64)), null); // uint16 flag but only 1 byte
  assert.equal(core.parseHeartRateMeasurement(u8(0x00, 5)), null); // bpm out of range
  assert.equal(core.parseHeartRateMeasurement(u8(0x10, 70)), null); // RR flagged, no RR bytes
  assert.equal(core.parseHeartRateMeasurement(null), null);
  assert.equal(core.parseHeartRateMeasurement('garbage'), null);
  assert.equal(core.parseHeartRateMeasurement(undefined), null);
});

test('validBpm boundaries', () => {
  assert.equal(core.validBpm(25), true);
  assert.equal(core.validBpm(240), true);
  assert.equal(core.validBpm(24), false);
  assert.equal(core.validBpm(241), false);
  assert.equal(core.validBpm(NaN), false);
  assert.equal(core.validBpm(Infinity), false);
  assert.equal(core.validBpm('72'), false);
});

// ---- createHeartRateBuffer ---------------------------------------------------------------------

test('buffer accepts monotonic valid samples and rejects invalid/non-monotonic/duplicate', () => {
  const buf = core.createHeartRateBuffer();
  assert.equal(buf.push({t: 1000, bpm: 70}), true);
  assert.equal(buf.push({t: 1000, bpm: 71}), false); // exact duplicate t
  assert.equal(buf.push({t: 900, bpm: 71}), false); // earlier than last
  assert.equal(buf.push({t: 1100, bpm: 300}), false); // invalid bpm
  assert.equal(buf.push({t: 1100, bpm: NaN}), false);
  assert.equal(buf.push({t: NaN, bpm: 80}), false);
  assert.equal(buf.push({t: 1100, bpm: 80, source: 'watch', device: 'x'}), true);
  assert.equal(buf.size(), 2);
  assert.deepEqual(buf.samples(), [{t: 1000, bpm: 70, source: undefined, device: undefined}, {t: 1100, bpm: 80, source: 'watch', device: 'x'}]);
});

test('buffer samples() window, latest() staleness, clear()', () => {
  const buf = core.createHeartRateBuffer();
  buf.push({t: 1000, bpm: 60});
  buf.push({t: 2000, bpm: 70});
  buf.push({t: 3000, bpm: 80});
  assert.deepEqual(buf.samples(1500, 2500).map(s => s.bpm), [70]);
  assert.equal(buf.latest(3000, 10000).bpm, 80);
  assert.equal(buf.latest(20000, 5000), null);
  buf.clear();
  assert.equal(buf.size(), 0);
  assert.equal(buf.latest(), null);
});

test('buffer prunes by age relative to the latest sample', () => {
  const buf = core.createHeartRateBuffer({maxAgeMs: 5000});
  buf.push({t: 0, bpm: 60});
  buf.push({t: 3000, bpm: 65});
  buf.push({t: 6000, bpm: 70}); // drops t=0 (age 6000 > 5000)
  assert.deepEqual(buf.samples().map(s => s.t), [3000, 6000]);
});

test('buffer prunes oldest-first beyond maxSamples', () => {
  const buf = core.createHeartRateBuffer({maxSamples: 3, maxAgeMs: 1e9});
  for (let i = 0; i < 5; i++) buf.push({t: i * 1000, bpm: 60 + i});
  assert.equal(buf.size(), 3);
  assert.deepEqual(buf.samples().map(s => s.t), [2000, 3000, 4000]);
});

// ---- downsample ---------------------------------------------------------------------------------

test('downsample returns [] for empty input', () => {
  assert.deepEqual(core.downsample([]), []);
});

test('downsample buckets by median bpm and offsetSeconds', () => {
  const start = 0;
  const samples = [
    {t: 0, bpm: 60}, {t: 1000, bpm: 62}, {t: 4000, bpm: 100}, // bucket 0 (0-5000): median of 60,62,100 = 62
    {t: 5000, bpm: 70}, {t: 7000, bpm: 74}                    // bucket 1 (5000-10000): median 72
  ];
  const out = core.downsample(samples, {start, bucketMs: 5000});
  assert.deepEqual(out, [[0, 62], [5, 72]]);
});

test('downsample widens bucketMs to respect maxPoints', () => {
  // 100 seconds of data at 1s bucketMs would need >10 buckets; maxPoints=10 forces widening.
  const samples = Array.from({length: 101}, (_, i) => ({t: i * 1000, bpm: 60 + (i % 5)}));
  const out = core.downsample(samples, {bucketMs: 1000, maxPoints: 10});
  assert(out.length <= 10, `expected <=10 points, got ${out.length}`);
});

// ---- summarize ------------------------------------------------------------------------------

test('summarize null when fewer than 3 valid samples in window', () => {
  assert.equal(core.summarize([]), null);
  assert.equal(core.summarize([{t: 0, bpm: 70}, {t: 1000, bpm: 71}]), null);
  assert.equal(core.summarize([{t: 0, bpm: 70}, {t: 1000, bpm: 71}, {t: 2000, bpm: 999}]), null); // invalid bpm excluded
});

test('summarize avg/max/min/count over default window (first..last sample)', () => {
  const samples = [{t: 0, bpm: 60}, {t: 1000, bpm: 80}, {t: 2000, bpm: 100}];
  const r = core.summarize(samples);
  assert.equal(r.avg, 80);
  assert.equal(r.max, 100);
  assert.equal(r.min, 60);
  assert.equal(r.count, 3);
  assert.equal(r.durationMs, 2000);
});

test('summarize coverage counts only gaps <=15s, ignores longer gaps', () => {
  // Two samples 10s apart (covered), then a 30s gap (not covered), total window 40s.
  const samples = [{t: 0, bpm: 60}, {t: 10000, bpm: 65}, {t: 40000, bpm: 70}];
  const r = core.summarize(samples, {start: 0, end: 40000});
  assert.equal(r.coverage, Math.round((10000 / 40000) * 100) / 100);
});

test('summarize with fully continuous coverage is 1', () => {
  const samples = [{t: 0, bpm: 60}, {t: 5000, bpm: 62}, {t: 10000, bpm: 64}];
  const r = core.summarize(samples, {start: 0, end: 10000});
  assert.equal(r.coverage, 1);
});

// ---- setMarksFromJournal --------------------------------------------------------------------

const iso = (msFromEpoch) => new Date(msFromEpoch).toISOString();

test('setMarksFromJournal keeps latest set event per row when done, ignores other sessions/undone/malformed', () => {
  const events = [
    {kind: 'set', session_id: 's1', row_key: '0-0', client_at: iso(1000), payload: {done: true}},
    {kind: 'set', session_id: 's1', row_key: '0-0', client_at: iso(2000), payload: {done: false}}, // latest wins: undone
    {kind: 'set', session_id: 's1', row_key: '1-0', client_at: iso(500), payload: {done: true}},
    {kind: 'set', session_id: 's1', row_key: '1-0', client_at: iso(1500), payload: {done: true}}, // latest wins: this one
    {kind: 'set', session_id: 'other', row_key: '2-0', client_at: iso(100), payload: {done: true}}, // other session ignored
    {kind: 'finish', session_id: 's1', row_key: '3-0', client_at: iso(100), payload: {done: true}}, // wrong kind
    {kind: 'set', session_id: 's1', row_key: 'bad-row', client_at: iso(100), payload: {done: true}},
    {kind: 'set', session_id: 's1', row_key: '4-0', client_at: 'not-a-date', payload: {done: true}},
    null
  ];
  const marks = core.setMarksFromJournal(events, 's1');
  assert.deepEqual(marks, [{exerciseIndex: 1, setIndex: 0, t: 1500}]);
});

test('setMarksFromJournal sorts by t ascending', () => {
  const events = [
    {kind: 'set', session_id: 's', row_key: '2-0', client_at: iso(3000), payload: {done: true}},
    {kind: 'set', session_id: 's', row_key: '0-0', client_at: iso(1000), payload: {done: true}},
    {kind: 'set', session_id: 's', row_key: '1-0', client_at: iso(2000), payload: {done: true}}
  ];
  const marks = core.setMarksFromJournal(events, 's');
  assert.deepEqual(marks.map(m => m.t), [1000, 2000, 3000]);
});

// ---- alignSets ------------------------------------------------------------------------------

test('alignSets finds peak in the lead-up window and recovery drop near recoveryMs later', () => {
  const marks = [{exerciseIndex: 0, setIndex: 0, t: 100000}];
  const samples = [
    {t: 50000, bpm: 90},
    {t: 95000, bpm: 150}, // peak, within [t-90000, t+15000] = [10000, 115000]
    {t: 110000, bpm: 140},
    {t: 160000, bpm: 110} // recoveryMs=60000 -> target 160000, exact match
  ];
  const [r] = core.alignSets(marks, samples);
  assert.equal(r.peakBpm, 150);
  assert.equal(r.recoveryDrop, 150 - 110);
});

test('alignSets peak window is clipped by the previous mark', () => {
  const marks = [
    {exerciseIndex: 0, setIndex: 0, t: 100000},
    {exerciseIndex: 0, setIndex: 1, t: 150000}
  ];
  const samples = [
    {t: 70000, bpm: 200}, // before first mark's window start (100000-90000=10000) but also before second mark's clipped lower bound (100000)
    {t: 120000, bpm: 130}
  ];
  const [, second] = core.alignSets(marks, samples);
  // second mark window lower bound = max(prevMark.t=100000, 150000-90000=60000) = 100000
  assert.equal(second.peakBpm, 130); // the 70000 sample is excluded by the clip
});

test('alignSets recoveryDrop is null when no sample near target or it crosses the next mark', () => {
  const marks = [{exerciseIndex: 0, setIndex: 0, t: 0}, {exerciseIndex: 0, setIndex: 1, t: 65000}];
  const samples = [{t: 0, bpm: 140}, {t: 70000, bpm: 100}]; // only candidate near recovery target (60000) is at 70000, past next mark(65000)
  const [first] = core.alignSets(marks, samples);
  assert.equal(first.peakBpm, 140);
  assert.equal(first.recoveryDrop, null);
});

test('alignSets peakBpm null when no samples in window', () => {
  const marks = [{exerciseIndex: 0, setIndex: 0, t: 1000000}];
  const [r] = core.alignSets(marks, []);
  assert.equal(r.peakBpm, null);
  assert.equal(r.recoveryDrop, null);
});

// ---- sessionWindow --------------------------------------------------------------------------

test('sessionWindow spans earliest event to finishTs', () => {
  const events = [
    {session_id: 's', client_at: iso(5000)},
    {session_id: 's', client_at: iso(1000)},
    {session_id: 'other', client_at: iso(0)}
  ];
  const w = core.sessionWindow(events, 's', 20000);
  assert.deepEqual(w, {start: 1000, end: 20000});
});

test('sessionWindow falls back to fallbackMinutes before finishTs with no events', () => {
  const w = core.sessionWindow([], 's', 100000, {fallbackMinutes: 10});
  assert.deepEqual(w, {start: 100000 - 600000, end: 100000});
});

// ---- localDateKey / dailyFromSamples ---------------------------------------------------------

test('localDateKey formats using tzOffsetMinutes deterministically', () => {
  const ms = Date.parse('2026-01-02T02:30:00Z'); // 2:30am UTC
  assert.equal(core.localDateKey(ms, 0), '2026-01-02'); // UTC
  assert.equal(core.localDateKey(ms, 300), '2026-01-01'); // UTC-5 -> still Jan 1, 9:30pm
  assert.equal(core.localDateKey(ms, -600), '2026-01-02'); // UTC+10 -> Jan 2, 12:30pm
});

test('dailyFromSamples sleep sums asleep-family stages, excludes awake/inBed, attributes to wake day', () => {
  const samples = [{
    startDate: '2026-01-01T23:00:00Z', endDate: '2026-01-02T07:00:00Z',
    stages: [
      {stage: 'light', startDate: '2026-01-01T23:00:00Z', endDate: '2026-01-02T01:00:00Z', durationMinutes: 120},
      {stage: 'awake', durationMinutes: 15},
      {stage: 'deep', durationMinutes: 90},
      {stage: 'rem', durationMinutes: 60},
      {stage: 'inBed', durationMinutes: 30}
    ]
  }];
  const out = core.dailyFromSamples(samples, {kind: 'sleep', tzOffsetMinutes: 0});
  assert.deepEqual(out, [{date: '2026-01-02', value: 270}]); // 120+90+60, wake day = endDate's date
});

test('dailyFromSamples sleep without stages uses sleepState / duration, filters naps under 60min', () => {
  const samples = [
    {startDate: '2026-02-01T22:00:00Z', endDate: '2026-02-02T06:00:00Z'}, // 480 min, no stages/state
    {startDate: '2026-03-02T13:00:00Z', endDate: '2026-03-02T13:20:00Z'}, // lone 20 min nap on another day, filtered out
    {startDate: '2026-02-02T14:00:00Z', endDate: '2026-02-02T14:10:00Z', sleepState: 'awake'} // ignored, not summed
  ];
  const out = core.dailyFromSamples(samples, {kind: 'sleep', tzOffsetMinutes: 0});
  assert.deepEqual(out, [{date: '2026-02-02', value: 480}]);
});

test('dailyFromSamples sleep: a nap on the same wake day as a full sleep block adds to that day total', () => {
  const samples = [
    {startDate: '2026-02-01T22:00:00Z', endDate: '2026-02-02T06:00:00Z'}, // 480 min
    {startDate: '2026-02-02T13:00:00Z', endDate: '2026-02-02T13:20:00Z'} // 20 min nap, same wake day -> merges
  ];
  const out = core.dailyFromSamples(samples, {kind: 'sleep', tzOffsetMinutes: 0});
  assert.deepEqual(out, [{date: '2026-02-02', value: 500}]);
});

test('dailyFromSamples restingHeartRate averages per local date, integer rounded', () => {
  const samples = [
    {value: 55, startDate: '2026-03-01T12:00:00Z'},
    {value: 59, startDate: '2026-03-01T13:00:00Z'},
    {value: -5, startDate: '2026-03-01T14:00:00Z'}, // ignored, non-positive
    {value: NaN, startDate: '2026-03-01T15:00:00Z'} // ignored
  ];
  const out = core.dailyFromSamples(samples, {kind: 'restingHeartRate', tzOffsetMinutes: 0});
  assert.deepEqual(out, [{date: '2026-03-01', value: 57}]);
});

test('dailyFromSamples heartRateVariability averages to 1 decimal', () => {
  const samples = [
    {value: 40, startDate: '2026-03-05T01:00:00Z'},
    {value: 41, startDate: '2026-03-05T02:00:00Z'}
  ];
  const out = core.dailyFromSamples(samples, {kind: 'heartRateVariability', tzOffsetMinutes: 0});
  assert.deepEqual(out, [{date: '2026-03-05', value: 40.5}]);
});

test('dailyFromSamples respects timezone attribution', () => {
  // 11:30pm UTC on 03-05 is already 03-06 local at UTC+2 (tzOffsetMinutes=-120)
  const samples = [{value: 50, startDate: '2026-03-05T23:30:00Z'}];
  const out = core.dailyFromSamples(samples, {kind: 'restingHeartRate', tzOffsetMinutes: -120});
  assert.deepEqual(out, [{date: '2026-03-06', value: 50}]);
});

test('dailyFromSamples returns [] for empty/unknown kind', () => {
  assert.deepEqual(core.dailyFromSamples([]), []);
  assert.deepEqual(core.dailyFromSamples([{value: 1, startDate: iso(0)}], {kind: 'nonsense'}), []);
});

// ---- personalBaseline -----------------------------------------------------------------------

test('personalBaseline null below min count, median otherwise, excludes given date', () => {
  const daily = Array.from({length: 6}, (_, i) => ({date: `2026-01-${String(i + 1).padStart(2, '0')}`, value: 50 + i}));
  assert.equal(core.personalBaseline(daily), null); // only 6, min 7
  // 8 days total so excluding one target date still leaves 7 (the default min).
  const eight = [...daily, {date: '2026-01-07', value: 56}, {date: '2026-01-08', value: 999}];
  const base = core.personalBaseline(eight, {excludeDate: '2026-01-08'});
  assert.equal(base.count, 7);
  assert.equal(base.median, median([50, 51, 52, 53, 54, 55, 56]));
});

function median(vals) { const s = [...vals].sort((a, b) => a - b), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

test('personalBaseline uses only the most recent `days` entries', () => {
  const daily = Array.from({length: 40}, (_, i) => ({date: `d${String(i).padStart(3, '0')}`, value: i})); // 0..39
  const base = core.personalBaseline(daily, {days: 10, min: 5});
  assert.equal(base.count, 10);
  assert.equal(base.median, median([30, 31, 32, 33, 34, 35, 36, 37, 38, 39]));
});

// ---- readinessInsight -----------------------------------------------------------------------

function dailyRun(baseValue, days, today, step = 0) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(today + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() - (days - i));
    out.push({date: d.toISOString().slice(0, 10), value: baseValue + step * i});
  }
  return out;
}

test('readinessInsight: no data at all -> hasData false, empty items', () => {
  const r = core.readinessInsight({today: '2026-04-10'});
  assert.deepEqual(r, {items: [], hasData: false});
});

test('readinessInsight: no baseline yet -> usual null, direction typical, no comparison text', () => {
  const sleep = [{date: '2026-04-10', value: 400}]; // only 1 entry, no baseline possible
  const r = core.readinessInsight({sleep, today: '2026-04-10'});
  assert.equal(r.hasData, true);
  const item = r.items.find(i => i.metric === 'sleep');
  assert.equal(item.usual, null);
  assert.equal(item.direction, 'typical');
  assert.doesNotMatch(item.text, /usual/);
});

test('readinessInsight: sleep below usual', () => {
  const today = '2026-04-20';
  const sleep = [...dailyRun(440, 10, today), {date: today, value: 300}]; // usual 440min (7h20), today 5h00=300 (<0.8x usual)
  const r = core.readinessInsight({sleep, today});
  const item = r.items.find(i => i.metric === 'sleep');
  assert.equal(item.direction, 'lower');
  assert.equal(item.text, 'Slept 5 h 0 min, below your usual 7 h 20 min.');
});

test('readinessInsight: sleep above usual and typical', () => {
  const today = '2026-04-21';
  const highSleep = [...dailyRun(300, 10, today), {date: today, value: 400}]; // 400 > 1.2*300=360
  const r1 = core.readinessInsight({sleep: highSleep, today});
  assert.equal(r1.items[0].direction, 'higher');

  const typicalSleep = [...dailyRun(400, 10, today), {date: today, value: 410}];
  const r2 = core.readinessInsight({sleep: typicalSleep, today});
  assert.equal(r2.items[0].direction, 'typical');
  assert.match(r2.items[0].text, /typical for you\.$/);
});

test('readinessInsight: resting heart rate higher/lower/typical with "about" phrasing', () => {
  const today = '2026-05-01';
  const rhr = [...dailyRun(57, 10, today), {date: today, value: 62}]; // usual 57, +5 threshold -> higher
  const r = core.readinessInsight({restingHeartRate: rhr, today});
  const item = r.items.find(i => i.metric === 'restingHeartRate');
  assert.equal(item.direction, 'higher');
  assert.equal(item.text, 'Resting heart rate 62 bpm, about 5 above your usual 57.');

  const rhrLow = [...dailyRun(60, 10, today), {date: today, value: 54}];
  const rLow = core.readinessInsight({restingHeartRate: rhrLow, today});
  assert.equal(rLow.items[0].direction, 'lower');
});

test('readinessInsight: RHR/HRV fall back to yesterday if today has no entry', () => {
  const today = '2026-05-10';
  const yesterday = '2026-05-09';
  const rhr = [...dailyRun(55, 10, yesterday), {date: yesterday, value: 55}];
  const r = core.readinessInsight({restingHeartRate: rhr, today});
  assert.equal(r.hasData, true);
  assert.equal(r.items[0].value, 55);
});

test('readinessInsight: HRV lower/higher/typical', () => {
  const today = '2026-06-01';
  const hrvLow = [...dailyRun(50, 10, today), {date: today, value: 40}]; // <0.85*50=42.5
  assert.equal(core.readinessInsight({heartRateVariability: hrvLow, today}).items[0].direction, 'lower');
  const hrvHigh = [...dailyRun(40, 10, today), {date: today, value: 48}]; // >1.15*40=46
  const rh = core.readinessInsight({heartRateVariability: hrvHigh, today});
  assert.equal(rh.items[0].direction, 'higher');
  const hrvTyp = [...dailyRun(45, 10, today), {date: today, value: 46}];
  const rt = core.readinessInsight({heartRateVariability: hrvTyp, today});
  assert.equal(rt.items[0].text, 'HRV 46 ms, typical for you.');
});

test('readinessInsight text is neutral, never prescriptive (no imperative phrasing)', () => {
  const today = '2026-06-05';
  const sleep = [...dailyRun(440, 10, today), {date: today, value: 370}];
  const rhr = [...dailyRun(57, 10, today), {date: today, value: 62}];
  const r = core.readinessInsight({sleep, restingHeartRate: rhr, today});
  for (const item of r.items) assert.doesNotMatch(item.text, /should|must|need to|recommend/i);
});

// ---- parseWorkoutFile: TCX -------------------------------------------------------------------

const dp = () => new JSDOM('').window.DOMParser;

const TCX = `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschema/TrainingCenterDatabase/v2">
  <Activities>
    <Activity Sport="Running">
      <Id>2026-01-01T10:00:00Z</Id>
      <Lap StartTime="2026-01-01T10:00:00Z">
        <Calories>120</Calories>
        <Track>
          <Trackpoint>
            <Time>2026-01-01T10:00:00Z</Time>
            <HeartRateBpm><Value>140</Value></HeartRateBpm>
          </Trackpoint>
          <Trackpoint>
            <Time>2026-01-01T10:01:00Z</Time>
            <HeartRateBpm><Value>150</Value></HeartRateBpm>
          </Trackpoint>
        </Track>
      </Lap>
      <Lap StartTime="2026-01-01T10:10:00Z">
        <Calories>30</Calories>
        <Track>
          <Trackpoint>
            <Time>2026-01-01T10:10:00Z</Time>
            <HeartRateBpm><Value>145</Value></HeartRateBpm>
          </Trackpoint>
        </Track>
      </Lap>
      <Creator><Name>Garmin Forerunner</Name></Creator>
    </Activity>
  </Activities>
</TrainingCenterDatabase>`;

test('parseWorkoutFile parses TCX: sport, samples, summed lap calories, device', () => {
  const r = core.parseWorkoutFile(TCX, {DOMParser: dp()});
  assert.equal(r.format, 'tcx');
  assert.equal(r.sport, 'Running');
  assert.equal(r.samples.length, 3);
  assert.deepEqual(r.samples.map(s => s.bpm), [140, 150, 145]);
  assert.equal(r.calories, 150);
  assert.equal(r.device, 'Garmin Forerunner');
  assert.equal(r.start, Date.parse('2026-01-01T10:00:00Z'));
  assert.equal(r.end, Date.parse('2026-01-01T10:10:00Z'));
});

// ---- parseWorkoutFile: GPX (namespaced heart rate) -------------------------------------------

const GPX = `<?xml version="1.0" encoding="UTF-8"?>
<gpx xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschema/TrackPointExtension/v1">
  <trk>
    <name>Morning Walk</name>
    <type>walking</type>
    <trkseg>
      <trkpt lat="1.0" lon="2.0">
        <time>2026-02-01T08:00:00Z</time>
        <extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>110</gpxtpx:hr></gpxtpx:TrackPointExtension></extensions>
      </trkpt>
      <trkpt lat="1.0" lon="2.0">
        <time>2026-02-01T08:01:00Z</time>
        <extensions><ns3:TrackPointExtension xmlns:ns3="http://example.com/ns3"><ns3:hr>115</ns3:hr></ns3:TrackPointExtension></extensions>
      </trkpt>
    </trkseg>
  </trk>
</gpx>`;

test('parseWorkoutFile parses GPX with namespaced hr elements (gpxtpx and arbitrary prefix)', () => {
  const r = core.parseWorkoutFile(GPX, {DOMParser: dp()});
  assert.equal(r.format, 'gpx');
  assert.equal(r.sport, 'walking');
  assert.deepEqual(r.samples.map(s => s.bpm), [110, 115]);
  assert.equal(r.calories, null);
  assert.equal(r.device, null);
  assert.equal(r.start, Date.parse('2026-02-01T08:00:00Z'));
  assert.equal(r.end, Date.parse('2026-02-01T08:01:00Z'));
});

test('parseWorkoutFile: malformed XML returns invalid error, never throws', () => {
  const bad = '<TrainingCenterDatabase><Activities><Activity Sport="Running">';
  assert.doesNotThrow(() => core.parseWorkoutFile(bad, {DOMParser: dp()}));
  const r = core.parseWorkoutFile(bad, {DOMParser: dp()});
  assert.equal(r.error, 'invalid');
});

test('parseWorkoutFile: FIT signature and garbage are unsupported, never throw', () => {
  const fitLike = 'XXXXXXXX.FIT' + 'garbage-binary-data';
  const r1 = core.parseWorkoutFile(fitLike, {DOMParser: dp()});
  assert.equal(r1.error, 'unsupported');
  assert.match(r1.message, /TCX or GPX/);

  const r2 = core.parseWorkoutFile('not xml at all, just text', {DOMParser: dp()});
  assert.equal(r2.error, 'unsupported');

  assert.equal(core.parseWorkoutFile('').error, 'invalid');
  assert.equal(core.parseWorkoutFile(null).error, 'invalid');
  assert.equal(core.parseWorkoutFile(12345).error, 'invalid');
});

test('parseWorkoutFile caps samples at 50000', () => {
  const points = Array.from({length: 50010}, (_, i) => {
    const t = new Date(Date.parse('2026-01-01T00:00:00Z') + i * 1000).toISOString();
    return `<trkpt><time>${t}</time><extensions><gpxtpx:hr>${100 + (i % 50)}</gpxtpx:hr></extensions></trkpt>`;
  }).join('');
  const gpx = `<gpx xmlns:gpxtpx="x"><trk><trkseg>${points}</trkseg></trk></gpx>`;
  const r = core.parseWorkoutFile(gpx, {DOMParser: dp()});
  assert.equal(r.samples.length, 50000);
});

// ---- matchWorkoutToWindow --------------------------------------------------------------------

test('matchWorkoutToWindow picks the workout meeting minOverlap, prefers larger overlap on ties, else null', () => {
  const window = {start: 0, end: 100000};
  const workouts = [
    {id: 'tooShortOverlap', start: 90000, end: 200000}, // overlap 10000 / shorter(100000 dur workout? no, workout dur=110000, shorter=100000) => 0.1 overlap ratio, below 0.5
    {id: 'good', start: 0, end: 80000}, // duration 80000, overlap 80000, ratio 1.0
    {id: 'alsoGood', start: 20000, end: 90000} // duration 70000, overlap 70000, ratio 1.0 but smaller raw overlap than 'good'
  ];
  const best = core.matchWorkoutToWindow(workouts, window);
  assert.equal(best.id, 'good');
  assert.equal(core.matchWorkoutToWindow([{start: 200000, end: 300000}], window), null);
  assert.equal(core.matchWorkoutToWindow([], window), null);
});

test('matchWorkoutToWindow accepts ISO strings and startDate/endDate shape', () => {
  const window = {start: '2026-01-01T00:00:00Z', end: '2026-01-01T01:00:00Z'};
  const workouts = [{startDate: '2026-01-01T00:10:00Z', endDate: '2026-01-01T00:40:00Z'}];
  const best = core.matchWorkoutToWindow(workouts, window);
  assert.equal(best, workouts[0]);
});

// ---- cardioModeFor --------------------------------------------------------------------------

test('cardioModeFor maps common sport/workout-type strings, case-insensitively', () => {
  assert.equal(core.cardioModeFor('Running'), 'run');
  assert.equal(core.cardioModeFor('treadmill'), 'run');
  assert.equal(core.cardioModeFor('Hiking'), 'walk');
  assert.equal(core.cardioModeFor('stationaryBike'), 'cycle');
  assert.equal(core.cardioModeFor('indoorCycling'), 'cycle');
  assert.equal(core.cardioModeFor('openWaterSwim'), 'swim');
  assert.equal(core.cardioModeFor('traditionalStrengthTraining'), null);
  assert.equal(core.cardioModeFor('other'), null);
  assert.equal(core.cardioModeFor(null), null);
  assert.equal(core.cardioModeFor(42), null);
});

// ---- constants --------------------------------------------------------------------------------

test('exports the BLE HR service/characteristic UUIDs', () => {
  assert.equal(core.HR_SERVICE, '0000180d-0000-1000-8000-00805f9b34fb');
  assert.equal(core.HR_MEASUREMENT, '00002a37-0000-1000-8000-00805f9b34fb');
});
