import type * as ZdogTypes from 'zdog';
import { Zdog } from '../zdog';
import type { Scene, ShapeData } from '../model/types';
import { rootTranslate, type ViewSpec } from '../render/view';
import { createZdogShape, zdogTransform } from './toZdog';

/** Attribute that ties every SVG element back to the top-level shape that drew it. */
export const SHAPE_ID_ATTRIBUTE = 'data-shape-id';

/** Padding around the selection outline, in screen pixels. */
const SELECTION_PADDING = 4;

interface Entry {
  readonly data: ShapeData;
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
  private selectedId: string | null = null;
  private playing = false;
  /** Shapes built since the last render, whose SVG elements still need their id tag. */
  private readonly untagged = new Set<string>();
  /** How many elements the SVG had after the last tagging pass. */
  private taggedCount = -1;
  private frame = 0;

  constructor(
    private readonly svg: SVGSVGElement,
    private readonly selectionOutline: HTMLElement,
  ) {
    this.illo = new Zdog.Illustration({
      element: svg,
      // Sized to its column by setView(); zdog's 'fullscreen' used the whole window.
      resize: false,
      // The camera comes from the editor's store (see Viewport), not zdog's dragRotate.
    });
  }

  /** Brings the zdog objects in line with `scene`. Unchanged shapes are left alone. */
  setScene(scene: Scene): void {
    const ordered: ZdogTypes.Anchor[] = [];
    const present = new Set<string>();

    for (const shape of scene.shapes) {
      present.add(shape.id);
      let entry = this.entries.get(shape.id);
      // Scene data is immutable, so a different object means the shape changed.
      if (entry && entry.data !== shape && onlyMoved(entry.data, shape)) {
        // Position, rotation or scale only (most animation frames): move the zdog object.
        const { translate, rotate, scale } = zdogTransform(shape);
        entry.object.translate.set(translate);
        entry.object.rotate.set(rotate);
        entry.object.scale.set({ x: scale, y: scale, z: scale });
        entry = { data: shape, object: entry.object };
        this.entries.set(shape.id, entry);
      } else if (!entry || entry.data !== shape) {
        // Anything else: rebuild it (several zdog shapes can't change size in place).
        if (entry) this.illo.removeChild(entry.object);
        entry = { data: shape, object: createZdogShape(shape) };
        this.entries.set(shape.id, entry);
        this.illo.addChild(entry.object);
        this.untagged.add(shape.id);
      }
      ordered.push(entry.object);
    }

    for (const [id, entry] of this.entries) {
      if (!present.has(id)) {
        this.illo.removeChild(entry.object);
        this.entries.delete(id);
      }
    }

    // Keep zdog's child order the same as the scene's.
    const children = childrenOf(this.illo);
    if (children) children.splice(0, children.length, ...ordered);

    this.requestRender();
  }

  /** While playing, the selection outline is hidden (measuring it every frame is slow). */
  setPlaying(playing: boolean): void {
    if (playing === this.playing) return;
    this.playing = playing;
    this.requestRender();
  }

  setSelected(id: string | null): void {
    if (id === this.selectedId) return;
    this.selectedId = id;
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
      this.renderNow();
    });
  }

  renderNow(): void {
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
      if (!entry) continue;
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
    const entry = this.selectedId === null ? undefined : this.entries.get(this.selectedId);
    const rects = entry
      ? svgElementsOf(entry.object)
          .filter((element) => element.isConnected)
          .map((element) => element.getBoundingClientRect())
          .filter((rect) => rect.width > 0 || rect.height > 0)
      : [];

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
