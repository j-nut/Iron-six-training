const assert = require('node:assert/strict');
const fs = require('node:fs');

const required = [
  'exercise-guide.js?v=6',
  'exercise-visuals.js?v=6',
  'local-ai-fallback.js?v=6',
  'coach.js?v=6',
  'cloud-sync.js?v=6',
  'cloud-history-sync.js?v=6'
];

for (const page of ['index.html', 'live.html']) {
  const html = fs.readFileSync(page, 'utf8');
  let previous = html.indexOf('ui3.js');
  assert.notEqual(previous, -1, `${page} must load ui3.js`);
  for (const script of required) {
    const position = html.indexOf(script);
    assert(position > previous, `${page} must load ${script} in order`);
    previous = position;
  }
}

const ui = fs.readFileSync('ui3.js', 'utf8');
assert(!ui.includes('loadIronSixScript'), 'feature scripts must not depend on the old dynamic loader');
