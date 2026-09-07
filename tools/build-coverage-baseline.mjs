// Regenerates the media-coverage ratchet baseline. Run this only after coverage genuinely
// improves; the test compares against the committed file so an accidental regression fails.
import { writeFileSync, mkdirSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const registry = require('../exercise-registry.js');
const resolver = require('../exercise-media-resolver.js');
const rows = registry.exercises.map(e => ({ name: e.name, tier: resolver.resolve(e.name).tier }));
const tiers = rows.reduce((a, r) => { a[r.tier] = (a[r.tier] || 0) + 1; return a; }, {});
const exact = (tiers[1] || 0) + (tiers[2] || 0) + (tiers[3] || 0);
const comingSoon = rows.filter(r => r.tier === 6).map(r => r.name).sort();
mkdirSync('reports', { recursive: true });
writeFileSync('reports/media-coverage-baseline.json', JSON.stringify({
  note: 'Ratchet baseline for tests/exercise-media-coverage.test.js. comingSoon lists the grandfathered backlog; it may only shrink. Regenerate with tools/build-coverage-baseline.mjs after genuine improvements.',
  generatedAt: new Date().toISOString().slice(0, 10),
  total: rows.length, exact, tiers, comingSoon
}, null, 1) + '\n');
console.log(`baseline: ${rows.length} exercises, ${exact} exact, ${comingSoon.length} coming soon`);
