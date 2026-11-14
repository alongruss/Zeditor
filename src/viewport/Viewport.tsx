import { useEffect, useRef, useState } from 'preact/hooks';
import { ContextMenu, type MenuPosition } from '../panels/ContextMenu';
import { Toolbar } from '../panels/Toolbar';
import { select } from '../state/commands';
import { dispatch, editor, useEditorState } from '../state/store';
import { SceneView } from './SceneView';

/** A pointer that moves less than this between press and release is a click. */
const CLICK_TOLERANCE_PX = 3;

/**
 * The 3D view. It is sized to its own grid column (not the window), shows the
 * scene from the editor store, and turns clicks into selection.
 */
export function Viewport() {
  const { scene } = useEditorState();
  const containerRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const outlineRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<MenuPosition | null>(null);

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

    view.fit(container.clientWidth, container.clientHeight);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[entries.length - 1];
      if (entry) view.fit(entry.contentRect.width, entry.contentRect.height);
    });
    observer.observe(container);

    // A press-and-release without movement selects; a drag turns the camera
    // (zdog's dragRotate) and leaves the selection alone.
    let pressedAt: { x: number; y: number } | null = null;
    const onPointerDown = (event: PointerEvent) => {
      pressedAt = event.button === 0 ? { x: event.clientX, y: event.clientY } : null;
    };
    const onClick = (event: MouseEvent) => {
      if (!pressedAt) return;
      const moved = Math.hypot(event.clientX - pressedAt.x, event.clientY - pressedAt.y);
      pressedAt = null;
      if (moved >= CLICK_TOLERANCE_PX) return;
      dispatch(select(view.pick(event.target)));
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
    svg.addEventListener('pointerdown', onPointerDown);
    svg.addEventListener('click', onClick);
    svg.addEventListener('contextmenu', onContextMenu);

    return () => {
      svg.removeEventListener('pointerdown', onPointerDown);
      svg.removeEventListener('click', onClick);
      svg.removeEventListener('contextmenu', onContextMenu);
      observer.disconnect();
      unsubscribe();
      view.destroy();
    };
  }, []);

  return (
    <div class="viewport" ref={containerRef} style={{ background: scene.settings.background }}>
      <svg class="scene" ref={svgRef} aria-label="Scene" />
      <div class="selection-outline" ref={outlineRef} hidden aria-hidden="true" />
      <Toolbar />
      {menu && <ContextMenu position={menu} onClose={() => setMenu(null)} />}
    </div>
  );
}
