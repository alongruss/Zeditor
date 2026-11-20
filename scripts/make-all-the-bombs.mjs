// Makes the "All the bombs at once" example: an unofficial fan recreation, in
// Zdog shapes, of four scenes from Kurzgesagt – In a Nutshell's video
// "What If We Detonated All Nuclear Bombs at Once?" (31 March 2019):
// https://www.youtube.com/watch?v=JyECrGp-Sw8
// The story, the ideas and the look are Kurzgesagt's; this example is not made
// or endorsed by them.
//
//   node scripts/make-all-the-bombs.mjs [out.zeditor.json]
//
// Default: src/examples/all-the-bombs.zeditor.json
//
// Four sets stand in a row along X, SET_GAP apart, and one "Film" camera cuts
// from set to set (a key that holds, then a jump):
//   1. The stockpile (frames 0-119): the world's warheads drop onto a stage,
//      one drop for about 200 of the 15,000.
//   2. The button (120-269): a bird hops onto a big red button; a fireball
//      rises over the hills and everything turns orange, then white.
//   3. The mushroom cloud (270-419): the cloud climbs past the tropopause, its
//      base rolling out, and cools from orange to purple.
//   4. Winter, then spring (420-599): snow falls on a ruined city; it thaws,
//      trees grow back, and the bird returns.
//
// Skies are flat cards turned to face the camera (see `facing`). Angles are
// degrees; Y points down, as in zdog. zdog doesn't scale a stroke with its
// shape, so balls (one-point Shapes, as wide as their stroke) grow and hide by
// their stroke, not their scale.
import { writeFileSync } from 'node:fs';
import process from 'node:process';

const [output = 'src/examples/all-the-bombs.zeditor.json'] = process.argv.slice(2);

const FPS = 30;
const DURATION = 600;
const SET_GAP = 600;
const SHOTS = {
  stockpile: { from: 0, to: 120 },
  button: { from: 120, to: 270 },
  cloud: { from: 270, to: 420 },
  winter: { from: 420, to: 600 },
};

const round = (n) => Math.round(n * 1000) / 1000 || 0;
const lerp = (a, b, t) => a + (b - a) * t;
const vec = ([x = 0, y = 0, z = 0] = []) => ({ x: round(x), y: round(y), z: round(z) });

// A small, repeatable random, so the file comes out the same every time.
let seed = 7;
const random = () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};
const between = (a, b) => lerp(a, b, random());

/** A hex color between `a` and `b`. */
function mix(a, b, t) {
  const parse = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [ca, cb] = [parse(a), parse(b)];
  return `#${ca.map((c, i) => Math.round(lerp(c, cb[i], t)).toString(16).padStart(2, '0')).join('')}`;
}

/** A hex color, lighter (factor above 1) or darker. */
const shade = (hex, factor) => (factor > 1 ? mix(hex, '#ffffff', factor - 1) : mix('#000000', hex, factor));

// ----- the scene -----

const DEFAULTS = {
  Rect: { width: 4, height: 4, color: '#ee6622', stroke: 1, fill: false },
  Ellipse: { diameter: 4, quarters: 4, color: '#cc2255', stroke: 1, fill: false, closed: false },
  Shape: { path: [{}], color: '#663366', stroke: 2, fill: false, closed: true, visible: true },
  Hemisphere: { diameter: 5, color: '#cc2255', backface: '#eeaa00', stroke: 0, fill: true },
  Cylinder: { diameter: 5, length: 4, color: '#eeaa00', backface: '#ffeedd', stroke: 0, fill: true },
  Cone: { diameter: 5, length: 4, color: '#663366', backface: '#cc2255', stroke: 0, fill: true },
  Box: {
    width: 5,
    height: 5,
    depth: 5,
    color: '#ee6622',
    stroke: 0,
    fill: true,
    frontFace: true,
    rearFace: true,
    leftFace: true,
    rightFace: true,
    topFace: true,
    bottomFace: true,
  },
};

const shapes = [];
const groups = [];
const counts = {};
const nextId = (prefix) => `${prefix}-${(counts[prefix] = (counts[prefix] ?? 0) + 1)}`;

/** A group; returns it, so its children can name it as `parent`. */
function group(name, { parent, at, rotate, scale = 1, drawTogether = false } = {}) {
  const g = {
    id: nextId('group'),
    name,
    type: 'Group',
    translate: vec(at),
    rotate: vec(rotate),
    scale,
    drawTogether,
    ...(parent ? { parent: parent.id } : {}),
  };
  groups.push(g);
  return g;
}

/** A shape of a type, with its own settings over the type's defaults. */
function shape(type, name, { parent, at, rotate, scale = 1, opacity = 1, ...props } = {}) {
  const s = {
    id: nextId(type.toLowerCase()),
    name,
    type,
    translate: vec(at),
    rotate: vec(rotate),
    scale,
    opacity,
    props: { ...DEFAULTS[type], ...props },
    ...(parent ? { parent: parent.id } : {}),
  };
  shapes.push(s);
  return s;
}

/** A ball: a one-point Shape, as wide as its stroke. */
const ball = (name, size, color, options = {}) => shape('Shape', name, { stroke: round(size), color, ...options });

/** A key on `object`'s track for `path` (e.g. 'translate.y', 'props.color'). */
function key(object, path, frame, value, easing = 'easeInOut') {
  object.tracks ??= {};
  (object.tracks[path] ??= []).push({ frame, value: typeof value === 'number' ? round(value) : value, easing });
}

/** Keys from a list of [frame, value, easing?]. */
function keys(object, path, list) {
  for (const [frame, value, easing = 'easeInOut'] of list) key(object, path, frame, value, easing);
}

/** Ease that overshoots a little, then settles. */
const BOUNCY = [0.34, 1.56, 0.64, 1];

/** A group hidden (scale 0) until `frame`, then grown to `size` over `grow` frames, with a little overshoot. */
function popIn(object, frame, grow = 8, size = 1) {
  keys(object, 'scale', [
    [0, 0, 'hold'],
    [frame, 0, BOUNCY],
    [frame + grow, size, 'linear'],
  ]);
}

/** A ball hidden until `frame`, then grown to its size over `grow` frames. */
function popBall(b, frame, grow = 8) {
  const size = b.props.stroke;
  keys(b, 'props.stroke', [
    [0, 0, 'hold'],
    [frame, 0, BOUNCY],
    [frame + grow, size, 'linear'],
  ]);
}

/** A ball's size over time, as [frame, times its size, easing]. */
function growBall(b, list) {
  const size = b.props.stroke;
  keys(
    b,
    'props.stroke',
    list.map(([frame, factor, easing]) => [frame, size * factor, easing]),
  );
}

/**
 * A group that turns its children to face a camera turned by `rotate` (x, y),
 * at `at`: the camera turns the world by X after Y, so this undoes Y after X.
 */
function facing(name, { parent, at, rotate }) {
  const outer = group(name, { parent, at, rotate: [0, -rotate.y, 0] });
  return group(`${name} (tilt)`, { parent: outer, rotate: [-rotate.x, 0, 0] });
}

/** A flat card in a facing group: a filled rectangle, `z` in front of (+) or behind (-) the target. */
const card = (name, parent, { x = 0, y = 0, z, width, height, color, opacity = 1 }) =>
  shape('Rect', name, { parent, at: [x, y, z], width, height, color, fill: true, stroke: 0, opacity });

/**
 * How near the camera a spot on the ground is, for a camera turned `turn`
 * degrees about Y (bigger is nearer): for drawing things back to front.
 */
const depthAt = ({ x, z }, turn) => z * Math.cos((turn * Math.PI) / 180) + x * Math.sin((turn * Math.PI) / 180);

/** One path of separate line segments ([from, to] pairs): each after the first starts with a move. */
function segments(pairs) {
  return pairs.flatMap(([from, to], i) => [i === 0 ? { ...from } : { move: { ...from } }, { ...to }]);
}

// The bird, facing -X, standing on its group's origin, `k` times its size.
// Returns its group and parts, so they can be animated and recolored.
function bird(name, parent, at, k = 1) {
  const g = group(name, { parent, at });
  const p = (x, y, z = 0) => ({ x: round(x * k), y: round(y * k), z: round(z * k) });
  const pos = (x, y, z = 0) => [x * k, y * k, z * k];
  const parts = {
    leftLeg: shape('Shape', 'Left leg', {
      parent: g,
      path: [p(-1.4, -3.4, 1.6), p(-1.8, 0, 1.6), p(-3.6, 0, 1.6)],
      closed: false,
      stroke: round(1 * k),
      color: '#ff9b2f',
    }),
    rightLeg: shape('Shape', 'Right leg', {
      parent: g,
      path: [p(1.2, -3.4, -1.6), p(0.8, 0, -1.6), p(-1, 0, -1.6)],
      closed: false,
      stroke: round(1 * k),
      color: '#ff9b2f',
    }),
    tail: shape('Shape', 'Tail', {
      parent: g,
      at: pos(0, 0, -1),
      path: [p(4.5, -8), p(10.5, -12.5), p(10, -6.5)],
      fill: true,
      stroke: round(1.6 * k),
      color: '#1d62e6',
    }),
    body: ball('Body', 13 * k, '#2f80ff', { parent: g, at: pos(0, -9, 0) }),
    belly: ball('Belly', 8.4 * k, '#aef0ff', { parent: g, at: pos(-2.4, -7.2, 2.8) }),
    wing: shape('Shape', 'Wing', {
      parent: g,
      at: pos(1.6, -8.4, 5.2),
      path: [p(-2, -1.6), p(3, -0.6), p(4.2, 2.6), p(-0.6, 1.8)],
      fill: true,
      stroke: round(2.2 * k),
      color: '#1d62e6',
    }),
    crest: shape('Shape', 'Crest', {
      parent: g,
      at: pos(0, -15, 0),
      path: [p(-1.6, 0.6), p(0.4, -3.4), p(1.8, 0.4)],
      fill: true,
      stroke: round(1.4 * k),
      color: '#2f80ff',
    }),
    eye: ball('Eye', 4 * k, '#ffffff', { parent: g, at: pos(-3.4, -10.8, 4.4) }),
    pupil: ball('Pupil', 2 * k, '#1b1446', { parent: g, at: pos(-4.2, -10.8, 5.3) }),
    beak: shape('Cone', 'Beak', {
      parent: g,
      at: pos(-5.8, -9.2, 2.6),
      rotate: [0, 90, 0],
      diameter: round(3 * k),
      length: round(3.4 * k),
      color: '#ffc21a',
      backface: '#ff9b00',
    }),
  };
  return { group: g, parts };
}

const camera = {
  id: 'camera-1',
  name: 'Film',
  type: 'Camera',
  rotate: vec(),
  target: vec(),
  viewSpan: 80,
  width: 960,
  height: 540,
};

/** A camera move over a shot: from `start` to `end`, then a cut to the next shot. */
function cameraShot({ from, to }, start, end, easing = 'easeInOut') {
  const paths = { 'rotate.x': 'rx', 'rotate.y': 'ry', 'target.x': 'tx', 'target.y': 'ty', 'target.z': 'tz', viewSpan: 'span' };
  for (const [path, k] of Object.entries(paths)) {
    key(camera, path, from, start[k], easing);
    key(camera, path, to - 1, end[k], 'hold');
  }
}

// ===== 1. The stockpile =====
{
  const X = 0;
  cameraShot(SHOTS.stockpile, { rx: -24, ry: 30, tx: X, ty: -8, tz: 0, span: 70 }, { rx: -30, ry: 44, tx: X, ty: -5, tz: 0, span: 60 });

  const set = group('1 · The stockpile', { at: [X, 0, 0] });
  const back = facing('Backdrop', { parent: set, at: [0, -5, 0], rotate: { x: -27, y: 37 } });
  card('Yellow', back, { z: -120, width: 320, height: 200, color: '#ffd21f' });

  const COLS = 10;
  const ROWS = 7;
  const DX = 7;
  const DZ = 7.6;
  const width = (COLS - 1) * DX + 12;
  const depth = (ROWS - 1) * DZ + 12;
  // Drawn as one unit, in order: the stage, then the drops from back to front
  // (as the camera sees them halfway through the shot). zdog would otherwise
  // sort each shape by its middle, and the stage's top would cover the drops
  // behind its middle.
  const pile = group('Stockpile', { parent: set, drawTogether: true });
  const stage = group('Stage', { parent: pile });
  shape('Box', 'Step', {
    parent: stage,
    at: [0, 5.5, 0],
    width: width + 6,
    depth: depth + 6,
    height: 3,
    color: '#ffab00',
    topFace: '#ffbe1f',
    frontFace: '#e58e00',
    rightFace: '#d47f00',
    leftFace: false,
    rearFace: false,
    bottomFace: false,
  });
  shape('Box', 'Top', {
    parent: stage,
    at: [0, 2, 0],
    width,
    depth,
    height: 4,
    color: '#ffb703',
    topFace: '#ffc634',
    frontFace: '#f39a00',
    rightFace: '#e38a00',
    leftFace: false,
    rearFace: false,
    bottomFace: false,
  });

  // Each drop falls in from above the picture, in a wave from the front corner, and bounces once.
  const spots = [];
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      spots.push({ row, col, x: (col - (COLS - 1) / 2) * DX, z: (row - (ROWS - 1) / 2) * DZ });
    }
  }
  for (const { row, col, x, z } of spots.sort((a, b) => depthAt(a, 37) - depthAt(b, 37))) {
    const drop = group(`Warhead ${row * COLS + col + 1}`, { parent: pile, at: [x, 0, z] });
    ball('Bottom', 5, '#2f86f0', { parent: drop, at: [0, -2.7, 0] });
    shape('Cone', 'Tip', {
      parent: drop,
      at: [0, -2.7, 0],
      rotate: [90, 0, 0],
      diameter: 5,
      length: 6,
      color: '#7fd6ff',
      backface: '#2f86f0',
    });
    ball('Shine', 1.2, '#d8f4ff', { parent: drop, at: [-1, -4.6, 1.4] });
    const land = 12 + (col + (ROWS - 1 - row)) * 3 + Math.round(random() * 3);
    keys(drop, 'translate.y', [
      [0, -110, 'hold'],
      [land - 9, -110, 'easeIn'],
      [land, 0, 'easeOut'],
      [land + 4, -2, 'easeIn'],
      [land + 8, 0, 'linear'],
    ]);
  }
}

// ===== 2. The button =====
{
  const X = SET_GAP;
  const shot = SHOTS.button;
  cameraShot(shot, { rx: -3, ry: -10, tx: X + 6, ty: -10, tz: 0, span: 86 }, { rx: -3, ry: -4, tx: X + 2, ty: -12, tz: 0, span: 78 });

  const PRESS = 156;
  const FLASH = 168;
  const TURN = FLASH + 14;
  const BLAZE = 206;
  const WHITE = 266;
  /** Calm, then quickly through a bright middle color to hot, which holds, then pale before the white-out. */
  const recolor = (object, path, [calm, middle, hot, pale]) =>
    keys(object, path, [
      [FLASH, calm, 'easeIn'],
      [TURN, middle, 'easeOut'],
      [BLAZE, hot, 'linear'],
      [BLAZE + 32, hot, 'easeIn'],
      [WHITE - 4, pale, 'hold'],
    ]);

  const set = group('2 · The button', { at: [X, 0, 0] });
  const back = facing('Sky', { parent: set, at: [0, -10, 0], rotate: { x: -3, y: -7 } });
  recolor(card('Sky', back, { y: -40, z: -140, width: 320, height: 140, color: '#2fb2ff' }), 'props.color', [
    '#2fb2ff',
    '#ff6fb8',
    '#ff8a1f',
    '#ffe9a8',
  ]);
  recolor(card('Horizon glow', back, { y: 28, z: -138, width: 320, height: 60, color: '#8fe3ff' }), 'props.color', [
    '#8fe3ff',
    '#ffc2e2',
    '#ffd23f',
    '#fff6d8',
  ]);

  // The fireball rises behind the far hills.
  const fireball = group('Fireball', { parent: set, at: [-20, 16, -95] });
  const halo = ball('Halo', 40, '#fff3a0', { parent: fireball, opacity: 0.55 });
  const core = ball('Core', 26, '#fffbea', { parent: fireball, at: [0, 0, 1] });
  const fireRing = shape('Ellipse', 'Ring', {
    parent: fireball,
    at: [0, 0, 2],
    diameter: 32,
    stroke: 2.4,
    color: '#ffd23f',
    closed: true,
  });
  const growth = [
    [0, 0, 'hold'],
    [FLASH, 0, 'easeOut'],
    [FLASH + 6, 0.45, 'easeInOut'],
    [BLAZE, 1.5, 'easeIn'],
    [WHITE, 6, 'linear'],
  ];
  growBall(halo, growth);
  growBall(core, growth);
  keys(
    fireRing,
    'props.diameter',
    growth.map(([f, k, e]) => [f, 32 * k, e]),
  );
  keys(fireRing, 'opacity', [
    [0, 0, 'hold'],
    [FLASH, 1, 'linear'],
  ]);
  keys(fireball, 'translate.y', [
    [FLASH, 16, 'easeOut'],
    [BLAZE, 2, 'easeIn'],
  ]);

  // Clouds drift.
  [
    [-52, -34, -120, 1],
    [6, -44, -118, 0.8],
    [58, -28, -116, 1.1],
  ].forEach(([x, y, z, size], i) => {
    const cloud = group(`Cloud ${i + 1}`, { parent: set, at: [x, y, z] });
    [
      [-6, 1, 7],
      [-1, -1.5, 9],
      [5, 0.5, 7.5],
      [10, 1.6, 5],
    ].forEach(([px, py, s], j) => {
      const puff = ball(`Puff ${j + 1}`, s * size, '#ffffff', { parent: cloud, at: [px * size, py * size, j % 2] });
      recolor(puff, 'props.color', ['#ffffff', '#ffe0f0', '#ffc27a', '#fff8e6']);
    });
    keys(cloud, 'translate.x', [
      [shot.from, x, 'linear'],
      [shot.to - 1, x + 8, 'linear'],
    ]);
  });

  const hill = (name, [x, y, z], diameter, colors) => {
    const h = shape('Ellipse', name, { parent: set, at: [x, y, z], diameter, color: colors[0], fill: true, stroke: 1, closed: true });
    recolor(h, 'props.color', colors);
    return h;
  };
  hill('Far hill 1', [-78, 64, -80], 130, ['#22b8a0', '#c8e84a', '#ff6a45', '#ffd0a0']);
  hill('Far hill 2', [18, 78, -78], 160, ['#27c98c', '#d4ec52', '#ff7a4a', '#ffd8a8']);
  hill('Far hill 3', [96, 60, -76], 120, ['#20ad8f', '#c0e04a', '#ff6340', '#ffcf9c']);
  hill('Mid hill 1', [-44, 92, -52], 160, ['#36d45e', '#ffe04a', '#f2493d', '#ffbf8a']);
  hill('Mid hill 2', [64, 100, -50], 176, ['#2fc356', '#ffd84a', '#e83f3a', '#ffb880']);

  // Round trees on the middle hills.
  [
    [-62, 16, -46, 1.1],
    [-48, 15, -44, 0.8],
    [-16, 15, -45, 1],
    [30, 18, -44, 0.9],
    [72, 16, -43, 1.2],
  ].forEach(([x, y, z, size], i) => {
    const tree = group(`Tree ${i + 1}`, { parent: set, at: [x, y, z] });
    shape('Shape', 'Trunk', { parent: tree, path: [{ y: 0 }, { y: -6 * size }], stroke: 1.4, color: '#1a6e47' });
    const green = i % 2 ? '#1fae5b' : '#27c26a';
    const crown = ball('Crown', 9 * size, green, { parent: tree, at: [0, -8 * size, 0] });
    recolor(crown, 'props.color', [green, '#ffb030', '#b8233a', '#ffa070']);
  });

  // The near hill, where the bird and its button stand.
  const NEAR = { x: 84, y: 124, r: 112 };
  const groundAt = (x) => NEAR.y - Math.sqrt(NEAR.r ** 2 - (x - NEAR.x) ** 2);
  hill('Near hill rim', [NEAR.x, NEAR.y, -14], NEAR.r * 2 + 3, ['#239a46', '#d8a828', '#a01f3a', '#ff9a6a']);
  hill('Near hill', [NEAR.x, NEAR.y + 1.2, -12], NEAR.r * 2, ['#58dc5c', '#ffe85a', '#ff5a3a', '#ffc890']);

  const BUTTON_X = 30;
  const buttonBase = groundAt(BUTTON_X) + 1;
  const button = group('Button', { parent: set, at: [BUTTON_X, buttonBase, 2], rotate: [0, 24, 0] });
  shape('Box', 'Pedestal', {
    parent: button,
    at: [0, -4, 0],
    width: 11,
    height: 8,
    depth: 9,
    color: '#8b45f5',
    topFace: '#a46bff',
    frontFace: '#7d35ea',
    leftFace: '#6122c4',
    rightFace: '#6122c4',
    rearFace: '#7d35ea',
  });
  shape('Rect', 'Stripe', { parent: button, at: [0, -2.4, 4.6], width: 11, height: 1.6, color: '#ffd23f', fill: true, stroke: 0 });
  const cap = group('Cap', { parent: button, at: [0, -9, 0] });
  shape('Cylinder', 'Red cap', { parent: cap, rotate: [90, 0, 0], diameter: 7.4, length: 2.4, color: '#ff2d55', backface: '#c8103a' });
  shape('Ellipse', 'Shine', {
    parent: cap,
    at: [-0.6, -1.25, -0.4],
    rotate: [90, 0, 0],
    diameter: 4,
    color: '#ff8aa0',
    fill: true,
    stroke: 0,
    closed: true,
  });
  keys(cap, 'translate.y', [
    [PRESS - 1, -9, 'easeIn'],
    [PRESS + 2, -7.6, 'hold'],
  ]);

  // The bird hops onto the button, then turns to watch.
  const BIRD_X = 56;
  const standing = groundAt(BIRD_X) + 0.6;
  const capTop = buttonBase - 4 - 4 - 1.2 - 1.2 + 1.4;
  const { group: b, parts } = bird('Bird', set, [BIRD_X, standing, 6]);
  keys(b, 'translate.x', [
    [shot.from, BIRD_X, 'hold'],
    [PRESS - 10, BIRD_X, 'easeInOut'],
    [PRESS, BUTTON_X + 2, 'linear'],
  ]);
  keys(b, 'translate.y', [
    [shot.from, standing, 'easeInOut'],
    [shot.from + 10, standing - 1, 'easeInOut'],
    [shot.from + 20, standing, 'easeInOut'],
    [shot.from + 30, standing - 1, 'easeInOut'],
    [PRESS - 10, standing, 'easeOut'],
    [PRESS - 5, capTop - 12, 'easeIn'],
    [PRESS, capTop, 'easeOut'],
    [PRESS + 2, capTop + 1.4, 'hold'],
  ]);
  keys(b, 'rotate.z', [
    [PRESS - 12, 0, 'easeInOut'],
    [PRESS - 8, -12, 'easeOut'],
    [PRESS, 6, 'easeOut'],
    [PRESS + 6, 0, 'hold'],
  ]);
  keys(b, 'rotate.y', [
    [FLASH, 0, 'easeInOut'],
    [FLASH + 8, -26, 'hold'],
  ]);
  // Lit from behind: a silhouette.
  const dark = { body: '#4a2370', belly: '#6e3a8c', wing: '#33185a', tail: '#33185a', crest: '#4a2370' };
  for (const [part, color] of Object.entries(dark)) {
    keys(parts[part], 'props.color', [
      [TURN, parts[part].props.color, 'easeIn'],
      [BLAZE + 10, color, 'hold'],
    ]);
  }

  // Leaves in front, for depth.
  [
    [-78, 40, 30, 16, '#108a4a'],
    [-66, 46, 34, 13, '#17a055'],
    [86, 36, 28, 14, '#108a4a'],
  ].forEach(([x, y, z, s, color], i) => {
    const leaf = ball(`Bush ${i + 1}`, s, color, { parent: set, at: [x, y, z] });
    recolor(leaf, 'props.color', [color, '#9a5a2a', '#6a1636', '#ff9a70']);
  });

  const front = facing('Flash', { parent: set, at: [0, -10, 0], rotate: { x: -3, y: -7 } });
  const white = card('White', front, { z: 80, width: 320, height: 200, color: '#fffbe8', opacity: 0 });
  keys(white, 'opacity', [
    [WHITE - 10, 0, 'easeIn'],
    [WHITE, 1, 'hold'],
  ]);
}

// ===== 3. The mushroom cloud =====
{
  const X = SET_GAP * 2;
  const shot = SHOTS.cloud;
  const t0 = shot.from;
  const end = shot.to - 1;
  cameraShot(shot, { rx: -4, ry: 14, tx: X, ty: -24, tz: 0, span: 92 }, { rx: -6, ry: -10, tx: X, ty: -50, tz: 0, span: 124 });

  const set = group('3 · The mushroom cloud', { at: [X, 0, 0] });
  const back = facing('Sky', { parent: set, at: [0, -40, 0], rotate: { x: -5, y: 2 } });
  // A gradient, as thin bands, from space down to a red horizon. The low
  // bands start out lit by the flash.
  const STOPS = [
    [-150, '#120c40'],
    [-70, '#25125f'],
    [-30, '#4e1878'],
    [0, '#8e2078'],
    [25, '#d4306c'],
    [45, '#ff6a3a'],
    [60, '#ff8a3a'],
  ];
  const colorAt = (y) => {
    const i = STOPS.findIndex(([sy]) => sy >= y);
    if (i <= 0) return STOPS[Math.max(0, i)][1];
    const [y0, c0] = STOPS[i - 1];
    const [y1, c1] = STOPS[i];
    return mix(c0, c1, (y - y0) / (y1 - y0));
  };
  const BAND = 5;
  for (let y = -96, i = 0; y < 60; y += BAND, i++) {
    const color = colorAt(y + BAND / 2);
    const band = card(`Sky ${i + 1}`, back, { y: y + BAND / 2, z: -160 + i * 0.1, width: 340, height: BAND + 0.6, color });
    if (y > -20) {
      keys(band, 'props.color', [
        [t0, mix(color, '#fff0a8', 0.75), 'easeOut'],
        [t0 + 50, color, 'linear'],
      ]);
    }
  }
  for (let i = 0; i < 16; i++) {
    ball(`Star ${i + 1}`, between(0.6, 1.3), '#ffffff', {
      parent: back,
      at: [between(-160, 160), between(-90, -40), -150],
      opacity: round(between(0.4, 0.9)),
    });
  }

  // An altitude ruler, and the tropopause and stratopause, dashed.
  const ruler = facing('Ruler', { parent: set, at: [-104, 12, 0], rotate: { x: -5, y: 2 } });
  const line = { closed: false, stroke: 0.7, color: '#ffffff' };
  shape('Shape', 'Scale', { parent: ruler, path: [{ y: 0 }, { y: -130 }], opacity: 0.7, ...line });
  shape('Shape', 'Ticks', {
    parent: ruler,
    path: segments(Array.from({ length: 14 }, (_, i) => [{ x: 0, y: -i * 10 }, { x: i % 2 ? 2 : 4, y: -i * 10 }])),
    opacity: 0.7,
    ...line,
  });
  const dashes = (y) => segments(Array.from({ length: 30 }, (_, i) => [{ x: 8 + i * 7, y }, { x: 12 + i * 7, y }]));
  shape('Shape', 'Tropopause', { parent: ruler, at: [0, 0, 1], path: dashes(-56), opacity: 0.4, ...line, stroke: 0.6 });
  shape('Shape', 'Stratopause', { parent: ruler, at: [0, 0, 1], path: dashes(-112), opacity: 0.4, ...line, stroke: 0.6 });

  // Dark land.
  [
    ['Land 1', [-80, 92, -60], 170, '#2a0f52'],
    ['Land 2', [36, 108, -58], 200, '#341462'],
    ['Land 3', [124, 94, -62], 160, '#2a0f52'],
  ].forEach(([name, at, diameter, color]) => shape('Ellipse', name, { parent: set, at, diameter, color, fill: true, stroke: 1, closed: true }));

  const cloud = group('Mushroom cloud', { parent: set, at: [0, 12, 0] });
  const RISE = [
    // [frame, cap height, cap size, easing]
    [t0 + 6, 6, 0.3, 'easeOut'],
    [t0 + 60, 50, 1.5, 'easeOut'],
    [end, 74, 2.5, 'linear'],
  ];

  // The first flash: a dome on the ground.
  const dome = shape('Hemisphere', 'Fireball', { parent: cloud, rotate: [90, 0, 0], diameter: 40, color: '#fff3b8', backface: '#ffd23f' });
  keys(dome, 'scale', [
    [t0, 0.3, 'easeOut'],
    [t0 + 16, 1, 'easeInOut'],
    [t0 + 60, 0.5, 'linear'],
  ]);
  keys(dome, 'props.color', [
    [t0 + 10, '#fff3b8', 'linear'],
    [t0 + 40, '#ff8a2a', 'linear'],
    [t0 + 70, '#c8304a', 'linear'],
  ]);
  keys(dome, 'opacity', [
    [t0 + 50, 1, 'easeIn'],
    [t0 + 80, 0, 'hold'],
  ]);

  /** Warm until `at`, then cools over 20 frames. */
  const cool = (object, warm, cold, at) =>
    keys(object, 'props.color', [
      [at, warm, 'easeInOut'],
      [at + 20, cold, 'hold'],
    ]);
  const WARM = ['#ffe066', '#ffb52e', '#ff8a2a', '#ff6a3a', '#e8443a'];
  const COLD = ['#c7a8ff', '#a07af0', '#8058da', '#6440bf', '#46289a'];

  // The glowing core of the stem, growing with the cap.
  const stemCore = shape('Cylinder', 'Stem glow', { parent: cloud, rotate: [90, 0, 0], diameter: 7, length: 1, color: '#fff0a0', backface: '#ffe066' });
  keys(
    stemCore,
    'props.length',
    RISE.map(([f, h, , e]) => [f, h, e]),
  );
  keys(
    stemCore,
    'translate.y',
    RISE.map(([f, h, , e]) => [f, -h / 2, e]),
  );
  keys(stemCore, 'props.color', [
    [t0 + 90, '#fff0a0', 'easeInOut'],
    [t0 + 120, '#ff9a4a', 'easeInOut'],
    [end, '#b86ae0', 'linear'],
  ]);

  // The stem: puffs around the core, each appearing as the cap climbs past it.
  const STEM = 11;
  for (let i = 0; i < STEM; i++) {
    const y = -4 - i * 6.6;
    const tone = Math.min(4, Math.floor(i / 2.4));
    const puff = ball(`Stem ${i + 1}`, 15 - i * 0.4, WARM[tone], { parent: cloud, at: [between(-1.6, 1.6), y, between(-1, 1)] });
    popBall(puff, t0 + 8 + Math.round(i * 4.6), 10);
    cool(puff, WARM[tone], COLD[Math.min(4, 4 - Math.floor(i / 3))], t0 + 96 + (STEM - 1 - i) * 3);
  }

  // The cap: a squashed ball of puffs that climbs and spreads.
  const cap = group('Cap', { parent: cloud });
  keys(
    cap,
    'translate.y',
    RISE.map(([f, h, , e]) => [f, -h, e]),
  );
  keys(
    cap,
    'scale',
    RISE.map(([f, , s, e]) => [f, s, e]),
  );
  const puffs = [];
  const ring = (count, radius, y, size, warm, cold, turn = 0) => {
    for (let i = 0; i < count; i++) {
      const a = (i / count) * Math.PI * 2 + turn;
      puffs.push({ at: [Math.cos(a) * radius, y + between(-0.8, 0.8), Math.sin(a) * radius], size: size + between(-1, 1), warm, cold });
    }
  };
  ring(10, 15, 4, 8, WARM[4], COLD[4]);
  ring(10, 13, -1.5, 11, WARM[2], COLD[3], 0.3);
  ring(7, 8, -7, 12, WARM[1], COLD[2], 0.1);
  puffs.push({ at: [0, -10.5, 0], size: 13, warm: WARM[0], cold: COLD[1] });
  puffs.forEach(({ at, size, warm, cold }, i) => {
    const puff = ball(`Cap puff ${i + 1}`, size, warm, { parent: cap, at });
    growBall(
      puff,
      RISE.map(([f, , s, e]) => [f, s, e]),
    );
    // Cools from the top down.
    cool(puff, warm, cold, t0 + 70 + Math.round((at[1] + 11) * 1.4 + between(0, 8)));
  });
  const glow = ball('Glow', 18, '#fff6c8', { parent: cap, at: [0, 3, 0] });
  growBall(glow, [
    [t0 + 6, 0.3, 'easeOut'],
    [t0 + 40, 1.2, 'easeIn'],
    [t0 + 80, 0, 'hold'],
  ]);

  // A ring of cloud around the stem.
  const collar = shape('Ellipse', 'Collar', {
    parent: cloud,
    at: [0, -34, 0],
    rotate: [90, 0, 0],
    diameter: 30,
    stroke: 5,
    color: '#ffb03a',
    closed: true,
    opacity: 0,
  });
  keys(collar, 'props.diameter', [
    [t0 + 50, 10, 'easeOut'],
    [t0 + 80, 30, 'linear'],
    [end, 44, 'linear'],
  ]);
  keys(collar, 'opacity', [
    [t0 + 50, 0, 'easeOut'],
    [t0 + 62, 0.9, 'linear'],
  ]);
  cool(collar, '#ffb03a', '#9a72ee', t0 + 100);

  // The base rolls out along the ground.
  for (let i = 0; i < 14; i++) {
    const a = (i / 14) * Math.PI * 2 + 0.2;
    const puff = ball(`Base ${i + 1}`, between(11, 15), '#ff9a5a', { parent: cloud, at: [Math.cos(a) * 8, -3, Math.sin(a) * 8] });
    const far = between(44, 58);
    keys(puff, 'translate.x', [
      [t0 + 10, Math.cos(a) * 8, 'easeOut'],
      [end, Math.cos(a) * far, 'linear'],
    ]);
    keys(puff, 'translate.z', [
      [t0 + 10, Math.sin(a) * 8, 'easeOut'],
      [end, Math.sin(a) * far * 0.8, 'linear'],
    ]);
    popBall(puff, t0 + 8 + (i % 3), 14);
    cool(puff, '#ff9a5a', i % 2 ? '#5a36b0' : '#7048c8', t0 + 110 + (i % 4) * 3);
  }

  // Sparks fly out.
  for (let i = 0; i < 14; i++) {
    const a = -Math.PI / 2 + between(-1.2, 1.2);
    const dist = between(40, 70);
    const spark = ball(`Spark ${i + 1}`, between(1.4, 2.4), '#ffe680', { parent: cloud, at: [0, -6, 0] });
    const leave = t0 + 6 + Math.round(between(0, 8));
    keys(spark, 'translate.x', [
      [leave, 0, 'easeOut'],
      [leave + 40, Math.cos(a) * dist, 'linear'],
    ]);
    keys(spark, 'translate.y', [
      [leave, -6, 'easeOut'],
      [leave + 40, -6 + Math.sin(a) * dist, 'linear'],
    ]);
    keys(spark, 'opacity', [
      [0, 0, 'hold'],
      [leave, 1, 'easeIn'],
      [leave + 40, 0, 'hold'],
    ]);
  }

  const front = facing('Fades', { parent: set, at: [0, -40, 0], rotate: { x: -5, y: 2 } });
  const white = card('White', front, { z: 120, width: 360, height: 260, color: '#fffbe8' });
  keys(white, 'opacity', [
    [t0, 1, 'easeOut'],
    [t0 + 14, 0, 'hold'],
  ]);
  const night = card('Dark', front, { z: 121, width: 360, height: 260, color: '#120c38', opacity: 0 });
  keys(night, 'opacity', [
    [end - 15, 0, 'easeIn'],
    [end, 1, 'hold'],
  ]);
}

// ===== 4. Winter, then spring =====
{
  const X = SET_GAP * 3;
  const shot = SHOTS.winter;
  const t0 = shot.from;
  const end = shot.to - 1;
  const THAW = t0 + 80;
  const SPRING = t0 + 110;
  cameraShot(shot, { rx: -24, ry: 34, tx: X, ty: -12, tz: 0, span: 94 }, { rx: -20, ry: 50, tx: X, ty: -14, tz: 0, span: 86 });

  const set = group('4 · Winter, then spring', { at: [X, 0, 0] });
  const back = facing('Sky', { parent: set, at: [0, -14, 0], rotate: { x: -22, y: 42 } });
  keys(card('Sky', back, { y: -30, z: -160, width: 360, height: 170, color: '#251d5e' }), 'props.color', [
    [THAW - 10, '#251d5e', 'easeInOut'],
    [SPRING, '#3e66c8', 'easeInOut'],
    [SPRING + 40, '#62ccff', 'linear'],
  ]);
  keys(card('Horizon', back, { y: 50, z: -159, width: 360, height: 60, color: '#3a3080' }), 'props.color', [
    [THAW - 10, '#3a3080', 'easeInOut'],
    [SPRING, '#7aa8e8', 'easeInOut'],
    [SPRING + 40, '#b4f2ff', 'linear'],
  ]);
  const sun = ball('Sun', 18, '#fff1a8', { parent: back, at: [-40, 30, -150], opacity: 0 });
  keys(sun, 'translate.y', [
    [SPRING - 10, 30, 'easeOut'],
    [end, -18, 'linear'],
  ]);
  keys(sun, 'opacity', [
    [SPRING - 10, 0, 'easeOut'],
    [SPRING + 10, 1, 'hold'],
  ]);
  // Soot hangs over the winter, then clears.
  for (let i = 0; i < 8; i++) {
    const soot = ball(`Soot ${i + 1}`, between(26, 36), i % 2 ? '#1b1347' : '#22195a', {
      parent: back,
      at: [-130 + i * 37, -66 + between(-6, 6), -150 + i * 0.5],
    });
    keys(soot, 'opacity', [
      [THAW - 20, 1, 'easeIn'],
      [THAW + 30, 0, 'hold'],
    ]);
  }

  // The city is drawn as one unit, in order: the ground first, then what
  // stands on it from back to front (as the camera sees it halfway through
  // the shot), then the snow in the air. zdog would otherwise sort each shape
  // by its middle, and the ground's big top would cover whatever stands
  // behind its middle.
  const city = group('City', { parent: set, drawTogether: true });
  const thaw = (object, path, winter, spring) =>
    keys(object, path, [
      [THAW, winter, 'easeInOut'],
      [SPRING + 10, spring, 'linear'],
    ]);

  // The ground: a block, snowy, then green, with a road across the front.
  const base = group('Ground', { parent: city });
  const ground = shape('Box', 'Block', {
    parent: base,
    at: [0, 4, 0],
    width: 118,
    height: 8,
    depth: 86,
    color: '#b9c8f4',
    topFace: '#e9f0ff',
    frontFace: '#a9b8f0',
    rightFace: '#93a3e0',
    leftFace: false,
    rearFace: false,
    bottomFace: false,
  });
  thaw(ground, 'props.topFace', '#e9f0ff', '#5cd65e');
  thaw(ground, 'props.frontFace', '#a9b8f0', '#9a6a3e');
  thaw(ground, 'props.rightFace', '#93a3e0', '#7e5430');
  const road = shape('Rect', 'Road', {
    parent: base,
    at: [0, -0.1, 24],
    rotate: [90, 0, 0],
    width: 118,
    height: 11,
    color: '#cdd8f6',
    fill: true,
    stroke: 0,
  });
  thaw(road, 'props.color', '#cdd8f6', '#6c6f92');
  const lines = shape('Shape', 'Road lines', {
    parent: base,
    at: [0, -0.2, 24],
    path: segments(Array.from({ length: 14 }, (_, i) => [{ x: -56 + i * 8, y: 0, z: 0 }, { x: -52 + i * 8, y: 0, z: 0 }])),
    closed: false,
    stroke: 0.8,
    color: '#ffe66e',
    opacity: 0,
  });
  keys(lines, 'opacity', [
    [THAW + 10, 0, 'easeIn'],
    [SPRING + 10, 1, 'hold'],
  ]);
  for (let i = 0; i < 14; i++) {
    const flower = ball(`Flower ${i + 1}`, 2, ['#ff6fa8', '#ffd23f', '#ffffff'][i % 3], {
      parent: base,
      at: [between(-54, 54), -0.9, i % 2 ? between(30, 40) : between(-40, 14)],
    });
    popBall(flower, SPRING + 24 + i * 2, 6);
  }

  /** What stands on the ground, each made when its turn comes (back to front). */
  const standing = [];

  // The ruined city; moss grows on the first six roofs in spring.
  [
    [-40, -18, 12, 30, 12, '#8f7bff', 0, 5],
    [-24, -26, 14, 40, 12, '#6b5ae0', 0, 6],
    [-8, -16, 10, 22, 10, '#b59cff', -6, 4.4],
    [8, -28, 14, 34, 12, '#7a66f0', 0, 5.4],
    [26, -18, 12, 26, 12, '#9d8cff', 5, 4.6],
    [42, -27, 10, 44, 10, '#6a58d8', 0, 6],
    [-30, 2, 10, 14, 10, '#a592ff', 0],
    [34, 4, 10, 12, 10, '#8471f4', -8],
  ].forEach(([x, z, w, h, d, color, tilt, moss], i) =>
    standing.push({
      x,
      z,
      make() {
        const tower = group(`Building ${i + 1}`, { parent: city, at: [x, 0, z], rotate: [0, 0, tilt] });
        const walls = shape('Box', 'Walls', {
          parent: tower,
          at: [0, -h / 2, 0],
          width: w,
          height: h,
          depth: d,
          color,
          frontFace: shade(color, 1.08),
          rightFace: shade(color, 0.8),
          leftFace: false,
          rearFace: false,
          bottomFace: false,
          topFace: '#f4f7ff',
        });
        thaw(walls, 'props.topFace', '#f4f7ff', shade(color, 1.2));
        // Windows: short strokes on the front, a few lit again in spring.
        const across = Math.floor((w - 3) / 3.4);
        const pairs = [];
        for (let row = 0; row < Math.floor((h - 6) / 5); row++) {
          for (let col = 0; col < across; col++) {
            const wx = -((across - 1) * 3.4) / 2 + col * 3.4;
            const wy = -h + 5 + row * 5;
            pairs.push([{ x: wx, y: wy }, { x: wx, y: wy + 1.6 }]);
          }
        }
        if (pairs.length) {
          const windows = shape('Shape', 'Windows', {
            parent: tower,
            at: [0, 0, d / 2 + 0.3],
            path: segments(pairs),
            closed: false,
            stroke: 1.3,
            color: '#3b2f8f',
          });
          thaw(windows, 'props.color', '#3b2f8f', i % 3 ? '#3b2f8f' : '#ffd86e');
        }
        const snow = shape('Box', 'Snow', {
          parent: tower,
          at: [0, -h - 0.8, 0],
          width: w + 1,
          height: 1.6,
          depth: d + 1,
          color: '#ffffff',
          frontFace: '#e4ecff',
          rightFace: '#d0dcff',
          leftFace: false,
          rearFace: false,
          bottomFace: false,
        });
        keys(snow, 'scale', [
          [THAW + i * 2, 1, 'easeIn'],
          [THAW + 26 + i * 2, 0, 'hold'],
        ]);
        if (moss) {
          popBall(ball('Moss', moss, i % 2 ? '#2bb24c' : '#3ad15a', { parent: tower, at: [w / 5, -h, d / 6] }), SPRING + 20 + i * 5, 10);
        }
      },
    }),
  );

  // Snow drifts, melting away.
  [
    [-48, 10, 14],
    [-14, -4, 12],
    [18, -6, 12],
    [50, 8, 16],
    [-50, 34, 10],
    [44, 34, 12],
  ].forEach(([x, z, size], i) =>
    standing.push({
      x,
      z,
      make() {
        const drift = shape('Hemisphere', 'Snow', {
          parent: group(`Drift ${i + 1}`, { parent: city, at: [x, 0, z] }),
          rotate: [90, 0, 0],
          diameter: size,
          color: '#f4f8ff',
          backface: '#dfe8ff',
        });
        keys(drift, 'scale', [
          [THAW + i * 3, 1, 'easeIn'],
          [THAW + 30 + i * 3, 0, 'hold'],
        ]);
      },
    }),
  );

  // Spring: trees grow back.
  [
    [-52, -6, 'round', 1.1],
    [-14, 6, 'cone', 1],
    [2, -8, 'round', 0.9],
    [18, 8, 'round', 1.2],
    [52, -10, 'cone', 1.2],
    [-44, 40, 'round', 0.9],
    [-8, 40, 'cone', 0.8],
    [28, 40, 'round', 1],
    [54, 38, 'cone', 0.9],
    [-54, 18, 'cone', 1],
  ].forEach(([x, z, kind, size], i) =>
    standing.push({
      x,
      z,
      make() {
        const grow = SPRING + 6 + i * 4;
        const tree = group(`Tree ${i + 1}`, { parent: city, at: [x, 0, z] });
        popIn(tree, grow, 12, size);
        shape('Cylinder', 'Trunk', {
          parent: tree,
          at: [0, -2.5, 0],
          rotate: [90, 0, 0],
          diameter: 1.8,
          length: 5,
          color: '#8a5a32',
          backface: '#6a4224',
        });
        if (kind === 'cone') {
          shape('Cone', 'Leaves', {
            parent: tree,
            at: [0, -4, 0],
            rotate: [90, 0, 0],
            diameter: 9,
            length: 14,
            color: i % 2 ? '#1d9a4a' : '#26b45a',
            backface: '#137a3a',
          });
        } else {
          popBall(ball('Leaves', 11 * size, i % 2 ? '#2fbf5a' : '#3fd168', { parent: tree, at: [0, -9, 0] }), grow, 12);
        }
      },
    }),
  );

  for (const thing of standing.sort((a, b) => depthAt(a, 42) - depthAt(b, 42))) thing.make();

  // Snowflakes, over it all: each falls, starts again at the top, and stops at the thaw.
  for (let i = 0; i < 44; i++) {
    const x = between(-58, 58);
    const z = between(-44, 44);
    const flake = ball(`Snowflake ${i + 1}`, between(1.4, 2.3), '#ffffff', { parent: city, at: [x, -70, z] });
    const fall = Math.round(between(48, 64));
    const offset = between(0, 1);
    const track = [];
    let f = t0;
    let y = lerp(-70, 0, offset);
    let left = Math.max(1, Math.round(fall * (1 - offset)));
    while (f < THAW + 20) {
      track.push([f, y, 'linear']);
      f += left;
      track.push([f, 0, 'hold']);
      f += 1;
      y = -70;
      left = fall;
    }
    keys(flake, 'translate.y', track);
    keys(flake, 'opacity', [
      [THAW, 1, 'easeIn'],
      [THAW + 16, 0, 'hold'],
    ]);
  }

  // The bird comes back, flapping (from off the picture's right).
  const { group: flyer, parts } = bird('Bird', set, [150, -46, 10], 0.6);
  keys(flyer, 'translate.x', [
    [SPRING + 4, 150, 'easeOut'],
    [end, 4, 'linear'],
  ]);
  keys(flyer, 'translate.y', [
    [SPRING + 4, -50, 'easeInOut'],
    [SPRING + 30, -38, 'easeInOut'],
    [SPRING + 50, -42, 'easeOut'],
    [end, -34, 'linear'],
  ]);
  const flaps = [];
  for (let f = SPRING + 4, up = true; f < shot.to; f += 5, up = !up) flaps.push([f, up ? -55 : 35, 'easeInOut']);
  keys(parts.wing, 'rotate.x', flaps);

  const front = facing('Fades', { parent: set, at: [0, -14, 0], rotate: { x: -22, y: 42 } });
  const night = card('Dark', front, { z: 140, width: 360, height: 240, color: '#120c38' });
  keys(night, 'opacity', [
    [t0, 1, 'easeOut'],
    [t0 + 16, 0, 'hold'],
  ]);
}

// ----- check and write -----

for (const object of [...shapes, ...groups, camera]) {
  if (!object.tracks) continue;
  for (const [path, list] of Object.entries(object.tracks)) {
    list.sort((a, b) => a.frame - b.frame);
    list.forEach((k, i) => {
      if (i > 0 && list[i - 1].frame === k.frame) throw new Error(`${object.name} (${object.id}) has two ${path} keys on frame ${k.frame}`);
      if (k.frame < 0 || k.frame >= DURATION) throw new Error(`${object.name} (${object.id}) has a ${path} key on frame ${k.frame}`);
    });
    // The plain value is the first key's, for if the track is removed.
    const [kind, field] = path.split('.');
    const first = list[0].value;
    if (field && kind === 'props') object.props[field] = first;
    else if (field) object[kind][field] = first;
    else object[kind] = first;
  }
}

const scene = {
  version: 4,
  settings: { background: '#1c1450', fps: FPS, duration: DURATION },
  shapes,
  groups,
  cameras: [camera],
};
// One shape, group or camera per line: a third of the size of the usual
// indenting (this file is part of the editor's download), and still diffable.
const list = (items) => `[\n${items.map((item) => `    ${JSON.stringify(item)}`).join(',\n')}\n  ]`;
writeFileSync(
  output,
  `{\n  "version": ${scene.version},\n  "settings": ${JSON.stringify(scene.settings)},\n` +
    `  "shapes": ${list(scene.shapes)},\n  "groups": ${list(scene.groups)},\n  "cameras": ${list(scene.cameras)}\n}\n`,
);
console.log(`Wrote ${output}: ${shapes.length} shapes, ${groups.length} groups, ${DURATION} frames.`);
