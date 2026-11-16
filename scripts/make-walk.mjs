// Makes the "Nippu, walking" example: the imported Nippu scene, with the
// couple walking in place.
//
//   node scripts/make-walk.mjs [in.zeditor.json] [out.zeditor.json]
//
// Defaults: src/examples/nippu.zeditor.json -> src/examples/nippu-walking.zeditor.json
//
// One step cycle takes CYCLE frames and repeats over the scene's 120 frames,
// so it loops with the Turntable camera. Every limb gets a key every STEP
// frames (linear between keys), sampled from a walk cycle:
// - thighs swing forward and back in turn;
// - knees follow a walk's curve: a little bend as the heel lands, a big one
//   while the leg swings through, straight-ish in between;
// - feet stay level on the ground, tip up as the heel lands and point down
//   as the foot pushes off;
// - arms hang and swing against the legs, the elbows bending a little more
//   as an arm comes forward (the lady's suitcase arm swings a little; the hand
//   with the phone stays put);
// - the body rides up and down so the lowest point of the feet is always on
//   the floor (where the drawing's planted foot is).
// The lady's left leg is one straight piece in the drawing; here it gets a
// knee (the same leg, cut in two), so she doesn't walk stiff-legged.
//
// Angles are degrees about each part's own X axis: + swings a leg or arm
// forward (the couple faces +Z), + bends an elbow forward, - bends a knee
// back, + tips a toe up. All the legs' joints turn about X only, so their
// poses can be worked out in the side (Y-Z) plane.
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';

const [input = 'src/examples/nippu.zeditor.json', output = 'src/examples/nippu-walking.zeditor.json'] = process.argv.slice(2);
const scene = JSON.parse(readFileSync(input, 'utf8'));

const CYCLE = 30;
const STEP = 3;
const DURATION = scene.settings.duration;
if (DURATION % CYCLE !== 0) throw new Error(`The scene's ${DURATION} frames aren't whole steps of ${CYCLE}.`);

const TAU = Math.PI * 2;
const RAD = Math.PI / 180;
const round = (n) => Math.round(n * 1000) / 1000 || 0;
const wrap = (phase) => ((phase % 1) + 1) % 1;

// ----- the scene -----

/** A group by its path of names from the top, e.g. "Ground/Dude/Hips". */
function group(path) {
  let parent;
  let found;
  for (const name of path.split('/')) {
    found = scene.groups.find((g) => g.name === name && g.parent === parent);
    if (!found) throw new Error(`No group at ${path} (stopped at ${name})`);
    parent = found.id;
  }
  return found;
}

const base = (groupPath, property) => {
  const [kind, axis] = property.split('.');
  return group(groupPath)[kind][axis];
};

/** Sets a group's value outright (no keys). */
function pose(groupPath, property, value) {
  const [kind, axis] = property.split('.');
  group(groupPath)[kind][axis] = value;
}

/** Keys a group's `property` every STEP frames from `value(phase)`, phase 0..1 through a step. */
function animate(groupPath, property, value) {
  const target = group(groupPath);
  const keys = [];
  for (let frame = 0; frame <= DURATION; frame += STEP) {
    keys.push({ frame, value: round(value((frame % CYCLE) / CYCLE)), easing: 'linear' });
  }
  target.tracks = { ...(target.tracks ?? {}), [property]: keys };
}

const nextId = (items, prefix) =>
  `${prefix}-${1 + Math.max(0, ...items.map((item) => Number(item.id.slice(prefix.length + 1))).filter(Number.isFinite))}`;

/**
 * Cuts a straight leg (one Shape from its group's origin straight down) in
 * two at `at`, with a knee between: a new "Left shin" group holding a shin
 * `shinLength` long and the foot at its end.
 */
function addKnee(legPath, at, shinLength) {
  const leg = group(legPath);
  const foot = scene.groups.find((g) => g.parent === leg.id);
  const shape = scene.shapes.find((s) => s.parent === leg.id && s.type === 'Shape');
  const knee = {
    id: nextId(scene.groups, 'group'),
    name: 'Left shin',
    type: 'Group',
    translate: { x: 0, y: at, z: 0 },
    rotate: { x: 0, y: 0, z: 0 },
    scale: 1,
    drawTogether: false,
    parent: leg.id,
  };
  scene.groups.splice(scene.groups.indexOf(leg) + 1, 0, knee);
  const shin = {
    ...structuredClone(shape),
    id: nextId(scene.shapes, 'shape'),
    name: 'Left shin shape',
    parent: knee.id,
    props: { ...structuredClone(shape.props), path: [{ y: 0 }, { y: shinLength }] },
  };
  shape.props.path = [{ y: 0 }, { y: at }];
  scene.shapes.splice(scene.shapes.indexOf(shape) + 1, 0, shin);
  foot.parent = knee.id;
  foot.translate = { ...foot.translate, y: shinLength };
}

// ----- the walk cycle -----

/**
 * A curve through [phase, value] points (phase 0..1, the first at 0),
 * eased between them (smoothstep), wrapping around.
 */
function curve(points) {
  const all = [...points, [1, points[0][1]]];
  return (phase) => {
    const p = wrap(phase);
    const i = all.findIndex(([at], k) => k > 0 && p <= at);
    const [p0, v0] = all[i - 1];
    const [p1, v1] = all[i];
    const t = (p - p0) / (p1 - p0);
    return v0 + (v1 - v0) * t * t * (3 - 2 * t);
  };
}

// Phases of one leg's step: 0 the leg passes under the body swinging
// forward; 0.25 the heel lands (thigh furthest forward); 0.25-0.75 the foot
// is on the ground; 0.75 it pushes off (thigh furthest back).
/** Forward swing of a thigh: -1..1, furthest forward as the heel lands. */
const swing = (phase) => Math.sin(TAU * phase);
/** How bent a knee is, in degrees: most as the foot passes under the body. */
const KNEE = curve([
  [0, 60],
  [0.12, 32],
  [0.25, 4],
  [0.35, 12],
  [0.5, 4],
  [0.7, 8],
  [0.82, 26],
  [0.93, 52],
]);
const KNEE_MOST = 60;
/** A thigh, forward by `swing` degrees at most, lifted by `lift` more as its knee bends (so the foot clears the ground under the body instead of kicking back). */
const thighAngle = (swingDegrees, lift) => (phase) => swingDegrees * swing(phase) + (lift * KNEE(phase)) / KNEE_MOST;
/** How far the toe points up from level, in degrees: up as the heel lands, down at push-off. */
const TOE = curve([
  [0, -12],
  [0.15, 6],
  [0.25, 14],
  [0.33, 0],
  [0.6, 0],
  [0.75, -28],
  [0.86, -24],
]);

// ----- side-plane kinematics -----

const turn = (v, degrees) => {
  const c = Math.cos(degrees * RAD);
  const s = Math.sin(degrees * RAD);
  return { y: v.y * c - v.z * s, z: v.y * s + v.z * c };
};

/**
 * Where `point` (in the last joint's space) ends up below a hip, through
 * joints that each turn about X: [{ at: {y, z} in the parent joint's space, angle }].
 */
function follow(joints, point) {
  let at = { y: 0, z: 0 };
  let angle = 0;
  for (const joint of joints) {
    const offset = turn({ y: joint.at.y ?? 0, z: joint.at.z ?? 0 }, angle);
    at = { y: at.y + offset.y, z: at.z + offset.z };
    angle += joint.angle;
  }
  const end = turn({ y: point.y ?? 0, z: point.z ?? 0 }, angle);
  return { y: at.y + end.y, z: at.z + end.z };
}

/** How far below the hip a foot's lowest point is (the lowest of `points`, in the foot's space). */
const lowest = (joints, points) => Math.max(...points.map((point) => follow(joints, point).y));

// ----- the dude -----
{
  const HIPS = 'Ground/Dude/Hips';
  const RIGHT_SHOE = `${HIPS}/Right thigh/Right shin/Right ankle/Shoe`;
  const HIPS_TILT = base(HIPS, 'rotate.x'); // the hips lean 22.5° forward in the drawing
  const SHOE_TILT = base(RIGHT_SHOE, 'rotate.x');
  const shin = { y: base(`${HIPS}/Right thigh/Right shin`, 'translate.y') };
  const ankle = { y: base(`${HIPS}/Right thigh/Right shin/Right ankle`, 'translate.y') };
  const shoe = { y: base(RIGHT_SHOE, 'translate.y'), z: base(RIGHT_SHOE, 'translate.z') };
  // The sole's ends (13 long, 1 thick, 3.5 below the shoe's middle): the shoe's lowest points.
  const SOLE = [
    { y: -7, z: 4 },
    { y: 7, z: 4 },
  ];
  // A shoe is level when its sole faces straight down: turned -90° overall.
  const LEVEL = -90;
  const SWING = 24;
  const ARM = 20;

  const swung = thighAngle(SWING, 14);
  const thigh = (p) => -HIPS_TILT + swung(p); // centred on hanging straight down
  const knee = (p) => -KNEE(p);
  const ankleTurn = (p) => LEVEL + TOE(p) - (HIPS_TILT + thigh(p) + knee(p)) - SHOE_TILT;
  const joints = (t, k, a) => [
    { at: {}, angle: HIPS_TILT + t },
    { at: shin, angle: k },
    { at: ankle, angle: a },
    { at: shoe, angle: SHOE_TILT },
  ];
  const reach = (p) => lowest(joints(thigh(p), knee(p), ankleTurn(p)), SOLE);

  for (const [side, later] of [
    ['Right', 0],
    ['Left', 0.5],
  ]) {
    const leg = `${HIPS}/${side} thigh`;
    animate(leg, 'rotate.x', (p) => thigh(p + later));
    animate(`${leg}/${side} shin`, 'rotate.x', (p) => knee(p + later));
    animate(`${leg}/${side} shin/${side} ankle`, 'rotate.x', (p) => ankleTurn(p + later));
  }

  // Arms hang a little out from the body and swing against the legs (the
  // right arm forward with the left leg); elbows bend more coming forward.
  for (const [side, later, out] of [
    ['Right', 0.5, 16],
    ['Left', 0, -16],
  ]) {
    const shoulder = `Ground/Dude/Torso/${side} shoulder`;
    pose(shoulder, 'rotate.y', 0);
    pose(shoulder, 'rotate.z', out);
    pose(`${shoulder}/${side} arm`, 'rotate.y', 0);
    pose(`${shoulder}/${side} arm`, 'rotate.z', 0);
    animate(shoulder, 'rotate.x', (p) => ARM * swing(p + later));
    animate(`${shoulder}/${side} arm`, 'rotate.x', (p) => 19 + 9 * swing(p + later));
  }

  // The floor: the lowest point of the drawing's planted (right) shoe.
  const floor = lowest(joints(0, 0, 0), SOLE);
  const y = base('Ground/Dude', 'translate.y');
  animate('Ground/Dude', 'translate.y', (p) => y + floor - Math.max(reach(p), reach(p + 0.5)));
}

// ----- the lady (half a step after the dude) -----
{
  const HIPS = 'Ground/Lady/Hips';
  const LATER = 0.5;
  // Her heels: the toe and the heel's tip, 11 below the foot's top, level when the foot hangs straight.
  const SOLE = [
    { y: 11, z: 2 },
    { y: 11, z: -4 },
  ];
  const SWING = 20;
  const KNEE_SCALE = 0.8; // smaller steps in heels
  const ARM = 10;

  // The floor: the lowest point of the drawing's feet, before the walk changes anything.
  const drawn = (paths) =>
    lowest(
      paths.map((path, i) => ({ at: i === 0 ? {} : { y: base(path, 'translate.y'), z: base(path, 'translate.z') }, angle: base(path, 'rotate.x') })),
      SOLE,
    );
  const floor = Math.max(
    drawn([`${HIPS}/Left leg`, `${HIPS}/Left leg/Left foot`]),
    drawn([`${HIPS}/Right thigh`, `${HIPS}/Right thigh/Right shin`, `${HIPS}/Right thigh/Right shin/Right foot`]),
  );

  // Her left leg gets a knee where her right one has it, and the same
  // length: in the drawing it's 2 longer (hidden by its angle), which would
  // make her limp.
  const kneeAt = base(`${HIPS}/Right thigh/Right shin`, 'translate.y');
  const shinLength = base(`${HIPS}/Right thigh/Right shin/Right foot`, 'translate.y');
  addKnee(`${HIPS}/Left leg`, kneeAt, shinLength);
  const legs = [
    { side: 'Left', thigh: `${HIPS}/Left leg`, shin: `${HIPS}/Left leg/Left shin`, foot: 'Left foot', later: 0.5 },
    { side: 'Right', thigh: `${HIPS}/Right thigh`, shin: `${HIPS}/Right thigh/Right shin`, foot: 'Right foot', later: 0 },
  ];
  const thigh = thighAngle(SWING, 10);
  const knee = (p) => -KNEE_SCALE * KNEE(p);
  const footTurn = (p) => TOE(p) - (thigh(p) + knee(p));
  const reach = legs.map((leg) => (p) => {
    const q = p + LATER + leg.later;
    return lowest(
      [
        { at: {}, angle: thigh(q) },
        { at: { y: kneeAt }, angle: knee(q) },
        { at: { y: shinLength }, angle: footTurn(q) },
      ],
      SOLE,
    );
  });
  for (const leg of legs) {
    const phase = (p) => p + LATER + leg.later;
    animate(leg.thigh, 'rotate.x', (p) => thigh(phase(p)));
    animate(leg.shin, 'rotate.x', (p) => knee(phase(p)));
    animate(`${leg.shin}/${leg.foot}`, 'rotate.x', (p) => footTurn(phase(p)));
  }

  // The suitcase arm swings a little, against her right leg; the phone hand stays put.
  const arm = `${HIPS}/Torso anchor/Torso/Right arm`;
  const armBase = base(arm, 'rotate.x');
  animate(arm, 'rotate.x', (p) => armBase + ARM * swing(p + LATER + 0.5));

  const y = base(HIPS, 'translate.y');
  animate(HIPS, 'translate.y', (p) => y + floor - Math.max(...reach.map((r) => r(p))));
}

writeFileSync(output, `${JSON.stringify(scene, null, 2)}\n`);
const tracks = scene.groups.reduce((n, g) => n + Object.keys(g.tracks ?? {}).length, 0);
console.log(`Wrote ${output}: ${tracks} animated properties, a ${CYCLE}-frame step cycle repeated ${DURATION / CYCLE} times.`);
