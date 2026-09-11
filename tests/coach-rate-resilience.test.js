const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

let source = fs.readFileSync('api/coach.js', 'utf8');
source = source.replace('export default async function handler', 'async function handler');
source += '\nthis.__coachTest = { handler, compactContext, compactConversation, cleanModelOutput, wantsAction, formattingInstruction };';

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
      if (calls.length === 1) return response(false, 400, { error: { message: 'provider failure' } });
      return response(true, 200, { choices: [{ finish_reason: 'stop', message: { content: 'Recovered with overflow model.' } }] });
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

  const exactQuestion = "Can't I hold the barbell at my waist for calf raises the same way I would with dumbbells?";
  const res = makeRes(); await api.handler({ method: 'POST', body: { message: exactQuestion, context: oversizedContext() } }, res);
  assert.equal(res.code, 200);
  assert.equal(res.body.reply, 'Recovered with overflow model.');
  assert.equal(res.body.model, 'groq/compound-mini');
  assert.equal(res.body.fallbackModel, true);
  assert.equal(calls.length, 2, 'a provider 400 must retry on the alternate cloud model');
  assert.equal(calls[0].model, 'openai/gpt-oss-20b');
  assert.equal(calls[0].reasoning_effort, 'low');
  assert.equal(calls[0].include_reasoning, false);
  assert.equal(calls[0].max_completion_tokens, 800);
  assert.equal('response_format' in calls[0], false);
  assert.match(calls[0].messages[0].content, /plain text only/i, 'ordinary advice must not ask the model to create JSON');
  assert.match(calls[0].messages[0].content, /exact question first/i, 'Coach must answer the user’s proposed setup instead of substituting a conventional variation');
  assert(JSON.stringify(calls[0]).length < 25000);

  const rawCalls = [];
  context.fetch = async (_url, init) => {
    rawCalls.push(JSON.parse(init.body));
    return response(true, 200, { choices: [{ finish_reason: 'stop', message: { content: 'Yes. Holding a barbell at your waist can work for standing calf raises if you can control it securely. It is closer to holding heavy dumbbells than to a bar-on-shoulders calf raise, although grip and bar position can become the limiting factors.' } }] });
  };
  const rawRes = makeRes();
  await api.handler({ method: 'POST', body: { message: exactQuestion, context: oversizedContext() } }, rawRes);
  assert.equal(rawRes.code, 200);
  assert.match(rawRes.body.reply, /barbell at your waist/i);
  assert.equal(rawRes.body.reply.startsWith('{'), false);
  assert.equal(Array.isArray(rawRes.body.actions), true);
  assert.equal(rawRes.body.actions.length, 0);
  assert.equal(rawCalls[0].reasoning_effort, 'low');

  const ugly = '{"reply":"You can do barbell calf raises, but it’s a bit trickier than using dumbbells. The barbell sits on your shoulders (or a squat-rack), so you need a stable base and a good grip.\n\n1. Setup – Place the barbell on a sturdy platform so you can stand on a raised';
  const salvaged = api.cleanModelOutput(ugly);
  assert.match(salvaged.reply, /^You can do barbell calf raises/);
  assert.equal(salvaged.reply.includes('{"reply"'), false, 'a malformed JSON wrapper must never leak into the chat bubble');
  assert.match(salvaged.reply, /raised$/);

  let truncCalls = 0;
  context.fetch = async (_url, init) => {
    truncCalls++;
    const body = JSON.parse(init.body);
    if (truncCalls === 1) return response(true, 200, { choices: [{ finish_reason: 'length', message: { content: '{"reply":"Yes, you can hold it at your waist, but this answer got cut' } }] });
    assert.equal(body.model, 'groq/compound-mini');
    assert.match(body.messages[body.messages.length - 1].content, /no more than 120 words/i);
    return response(true, 200, { choices: [{ finish_reason: 'stop', message: { content: 'Yes. You can hold the barbell at waist/thigh level for calf raises if you can keep it secure and balanced. That setup is mechanically similar to holding heavy dumbbells at your sides, but your grip and the bar contacting your thighs may limit how much load you can use.' } }] });
  };
  const truncRes = makeRes();
  await api.handler({ method: 'POST', body: { message: exactQuestion, context: oversizedContext() } }, truncRes);
  assert.equal(truncCalls, 2, 'a length-cut response must get one automatic completion retry');
  assert.match(truncRes.body.reply, /waist\/thigh level/i);
  assert.equal(truncRes.body.truncated, false);
  assert.equal(truncRes.body.fallbackModel, true);

  context.fetch = async () => response(true, 200, { choices: [{ finish_reason: 'stop', message: { content: "I'm running locally." } }] });
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

  console.log('Coach direct-answer format, low-reasoning budget, malformed-wrapper recovery, truncation retry, provider recovery, and 429 recovery verified.');
})().catch(error => { console.error(error); process.exitCode = 1; });
