/**
 * The parts of the Lottie format the export writes, with builders. Field
 * names follow the Lottie spec (https://lottie.github.io/lottie-spec/).
 *
 * Rules that matter for players (checked against lottie-web 5.13):
 * - Every layer needs `st` (start time); lottie-web hides a layer without it.
 * - The first layer in the list, and the first item in a group, is drawn on top.
 * - Players ignore a color's 4th (alpha) component; opacity goes in `o` (0–100).
 * - A group's transform (`tr`) must be its last item.
 * - lottie-web rewrites the data it is given (e.g. tangents become absolute),
 *   so builders never share an object between two places in the tree.
 */

export interface Static<T> {
  readonly a: 0;
  readonly k: T;
}

export type Vec2 = readonly [number, number];

export interface LottieBezier {
  /** Closed. */
  readonly c: boolean;
  /** Vertices. */
  readonly v: readonly Vec2[];
  /** In-tangents, relative to their vertex. */
  readonly i: readonly Vec2[];
  /** Out-tangents, relative to their vertex. */
  readonly o: readonly Vec2[];
}

export interface PathItem {
  readonly ty: 'sh';
  readonly ks: Static<LottieBezier>;
}

export interface FillItem {
  readonly ty: 'fl';
  /** [r, g, b] from 0 to 1. */
  readonly c: Static<readonly [number, number, number]>;
  /** 0–100 */
  readonly o: Static<number>;
  /** 1 = nonzero, like canvas. */
  readonly r: 1;
}

export interface StrokeItem {
  readonly ty: 'st';
  readonly c: Static<readonly [number, number, number]>;
  readonly o: Static<number>;
  readonly w: Static<number>;
  /** 1 butt, 2 round, 3 square */
  readonly lc: 1 | 2 | 3;
  /** 1 miter, 2 round, 3 bevel */
  readonly lj: 1 | 2 | 3;
  readonly ml: number;
}

export interface TransformItem {
  readonly ty: 'tr';
  readonly p: Static<Vec2>;
  readonly a: Static<Vec2>;
  readonly s: Static<Vec2>;
  readonly r: Static<number>;
  readonly o: Static<number>;
}

export interface GroupItem {
  readonly ty: 'gr';
  readonly nm: string;
  readonly it: readonly (PathItem | FillItem | StrokeItem | TransformItem)[];
}

export interface LayerTransform {
  readonly o: Static<number>;
  readonly r: Static<number>;
  readonly p: Static<readonly [number, number, number]>;
  readonly a: Static<readonly [number, number, number]>;
  readonly s: Static<readonly [number, number, number]>;
}

interface LayerBase {
  readonly ddd: 0;
  readonly ind: number;
  readonly nm: string;
  readonly sr: 1;
  readonly ks: LayerTransform;
  readonly ao: 0;
  readonly ip: number;
  readonly op: number;
  /** Required by lottie-web, which never shows a layer without it. */
  readonly st: 0;
  readonly bm: 0;
}

export interface ShapeLayer extends LayerBase {
  readonly ty: 4;
  readonly shapes: readonly GroupItem[];
}

export interface SolidLayer extends LayerBase {
  readonly ty: 1;
  readonly sc: string;
  readonly sw: number;
  readonly sh: number;
}

export interface LottieAnimation {
  readonly v: string;
  readonly fr: number;
  readonly ip: 0;
  /** End frame, exclusive. */
  readonly op: number;
  readonly w: number;
  readonly h: number;
  readonly nm: string;
  readonly ddd: 0;
  readonly assets: readonly never[];
  readonly layers: readonly (ShapeLayer | SolidLayer)[];
}

/** The format version written; lottie-web applies no old-version fixes to 5.x files. */
export const LOTTIE_VERSION = '5.7.0';

export const still = <T>(k: T): Static<T> => ({ a: 0, k });

const identityLayerTransform = (): LayerTransform => ({
  o: still(100),
  r: still(0),
  p: still([0, 0, 0] as const),
  a: still([0, 0, 0] as const),
  s: still([100, 100, 100] as const),
});

/** A group transform that changes nothing (a new object each time). */
export const identityGroupTransform = (): TransformItem => ({
  ty: 'tr',
  p: still([0, 0] as const),
  a: still([0, 0] as const),
  s: still([100, 100] as const),
  r: still(0),
  o: still(100),
});

function layerBase(ind: number, nm: string, ip: number, op: number): LayerBase {
  return { ddd: 0, ind, nm, sr: 1, ks: identityLayerTransform(), ao: 0, ip, op, st: 0, bm: 0 };
}

export function shapeLayer(ind: number, nm: string, ip: number, op: number, shapes: readonly GroupItem[]): ShapeLayer {
  return { ...layerBase(ind, nm, ip, op), ty: 4, shapes };
}

export function solidLayer(ind: number, nm: string, ip: number, op: number, size: Vec2, color: string): SolidLayer {
  return { ...layerBase(ind, nm, ip, op), ty: 1, sc: color, sw: size[0], sh: size[1] };
}
