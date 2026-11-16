// Makes the "Nippu, walking" example: the imported Nippu scene, with the
// couple walking in place.
//
//   node scripts/make-walk.mjs [in.zeditor.json] [out.zeditor.json]
//
// Defaults: src/examples/nippu.zeditor.json -> src/examples/nippu-walking.zeditor.json
//
// One step cycle takes CYCLE frames and repeats over the scene's 120 frames,
// so it loops with the Turntable camera. Every limb gets a key every STEP
// frames (linear between keys), sampled from a smooth cycle:
// - thighs swing forward and back in turn; a knee bends while its leg swings
//   forward and is straight while the foot is on the ground;
// - arms swing against the legs;
// - the body rides up and down so the planted foot stays on the ground: its
//   height is set from the longer leg's reach, every key.
// Angles are degrees, about each part's own X axis (+ swings forward: the
// couple faces +Z). The lady steps half a cycle after the dude.
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

/** Keys `path` of a group every STEP frames from `value(phase)`, phase 0..1 through a step cycle. */
function animate(groupPath, property, value) {
  const target = group(groupPath);
  const keys = [];
  for (let frame = 0; frame <= DURATION; frame += STEP) {
    keys.push({ frame, value: round(value((frame % CYCLE) / CYCLE)), easing: 'linear' });
  }
  target.tracks = { ...(target.tracks ?? {}), [property]: keys };
}

const base = (groupPath, property) => {
  const [kind, axis] = property.split('.');
  return group(groupPath)[kind][axis];
};

/** Forward swing of a thigh: -1..1, peaking a quarter cycle in. */
const swing = (phase) => Math.sin(TAU * phase);
/** How bent a knee is, 0..1: most as the leg passes under the body swinging forward, none in stance. */
const bend = (phase) => Math.max(0, Math.cos(TAU * phase)) ** 1.5;
/** How far down a leg reaches from its hip, for segments [length, world angle in degrees]. */
const reach = (segments) => segments.reduce((sum, [length, angle]) => sum + length * Math.cos(angle * RAD), 0);

// ----- the dude -----
{
  const HIPS_TILT = base('Ground/Dude/Hips', 'rotate.x'); // the hips lean 22.5° in the drawing
  const THIGH = 18;
  const SHIN = 22; // to the ankle (the shoe below it keeps one angle, so it doesn't change the reach)
  const SWING = 25;
  const KNEE = 55;
  const ARM = 20;
  const legs = {
    'Right thigh': (p) => p,
    'Left thigh': (p) => p + 0.5,
  };
  // Thigh angle in the hips' frame, centred on hanging straight down.
  const thigh = (p) => -HIPS_TILT + SWING * swing(p);
  const knee = (p) => -KNEE * bend(p);
  const legReach = (p) => reach([
    [THIGH, HIPS_TILT + thigh(p)],
    [SHIN, HIPS_TILT + thigh(p) + knee(p)],
  ]);
  for (const [name, phaseOf] of Object.entries(legs)) {
    const path = `Ground/Dude/Hips/${name}`;
    const shin = `${path}/${name.replace('thigh', 'shin')}`;
    const ankle = `${shin}/${name.replace('thigh', 'ankle')}`;
    animate(path, 'rotate.x', (p) => thigh(phaseOf(p)));
    animate(shin, 'rotate.x', (p) => knee(phaseOf(p)));
    // The shoe keeps the angle the planted right shoe has in the drawing.
    animate(ankle, 'rotate.x', (p) => -(thigh(phaseOf(p)) + knee(phaseOf(p))));
  }
  // Arms swing against the legs: the right arm forward with the left leg.
  const right = base('Ground/Dude/Torso/Right shoulder', 'rotate.x');
  const left = base('Ground/Dude/Torso/Left shoulder', 'rotate.x');
  animate('Ground/Dude/Torso/Right shoulder', 'rotate.x', (p) => right + ARM * swing(p + 0.5));
  animate('Ground/Dude/Torso/Left shoulder', 'rotate.x', (p) => left + ARM * swing(p));
  // The planted foot stays where the drawing's right foot is.
  const ground = reach([[THIGH, HIPS_TILT], [SHIN, HIPS_TILT]]);
  const y = base('Ground/Dude', 'translate.y');
  animate('Ground/Dude', 'translate.y', (p) => y + ground - Math.max(legReach(p), legReach(p + 0.5)));
}

// ----- the lady (half a step later) -----
{
  const LATER = 0.5;
  const LEG = 28 + 11; // one straight leg, then the shoe
  const THIGH = 16;
  const SHIN = 10 + 11;
  const SWING = 22;
  const KNEE = 45;
  const ARM = 10;
  const leftLeg = (p) => SWING * swing(p + 0.5);
  const rightThigh = (p) => SWING * swing(p);
  const rightKnee = (p) => -KNEE * bend(p);
  const lady = (p) => p + LATER;
  animate('Ground/Lady/Hips/Left leg', 'rotate.x', (p) => leftLeg(lady(p)));
  animate('Ground/Lady/Hips/Right thigh', 'rotate.x', (p) => rightThigh(lady(p)));
  animate('Ground/Lady/Hips/Right thigh/Right shin', 'rotate.x', (p) => rightKnee(lady(p)));
  // The suitcase arm swings a little, against her right leg; the phone hand stays put.
  const arm = base('Ground/Lady/Hips/Torso anchor/Torso/Right arm', 'rotate.x');
  animate('Ground/Lady/Hips/Torso anchor/Torso/Right arm', 'rotate.x', (p) => arm + ARM * swing(lady(p) + 0.5));
  // Her right foot is on the ground in the drawing (thigh 45°, shin straight down).
  const ground = reach([[THIGH, 45], [SHIN, 0]]);
  const legsReach = (p) =>
    Math.max(reach([[LEG, leftLeg(p)]]), reach([[THIGH, rightThigh(p)], [SHIN, rightThigh(p) + rightKnee(p)]]));
  const y = base('Ground/Lady/Hips', 'translate.y');
  animate('Ground/Lady/Hips', 'translate.y', (p) => y + ground - legsReach(lady(p)));
}

writeFileSync(output, `${JSON.stringify(scene, null, 2)}\n`);
const tracks = scene.groups.reduce((n, g) => n + Object.keys(g.tracks ?? {}).length, 0);
console.log(`Wrote ${output}: ${tracks} animated properties, a ${CYCLE}-frame step cycle repeated ${DURATION / CYCLE} times.`);
