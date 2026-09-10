const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let source = fs.readFileSync('api/coach.js', 'utf8');
source = source.replace('export default async function handler', 'async function handler');
source += '\nthis.__coachTest = { handler, compactContext, compactConversation };';

function response(ok, status, body, headers = {}) {
  return { ok, status, headers: { get: name => headers[String(name).toLowerCase()] ?? null }, async json() { return body; } };
}
function makeRes() {
  return { code: 200, headers: {}, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.code = code; return this; }, json(body) { this.body = body; return this; } };
}
function oversizedContext() {
  const sets = Array.from({ length: 10 }, (_, i) => ({ weight: 100 + i * 5, reps: 8 + i, rir: 2, done: true, feedback: i % 2 ? 'easy' : 'right', junk: 'x'.repeat(800) }));
  const details = Array.from({ length: 12 }, (_, i) => ({ name: `Exercise ${i}`, base: `Base ${i}`, sets, junk: 'y'.repeat(800) }));
  const history = Array.from({ length: 8 }, (_, i) => ({ name: `Session ${i}`, date: `2026-09-${10 - i}`, workoutKey: 'lower_strength', duration: 60, details, junk: 'z'.repeat(1000) }));
  return {
    profile: { name: 'Tester', bodyWeight: 220, age: 40, heightIn: 74, trainingLevel: 'intermediate', equipment: Array.from({ length: 30 }, (_, i) => `Equipment ${i}`), capacities: { barbellMax: 300 }, workoutMinutes: 60, junk: 'p'.repeat(3000) },
    readiness: { energy: 4, soreness: 1 },
    workout: Array.from({ length: 16 }, (_, i) => ({ index: i, name: `Movement ${i}`, prescription: '4 × 8–12', base: `Base ${i}`, suggested: { load: 100, target: 10, text: 'Suggested load', confidence: 'Performance-based', detail: 'd'.repeat(1000) } })),
    today: Array.from({ length: 40 }, (_, i) => ({ key: `0-${i}`, weight: 100, reps: 10, rir: 2, done: true, junk: 't'.repeat(600) })),
    history,
    allowedSwaps: Array.from({ length: 18 }, (_, i) => ({ targetIndex: i, targetName: `Movement ${i}`, replacements: Array.from({ length: 12 }, (_, j) => `Swap ${i}-${j}`) })),
    setFeedback: Array.from({ length: 30 }, (_, i) => ({ ts: i, exerciseName: `Movement ${i}`, feedback: 'easy', weight: 100, reps: 10, rir: 4 })),
    analytics: { sessions7: 4, sets7: 50, volume7: 12000, trends: Array.from({ length: 20 }, (_, i) => ({ exercise: `Movement ${i}`, change: i })), freshness: { lower: 1 } },
    equipmentCoverage: { score: 90, slotsCovered: 18, slotsTotal: 20, emptySlots: Array.from({length:12},(_,i)=>({workout:`W${i}`,movement:`M${i}`})), thinSlots: [], wouldHelp: [], unrecognized: [], conditioningOnly: [] },
  };
}

(async () => {
  const calls = [];
  const context = {
    process: { env: { GROQ_API_KEY: 'test-key' } }, console,
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body); calls.push(body);
      if (calls.length === 1) return response(false, 400, { error: { message: 'Failed to validate JSON' } });
      return response(true, 200, { choices: [{ message: { content: JSON.stringify({ reply: 'Recovered with overflow model.', actions: [], videos: [], followUps: [] }) } }] });
    },
  };
  vm.createContext(context); vm.runInContext(source, context, { filename: 'api/coach.js' });
  const api = context.__coachTest;

  const compact = api.compactContext(oversizedContext());
  assert.equal(compact.history.length, 3);
  assert.equal(compact.history[0].details.length, 5);
  assert.equal(compact.history[0].details[0].sets.length, 2);
  assert.equal(compact.profile.equipment.length, 14);
  assert.equal(compact.today.length, 16);
  assert.equal(compact.workout.length, 8);

  const req = { method: 'POST', body: { message: "Can't I hold the barbell at my waist for calf raises the same way I would with dumbbells?", context: oversizedContext() } };
  const res = makeRes(); await api.handler(req, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.reply, 'Recovered with overflow model.');
  assert.equal(res.body.model, 'groq/compound-mini');
  assert.equal(res.body.fallbackModel, true);
  assert.equal(calls.length, 2, 'a provider 400 must retry on the alternate cloud model');
  assert.equal(calls[0].model, 'openai/gpt-oss-20b');
  assert.equal(calls[1].model, 'groq/compound-mini');
  assert.equal('response_format' in calls[0], false, 'provider-side JSON enforcement must stay disabled');
  assert.equal('response_format' in calls[1], false, 'backup model must also avoid provider JSON rejection');
  assert(JSON.stringify(calls[0]).length < 24000);

  const rawCalls = [];
  context.fetch = async (_url, init) => {
    rawCalls.push(JSON.parse(init.body));
    return response(true, 200, { choices: [{ message: { content: 'Yes. Holding a barbell at your waist can work for standing calf raises if you can control it securely and keep the setup stable.' } }] });
  };
  const rawRes = makeRes();
  await api.handler({ method: 'POST', body: { message: 'Can I hold the bar at my waist for calf raises?', context: oversizedContext() } }, rawRes);
  assert.equal(rawRes.code, 200);
  assert.match(rawRes.body.reply, /barbell at your waist/i, 'plain text model output must be accepted as a valid Coach reply');
  assert.equal(Array.isArray(rawRes.body.actions), true);
  assert.equal(rawRes.body.actions.length, 0);
  assert.equal('response_format' in rawCalls[0], false);

  context.fetch = async () => response(true, 200, { choices: [{ message: { content: JSON.stringify({ reply: "I'm running locally.", actions: [], videos: [], followUps: [] }) } }] });
  const statusRes = makeRes();
  await api.handler({ method: 'POST', body: { message: 'Is the cloud model working?', context: oversizedContext() } }, statusRes);
  assert.equal(statusRes.code, 200);
  assert.equal(statusRes.body.model, 'openai/gpt-oss-20b');
  assert.equal(statusRes.body.reply, 'Yes — the cloud Coach is responding right now.');

  let rateCalls = 0;
  context.fetch = async () => { rateCalls++; return response(false, 429, { error: { message: 'rate limited' } }, { 'retry-after': '3' }); };
  const secondRes = makeRes();
  await api.handler({ method: 'POST', body: { message: 'Keep coaching me', context: oversizedContext() } }, secondRes);
  assert.equal(secondRes.code, 200);
  assert.equal(secondRes.body.model, 'Iron Six cloud recovery');
  assert.equal(secondRes.body.degraded, true);
  assert.match(secondRes.body.reply, /temporarily rate-limited/i);
  assert.equal(rateCalls, 2);

  console.log('Coach unconstrained output, provider recovery, plain-text fallback, status truthfulness, and 429 recovery verified.');
})().catch(error => { console.error(error); process.exitCode = 1; });
