import { useEffect, useRef, useState } from 'preact/hooks';
import { objectAtFrame, sceneAtFrame } from '../model/evaluate';
import { findShape } from '../model/scene';
import { SHAPE_TYPE_DEFS } from '../model/shapeTypes';
import { SHAPE_TYPES } from '../model/types';
import type { CameraData } from '../model/types';
import { ContextMenu, type MenuPosition } from '../panels/ContextMenu';
import { NoticeBar } from '../panels/NoticeBar';
import { cameraFrame } from '../render/view';
import { addShapeOfType, edit, select } from '../state/commands';
import { currentViewSpec, lookedThroughCamera } from '../state/currentView';
import { newGroup } from '../state/history';
import { setPointerDrag } from '../state/pointerDrag';
import { PopupMenu } from '../panels/PopupMenu';
import {
  dispatch,
  editor,
  freeView,
  lookThrough,
  setFreeView,
  useEditorState,
  useFreeView,
  useLookThrough,
} from '../state/store';
import { currentFrame, pause, timeline, useTimeline } from '../state/timeline';
import { setViewportSize } from '../state/viewportSize';
import { CameraFrames } from './CameraFrames';
import { ContextToolbar } from './ContextToolbar';
import { EmptyStage } from './EmptyStage';
import { ExportDone } from '../panels/ExportDone';
import { orbit, wheelZoomFactor, zoomByWheel, type FreeView } from './freeView';
import { Gizmo } from './Gizmo';
import { unproject, type ViewTransform } from './gizmoMath';
import { SceneView } from './SceneView';
import { ZoomControls } from './ZoomControls';

/** A pointer that moves less than this between press and release is a click. */
const CLICK_TOLERANCE_PX = 3;

/** Pixels per wheel "line" or "page", for mice that scroll in those units. */
const WHEEL_LINE_PX = 16;

/** Wheel scrolling with gaps shorter than this is one undo step (when it zooms a camera). */
const WHEEL_STEP_GAP_MS = 400;

/** Camera angles from a drag are kept to hundredths of a degree, like the gizmo's rings. */
const roundAngle = (degrees: number) => Math.round(degrees * 100) / 100;

const MIN_VIEW_SPAN = 0.1;
const MAX_VIEW_SPAN = 100000;

interface Size {
  readonly width: number;
  readonly height: number;
}

/** A press on the scene: a click if it barely moves, otherwise a drag that turns the view. */
interface Press {
  readonly pointerId: number;
  readonly x: number;
  readonly y: number;
  /** What was under the pointer when pressed: that is what a click selects. */
  readonly target: EventTarget | null;
  readonly freeView: FreeView;
  /** When looking through a camera: the camera as it was when the drag began. */
  readonly camera: CameraData | null;
  /** The drag's undo group (when it turns a camera). */
  readonly group: string;
  orbiting: boolean;
}

/**
 * The 3D view. It is sized to its own grid column (not the window) and shows
 * the scene as posed on the playhead's frame, through the free view or a
 * camera. Clicks select; dragging turns the view and the wheel zooms. While
 * looking through a camera, those change the camera itself (keyed on this
 * frame if it is animated), and its picture is shown letterboxed.
 */
export function Viewport() {
  const { scene, selectedId } = useEditorState();
  useFreeView(); // re-render the overlays when the free view turns
  const lookingThrough = useLookThrough();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const outlineRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuPosition | null>(null);
  /** Right-click on empty space: an "Add here" menu at that point. */
  const [addMenu, setAddMenu] = useState<MenuPosition | null>(null);
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
    let area: Size = { width: container.clientWidth, height: container.clientHeight };
    // The scene as posed on the playhead's frame, through the current view.
    // Playback only moves the playhead; it never goes through the undo history.
    const show = () => {
      const { scene, selectedId } = editor.get();
      view.setPlaying(timeline.get().playing);
      const spec = currentViewSpec(area.width, area.height);
      if (spec) view.setView(spec);
      view.setScene(sceneAtFrame(scene, currentFrame()));
      view.setSelected(selectedId);
    };
    show();
    const unsubscribers = [
      editor.subscribe(show),
      timeline.subscribe(show),
      freeView.subscribe(show),
      lookThrough.subscribe(show),
    ];

    const resize = (width: number, height: number) => {
      area = { width, height };
      setViewportSize(area);
      show();
      setSize((previous) => (previous?.width === width && previous.height === height ? previous : { width, height }));
    };
    resize(container.clientWidth, container.clientHeight);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) resize(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(container);

    // A press-and-release without movement selects; a drag turns the view
    // and leaves the selection alone.
    let press: Press | null = null;
    const onPointerDown = (event: PointerEvent) => {
      if (event.button !== 0) return;
      press = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        target: event.target,
        freeView: freeView.get(),
        camera: lookedThroughCamera(),
        group: newGroup(),
        orbiting: false,
      };
      svg.setPointerCapture(event.pointerId);
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.pointerId) return;
      const dx = event.clientX - press.x;
      const dy = event.clientY - press.y;
      if (!press.orbiting && Math.hypot(dx, dy) < CLICK_TOLERANCE_PX) return;
      if (!press.orbiting) setPointerDrag(true);
      press.orbiting = true;
      const displaySize = Math.min(container.clientWidth, container.clientHeight);
      if (press.camera) {
        // The same feel as the free view: a drag across the shorter side is a full turn.
        const { rotate } = press.camera;
        pause();
        dispatch(
          edit(
            press.camera.id,
            { rotate: { x: roundAngle(rotate.x - (dy / displaySize) * 360), y: roundAngle(rotate.y - (dx / displaySize) * 360) } },
            currentFrame(),
          ),
          { group: press.group },
        );
      } else {
        setFreeView(orbit(press.freeView, dx, dy, displaySize));
      }
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!press || event.pointerId !== press.pointerId) return;
      const { orbiting, target } = press;
      press = null;
      if (orbiting) setPointerDrag(false);
      else dispatch(select(view.pick(target)));
    };
    const onPointerCancel = () => {
      if (press?.orbiting) setPointerDrag(false);
      press = null;
    };
    const onContextMenu = (event: MouseEvent) => {
      const id = view.pick(event.target);
      event.preventDefault();
      const bounds = container.getBoundingClientRect();
      const at = { x: event.clientX - bounds.left, y: event.clientY - bounds.top };
      if (id === null) {
        setMenu(null);
        setAddMenu(at);
        return;
      }
      setAddMenu(null);
      dispatch(select(id));
      setMenu(at);
    };
    let wheelGroup: string | null = null;
    let wheelTimer: ReturnType<typeof setTimeout> | undefined;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? WHEEL_LINE_PX
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? container.clientHeight
            : 1;
      const camera = lookedThroughCamera();
      if (!camera) {
        setFreeView((current) => zoomByWheel(current, event.deltaY * unit));
        return;
      }
      // Zooming in makes the camera's view span smaller. One burst of scrolling is one undo step.
      wheelGroup ??= newGroup();
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(() => (wheelGroup = null), WHEEL_STEP_GAP_MS);
      const viewSpan = Math.min(
        MAX_VIEW_SPAN,
        Math.max(MIN_VIEW_SPAN, camera.viewSpan / wheelZoomFactor(event.deltaY * unit)),
      );
      pause();
      dispatch(edit(camera.id, { viewSpan }, currentFrame()), { group: wheelGroup });
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
      clearTimeout(wheelTimer);
      observer.disconnect();
      for (const unsubscribe of unsubscribers) unsubscribe();
      view.destroy();
    };
  }, []);

  const { frame, playing } = useTimeline();
  const found = findShape(scene, selectedId);
  const selected = found && objectAtFrame(found, frame);
  const posedCameras = scene.cameras.map((camera) => objectAtFrame(camera, frame));
  const throughCamera = posedCameras.find((camera) => camera.id === lookingThrough) ?? null;
  const spec = size && currentViewSpec(size.width, size.height);
  const transform: ViewTransform | null = spec && {
    width: spec.width,
    height: spec.height,
    zoom: spec.pixelsPerUnit,
    rotate: spec.rotate,
    target: spec.target,
  };
  const frameRect = throughCamera && size ? cameraFrame(throughCamera, size.width, size.height) : null;
  const selectedObject = selected ?? posedCameras.find((camera) => camera.id === selectedId) ?? null;

  /** Adds a shape where the "Add here" menu was opened, on the plane facing the view. */
  const addAt = (type: (typeof SHAPE_TYPES)[number], at: MenuPosition) => {
    if (!transform) return;
    const p = unproject(at, transform);
    const round = (n: number) => Math.round(n * 2) / 2;
    dispatch(addShapeOfType(type, { x: round(p.x), y: round(p.y), z: round(p.z) }));
  };

  return (
    <div class="viewport" ref={containerRef} style={{ background: scene.settings.background }}>
      <svg class="scene" ref={svgRef} aria-label="Scene" tabindex={-1} />
      <div class="selection-outline" ref={outlineRef} hidden aria-hidden="true" />
      {transform && !throughCamera && (
        <CameraFrames
          cameras={posedCameras}
          view={transform}
          selectedId={selectedId}
          onSelect={(id) => dispatch(select(id))}
        />
      )}
      {frameRect && throughCamera && (
        <div
          class="camera-letterbox"
          role="img"
          aria-label={`Looking through ${throughCamera.name}`}
          style={{
            left: `${frameRect.left}px`,
            top: `${frameRect.top}px`,
            width: `${frameRect.width}px`,
            height: `${frameRect.height}px`,
          }}
        >
          <span class="camera-letterbox-label">
            {throughCamera.name} · {throughCamera.width}×{throughCamera.height}
          </span>
        </div>
      )}
      {selected && transform && <Gizmo shape={selected} frame={frame} view={transform} />}
      {selectedObject && transform && (
        <ContextToolbar
          object={selectedObject}
          view={transform}
          frame={frame}
          pinned={throughCamera?.id === selectedObject.id}
          playing={playing}
          outline={outlineRef.current}
          scene={svgRef.current}
        />
      )}
      {scene.shapes.length === 0 && scene.cameras.length === 0 && <EmptyStage />}
      <ExportDone />
      <ZoomControls />
      <NoticeBar />
      {menu && <ContextMenu position={menu} onClose={() => setMenu(null)} />}
      {addMenu && (
        <PopupMenu
          label="Add here"
          position={addMenu}
          onClose={() => setAddMenu(null)}
          items={SHAPE_TYPES.map((type) => ({
            label: SHAPE_TYPE_DEFS[type].addLabel ?? SHAPE_TYPE_DEFS[type].label,
            onSelect: () => addAt(type, addMenu),
          }))}
        />
      )}
    </div>
  );
}
