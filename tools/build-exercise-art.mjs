// Renders every pose in the Iron Six figure system to SVG under assets/exercise-art/.
// Deterministic: same input, same bytes, so reruns diff cleanly and review is meaningful.
import { writeFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { frame } from './exercise-art/scene.mjs';
import { POSES } from './exercise-art/poses.mjs';

const OUT = 'assets/exercise-art';
mkdirSync(OUT, { recursive: true });
for (const f of readdirSync(OUT)) if (f.endsWith('.svg')) rmSync(`${OUT}/${f}`);

let count = 0;
for (const [id, pose] of Object.entries(POSES)) {
  for (const phase of ['start', 'finish']) {
    const svg = frame(pose[phase], { equipment: pose.equipment, title: `${pose.title} — ${phase} position`, label: phase });
    writeFileSync(`${OUT}/${id}-${phase}.svg`, svg + '\n');
    count++;
  }
}
console.log(`exercise art: ${count} frames for ${Object.keys(POSES).length} movements -> ${OUT}`);
