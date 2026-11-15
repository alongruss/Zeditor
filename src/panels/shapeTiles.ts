import { createShape, emptyScene } from '../model/scene';
import { getShapeTypeDef } from '../model/shapeTypes';
import type { ObjectType, Props, ShapeData, ShapeType } from '../model/types';
import { createZdogShape } from '../viewport/toZdog';
import { Zdog } from '../zdog';

/**
 * Each kind of object has a sticker color (a CSS variable from styles.css):
 * the Add menu's tiles and the scene tree's dots. Always shown with a name,
 * so the color is never the only way to tell them apart.
 */
export const STICKER: Readonly<Record<ObjectType, string>> = {
  Rect: 'var(--sticker-tomato)',
  RoundedRect: 'var(--sticker-tangerine)',
  Ellipse: 'var(--sticker-sunflower)',
  Polygon: 'var(--sticker-lime)',
  Shape: 'var(--sticker-mint)',
  Hemisphere: 'var(--sticker-sky)',
  Cylinder: 'var(--sticker-grape)',
  Cone: 'var(--sticker-bubblegum)',
  Box: 'var(--sticker-tangerine)',
  Camera: 'var(--group-bg)',
};

const INK = '#1d1b22';
const FACE_SHADES: Readonly<Record<string, string>> = {
  topFace: '#ffffff',
  leftFace: '#4a4652',
  rightFace: '#615d6b',
};

/** Flat shapes look best straight on; solids are turned to show they are 3D. */
const FLAT: ReadonlySet<ShapeType> = new Set(['Rect', 'RoundedRect', 'Ellipse', 'Polygon', 'Shape']);

/** A type's default shape, drawn in ink (white backs, shaded box faces) for a tile. */
function tileShape(type: ShapeType): ShapeData {
  const shape = createShape(emptyScene(), type);
  const props: Record<string, Props[string]> = { ...shape.props };
  for (const field of getShapeTypeDef(type).fields) {
    if (field.kind === 'color') props[field.key] = field.key === 'backface' ? '#ffffff' : INK;
    if (field.kind === 'face') props[field.key] = FACE_SHADES[field.key] ?? INK;
  }
  return { ...shape, props, rotate: FLAT.has(type) ? { x: 0, y: 0, z: 0 } : { x: -20, y: 30, z: 0 } };
}

const SVG_NS = 'http://www.w3.org/2000/svg';
const cache = new Map<ShapeType, string>();

/**
 * SVG markup of a shape type's picture, drawn by zdog itself so it matches
 * the scene, and kept after the first time (the Add menu draws nine of them).
 * Generated from the app's own defaults, never from user input.
 */
export function shapeTileSvg(type: ShapeType): string {
  const cached = cache.get(type);
  if (cached) return cached;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('width', '64');
  svg.setAttribute('height', '64');
  svg.style.position = 'absolute';
  svg.style.left = '-10000px';
  document.body.append(svg);
  try {
    const shape = tileShape(type);
    const illo = new Zdog.Illustration({ element: svg, resize: false, zoom: 1 });
    illo.addChild(createZdogShape(shape));
    illo.updateRenderGraph();

    // Fit the drawing: its box plus room for the stroke, square and centered.
    const box = svg.getBBox();
    const stroke = typeof shape.props.stroke === 'number' ? shape.props.stroke : 1;
    const extent = Math.max(box.width, box.height);
    const size = Math.max(extent * 1.3 + stroke, stroke * 2.6, 1);
    const cx = box.x + box.width / 2;
    const cy = box.y + box.height / 2;
    svg.setAttribute('viewBox', `${cx - size / 2} ${cy - size / 2} ${size} ${size}`);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.removeAttribute('style');
    svg.setAttribute('aria-hidden', 'true');
    const markup = svg.outerHTML;
    cache.set(type, markup);
    return markup;
  } finally {
    svg.remove();
  }
}
