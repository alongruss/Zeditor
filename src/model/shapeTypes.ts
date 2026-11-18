import { MAX_SIDES, MAX_SIZE, MAX_STROKE, MIN_SIDES } from './limits';
import type { PathData, PropValue, ShapeType } from './types';

/** Which Inspector section a field appears in. */
export type FieldGroup = 'size' | 'appearance' | 'faces';

interface FieldBase {
  readonly key: string;
  readonly label: string;
  readonly group: FieldGroup;
}

export interface NumberField extends FieldBase {
  readonly kind: 'number';
  readonly min: number;
  readonly max: number;
  /** Arrow-key step in the Inspector. */
  readonly step: number;
  /** Whole numbers only (e.g. polygon sides). */
  readonly integer?: boolean;
}

export interface ColorField extends FieldBase {
  readonly kind: 'color';
}

export interface BooleanField extends FieldBase {
  readonly kind: 'boolean';
}

/** A Box face: its own color, or `true` for the shape's main color. */
export interface FaceField extends FieldBase {
  readonly kind: 'face';
}

export type FieldDef = NumberField | ColorField | BooleanField | FaceField;

export interface ShapeTypeDef {
  readonly type: ShapeType;
  /** Shown in the scene tree and Inspector, and used for new shapes' names. */
  readonly label: string;
  /** Shown in the Add menu when it differs from `label` (what you get from Add). */
  readonly addLabel?: string;
  /** Used to build ids like `rounded-rect-1`. */
  readonly idPrefix: string;
  /** Editable fields, in Inspector order. */
  readonly fields: readonly FieldDef[];
  /** Default value for every prop, including ones with no field (e.g. `path`). */
  readonly defaults: Readonly<Record<string, PropValue>>;
}

const UNIT_STEP = 0.5;

const size = (key: string, label: string): NumberField => ({
  key,
  label,
  group: 'size',
  kind: 'number',
  min: 0,
  max: MAX_SIZE,
  step: UNIT_STEP,
});

const color: ColorField = { key: 'color', label: 'Color', group: 'appearance', kind: 'color' };
const stroke: NumberField = {
  key: 'stroke',
  label: 'Stroke',
  group: 'appearance',
  kind: 'number',
  min: 0,
  max: MAX_STROKE,
  step: UNIT_STEP,
};
const fill: BooleanField = { key: 'fill', label: 'Fill', group: 'appearance', kind: 'boolean' };
/** Draw the outline back to its start (a closed path), or leave it open. */
const closed: BooleanField = { key: 'closed', label: 'Closed', group: 'appearance', kind: 'boolean' };
/** Hidden shapes still count when a group is drawn together (zdog demos use them to steer draw order). */
const visible: BooleanField = { key: 'visible', label: 'Visible', group: 'appearance', kind: 'boolean' };
const quarters: NumberField = {
  key: 'quarters',
  label: 'Quarters',
  group: 'size',
  kind: 'number',
  min: 1,
  max: 4,
  step: 1,
  integer: true,
};

const backface: ColorField = {
  key: 'backface',
  label: 'Back color',
  group: 'appearance',
  kind: 'color',
};

export const BOX_FACES = [
  ['frontFace', 'Front'],
  ['rearFace', 'Rear'],
  ['leftFace', 'Left'],
  ['rightFace', 'Right'],
  ['topFace', 'Top'],
  ['bottomFace', 'Bottom'],
] as const;

const DOT_PATH: PathData = [{}];

const defs: readonly ShapeTypeDef[] = [
  {
    type: 'Rect',
    label: 'Rectangle',
    idPrefix: 'rect',
    fields: [size('width', 'Width'), size('height', 'Height'), color, stroke, fill],
    defaults: { width: 4, height: 4, color: '#ee6622', stroke: 1, fill: false },
  },
  {
    type: 'RoundedRect',
    label: 'Rounded rectangle',
    idPrefix: 'rounded-rect',
    fields: [
      size('width', 'Width'),
      size('height', 'Height'),
      size('cornerRadius', 'Corner radius'),
      color,
      stroke,
      fill,
    ],
    defaults: { width: 4, height: 4, cornerRadius: 1, color: '#33aa66', stroke: 1, fill: false },
  },
  {
    type: 'Ellipse',
    label: 'Circle',
    idPrefix: 'ellipse',
    fields: [size('diameter', 'Diameter'), quarters, color, stroke, fill, closed],
    defaults: { diameter: 4, quarters: 4, color: '#cc2255', stroke: 1, fill: false, closed: false },
  },
  {
    type: 'Polygon',
    label: 'Polygon',
    idPrefix: 'polygon',
    fields: [
      { key: 'sides', label: 'Sides', group: 'size', kind: 'number', min: MIN_SIDES, max: MAX_SIDES, step: 1, integer: true },
      size('radius', 'Radius'),
      color,
      stroke,
      fill,
    ],
    defaults: { sides: 3, radius: 2.5, color: '#ee6622', stroke: 1, fill: false },
  },
  {
    type: 'Shape',
    label: 'Shape',
    addLabel: 'Dot',
    idPrefix: 'shape',
    // The path itself isn't editable in v1; a new Shape is a single point (a round dot).
    fields: [color, stroke, fill, closed, visible],
    defaults: { path: DOT_PATH, color: '#663366', stroke: 2, fill: false, closed: true, visible: true },
  },
  {
    type: 'Hemisphere',
    label: 'Hemisphere',
    idPrefix: 'hemisphere',
    fields: [size('diameter', 'Diameter'), color, backface, stroke, fill],
    defaults: { diameter: 5, color: '#cc2255', backface: '#eeaa00', stroke: 0, fill: true },
  },
  {
    type: 'Cylinder',
    label: 'Cylinder',
    idPrefix: 'cylinder',
    fields: [size('diameter', 'Diameter'), size('length', 'Length'), color, backface, stroke, fill],
    defaults: {
      diameter: 5,
      length: 4,
      color: '#eeaa00',
      backface: '#ffeedd',
      stroke: 0,
      fill: true,
    },
  },
  {
    type: 'Cone',
    label: 'Cone',
    idPrefix: 'cone',
    fields: [size('diameter', 'Diameter'), size('length', 'Length'), color, backface, stroke, fill],
    defaults: {
      diameter: 5,
      length: 4,
      color: '#663366',
      backface: '#cc2255',
      stroke: 0,
      fill: true,
    },
  },
  {
    type: 'Box',
    label: 'Box',
    idPrefix: 'box',
    fields: [
      size('width', 'Width'),
      size('height', 'Height'),
      size('depth', 'Depth'),
      color,
      stroke,
      fill,
      ...BOX_FACES.map(([key, label]): FaceField => ({ key, label, group: 'faces', kind: 'face' })),
    ],
    defaults: {
      width: 5,
      height: 5,
      depth: 5,
      color: '#ee6622',
      stroke: 0,
      fill: true,
      ...Object.fromEntries(BOX_FACES.map(([key]) => [key, true])),
    },
  },
];

export const SHAPE_TYPE_DEFS: Readonly<Record<ShapeType, ShapeTypeDef>> = Object.fromEntries(
  defs.map((def) => [def.type, def]),
) as Record<ShapeType, ShapeTypeDef>;

export function getShapeTypeDef(type: ShapeType): ShapeTypeDef {
  return SHAPE_TYPE_DEFS[type];
}
