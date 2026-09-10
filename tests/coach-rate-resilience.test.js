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
    allowedSwaps: Array.from({ length: 18 }, (_, i) => ({ targetIndex: i, targetName: `Movement ${i}`, targetBase: `Base ${i}`, replacements: Array.from({ length: 12 }, (_, j) => `Swap ${i}-${j}`) })),
    setFeedback: Array.from({ length: 30 }, (_, i) => ({ ts: i, exerciseName: `Movement ${i}`, feedback: 'easy', weight: 100, reps: 10, rir: 4, junk: 'f'.repeat(500) })),
    analytics: { sessions7: 4, sets7: 50, volume7: 12000, trends: Array.from({ length: 20 }, (_, i) => ({ exercise: `Movement ${i}`, change: i })), freshness: { lower: 1 }, junk: 'a'.repeat(3000) },
    equipmentCoverage: {score: 90, slotsCovered: 18, slotsTotal: 20, emptySlots: Array.from({length:12},(_,i)=>({workout:`W${i}`,movement:`M${i}`})), thinSlots: Array.from({length:12},(_,i)=>({workout:`W${i}`,movement:`M${i}`,only:'one'})), wouldHelp:Array.from({length:12},(_,i)=>`Gear ${i}`), unrecognized:Array.from({length:12},(_,i)=>`Unknown ${i}`), conditioningOnly:Array.from({length:12},(_,i)=>`Cardio ${i}`)},
  };
}

(async () => {
  const calls = [];
  const context = {
    process: { env: { GROQ_API_KEY: 'test-key' } }, console,
    fetch: async (_url, init) => {
      const body = JSON.parse(init.body); calls.push(body);
      if (calls.length === 1) return response(false, 429, { error: { message: 'rate limited' } }, { 'retry-after': '4', 'x-ratelimit-remaining-tokens': '0' });
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
  assert.equal(compact.allowedSwaps.length, 8);
  assert.equal(compact.allowedSwaps[0].replacements.length, 4);
  assert.equal(compact.setFeedback.length, 8);
  assert.equal(compact.equipmentCoverage.emptySlots.length, 6);

  const turns = Array.from({ length: 14 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: String(i).repeat(1800) }));
  const conversation = api.compactConversation(turns, 'latest');
  assert.equal(conversation.length, 5);
  assert(conversation.every(turn => turn.content.length <= 400));

  const req = { method: 'POST', body: { message: 'How should I progress this set?', context: oversizedContext(), conversation: turns } };
  const res = makeRes(); await api.handler(req, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.reply, 'Recovered with overflow model.');
  assert.equal(res.body.model, 'groq/compound-mini');
  assert.equal(res.body.fallbackModel, true);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].model, 'openai/gpt-oss-20b');
  assert.equal(calls[1].model, 'groq/compound-mini');
  assert(JSON.stringify(calls[0]).length < 22000, 'Coach request must retain strong headroom below the 8K TPM budget');
  assert.equal(calls[0].max_completion_tokens, 450);

  let rateCalls = 0;
  context.fetch = async () => { rateCalls++; return response(false, 429, { error: { message: 'rate limited' } }, { 'retry-after': '3' }); };
  const secondRes = makeRes();
  await api.handler({ method: 'POST', body: { message: 'Keep coaching me', context: oversizedContext() } }, secondRes);
  assert.equal(secondRes.code, 200, 'double rate-limit must still return a visible Coach response');
  assert.equal(secondRes.body.model, 'Iron Six recovery');
  assert.equal(secondRes.body.degraded, true);
  assert.match(secondRes.body.reply, /temporary rate limit/i);
  assert.equal(rateCalls, 2);

  console.log('Coach context compaction and 429 recovery verified.');
})().catch(error => { console.error(error); process.exitCode = 1; });
