import type * as ZdogTypes from 'zdog';
import { Zdog } from '../zdog';
import type { Placeable, Scene, ShapeData } from '../model/types';
import { rootTranslate, type ViewSpec } from '../render/view';
import { attachAll, createZdogGroup } from '../render/zdogGraph';
import { testHooks } from '../state/testHooks';
import { createZdogShape, zdogTransform } from './toZdog';

/** Attribute that ties every SVG element back to the top-level shape that drew it. */
export const SHAPE_ID_ATTRIBUTE = 'data-shape-id';

/** Padding around the selection outline, in screen pixels. */
const SELECTION_PADDING = 4;

/** What a SceneView tells its owner after each draw. */
export interface SceneViewEvents {
  /** The scene was drawn without trouble. */
  readonly onDrawn?: () => void;
  /** Drawing failed. Without this, the error is thrown. */
  readonly onError?: (error: unknown) => void;
}

interface Entry {
  readonly data: Placeable;
  readonly object: ZdogTypes.Anchor;
}

/** zdog's Anchor keeps its children in an untyped `children` array. */
function childrenOf(node: object): ZdogTypes.Anchor[] | undefined {
  const children = (node as { children?: unknown }).children;
  return Array.isArray(children) ? (children as ZdogTypes.Anchor[]) : undefined;
}

/**
 * Every SVG element a zdog object (and its internal children, e.g. a Box's
 * faces or a Cone's surface) has drawn. zdog creates these lazily and keeps
 * them in differently named properties, so look at all of them.
 */
function svgElementsOf(root: ZdogTypes.Anchor): SVGElement[] {
  const found: SVGElement[] = [];
  const visit = (node: object) => {
    for (const value of Object.values(node)) {
      if (value instanceof SVGElement) found.push(value);
    }
    childrenOf(node)?.forEach(visit);
  };
  visit(root);
  return found;
}

/**
 * Owns the zdog Illustration and keeps it in step with the scene data and
 * the camera. Draws only when something changed (scene, selection, size,
 * camera).
 */
export class SceneView {
  private readonly illo: ZdogTypes.Illustration;
  private readonly entries = new Map<string, Entry>();
  private selectedIds: readonly string[] = [];
  private playing = false;
  /** Shapes built since the last render, whose SVG elements still need their id tag. */
  private readonly untagged = new Set<string>();
  /** How many elements the SVG had after the last tagging pass. */
  private taggedCount = -1;
  private frame = 0;

  constructor(
    private readonly svg: SVGSVGElement,
    private readonly selectionOutline: HTMLElement,
    private readonly events: SceneViewEvents = {},
  ) {
    this.illo = new Zdog.Illustration({
      element: svg,
      // Sized to its column by setView(); zdog's 'fullscreen' used the whole window.
      resize: false,
      // The camera comes from the editor's store (see Viewport), not zdog's dragRotate.
    });
  }

  /**
   * Brings the zdog objects in line with `scene`. Unchanged shapes and groups
   * are left alone; ones that only moved are moved in place.
   */
  setScene(scene: Scene): void {
    const present = new Set<string>();

    for (const group of scene.groups) {
      present.add(group.id);
      const entry = this.entries.get(group.id);
      if (entry?.data === group) continue;
      if (entry && entry.data.type === 'Group' && entry.data.drawTogether === group.drawTogether) {
        this.moveInPlace(entry.object, group);
        this.entries.set(group.id, { data: group, object: entry.object });
      } else {
        // New, or switched between Anchor and Group: a new node (its children are re-attached below).
        this.entries.set(group.id, { data: group, object: createZdogGroup(group) });
      }
    }

    for (const shape of scene.shapes) {
      present.add(shape.id);
      const entry = this.entries.get(shape.id);
      // Scene data is immutable, so a different object means the shape changed.
      if (entry?.data === shape) continue;
      if (entry && entry.data.type !== 'Group' && onlyMoved(entry.data, shape)) {
        // Position, rotation, scale or group only (most animation frames): move the zdog object.
        this.moveInPlace(entry.object, shape);
        this.entries.set(shape.id, { data: shape, object: entry.object });
      } else {
        // Anything else: rebuild it (several zdog shapes can't change size in place).
        this.entries.set(shape.id, { data: shape, object: createZdogShape(shape) });
        this.untagged.add(shape.id);
      }
    }

    for (const id of [...this.entries.keys()]) if (!present.has(id)) this.entries.delete(id);

    // Every node under its group (or the illustration), in the scene's order.
    const nodes = new Map([...this.entries].map(([id, entry]) => [id, entry.object]));
    attachAll(scene, this.illo, nodes);

    this.requestRender();
  }

  private moveInPlace(object: ZdogTypes.Anchor, data: Placeable): void {
    const { translate, rotate, scale } = zdogTransform(data);
    object.translate.set(translate);
    object.rotate.set(rotate);
    object.scale.set({ x: scale, y: scale, z: scale });
  }

  /** While playing, the selection outline is hidden (measuring it every frame is slow). */
  setPlaying(playing: boolean): void {
    if (playing === this.playing) return;
    this.playing = playing;
    this.requestRender();
  }

  /** The outline goes around everything selected. */
  setSelected(ids: readonly string[]): void {
    if (ids.length === this.selectedIds.length && ids.every((id, i) => id === this.selectedIds[i])) return;
    this.selectedIds = ids;
    this.requestRender();
  }

  /**
   * How the scene is seen: the free view or a camera, as a ViewSpec covering
   * the whole viewport (see render/view.ts).
   */
  setView(view: ViewSpec): void {
    if (view.width <= 0 || view.height <= 0) return;
    this.illo.rotate.set(view.rotate);
    this.illo.translate.set(rootTranslate(view));
    this.illo.zoom = view.pixelsPerUnit;
    this.illo.setSize(view.width, view.height);
    this.requestRender();
  }

  /** The id of the shape that drew `target`, or null for empty space. */
  pick(target: EventTarget | null): string | null {
    if (!(target instanceof Element)) return null;
    const element = target.closest(`[${SHAPE_ID_ATTRIBUTE}]`);
    if (!element || !this.svg.contains(element)) return null;
    const id = element.getAttribute(SHAPE_ID_ATTRIBUTE);
    return id !== null && this.entries.has(id) ? id : null;
  }

  requestRender(): void {
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      // A draw that throws mustn't escape: it would repeat on every frame and
      // leave the viewport stuck. Report it, so the editor can step back.
      try {
        this.renderNow();
      } catch (error) {
        if (!this.events.onError) throw error;
        this.events.onError(error);
        return;
      }
      this.events.onDrawn?.();
    });
  }

  renderNow(): void {
    const breakFor = testHooks().breakDrawOf;
    if (breakFor !== undefined && [...this.entries.values()].some((entry) => entry.data.name === breakFor)) {
      throw new Error(`Test: drawing "${breakFor}" fails on purpose.`);
    }
    this.illo.updateRenderGraph();
    this.tagElements();
    this.placeSelectionOutline();
  }

  destroy(): void {
    cancelAnimationFrame(this.frame);
    this.frame = 0;
    this.svg.replaceChildren();
  }

  /**
   * Tags SVG elements with their shape's id. zdog creates an element the first
   * time that part is drawn, which can be long after the shape was built (a
   * face turned away isn't drawn), so every shape is checked whenever the
   * number of elements changes; otherwise only newly built shapes are.
   */
  private tagElements(): void {
    const count = this.svg.getElementsByTagName('*').length;
    const ids = count !== this.taggedCount ? [...this.entries.keys()] : [...this.untagged];
    for (const id of ids) {
      const entry = this.entries.get(id);
      // Only shapes: a group's elements are its shapes', which carry their own ids.
      if (!entry || entry.data.type === 'Group') continue;
      for (const element of svgElementsOf(entry.object)) {
        if (element.getAttribute(SHAPE_ID_ATTRIBUTE) !== id) element.setAttribute(SHAPE_ID_ATTRIBUTE, id);
      }
    }
    this.untagged.clear();
    this.taggedCount = count;
  }

  private placeSelectionOutline(): void {
    const outline = this.selectionOutline;
    if (this.playing) {
      outline.hidden = true;
      return;
    }
    const rects = this.selectedIds
      .map((id) => this.entries.get(id))
      .flatMap((entry) => (entry ? svgElementsOf(entry.object) : []))
      .filter((element) => element.isConnected)
      .map((element) => element.getBoundingClientRect())
      .filter((rect) => rect.width > 0 || rect.height > 0);

    if (rects.length === 0) {
      outline.hidden = true;
      return;
    }

    // offsetParent is null while the outline is hidden, so measure its parent instead.
    const container = (outline.parentElement ?? this.svg).getBoundingClientRect();
    const left = Math.min(...rects.map((r) => r.left)) - container.left - SELECTION_PADDING;
    const top = Math.min(...rects.map((r) => r.top)) - container.top - SELECTION_PADDING;
    const right = Math.max(...rects.map((r) => r.right)) - container.left + SELECTION_PADDING;
    const bottom = Math.max(...rects.map((r) => r.bottom)) - container.top + SELECTION_PADDING;

    outline.hidden = false;
    outline.style.left = `${left}px`;
    outline.style.top = `${top}px`;
    outline.style.width = `${right - left}px`;
    outline.style.height = `${bottom - top}px`;
  }
}

/** True when only position, rotation or scale differ, which zdog can change in place. */
function onlyMoved(before: ShapeData, after: ShapeData): boolean {
  return before.type === after.type && before.props === after.props && before.opacity === after.opacity;
}
