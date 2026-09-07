// Scene layer for the Iron Six figure system: fixed camera, shared floor, reusable
// equipment parts and the worked-muscle overlay. Equipment is drawn from primitives so a
// barbell looks identical in every exercise that uses one.
import { figure, skeleton, limb, PALETTE, RIG, round } from './figure.mjs';

// One camera for the whole library. Exercises never choose their own framing, which is what
// keeps the set looking like one product rather than a pile of clip art.
export const VIEWBOX = '-50 -58 100 112';
const FLOOR_Y = 48;

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function floor(cx = 0) {
  return `<ellipse cx="${round(cx)}" cy="${FLOOR_Y + 1}" rx="17" ry="2.6" fill="${PALETTE.floor}" opacity="0.75"/><line x1="-46" y1="${FLOOR_Y}" x2="46" y2="${FLOOR_Y}" stroke="${PALETTE.floor}" stroke-width="2" stroke-linecap="round"/>`;
}

export function plateStack(x, y, r = 11) {
  return `<g><circle cx="${round(x)}" cy="${round(y)}" r="${r}" fill="${PALETTE.equipment}"/>`
    + `<circle cx="${round(x)}" cy="${round(y)}" r="${round(r * 0.34)}" fill="${PALETTE.equipmentSoft}"/></g>`;
}

// A barbell drawn through a grip point, angled with the bar. `plates` false gives a bare bar.
export function barbell(grip, { angle = 0, half = 34, plates = true, plateR = 11 } = {}) {
  const rad = (angle * Math.PI) / 180;
  const dx = Math.cos(rad) * half, dy = Math.sin(rad) * half;
  const a = { x: grip.x - dx, y: grip.y - dy }, b = { x: grip.x + dx, y: grip.y + dy };
  return `<g><line x1="${round(a.x)}" y1="${round(a.y)}" x2="${round(b.x)}" y2="${round(b.y)}" stroke="${PALETTE.equipment}" stroke-width="4" stroke-linecap="round"/>`
    + (plates ? plateStack(a.x, a.y, plateR) + plateStack(b.x, b.y, plateR) : '') + '</g>';
}

export function dumbbell(grip, { angle = 0 } = {}) {
  const rad = (angle * Math.PI) / 180, half = 8;
  const dx = Math.cos(rad) * half, dy = Math.sin(rad) * half;
  const bell = (cx, cy) => `<rect x="${round(cx - 3.4)}" y="${round(cy - 6)}" width="6.8" height="12" rx="2.4" fill="${PALETTE.equipment}"/>`;
  return `<g><line x1="${round(grip.x - dx)}" y1="${round(grip.y - dy)}" x2="${round(grip.x + dx)}" y2="${round(grip.y + dy)}" stroke="${PALETTE.equipment}" stroke-width="3.2" stroke-linecap="round"/>`
    + bell(grip.x - dx, grip.y - dy) + bell(grip.x + dx, grip.y + dy) + '</g>';
}

export function bench({ x = 0, y = 30, width = 62, incline = 0 } = {}) {
  const half = width / 2;
  return `<g transform="rotate(${round(-incline)} ${round(x)} ${round(y)})">`
    + `<rect x="${round(x - half)}" y="${round(y - 5)}" width="${width}" height="8" rx="3.4" fill="${PALETTE.equipment}"/>`
    + `<rect x="${round(x - half + 5)}" y="${round(y + 3)}" width="5" height="${round(FLOOR_Y - y - 3)}" fill="${PALETTE.equipmentSoft}"/>`
    + `<rect x="${round(x + half - 10)}" y="${round(y + 3)}" width="5" height="${round(FLOOR_Y - y - 3)}" fill="${PALETTE.equipmentSoft}"/></g>`;
}

export function pullupBar({ y = -52, half = 30 } = {}) {
  return `<g><line x1="${-half}" y1="${y}" x2="${half}" y2="${y}" stroke="${PALETTE.equipment}" stroke-width="4.5" stroke-linecap="round"/>`
    + `<line x1="${-half}" y1="${y}" x2="${-half}" y2="${y - 12}" stroke="${PALETTE.equipmentSoft}" stroke-width="3.5"/>`
    + `<line x1="${half}" y1="${y}" x2="${half}" y2="${y - 12}" stroke="${PALETTE.equipmentSoft}" stroke-width="3.5"/></g>`;
}

export function band(from, to, { sag = 10 } = {}) {
  const mx = (from.x + to.x) / 2, my = (from.y + to.y) / 2 + sag;
  return `<path d="M ${round(from.x)} ${round(from.y)} Q ${round(mx)} ${round(my)} ${round(to.x)} ${round(to.y)}" fill="none" stroke="${PALETTE.equipmentSoft}" stroke-width="3" stroke-linecap="round"/>`;
}

// Worked-muscle overlay. Segments are re-stroked in the accent colour on top of the body so
// the highlight always lines up with the pose instead of being a fixed anatomical sprite.
const MUSCLE_SEGMENTS = {
  quads: [['nearLeg', 0], ['farLeg', 0]],
  hamstrings: [['nearLeg', 0], ['farLeg', 0]],
  glutes: [['nearLeg', 0]],
  calves: [['nearLeg', 1], ['farLeg', 1]],
  chest: [['torso', 0]],
  back: [['torso', 0]],
  shoulders: [['nearArm', 0], ['farArm', 0]],
  biceps: [['nearArm', 1]],
  triceps: [['nearArm', 1], ['farArm', 1]],
  core: [['torso', 0]]
};
const SEG_W = { nearArm: [[6.4, 5.2], [5.2, 3.8]], farArm: [[6.4, 5.2], [5.2, 3.8]], nearLeg: [[10.5, 7.4], [7.4, 4.6]], farLeg: [[10.5, 7.4], [7.4, 4.6]] };

export function muscleOverlay(sk, muscles = []) {
  const parts = [];
  for (const m of muscles) {
    for (const [chainName, index] of MUSCLE_SEGMENTS[m] || []) {
      if (chainName === 'torso') { parts.push(`<path d="${limb(sk.hip, sk.chest, 13, 16)}" fill="${PALETTE.accent}"/>`); continue; }
      const chain = sk[chainName]; if (!chain) continue;
      const w = SEG_W[chainName][index];
      parts.push(`<path d="${limb(chain[index], chain[index + 1], w[0], w[1])}" fill="${PALETTE.accent}"/>`);
    }
  }
  return parts.length ? `<g opacity="0.34">${parts.join('')}</g>` : '';
}

// Compose one frame. `build(sk)` returns equipment drawn behind and in front of the body,
// so a bench sits behind the lifter while a barbell crosses in front of the hands.
export function frame(pose, { equipment = () => ({}), title = '', label = '' } = {}) {
  const { svg: body, skeleton: sk } = figure(pose);
  const eq = equipment(sk) || {};
  const labelSvg = '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${VIEWBOX}" width="480" height="480" role="img" aria-label="${esc(title)}">`
    + `<title>${esc(title)}</title>`
    + `<rect x="-50" y="-58" width="100" height="112" fill="${PALETTE.panel}"/>`
    + floor((sk.nearLeg[3].x + sk.farLeg[3].x) / 2)
    + (eq.behind || '')
    + body
    + (eq.front || '')
    + labelSvg
    + '</svg>';
}

export { skeleton, PALETTE, RIG };
