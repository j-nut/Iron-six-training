// Pose library. Each entry is data, not drawing: two angle sets (start/finish), the
// equipment to compose, and the muscles to highlight. Adding an exercise is adding an entry
// here — the renderer guarantees it matches everything already in the library.
//
// Angles are absolute degrees, clockwise from +x in SVG space: 90 is straight down,
// -90 straight up, 0 forward (to the viewer's right, the direction the figure faces).
import { barbell, dumbbell, bench, pullupBar, band } from './scene.mjs';

const stand = {
  spine: -92, neck: -92,
  nearThigh: 91, nearShin: 90, nearFoot: 2,
  farThigh: 89, farShin: 90, farFoot: 2
};

// Hands on a bar racked across the upper back.
const backRackArms = { nearUpperArm: 128, nearForearm: -104, nearHand: -104, farUpperArm: 126, farForearm: -102, farHand: -102 };
const hangArms = { nearUpperArm: 92, nearForearm: 92, nearHand: 92, farUpperArm: 90, farForearm: 90, farHand: 90 };
const overheadArms = { nearUpperArm: -84, nearForearm: -88, nearHand: -88, farUpperArm: -86, farForearm: -90, farHand: -90 };

export const POSES = {
  'back-squat': {
    names: ['Barbell Back Squat', 'High-Bar Back Squat', 'Paused Barbell Back Squat'],
    title: 'Barbell Back Squat', muscles: ['quads', 'glutes'],
    start: { rootY: -6, angles: { ...stand, ...backRackArms } },
    finish: { rootY: 16, angles: { ...stand, ...backRackArms, spine: -74, neck: -80, nearThigh: 22, nearShin: 104, nearFoot: 4, farThigh: 20, farShin: 106, farFoot: 4 } },
    equipment: sk => ({ front: barbell({ x: sk.neckTop.x - 3.5, y: sk.neckTop.y + 1.5 }, { half: 30, plateR: 9.5 }) })
  },
  'goblet-squat': {
    names: ['Goblet Squat'],
    title: 'Goblet Squat', muscles: ['quads', 'glutes'],
    start: { rootY: -6, angles: { ...stand, nearUpperArm: 118, nearForearm: -46, nearHand: -46, farUpperArm: 116, farForearm: -44, farHand: -44 } },
    finish: { rootY: 16, angles: { ...stand, spine: -78, neck: -84, nearThigh: 24, nearShin: 102, nearFoot: 4, farThigh: 22, farShin: 104, farFoot: 4, nearUpperArm: 118, nearForearm: -50, nearHand: -50, farUpperArm: 116, farForearm: -48, farHand: -48 } },
    equipment: sk => ({ front: dumbbell({ x: sk.nearArm[3].x, y: sk.nearArm[3].y }, { angle: 90 }) })
  },
  'bodyweight-squat': {
    names: ['Tempo Bodyweight Squat', '1½-Rep Bodyweight Squat'],
    title: 'Bodyweight Squat', muscles: ['quads', 'glutes'],
    start: { rootY: -6, angles: { ...stand, nearUpperArm: 8, nearForearm: 4, nearHand: 4, farUpperArm: 10, farForearm: 6, farHand: 6 } },
    finish: { rootY: 16, angles: { ...stand, spine: -76, neck: -82, nearThigh: 22, nearShin: 104, nearFoot: 4, farThigh: 20, farShin: 106, farFoot: 4, nearUpperArm: 6, nearForearm: 2, nearHand: 2, farUpperArm: 8, farForearm: 4, farHand: 4 } },
    equipment: () => ({})
  },
  'romanian-deadlift': {
    names: ['Barbell Romanian Deadlift'],
    title: 'Barbell Romanian Deadlift', muscles: ['hamstrings', 'glutes'],
    start: { rootY: -6, angles: { ...stand, ...hangArms } },
    finish: { rootY: -2, angles: { ...stand, spine: -18, neck: -34, nearThigh: 84, nearShin: 92, farThigh: 82, farShin: 94, nearUpperArm: 84, nearForearm: 86, nearHand: 86, farUpperArm: 82, farForearm: 84, farHand: 84 } },
    equipment: sk => ({ front: barbell({ x: sk.nearArm[3].x, y: sk.nearArm[3].y }, { half: 30, plateR: 9.5 }) })
  },
  'overhead-press': {
    names: ['Barbell Overhead Press'],
    title: 'Barbell Overhead Press', muscles: ['shoulders', 'triceps'],
    start: { rootY: -6, angles: { ...stand, nearUpperArm: 132, nearForearm: -80, nearHand: -80, farUpperArm: 130, farForearm: -82, farHand: -82 } },
    finish: { rootY: -6, angles: { ...stand, ...overheadArms } },
    equipment: sk => ({ front: barbell({ x: sk.nearArm[3].x, y: sk.nearArm[3].y }, { half: 29, plateR: 9 }) })
  },
  'push-up': {
    names: ['Push-Up', 'Tempo Push-Up'],
    title: 'Push-Up', muscles: ['chest', 'triceps'],
    start: { rootX: 6, rootY: 22, angles: { spine: -6, neck: -8, nearUpperArm: 86, nearForearm: 88, nearHand: 88, farUpperArm: 88, farForearm: 90, farHand: 90, nearThigh: 176, nearShin: 178, nearFoot: 128, farThigh: 174, farShin: 176, farFoot: 126 } },
    finish: { rootX: 6, rootY: 32, angles: { spine: -6, neck: -8, nearUpperArm: 40, nearForearm: 124, nearHand: 124, farUpperArm: 42, farForearm: 126, farHand: 126, nearThigh: 176, nearShin: 178, nearFoot: 128, farThigh: 174, farShin: 176, farFoot: 126 } },
    equipment: () => ({})
  },
  'pull-up': {
    names: ['Pull-Up'],
    title: 'Pull-Up', muscles: ['back', 'biceps'],
    start: { rootY: 6, angles: { spine: -92, neck: -92, nearUpperArm: -86, nearForearm: -90, nearHand: -90, farUpperArm: -88, farForearm: -92, farHand: -92, nearThigh: 94, nearShin: 92, nearFoot: 8, farThigh: 92, farShin: 90, farFoot: 6 } },
    finish: { rootY: -14, angles: { spine: -92, neck: -92, nearUpperArm: -52, nearForearm: -122, nearHand: -122, farUpperArm: -54, farForearm: -124, farHand: -124, nearThigh: 100, nearShin: 76, nearFoot: 8, farThigh: 98, farShin: 74, farFoot: 6 } },
    equipment: () => ({ behind: pullupBar({ y: -52 }) })
  },
  'bench-press': {
    names: ['Barbell Bench Press', 'Paused Barbell Bench Press'],
    title: 'Barbell Bench Press', muscles: ['chest', 'triceps'],
    start: { rootX: -8, rootY: 22, angles: { spine: 4, neck: 2, nearUpperArm: -74, nearForearm: -88, nearHand: -88, farUpperArm: -76, farForearm: -90, farHand: -90, nearThigh: 44, nearShin: 118, nearFoot: 6, farThigh: 42, farShin: 120, farFoot: 6 } },
    finish: { rootX: -8, rootY: 22, angles: { spine: 4, neck: 2, nearUpperArm: -128, nearForearm: -34, nearHand: -34, farUpperArm: -130, farForearm: -36, farHand: -36, nearThigh: 44, nearShin: 118, nearFoot: 6, farThigh: 42, farShin: 120, farFoot: 6 } },
    equipment: sk => ({ behind: bench({ x: 2, y: 30, width: 66 }), front: barbell({ x: sk.nearArm[3].x, y: sk.nearArm[3].y }, { half: 29, plateR: 9 }) })
  },
  'bent-over-row': {
    names: ['Barbell Row'],
    title: 'Barbell Row', muscles: ['back', 'biceps'],
    start: { rootY: 2, angles: { spine: -34, neck: -48, nearThigh: 86, nearShin: 96, nearFoot: 4, farThigh: 84, farShin: 98, farFoot: 4, nearUpperArm: 84, nearForearm: 86, nearHand: 86, farUpperArm: 82, farForearm: 84, farHand: 84 } },
    finish: { rootY: 2, angles: { spine: -34, neck: -48, nearThigh: 86, nearShin: 96, nearFoot: 4, farThigh: 84, farShin: 98, farFoot: 4, nearUpperArm: 128, nearForearm: 34, nearHand: 34, farUpperArm: 126, farForearm: 32, farHand: 32 } },
    equipment: sk => ({ front: barbell({ x: sk.nearArm[3].x, y: sk.nearArm[3].y }, { half: 29, plateR: 9 }) })
  },
  'band-row': {
    names: ['Band Row'],
    title: 'Band Row', muscles: ['back', 'biceps'],
    start: { rootY: -4, angles: { ...stand, spine: -86, nearUpperArm: 66, nearForearm: 30, nearHand: 30, farUpperArm: 64, farForearm: 28, farHand: 28 } },
    finish: { rootY: -4, angles: { ...stand, spine: -92, nearUpperArm: 122, nearForearm: 22, nearHand: 22, farUpperArm: 120, farForearm: 20, farHand: 20 } },
    equipment: sk => ({ behind: band({ x: 52, y: sk.nearArm[3].y - 4 }, sk.nearArm[3], { sag: 4 }) })
  }
};

export const POSE_IDS = Object.keys(POSES);
