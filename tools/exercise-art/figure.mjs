// Iron Six figure system — a deterministic 2D rig.
//
// Every illustration in the app is produced from this one renderer, so the whole library
// shares a silhouette, palette, camera and line weight by construction rather than by
// review. Adding an exercise means adding joint angles, not drawing a picture.
//
// A pose is a set of joint angles in degrees. Angles are absolute, measured clockwise from
// the +x axis in SVG space (y grows downward), so 90 points straight down and -90 straight
// up. Forward kinematics turns them into joint positions; limbs are then drawn as tapered
// capsules so the figure reads as a body with volume instead of a stick.

// Segment lengths in figure units. Total standing height is ~100, head ~1/7.5 of it.
export const RIG = {
  head: 12, neck: 4, spine: 27,
  upperArm: 17, forearm: 15, hand: 4,
  thigh: 25, shin: 23, foot: 9
};

// Limb thickness at each end, in figure units.
const WIDTH = {
  spine: [13, 16], neck: [5.5, 5.5],
  upperArm: [6.4, 5.2], forearm: [5.2, 3.8], hand: [3.8, 3.2],
  thigh: [10.5, 7.4], shin: [7.4, 4.6], foot: [4.6, 3.4]
};

export const PALETTE = {
  panel: '#F4F6F8',
  near: '#2E3A46',      // limbs closest to camera
  far: '#8A99A8',       // far-side limbs, lighter so depth reads instantly
  torso: '#26313B',
  head: '#26313B',
  equipment: '#141A20',
  equipmentSoft: '#5C6874',
  accent: '#A6D95B',    // Iron Six lime, used only for the worked muscle
  floor: '#D3DAE1',
  guide: '#B9C4CE'
};

const rad = deg => (deg * Math.PI) / 180;
const pt = (x, y) => ({ x, y });
const advance = (from, angle, length) => pt(from.x + Math.cos(rad(angle)) * length, from.y + Math.sin(rad(angle)) * length);
const round = n => Math.round(n * 100) / 100;

// A tapered capsule: two straight sides joined by semicircular caps. This is what stops the
// figure reading as a stick — the width profile carries the anatomy.
function limb(a, b, w1, w2) {
  const dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 0.0001;
  const nx = -dy / len, ny = dx / len, r1 = w1 / 2, r2 = w2 / 2;
  const p = (x, y) => `${round(x)} ${round(y)}`;
  return [
    `M ${p(a.x + nx * r1, a.y + ny * r1)}`,
    `L ${p(b.x + nx * r2, b.y + ny * r2)}`,
    `A ${round(r2)} ${round(r2)} 0 0 1 ${p(b.x - nx * r2, b.y - ny * r2)}`,
    `L ${p(a.x - nx * r1, a.y - ny * r1)}`,
    `A ${round(r1)} ${round(r1)} 0 0 1 ${p(a.x + nx * r1, a.y + ny * r1)}`,
    'Z'
  ].join(' ');
}

// Forward kinematics. `pose` supplies absolute angles; anything omitted falls back to a
// neutral standing value so a partial pose still renders a whole, sane body.
export function skeleton(pose = {}) {
  const a = {
    spine: -90, neck: -90,
    nearUpperArm: 95, nearForearm: 95, nearHand: 95,
    farUpperArm: 95, farForearm: 95, farHand: 95,
    nearThigh: 90, nearShin: 90, nearFoot: 0,
    farThigh: 90, farShin: 90, farFoot: 0,
    ...pose.angles
  };
  const hip = pt(pose.rootX ?? 0, pose.rootY ?? 0);
  const chest = advance(hip, a.spine, RIG.spine);
  const neckTop = advance(chest, a.neck, RIG.neck);
  const headCentre = advance(neckTop, a.neck, RIG.head / 2);
  const chain = (origin, keys, lengths) => {
    const out = [origin];
    let cur = origin;
    keys.forEach((k, i) => { cur = advance(cur, a[k], lengths[i]); out.push(cur); });
    return out;
  };
  const armLengths = [RIG.upperArm, RIG.forearm, RIG.hand];
  const legLengths = [RIG.thigh, RIG.shin, RIG.foot];
  return {
    hip, chest, neckTop, headCentre, angles: a,
    nearArm: chain(chest, ['nearUpperArm', 'nearForearm', 'nearHand'], armLengths),
    farArm: chain(chest, ['farUpperArm', 'farForearm', 'farHand'], armLengths),
    nearLeg: chain(hip, ['nearThigh', 'nearShin', 'nearFoot'], legLengths),
    farLeg: chain(hip, ['farThigh', 'farShin', 'farFoot'], legLengths)
  };
}

function limbGroup(joints, widths, fill) {
  return joints.slice(0, -1)
    .map((j, i) => `<path d="${limb(j, joints[i + 1], widths[i][0], widths[i][1])}" fill="${fill}"/>`)
    .join('');
}

const ARM_W = [WIDTH.upperArm, WIDTH.forearm, WIDTH.hand];
const LEG_W = [WIDTH.thigh, WIDTH.shin, WIDTH.foot];

// Draw order is the depth cue: far limbs, then torso, then near limbs on top.
export function figure(pose = {}) {
  const s = skeleton(pose);
  const far = `<g opacity="0.92">${limbGroup(s.farLeg, LEG_W, PALETTE.far)}${limbGroup(s.farArm, ARM_W, PALETTE.far)}</g>`;
  // A pelvis disc closes the seam where the thighs meet the spine capsule.
  const torso = `<circle cx="${round(s.hip.x)}" cy="${round(s.hip.y)}" r="6.6" fill="${PALETTE.torso}"/>`
    + `<path d="${limb(s.hip, s.chest, WIDTH.spine[0], WIDTH.spine[1])}" fill="${PALETTE.torso}"/>`
    + `<path d="${limb(s.chest, s.neckTop, WIDTH.neck[0], WIDTH.neck[1])}" fill="${PALETTE.torso}"/>`
    + `<circle cx="${round(s.headCentre.x)}" cy="${round(s.headCentre.y)}" r="${RIG.head / 2}" fill="${PALETTE.head}"/>`;
  const near = `${limbGroup(s.nearLeg, LEG_W, PALETTE.near)}${limbGroup(s.nearArm, ARM_W, PALETTE.near)}`;
  return { svg: far + torso + near, skeleton: s };
}

export { limb, advance, round };
