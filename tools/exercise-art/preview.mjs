import { writeFileSync, mkdirSync } from 'node:fs';
import { frame } from './scene.mjs';
import { POSES } from './poses.mjs';
mkdirSync('C:/Users/jordm/Documents/GitHub/Iron-six-training/.art-preview', { recursive: true });
const cards = Object.entries(POSES).map(([id, p]) => {
  const a = frame(p.start, { equipment: p.equipment, muscles: p.muscles, title: p.title + ' start', label: 'start' });
  const b = frame(p.finish, { equipment: p.equipment, muscles: p.muscles, title: p.title + ' finish', label: 'finish' });
  return `<div class="card"><h3>${p.title}</h3><div class="pair"><div>${a}</div><div>${b}</div></div></div>`;
}).join('');
writeFileSync('C:/Users/jordm/Documents/GitHub/Iron-six-training/.art-preview/preview.html',
`<style>body{background:#11161b;color:#e8eef4;font:13px system-ui;margin:0;padding:16px}
.grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14px}
.card{background:#1b222a;border-radius:12px;padding:10px}
h3{margin:0 0 6px;font-size:13px;letter-spacing:.02em}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:8px}
svg{width:100%;height:auto;border-radius:8px;display:block}</style><div class="grid">${cards}</div>`);
console.log('preview written');
