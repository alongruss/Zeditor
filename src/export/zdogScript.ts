import type { PropValue, Scene, ShapeData, Vec3 } from '../model/types';
import type { Camera } from '../viewport/camera';
import { VIEW_SPAN } from '../viewport/fitZoom';
import { fadedProps } from '../viewport/toZdog';

/** Size of the canvas the script adds when the page has none of its own. */
export const EXPORT_CANVAS_SIZE = 480;

const RAD_TO_DEG = 180 / Math.PI;

/** Every kind of line break, including U+2028 and U+2029, which also end a // comment. */
const LINE_BREAKS = new RegExp(`[${String.fromCharCode(10, 13, 0x2028, 0x2029)}]+`, 'g');

/** Names the script itself uses, so no shape may take them. */
const TAKEN = new Set(['illo', 'element', 'animate', 'DEG', 'Zdog', 'document', 'window']);

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
export function constName(shape: ShapeData, used: Set<string>): string {
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

function shapeSource(shape: ShapeData, name: string): string {
  const lines = ['  addTo: illo,', `  translate: ${vector(shape.translate)},`];
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

/**
 * A complete script that draws the scene with Zdog, as seen from the current
 * camera: an Illustration you can drag to turn, one named `const` per shape
 * (so you can animate them), and a draw loop. It never includes the gizmo.
 */
export function exportZdogScript(scene: Scene, camera: Camera): string {
  const used = new Set<string>();
  const shapes = scene.shapes.map((shape) => shapeSource(shape, constName(shape, used)));
  const span = num(VIEW_SPAN / camera.zoom, 3);
  const size = EXPORT_CANVAS_SIZE;

  return `// Made with Zeditor.
// Needs Zdog 1.x on the page first, for example:
// <script src="https://unpkg.com/zdog@1/dist/zdog.dist.min.js"></script>
// Draws into <canvas class="zeditor-scene"> if the page has one, or adds a ${size} x ${size} one.

let element = document.querySelector('canvas.zeditor-scene');
if (!element) {
  element = document.createElement('canvas');
  element.className = 'zeditor-scene';
  element.width = ${size};
  element.height = ${size};
  document.body.append(element);
}
element.style.background = ${JSON.stringify(scene.settings.background)};

const DEG = Zdog.TAU / 360;

const illo = new Zdog.Illustration({
  element,
  // ${span} world units fit across the shorter side.
  zoom: Math.min(element.width, element.height) / ${span},
  rotate: { x: ${num(camera.rotate.x * RAD_TO_DEG, 2)} * DEG, y: ${num(camera.rotate.y * RAD_TO_DEG, 2)} * DEG },
  dragRotate: true,
});

${shapes.join('\n\n')}

function animate() {
  illo.updateRenderGraph();
  requestAnimationFrame(animate);
}
animate();
`;
}
