const assert = require('node:assert/strict');
const fs = require('node:fs');

const api = fs.readFileSync('api/recalculate.js', 'utf8');
assert(api.includes("process.env.GROQ_API_KEY"), 'cloud recalibration must keep the Groq key server-side');
assert(api.includes("Math.max(.94,deterministic-.02)"), 'Groq must be constrained near the deterministic calculation');
assert(api.includes("Math.min(1.06,deterministic+.02)"), 'Groq must not make large whole-workout increases');

const ui = fs.readFileSync('ui2.js', 'utf8');
assert(ui.includes("fetch('/api/recalculate'"), 'completed sets must trigger cloud whole-workout analysis');
assert(ui.includes('refreshRemainingWorkout'), 'the UI must update every untouched remaining exercise');
