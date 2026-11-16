import type { CameraData, GroupData, PropValue, Scene, ShapeData, Vec3 } from '../model/types';
import type { FreeView } from '../viewport/freeView';
import { VIEW_SPAN } from '../viewport/fitZoom';
import { fadedProps } from '../viewport/toZdog';

/** Size of the canvas the script adds when the page has none of its own. */
export const EXPORT_CANVAS_SIZE = 480;

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;

/** Where the script's view looks from: the editor's free view or a scene camera. */
export interface ScriptView {
  /** Rotation of the world, in radians. */
  readonly rotate: Vec3;
  /** The world point at the middle of the picture. */
  readonly target: Vec3;
  /** World units across the picture's shorter side. */
  readonly viewSpan: number;
  /** Size of the canvas the script adds when the page has none (480 x 480 if not given). */
  readonly width?: number;
  readonly height?: number;
}

/** The free view, for the script: same angle and zoom, aimed at the origin. */
export function scriptViewFromFreeView(view: FreeView): ScriptView {
  return { rotate: { x: view.rotate.x, y: view.rotate.y, z: 0 }, target: { x: 0, y: 0, z: 0 }, viewSpan: VIEW_SPAN / view.zoom };
}

/** A camera (as posed on some frame), for the script, with a canvas of its picture size. */
export function scriptViewFromCamera(camera: CameraData): ScriptView {
  const { rotate } = camera;
  return {
    rotate: { x: rotate.x * DEG_TO_RAD, y: rotate.y * DEG_TO_RAD, z: rotate.z * DEG_TO_RAD },
    target: camera.target,
    viewSpan: camera.viewSpan,
    width: camera.width,
    height: camera.height,
  };
}

/** Every kind of line break, including U+2028 and U+2029, which also end a // comment. */
const LINE_BREAKS = new RegExp(`[${String.fromCharCode(10, 13, 0x2028, 0x2029)}]+`, 'g');

/** Names the script itself uses, so no shape may take them. */
const TAKEN = new Set(['illo', 'world', 'element', 'animate', 'DEG', 'Zdog', 'document', 'window']);

const RESERVED = new Set(
  (
    'await break case catch class const continue debugger default delete do else enum export extends ' +
    'false finally for function if implements import in instanceof interface let new null package ' +
    'private protected public return static super switch this throw true try typeof var void while ' +
    'with yield arguments eval undefined NaN Infinity'
  ).split(' '),
);

/**
 * A JavaScript name for a shape, from its display name: "Rounded rectangle 1"
 * becomes `roundedRectangle1`. Letters from any language are kept. Falls
 * back to the shape's id, and adds a number if the name is already used.
 */
export function constName(shape: Pick<ShapeData, 'name' | 'id'>, used: Set<string>): string {
  const camel = (text: string) =>
    text
      .split(/[^\p{L}\p{N}]+/u)
      .filter(Boolean)
      .map((word, i) => (i === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1)))
      .join('');
  let base = camel(shape.name) || camel(shape.id) || 'shape';
  if (!/^[\p{L}_$]/u.test(base)) base = `shape${base.charAt(0).toUpperCase()}${base.slice(1)}`;
  if (RESERVED.has(base) || TAKEN.has(base)) base = `${base}Shape`;
  let name = base;
  for (let n = 2; used.has(name); n++) name = `${base}${n}`;
  used.add(name);
  return name;
}

/** A number as short, exact-enough source text (no float noise like 0.30000000000000004). */
function num(value: number, places = 4): string {
  const rounded = Math.round(value * 10 ** places) / 10 ** places;
  return String(Object.is(rounded, -0) ? 0 : rounded);
}

/** A value as JavaScript source, with plain keys unquoted. */
function source(value: PropValue | Readonly<Record<string, unknown>> | unknown): string {
  if (typeof value === 'number') return num(value, 6);
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => source(item)).join(', ')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    const keyText = (key: string) => (/^[A-Za-z_$][\w$]*$/.test(key) ? key : JSON.stringify(key));
    return `{ ${entries.map(([key, item]) => `${keyText(key)}: ${source(item)}`).join(', ')} }`;
  }
  return 'undefined';
}

const vector = (v: Vec3) => `{ x: ${num(v.x)}, y: ${num(v.y)}, z: ${num(v.z)} }`;
const angles = (v: Vec3) => `{ x: ${num(v.x)} * DEG, y: ${num(v.y)} * DEG, z: ${num(v.z)} * DEG }`;
const isZero = (v: Vec3) => v.x === 0 && v.y === 0 && v.z === 0;

function shapeSource(shape: ShapeData, name: string, parent: string): string {
  const lines = [`  addTo: ${parent},`, `  translate: ${vector(shape.translate)},`];
  if (!isZero(shape.rotate)) lines.push(`  rotate: ${angles(shape.rotate)},`);
  if (shape.scale !== 1) lines.push(`  scale: ${num(shape.scale)},`);
  // Every prop is written out, so 0 and false (e.g. stroke: 0) are kept.
  // Opacity is already in the colors' alpha, as zdog has no opacity setting.
  for (const [key, value] of Object.entries(fadedProps(shape))) {
    lines.push(`  ${key}: ${source(value)},`);
  }
  const title = shape.name.replace(LINE_BREAKS, ' ');
  return `// ${title}\nconst ${name} = new Zdog.${shape.type}({\n${lines.join('\n')}\n});`;
}

/** A group as an Anchor (or, if it draws its children together, a Group) named `name`. */
function groupSource(group: GroupData, name: string, addTo: string): string {
  const lines = [`  addTo: ${addTo},`];
  if (!isZero(group.translate)) lines.push(`  translate: ${vector(group.translate)},`);
  if (!isZero(group.rotate)) lines.push(`  rotate: ${angles(group.rotate)},`);
  if (group.scale !== 1) lines.push(`  scale: ${num(group.scale)},`);
  const title = group.name.replace(LINE_BREAKS, ' ');
  return `// ${title}\nconst ${name} = new Zdog.${group.drawTogether ? 'Group' : 'Anchor'}({\n${lines.join('\n')}\n});`;
}

/**
 * A complete script that draws the scene with Zdog, as seen from `view`: an
 * Illustration you can drag to turn, one named `const` per shape (so you can
 * animate them), and a draw loop. It never includes the gizmo or cameras.
 * When the view looks at a point other than the origin, the shapes go in a
 * `world` anchor moved so that point is in the middle, and dragging turns
 * around it.
 */
export function exportZdogScript(scene: Scene, view: ScriptView): string {
  const used = new Set<string>();
  const parent = isZero(view.target) ? 'illo' : 'world';
  // Groups first, each after the group it's in, so every `addTo` names a const already made.
  const groupNames = new Map<string, string>();
  const groupSources: string[] = [];
  const pending = [...scene.groups];
  while (pending.length > 0) {
    const index = pending.findIndex((group) => group.parent === undefined || groupNames.has(group.parent) || !scene.groups.some((g) => g.id === group.parent));
    const [group] = pending.splice(index === -1 ? 0 : index, 1);
    const name = constName(group, used);
    groupNames.set(group.id, name);
    groupSources.push(groupSource(group, name, (group.parent && groupNames.get(group.parent)) || parent));
  }
  const shapes = scene.shapes.map((shape) =>
    shapeSource(shape, constName(shape, used), (shape.parent && groupNames.get(shape.parent)) || parent),
  );
  shapes.unshift(...groupSources);
  const span = num(view.viewSpan, 3);
  const width = Math.round(view.width ?? EXPORT_CANVAS_SIZE);
  const height = Math.round(view.height ?? EXPORT_CANVAS_SIZE);
  const { rotate, target } = view;
  const rotateText = `{ x: ${num(rotate.x * RAD_TO_DEG, 2)} * DEG, y: ${num(rotate.y * RAD_TO_DEG, 2)} * DEG${
    rotate.z === 0 ? '' : `, z: ${num(rotate.z * RAD_TO_DEG, 2)} * DEG`
  } }`;
  const world =
    parent === 'world'
      ? `
// The view looks at ${vector(target)}: move that point to the middle.
const world = new Zdog.Anchor({ addTo: illo, translate: ${vector({ x: -target.x, y: -target.y, z: -target.z })} });
`
      : '';

  return `// Made with Zeditor.
// Needs Zdog 1.x on the page first, for example:
// <script src="https://unpkg.com/zdog@1/dist/zdog.dist.min.js"></script>
// Draws into <canvas class="zeditor-scene"> if the page has one, or adds a ${width} x ${height} one.

let element = document.querySelector('canvas.zeditor-scene');
if (!element) {
  element = document.createElement('canvas');
  element.className = 'zeditor-scene';
  element.width = ${width};
  element.height = ${height};
  document.body.append(element);
}
element.style.background = ${JSON.stringify(scene.settings.background)};

const DEG = Zdog.TAU / 360;

const illo = new Zdog.Illustration({
  element,
  // ${span} world units fit across the shorter side.
  zoom: Math.min(element.width, element.height) / ${span},
  rotate: ${rotateText},
  dragRotate: true,
});
${world}
${shapes.join('\n\n')}

function animate() {
  illo.updateRenderGraph();
  requestAnimationFrame(animate);
}
animate();
`;
}
