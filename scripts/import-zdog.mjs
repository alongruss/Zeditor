// Turns a Zdog demo script into a Zeditor scene file.
//
//   node scripts/import-zdog.mjs <demo.js> <out.zeditor.json>
//       [--background #rrggbb] [--name <id>=<Name> ...] [--turntable <start degrees>]
//
// --name names something the script never put in a variable (e.g. a copyGraph).
// --turntable adds a "Turntable" camera that turns once around Y over the
// scene's 120 frames, eased in and out, from the given angle (it loops).
//
// The script runs with the real zdog (no canvas: the Illustration is a plain
// Anchor), then the graph it built is written out:
// - Anchors become groups; zdog Groups become groups that draw together.
// - A shape with children becomes a group with the shape's transform,
//   holding the shape (at the group's origin) and the children. zdog draws
//   both the same way: an Anchor's parts are sorted one by one either way.
// - A stretch along one axis (`scale: { x: 2 }`) is baked into a Shape's path;
//   the editor's scale is uniform.
// - Parts get readable names from the script's variables (`rightThigh` ->
//   "Right thigh"); the rest get numbered names like the editor's.
// - The Illustration's own rotation is the view, not part of the scene.
import { readFileSync, writeFileSync } from 'node:fs';
import process from 'node:process';
import Zdog from 'zdog';

const args = process.argv.slice(2);
const option = (flag) => {
  const at = args.indexOf(flag);
  return at === -1 ? undefined : args[at + 1];
};
const valued = new Set();
args.forEach((arg, i) => arg.startsWith('--') && valued.add(i + 1));
const [input, output] = args.filter((arg, i) => !arg.startsWith('--') && !valued.has(i));
const background = option('--background') ?? '#ffddbb';
const turntable = option('--turntable');
const renames = new Map(
  args.flatMap((arg, i) => (arg === '--name' ? [args[i + 1].split('=')] : [])).map(([id, ...name]) => [id, name.join('=')]),
);
if (!input || !output) {
  console.error('Usage: node scripts/import-zdog.mjs <demo.js> <out.zeditor.json> [--background #rrggbb] [--name id=Name] [--turntable deg]');
  process.exit(1);
}

// ----- run the demo, remembering each object's variable name -----

/**
 * `var name = new Zdog.X(...)` and `var name = other.copy(...)` become
 * `var name = __named('name', ...)`, so the object knows its name.
 */
function nameObjects(source) {
  let out = '';
  let i = 0;
  const pattern = /var\s+([A-Za-z_$][\w$]*)\s*=\s*/g;
  let match;
  while ((match = pattern.exec(source))) {
    const start = match.index + match[0].length;
    const rest = source.slice(start, start + 40);
    if (!/^(new Zdog\.|[\w$]+\.copy(Graph)?\()/.test(rest)) continue;
    // Find the end of the expression: the `;` at depth 0.
    let depth = 0;
    let end = start;
    for (; end < source.length; end++) {
      const ch = source[end];
      if ('([{'.includes(ch)) depth++;
      else if (')]}'.includes(ch)) depth--;
      else if (ch === ';' && depth === 0) break;
    }
    out += source.slice(i, start) + `__named(${JSON.stringify(match[1])}, ` + source.slice(start, end) + ')';
    i = end;
    pattern.lastIndex = end;
  }
  return out + source.slice(i);
}

const illustrations = [];
class Illustration extends Zdog.Anchor {
  constructor(options) {
    super(options);
    illustrations.push(this);
  }
  updateRenderGraph() {}
}
const fakeElement = { setAttribute() {}, width: 0, height: 0 };
const fakeDocument = { querySelector: (selector) => (selector === '.illo' ? fakeElement : {}) };
const fakeWindow = { innerWidth: 1000, innerHeight: 1000 };
const named = (name, object) => {
  if (object && typeof object === 'object') object.__zeditorName = name;
  return object;
};
const source = nameObjects(readFileSync(input, 'utf8'));
new Function('Zdog', 'document', 'window', 'requestAnimationFrame', '__named', source)(
  { ...Zdog, Illustration },
  fakeDocument,
  fakeWindow,
  () => {},
  named,
);
if (illustrations.length !== 1) throw new Error(`The script made ${illustrations.length} Illustrations; expected one.`);
const [root] = illustrations;

// ----- write the graph out -----

const TYPES = [
  // Most specific first.
  ['Hemisphere', Zdog.Hemisphere, 'hemisphere', 'Hemisphere'],
  ['Cone', Zdog.Cone, 'cone', 'Cone'],
  ['Cylinder', Zdog.Cylinder, 'cylinder', 'Cylinder'],
  ['Box', Zdog.Box, 'box', 'Box'],
  ['RoundedRect', Zdog.RoundedRect, 'rounded-rect', 'Rounded rectangle'],
  ['Rect', Zdog.Rect, 'rect', 'Rectangle'],
  ['Ellipse', Zdog.Ellipse, 'ellipse', 'Circle'],
  ['Polygon', Zdog.Polygon, 'polygon', 'Polygon'],
  ['Shape', Zdog.Shape, 'shape', 'Shape'],
];
/** The editor's props for each type (see src/model/shapeTypes.ts). */
const PROPS = {
  Rect: ['width', 'height', 'color', 'stroke', 'fill'],
  RoundedRect: ['width', 'height', 'cornerRadius', 'color', 'stroke', 'fill'],
  Ellipse: ['diameter', 'quarters', 'color', 'stroke', 'fill', 'closed'],
  Polygon: ['sides', 'radius', 'color', 'stroke', 'fill'],
  Shape: ['path', 'color', 'stroke', 'fill', 'closed', 'visible'],
  Hemisphere: ['diameter', 'color', 'backface', 'stroke', 'fill'],
  Cylinder: ['diameter', 'length', 'color', 'backface', 'stroke', 'fill'],
  Cone: ['diameter', 'length', 'color', 'backface', 'stroke', 'fill'],
  Box: ['width', 'height', 'depth', 'color', 'stroke', 'fill'],
};
/** zdog's composite shapes make their own children (faces, ends); those aren't the demo's. */
const COMPOSITE = new Set(['Hemisphere', 'Cone', 'Cylinder', 'Box']);

const round = (n, places = 6) => {
  const r = Math.round(n * 10 ** places) / 10 ** places;
  return Object.is(r, -0) ? 0 : r;
};
const vec = (v) => ({ x: round(v.x), y: round(v.y), z: round(v.z) });
const degrees = (v) => ({ x: round((v.x * 180) / Math.PI), y: round((v.y * 180) / Math.PI), z: round((v.z * 180) / Math.PI) });

const NAMED_COLORS = { white: '#ffffff', black: '#000000' };
function hex(color) {
  if (typeof color !== 'string') throw new Error(`Not a color: ${color}`);
  const c = color.trim().toLowerCase();
  if (NAMED_COLORS[c]) return NAMED_COLORS[c];
  if (/^#[0-9a-f]{3}$/.test(c)) return `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}`;
  if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/.test(c)) return c;
  throw new Error(`Unsupported color: ${color}`);
}

/** A path with every point stretched by `scale` (x, y, z), arcs and moves included. */
function stretchPath(path, scale) {
  const point = (p) => {
    const out = {};
    for (const axis of ['x', 'y', 'z']) if (typeof p[axis] === 'number') out[axis] = round(p[axis] * scale[axis]);
    return out;
  };
  return path.map((entry) => {
    if (entry.arc) return { arc: entry.arc.map(point) };
    if (entry.bezier) return { bezier: entry.bezier.map(point) };
    if (entry.move) return { move: point(entry.move) };
    if (entry.line) return { line: point(entry.line) };
    return point(entry);
  });
}

const cleanPath = (path) => JSON.parse(JSON.stringify(path, (key, value) => (typeof value === 'number' ? round(value) : value)));

const readable = (name) => {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

const shapes = [];
const groups = [];
const counters = {};
const nextId = (prefix) => {
  counters[prefix] = (counters[prefix] ?? 0) + 1;
  return `${prefix}-${counters[prefix]}`;
};

function typeOf(node) {
  if (node instanceof Zdog.Group) return 'Group';
  for (const [type, ctor] of TYPES) if (node instanceof ctor) return type;
  if (node instanceof Zdog.Anchor) return 'Anchor';
  throw new Error('Unknown zdog object');
}

function transformOf(node, type) {
  const s = node.scale;
  const uniform = s.x === s.y && s.y === s.z;
  if (!uniform && type !== 'Shape') throw new Error(`A ${type} is stretched along one axis; only Shapes can be.`);
  return { translate: vec(node.translate), rotate: degrees(node.rotate), scale: uniform ? round(s.x) : 1, stretch: uniform ? null : s };
}

function addGroup(node, parent, drawTogether, name) {
  const id = nextId('group');
  const t = transformOf(node, 'Group');
  const group = { id, name: name ?? `Group ${counters.group}`, type: 'Group', translate: t.translate, rotate: t.rotate, scale: t.scale, drawTogether };
  if (parent) group.parent = parent;
  groups.push(group);
  return id;
}

function addShape(node, type, parent, transform, name) {
  const [, , prefix, label] = TYPES.find(([t]) => t === type);
  const id = nextId(prefix);
  const props = {};
  for (const key of PROPS[type]) {
    let value = node[key];
    if (key === 'stroke') value = value === false ? 0 : value;
    if (key === 'color') value = hex(value);
    if (key === 'backface') value = typeof value === 'string' ? hex(value) : hex(node.color);
    if (key === 'path') value = transform.stretch ? stretchPath(value, transform.stretch) : cleanPath(value);
    props[key] = value;
  }
  const shape = {
    id,
    name: name ?? `${label} ${counters[prefix]}`,
    type,
    translate: transform.translate,
    rotate: transform.rotate,
    scale: transform.scale,
    opacity: 1,
    props,
  };
  if (parent) shape.parent = parent;
  shapes.push(shape);
}

const IDENTITY = { translate: { x: 0, y: 0, z: 0 }, rotate: { x: 0, y: 0, z: 0 }, scale: 1, stretch: null };

function visit(node, parent) {
  const type = typeOf(node);
  const name = node.__zeditorName ? readable(node.__zeditorName) : undefined;
  const kids = COMPOSITE.has(type) ? [] : node.children;
  if (type === 'Anchor' || type === 'Group') {
    const id = addGroup(node, parent, type === 'Group', name);
    for (const child of kids) visit(child, id);
    return;
  }
  if (kids.length === 0) {
    addShape(node, type, parent, transformOf(node, type), name);
    return;
  }
  // A shape with children: a group carries its transform, the shape sits at the group's origin.
  const t = transformOf(node, type);
  if (t.stretch) throw new Error('A stretched shape with children is not supported.');
  const id = addGroup(node, parent, false, name);
  addShape(node, type, id, IDENTITY, name ? `${name} shape` : undefined);
  for (const child of kids) visit(child, id);
}

for (const child of root.children) visit(child, undefined);

for (const object of [...shapes, ...groups]) {
  if (renames.has(object.id)) object.name = renames.get(object.id);
}

const DURATION = 120;
const cameras = [];
if (turntable !== undefined) {
  const start = Number(turntable);
  cameras.push({
    id: 'camera-1',
    name: 'Turntable',
    type: 'Camera',
    rotate: { x: 0, y: start, z: 0 },
    target: { x: 0, y: 0, z: 0 },
    viewSpan: 128,
    width: 512,
    height: 512,
    tracks: {
      'rotate.y': [
        { frame: 0, value: start, easing: 'easeInOut' },
        { frame: DURATION, value: start - 360, easing: 'easeInOut' },
      ],
    },
  });
}

const scene = {
  version: 4,
  settings: { background: hex(background), fps: 30, duration: DURATION },
  shapes,
  groups,
  cameras,
};
writeFileSync(output, `${JSON.stringify(scene, null, 2)}\n`);
console.log(`Wrote ${output}: ${shapes.length} shapes, ${groups.length} groups.`);
