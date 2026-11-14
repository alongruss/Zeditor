import type * as ZdogTypes from 'zdog';
import { Zdog } from '../zdog';
import type { Scene, ShapeData } from '../model/types';
import { DEFAULT_CAMERA, pixelsPerUnit, type Camera } from './camera';
import { createZdogShape } from './toZdog';

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
  private camera: Camera = DEFAULT_CAMERA;
  private width = 0;
  private height = 0;
  private frame = 0;

  constructor(
    private readonly svg: SVGSVGElement,
    private readonly selectionOutline: HTMLElement,
  ) {
    this.illo = new Zdog.Illustration({
      element: svg,
      // Sized to its column by fit(); zdog's 'fullscreen' used the whole window.
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
      // Rebuilding is simplest: several zdog shapes can't update size in place.
      if (!entry || entry.data !== shape) {
        if (entry) this.illo.removeChild(entry.object);
        entry = { data: shape, object: createZdogShape(shape) };
        this.entries.set(shape.id, entry);
        this.illo.addChild(entry.object);
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

  setSelected(id: string | null): void {
    if (id === this.selectedId) return;
    this.selectedId = id;
    this.requestRender();
  }

  /** Fits the scene to a `width` x `height` area. Ignored until it has a size. */
  fit(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.applyView();
  }

  setCamera(camera: Camera): void {
    if (camera === this.camera) return;
    this.camera = camera;
    this.applyView();
  }

  private applyView(): void {
    const zoom = pixelsPerUnit(this.width, this.height, this.camera);
    if (zoom === null) return;
    this.illo.rotate.set({ x: this.camera.rotate.x, y: this.camera.rotate.y, z: 0 });
    this.illo.zoom = zoom;
    this.illo.setSize(this.width, this.height);
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

  private tagElements(): void {
    for (const [id, entry] of this.entries) {
      for (const element of svgElementsOf(entry.object)) {
        if (element.getAttribute(SHAPE_ID_ATTRIBUTE) !== id) {
          element.setAttribute(SHAPE_ID_ATTRIBUTE, id);
        }
      }
    }
  }

  private placeSelectionOutline(): void {
    const outline = this.selectionOutline;
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
