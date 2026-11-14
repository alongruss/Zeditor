import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';
import { deleteShape, duplicate } from '../state/commands';
import { dispatch, editor } from '../state/store';

export interface MenuPosition {
  /** Pixels from the viewport's top-left corner. */
  readonly x: number;
  readonly y: number;
}

/** Gap kept between the menu and the viewport's edges, in pixels. */
const EDGE_GAP = 4;

/** Right-click menu for the selected shape. */
export function ContextMenu({ position, onClose }: { position: MenuPosition; onClose: () => void }) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Keep the whole menu inside the viewport, so it never slides under a side panel.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const area = menu?.offsetParent;
    if (!menu || !(area instanceof HTMLElement)) return;
    const maxX = area.clientWidth - menu.offsetWidth - EDGE_GAP;
    const maxY = area.clientHeight - menu.offsetHeight - EDGE_GAP;
    menu.style.left = `${Math.max(EDGE_GAP, Math.min(position.x, maxX))}px`;
    menu.style.top = `${Math.max(EDGE_GAP, Math.min(position.y, maxY))}px`;
  }, [position.x, position.y]);

  useEffect(() => {
    menuRef.current?.querySelector('button')?.focus();
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, [onClose]);

  const run = (command: (id: string) => Parameters<typeof dispatch>[0]) => {
    const { selectedId } = editor.get();
    if (selectedId !== null) dispatch(command(selectedId));
    onClose();
  };

  return (
    <div class="context-menu" role="menu" aria-label="Shape actions" ref={menuRef}>
      <button type="button" role="menuitem" onClick={() => run(duplicate)}>
        Duplicate <kbd>Ctrl+D</kbd>
      </button>
      <button type="button" role="menuitem" onClick={() => run(deleteShape)}>
        Delete <kbd>Del</kbd>
      </button>
    </div>
  );
}
