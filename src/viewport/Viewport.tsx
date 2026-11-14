import { useEffect, useRef, useState } from 'preact/hooks';
import { findShape } from '../model/scene';
import { ContextMenu, type MenuPosition } from '../panels/ContextMenu';
import { NoticeBar } from '../panels/NoticeBar';
import { Toolbar } from '../panels/Toolbar';
import { select } from '../state/commands';
import { camera, dispatch, editor, setCamera, useCamera, useEditorState } from '../state/store';
import { orbit, pixelsPerUnit, zoomByWheel, type Camera } from './camera';
import { Gizmo } from './Gizmo';
import { SceneView } from './SceneView';

/** A pointer that moves less than this between press and release is a click. */
const CLICK_TOLERANCE_PX = 3;

/** Pixels per wheel "line" or "page", for mice that scroll in those units. */
const WHEEL_LINE_PX = 16;

interface Size {
  readonly width: number;
  readonly height: number;
}

/** A press on the scene: a click if it barely moves, otherwise a camera drag. */
interface Press {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  /** What was under the pointer when pressed: that is what a click selects. */
  readonly target: EventTarget | null;
  readonly camera: Camera;
  orbiting: boolean;
}

/**
 * The 3D view. It is sized to its own grid column (not the window), shows the
 * scene from the editor store through the camera, and turns clicks into
 * selection and drags into camera turns. The wheel zooms. The selected shape
 * gets the move/rotate gizmo.
 */
export function Viewport() {
  const { scene, selectedId } = useEditorState();
  const currentCamera = useCamera();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const outlineRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  const [size, setSize] = useState<Size | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    const svg = svgRef.current;
    const outline = outlineRef.current;
    if (!container || !svg || !outline) return;

    // zdog reads the initial size from these attributes when it attaches to an
    // <svg>; without them it writes width="null" and logs an error.
    svg.setAttribute('width', String(Math.max(1, container.clientWidth)));
    svg.setAttribute('height', String(Math.max(1, container.clientHeight)));

    const view = new SceneView(svg, outline);
    const show = () => {
      const { scene, selectedId } = editor.get();
      view.setScene(scene);
      view.setSelected(selectedId);
    };
    show();
    const unsubscribe = editor.subscribe(show);
    view.setCamera(camera.get());
    const unsubscribeCamera = camera.subscribe((next) => view.setCamera(next));

    const resize = (width: number, height: number) => {
      view.fit(width, height);
      setSize((previous) =>
        previous?.width === width && previous.height === height ? previous : { width, height },
      );
    };
    resize(container.clientWidth, container.clientHeight);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) resize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(container);

    // A press-and-release without movement selects; a drag turns the camera
    // and leaves the selection alone.
    let press: Press | null = null;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      press = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        target: event.target,
        camera: camera.get(),
        orbiting: false,
      };
      svg.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.pointerId) return;
      const dx = event.clientX - press.x;
      const dy = event.clientY - press.y;
      if (!press.orbiting && Math.hypot(dx, dy) < CLICK_TOLERANCE_PX) return;
      press.orbiting = true;
      const displaySize = Math.min(container.clientWidth, container.clientHeight);
      setCamera(orbit(press.camera, dx, dy, displaySize));
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.pointerId) return;
      const { orbiting, target } = press;
      press = null;
      if (!orbiting) dispatch(select(view.pick(target)));
    };
    const onPointerCancel = () => {
      press = null;
    };
    const onContextMenu = (event: MouseEvent) => {
      const id = view.pick(event.target);
      if (id === null) {
        setMenu(null);
        return;
      }
      event.preventDefault();
      dispatch(select(id));
      const bounds = container.getBoundingClientRect();
      setMenu({ x: event.clientX - bounds.left, y: event.clientY - bounds.top });
    };
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? WHEEL_LINE_PX
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? container.clientHeight
            : 1;
      setCamera((current) => zoomByWheel(current, event.deltaY * unit));
    };
    svg.addEventListener('pointerdown', onPointerDown);
    svg.addEventListener('pointermove', onPointerMove);
    svg.addEventListener('pointerup', onPointerUp);
    svg.addEventListener('pointercancel', onPointerCancel);
    svg.addEventListener('contextmenu', onContextMenu);
    container.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      svg.removeEventListener('pointerdown', onPointerDown);
      svg.removeEventListener('pointermove', onPointerMove);
      svg.removeEventListener('pointerup', onPointerUp);
      svg.removeEventListener('pointercancel', onPointerCancel);
      svg.removeEventListener('contextmenu', onContextMenu);
      container.removeEventListener('wheel', onWheel);
      observer.disconnect();
      unsubscribe();
      unsubscribeCamera();
      view.destroy();
    };
  }, []);

  const selected = findShape(scene, selectedId);
  const zoom = size && pixelsPerUnit(size.width, size.height, currentCamera);

  return (
    <div class="viewport" ref={containerRef} style={{ background: scene.settings.background }}>
      <svg class="scene" ref={svgRef} aria-label="Scene" />
      <div class="selection-outline" ref={outlineRef} hidden aria-hidden="true" />
      {selected && size && zoom && (
        <Gizmo shape={selected} view={{ width: size.width, height: size.height, zoom, rotate: currentCamera.rotate }} />
      )}
      <Toolbar viewSize={size} />
      <NoticeBar />
      {menu && <ContextMenu position={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
