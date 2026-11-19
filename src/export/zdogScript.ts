import { propertySpec } from '../model/animatable';
import { objectAtFrame, sceneAtFrame } from '../model/evaluate';
import { overshoots } from '../model/easing';
import { cleanName } from '../model/names';
import { getShapeTypeDef } from '../model/shapeTypes';
import type { CameraData, GroupData, Keyframe, PropValue, Scene, SceneObject, ShapeData, Vec3 } from '../model/types';
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
  /** The camera this view looks through, with its keys, so an animated camera moves in the script too. */
  readonly camera?: CameraData;
}

/** The free view, for the script: same angle and zoom, aimed at the origin. */
export function scriptViewFromFreeView(view: FreeView): ScriptView {
  return { rotate: { x: view.rotate.x, y: view.rotate.y, z: 0 }, target: { x: 0, y: 0, z: 0 }, viewSpan: VIEW_SPAN / view.zoom };
}

/**
 * Looking through a camera, for the script, with a canvas of its picture
 * size. The view is the camera as posed on `frame`; the script itself poses
 * it again on the frame it starts from.
 */
export function scriptViewFromCamera(camera: CameraData, frame = 0): ScriptView {
  const posed = objectAtFrame(camera, frame);
  const { rotate } = posed;
  return {
    rotate: { x: rotate.x * DEG_TO_RAD, y: rotate.y * DEG_TO_RAD, z: rotate.z * DEG_TO_RAD },
    target: posed.target,
    viewSpan: posed.viewSpan,
    width: posed.width,
    height: posed.height,
    camera,
  };
}

const hasTracks = (object: SceneObject | undefined) => object?.tracks !== undefined && Object.keys(object.tracks).length > 0;

/**
 * True if the script for this scene and view plays an animation: a shape or
 * group has keys, or the camera it looks through does.
 */
export function scriptAnimates(scene: Scene, view: ScriptView): boolean {
  return [...scene.shapes, ...scene.groups].some(hasTracks) || hasTracks(view.camera);
}

/** Every kind of line break, including U+2028 and U+2029, which also end a // comment. */
const LINE_BREAKS = new RegExp(`[${String.fromCharCode(10, 13, 0x2028, 0x2029)}]+`, 'g');

/**
 * A string as JavaScript source that is also safe inside an HTML <script>:
 * every "<" is written as <, so a name like "</script>" can't end the
 * script early.
 */
const text = (value: string): string => JSON.stringify(value).replace(/</g, '\\u003c');

/** A line of comment text: on one line, with no direction marks, and no "<" that HTML could read as a tag. */
const commentText = (value: string): string => cleanName(value.replace(LINE_BREAKS, ' ')).replace(/</g, '\\u003c');

/**
 * Names the script itself uses, so no shape may take them, and the page's
 * own global names: the script declares its shapes at the top level, where
 * `const top` or `const location` would stop the whole script.
 */
const TAKEN = new Set(
  (
    'illo world element animate DEG Zdog FPS FRAMES animated player __proto__ ' +
    'window document location top parent self frames name status length origin history event opener closed ' +
    'screen navigator performance crypto console alert confirm prompt print open close stop focus blur find ' +
    'scroll scrollTo scrollBy fetch external frameElement customElements localStorage sessionStorage indexedDB ' +
    'caches visualViewport devicePixelRatio innerWidth innerHeight outerWidth outerHeight screenX screenY ' +
    'screenLeft screenTop scrollX scrollY pageXOffset pageYOffset menubar toolbar statusbar scrollbars personalbar ' +
    'locationbar globalThis setTimeout setInterval clearTimeout clearInterval queueMicrotask structuredClone ' +
    'requestAnimationFrame cancelAnimationFrame requestIdleCallback cancelIdleCallback atob btoa isNaN isFinite ' +
    'parseInt parseFloat escape unescape encodeURI decodeURI encodeURIComponent decodeURIComponent ' +
    'getComputedStyle getSelection matchMedia postMessage reportError isSecureContext crossOriginIsolated ' +
    'trustedTypes speechSynthesis onload onerror onmessage'
  ).split(' '),
);

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
 * becomes `roundedRectangle1`. Letters from any language are kept, but only
 * characters JavaScript allows in a name (so "Wheel ²" is `wheel`, never a
 * script that won't run). Falls back to the shape's id, and adds a number if
 * the name is already used.
 */
export function constName(shape: Pick<ShapeData, 'name' | 'id'>, used: Set<string>): string {
  const camel = (words: string) =>
    words
      .split(/[^\p{ID_Continue}]+/u)
      .filter(Boolean)
      .map((word, i) => (i === 0 ? word.charAt(0).toLowerCase() + word.slice(1) : word.charAt(0).toUpperCase() + word.slice(1)))
      .join('');
  const usable = (name: string) => (/^[\p{ID_Continue}$]*$/u.test(name) ? name : '');
  let base = usable(camel(shape.name)) || camel(shape.id) || 'shape';
  if (!/^[\p{ID_Start}_$]/u.test(base)) base = `shape${base.charAt(0).toUpperCase()}${base.slice(1)}`;
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
  if (typeof value === 'string') return text(value);
  if (typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return `[${value.map((item) => source(item)).join(', ')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value);
    if (entries.length === 0) return '{}';
    // `__proto__: x`, quoted or not, would set the object's prototype; a computed key doesn't.
    const keyText = (key: string) => (key === '__proto__' ? `[${text(key)}]` : /^[A-Za-z_$][\w$]*$/.test(key) ? key : text(key));
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
  return `// ${commentText(shape.name)}\nconst ${name} = new Zdog.${shape.type}({\n${lines.join('\n')}\n});`;
}

/** A group as an Anchor (or, if it draws its children together, a Group) named `name`. */
function groupSource(group: GroupData, name: string, addTo: string): string {
  const lines = [`  addTo: ${addTo},`];
  if (!isZero(group.translate)) lines.push(`  translate: ${vector(group.translate)},`);
  if (!isZero(group.rotate)) lines.push(`  rotate: ${angles(group.rotate)},`);
  if (group.scale !== 1) lines.push(`  scale: ${num(group.scale)},`);
  return `// ${commentText(group.name)}\nconst ${name} = new Zdog.${group.drawTogether ? 'Group' : 'Anchor'}({\n${lines.join('\n')}\n});`;
}

/** Position, rotation and scale: set on the zdog object in place. Anything else rebuilds the shape. */
const PLACED = /^(?:translate\.[xyz]|rotate\.[xyz]|scale|target\.[xyz]|viewSpan)$/;

const keysSource = (keys: readonly Keyframe[]) =>
  `[${keys.map((key) => `[${key.frame}, ${source(key.value)}, ${source(key.easing)}]`).join(', ')}]`;

/** One entry of the script's `animated` list: a zdog object and its tracks. */
function animatedSource(node: string, tracks: readonly (readonly [string, readonly Keyframe[]])[], extra: readonly string[] = []): string {
  const lines = [`    node: ${node},`, ...extra.map((line) => `    ${line},`), '    tracks: {'];
  for (const [path, keys] of tracks) lines.push(`      ${text(path)}: ${keysSource(keys)},`);
  lines.push('    },');
  return `  {\n${lines.join('\n')}\n  }`;
}

/**
 * A shape's entry. One whose size, colors or opacity change gets its `look`:
 * its settings without opacity (the player fades the colors, as the editor
 * does) and its opacity, so it can be rebuilt with new ones.
 */
function animatedShapeSource(shape: ShapeData, name: string): string {
  const tracks = Object.entries(shape.tracks ?? {});
  const extra: string[] = [];
  if (tracks.some(([path]) => !PLACED.test(path))) {
    const props: Record<string, unknown> = { ...shape.props };
    const { fields, defaults } = getShapeTypeDef(shape.type);
    for (const field of fields) {
      // Colors it doesn't set itself, so they can be faded too.
      const value = defaults[field.key];
      if ((field.kind === 'color' || field.kind === 'face') && !(field.key in props) && typeof value === 'string') props[field.key] = value;
    }
    extra.push(`look: { opacity: ${num(shape.opacity, 6)}, props: ${source(props)} }`);
  }
  const whole = tracks.filter(([path]) => propertySpec(shape.type, path)?.integer).map(([path]) => path);
  if (whole.length > 0) extra.push(`whole: ${source(whole)}`);
  const limits = limitsSource(shape, tracks);
  if (limits) extra.push(limits);
  return animatedSource(name, tracks, extra);
}

/**
 * `limits: { opacity: { min: 0, max: 1 } }` for tracks whose custom curves
 * can overshoot past a setting's limits, so the player stops there as the
 * editor does.
 */
function limitsSource(object: SceneObject, tracks: readonly (readonly [string, readonly Keyframe[]])[]): string | null {
  const limits: Record<string, { min?: number; max?: number }> = {};
  for (const [path, keys] of tracks) {
    const spec = propertySpec(object.type, path);
    if (!spec || (spec.min === undefined && spec.max === undefined) || !keys.some((key) => overshoots(key.easing))) continue;
    limits[path] = { ...(spec.min === undefined ? {} : { min: spec.min }), ...(spec.max === undefined ? {} : { max: spec.max }) };
  }
  return Object.keys(limits).length > 0 ? `limits: ${source(limits)}` : null;
}

/**
 * The player: shows a frame by working out every track's value there, the
 * same way the editor does (the same easing curves, colors mixed through
 * RGBA, whole numbers kept whole), and plays at FPS, looping.
 */
const PLAYER = `const player = (() => {
  const CURVES = { linear: [0, 0, 1, 1], easeIn: [0.42, 0, 1, 1], easeOut: [0, 0, 0.58, 1], easeInOut: [0.42, 0, 0.58, 1] };
  const bezier = (p1, p2, s) => 3 * (1 - s) * (1 - s) * s * p1 + 3 * (1 - s) * s * s * p2 + s * s * s;
  const slope = (p1, p2, s) => 3 * (1 - s) * (1 - s) * p1 + 6 * (1 - s) * s * (p2 - p1) + 3 * s * s * (1 - p2);

  // How far (0 to 1) a value has gone from one key to the next, at time t (0 to 1) between them.
  function ease(easing, t) {
    if (easing === 'hold') return 0;
    const time = Math.min(1, Math.max(0, t));
    // A preset's name, or a curve of its own: [x1, y1, x2, y2], as CSS cubic-bezier().
    const [x1, y1, x2, y2] = Array.isArray(easing) ? easing : CURVES[easing] || CURVES.linear;
    if (x1 === y1 && x2 === y2) return time;
    let s = time;
    for (let i = 0; i < 8; i++) {
      const error = bezier(x1, x2, s) - time;
      if (Math.abs(error) < 1e-7) return bezier(y1, y2, s);
      const d = slope(x1, x2, s);
      if (Math.abs(d) < 1e-6) break;
      s -= error / d;
    }
    let low = 0;
    let high = 1;
    s = time;
    for (let i = 0; i < 40; i++) {
      const x = bezier(x1, x2, s);
      if (Math.abs(x - time) < 1e-7) break;
      if (x < time) low = s;
      else high = s;
      s = (low + high) / 2;
    }
    return bezier(y1, y2, s);
  }

  // '#rgb', '#rgba', '#rrggbb' or '#rrggbbaa' as [r, g, b, alpha], each 0 to 255; null if it isn't one.
  function rgba(color) {
    if (typeof color !== 'string' || !/^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(color)) return null;
    let digits = color.slice(1).toLowerCase();
    if (digits.length <= 4) digits = digits.replace(/./g, '$&$&');
    if (digits.length === 6) digits += 'ff';
    return [0, 2, 4, 6].map((i) => parseInt(digits.slice(i, i + 2), 16));
  }
  const byte = (n) => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0');
  const hex = ([r, g, b, a]) => '#' + byte(r) + byte(g) + byte(b) + (Math.round(a) >= 255 ? '' : byte(a));
  const fade = (color, opacity) => {
    const c = rgba(color);
    return c && opacity < 1 ? hex([c[0], c[1], c[2], c[3] * Math.max(0, opacity)]) : color;
  };

  // A track's value on a frame: eased between keys, held before the first and after the last.
  function valueAt(keys, frame, whole, limits) {
    const first = keys[0];
    const last = keys[keys.length - 1];
    if (frame <= first[0]) return first[1];
    if (frame >= last[0]) return last[1];
    let i = 0;
    while (keys[i + 1][0] <= frame) i += 1;
    const [at, a, easing] = keys[i];
    if (at === frame) return a;
    const [next, b] = keys[i + 1];
    const amount = ease(easing, (frame - at) / (next - at));
    if (typeof a === 'number' && typeof b === 'number') {
      let value = a + (b - a) * amount;
      // A curve that overshoots stays within the setting's limits (opacity 0 to 1, say).
      if (limits && limits.min !== undefined) value = Math.max(limits.min, value);
      if (limits && limits.max !== undefined) value = Math.min(limits.max, value);
      return whole ? Math.round(value) : value;
    }
    const from = rgba(a);
    const to = rgba(b);
    const t = Math.min(1, Math.max(0, amount)); // colors stop at the keys
    return from && to ? hex(from.map((x, j) => x + (to[j] - x) * t)) : a;
  }

  function place(node, path, value) {
    const [key, axis] = path.split('.');
    if (key === 'translate') node.translate[axis] = value;
    else if (key === 'rotate') node.rotate[axis] = value * DEG;
    else if (key === 'scale') node.scale.set({ x: value, y: value, z: value });
    // The camera: the point it looks at goes in the middle, and its view span fits the picture.
    else if (key === 'target') node.translate[axis] = -value;
    else if (key === 'viewSpan') node.zoom = Math.min(element.width, element.height) / value;
  }

  // A new zdog shape with these settings, where the old one was (same place, same drawing order).
  function rebuild(item, options) {
    const old = item.node;
    const fresh = new old.constructor({ ...options, translate: old.translate, rotate: old.rotate, scale: old.scale });
    const siblings = old.addTo.children;
    siblings[siblings.indexOf(old)] = fresh;
    fresh.addTo = old.addTo;
    item.node = fresh;
  }

  function show(frame) {
    for (const item of animated) {
      const look = item.look && { ...item.look.props };
      let opacity = item.look && item.look.opacity;
      for (const [path, keys] of Object.entries(item.tracks)) {
        const value = valueAt(keys, frame, item.whole && item.whole.includes(path), item.limits && item.limits[path]);
        if (path.startsWith('props.')) look[path.slice(6)] = value;
        else if (path === 'opacity') opacity = value;
        else place(item.node, path, value);
      }
      if (!look) continue;
      for (const key of Object.keys(look)) if (typeof look[key] === 'string') look[key] = fade(look[key], opacity);
      const options = JSON.stringify(look);
      if (options !== item.shown) {
        rebuild(item, JSON.parse(options));
        item.shown = options;
      }
    }
  }

  let playing = true;
  // The moment shown, in frames: while playing it has a fraction (the pose between two
  // frames), so motion moves on with every screen refresh.
  let time = 0;
  let start = null;
  let shown = -1;
  return {
    /** Called on every animation frame with its time: moves on while playing, and draws what changed. */
    tick(now) {
      if (playing && now !== undefined) {
        if (start === null) start = now - (time * 1000) / FPS;
        time = (((now - start) * FPS) / 1000) % FRAMES;
      }
      if (time !== shown) {
        show(time);
        shown = time;
      }
    },
    play() {
      if (!playing) start = null;
      playing = true;
    },
    /** Stops on the whole frame it's on. */
    pause() {
      playing = false;
      time = Math.floor(time);
    },
    /** Shows frame n (0 to FRAMES - 1); keeps playing from there if it was. */
    goTo(n) {
      time = ((Math.round(n) % FRAMES) + FRAMES) % FRAMES;
      start = null;
    },
    /** The whole frame it's on. */
    get frame() {
      return Math.floor(time);
    },
    /** The exact moment shown, in frames. */
    get time() {
      return time;
    },
    get playing() {
      return playing;
    },
  };
})();`;

/**
 * A complete script that draws the scene with Zdog, as seen from `view`: an
 * Illustration you can drag to turn, one named `const` per shape (so you can
 * animate them), and a draw loop. It never includes the gizmo or cameras.
 * When the view looks at a point other than the origin, the shapes go in a
 * `world` anchor moved so that point is in the middle, and dragging turns
 * around it.
 *
 * `scene` is the scene with its keys. If anything in it is animated (or the
 * camera the view looks through is), the script plays the animation from
 * frame 0 at the scene's frame rate, looping, with a small player of its
 * own. Otherwise it draws the scene as posed on `frame`.
 */
export function exportZdogScript(full: Scene, sceneView: ScriptView, frame = 0): string {
  const animates = scriptAnimates(full, sceneView);
  const start = animates ? 0 : frame;
  const scene = sceneAtFrame(full, start);
  const camera = sceneView.camera;
  const view = camera ? scriptViewFromCamera(camera, start) : sceneView;
  const cameraTracks = animates && camera?.tracks ? Object.entries(camera.tracks) : [];
  const turns = cameraTracks.some(([path]) => path.startsWith('rotate.'));
  const aims = cameraTracks.some(([path]) => path.startsWith('target.'));

  const used = new Set<string>();
  const parent = isZero(view.target) && !aims ? 'illo' : 'world';
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
  const shapeNames = new Map<string, string>();
  const shapes = scene.shapes.map((shape) => {
    const name = constName(shape, used);
    shapeNames.set(shape.id, name);
    return shapeSource(shape, name, (shape.parent && groupNames.get(shape.parent)) || parent);
  });
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
// The view looks at ${aims ? 'a point' : vector(target)}: move that point to the middle.
const world = new Zdog.Anchor({ addTo: illo, translate: ${vector({ x: -target.x, y: -target.y, z: -target.z })} });
`
      : '';

  return `// Made with Zeditor.
// Needs Zdog 1.x on the page first, for example from
// https://unpkg.com/zdog@1/dist/zdog.dist.min.js
// Draws into a canvas with class "zeditor-scene" if the page has one, or adds a ${width} x ${height} one.

let element = document.querySelector('canvas.zeditor-scene');
if (!element) {
  element = document.createElement('canvas');
  element.className = 'zeditor-scene';
  element.width = ${width};
  element.height = ${height};
  document.body.append(element);
}
element.style.background = ${text(scene.settings.background)};

const DEG = Zdog.TAU / 360;

const illo = new Zdog.Illustration({
  element,
  // ${span} world units fit across the shorter side.
  zoom: Math.min(element.width, element.height) / ${span},
  rotate: ${rotateText},${turns ? '\n  // The camera turns over time, so dragging is off.' : '\n  dragRotate: true,'}
});
${world}
${shapes.join('\n\n')}
${animates ? animationSource(full, shapeNames, groupNames, cameraTracks, camera) : STILL_LOOP}`;
}

const STILL_LOOP = `
function animate() {
  illo.updateRenderGraph();
  requestAnimationFrame(animate);
}
animate();
`;

/** The script's animation: its keys, the player, and a draw loop that runs it. */
function animationSource(
  scene: Scene,
  shapeNames: ReadonlyMap<string, string>,
  groupNames: ReadonlyMap<string, string>,
  cameraTracks: readonly (readonly [string, readonly Keyframe[]])[],
  camera: CameraData | undefined,
): string {
  const entries: string[] = [];
  for (const group of scene.groups) {
    if (!hasTracks(group)) continue;
    const tracks = Object.entries(group.tracks!);
    const limits = limitsSource(group, tracks);
    entries.push(animatedSource(groupNames.get(group.id)!, tracks, limits ? [limits] : []));
  }
  for (const shape of scene.shapes) {
    if (hasTracks(shape)) entries.push(animatedShapeSource(shape, shapeNames.get(shape.id)!));
  }
  const view = cameraTracks.filter(([path]) => !path.startsWith('target.'));
  const aim = cameraTracks.filter(([path]) => path.startsWith('target.'));
  if (view.length > 0) {
    const limits = camera ? limitsSource(camera, view) : null;
    entries.push(animatedSource('illo', view, limits ? [limits] : []));
  }
  if (aim.length > 0) entries.push(animatedSource('world', aim));
  const { fps, duration } = scene.settings;
  const seconds = num(duration / fps, 2);
  return `
// ----- Animation -----
// ${duration} frames at ${num(fps, 3)} frames a second (${seconds} s), looping.
// Each track lists its keys as [frame, value, easing to the next key]; angles are in degrees.
// A shape whose size, colors or opacity change is rebuilt when they do:
// its entry's \`node\` is the one on screen.
// It plays smoothly, showing the moments between frames too.
// player.pause(), player.play() and player.goTo(frame) control it.
const FPS = ${num(fps, 3)};
const FRAMES = ${Math.max(1, Math.round(duration))};
const animated = [
${entries.join(',\n')},
];

${PLAYER}

function animate(now) {
  player.tick(now);
  illo.updateRenderGraph();
  requestAnimationFrame(animate);
}
animate();
`;
}
