import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';

export interface MenuPosition {
  /** Pixels from the top-left corner of the menu's positioned container. */
  readonly x: number;
  readonly y: number;
}

export interface PopupMenuItem {
  readonly label: string;
  /** Shortcut shown on the right, e.g. "Ctrl+D". */
  readonly shortcut?: string;
  /** Marks the current choice (e.g. a key's easing). */
  readonly checked?: boolean;
  readonly onSelect: () => void;
}

/** Gap kept between the menu and its container's edges, in pixels. */
const EDGE_GAP = 4;

/**
 * A small menu at a point (e.g. where you right-clicked). It stays inside its
 * container, focuses its first item, and closes on Esc, on a click outside, or
 * after an item is chosen.
 */
export function PopupMenu({
  label,
  position,
  items,
  onClose,
}: {
  label: string;
  position: MenuPosition;
  items: readonly PopupMenuItem[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Keep the whole menu inside its container, so it never slides under a panel.
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

  return (
    <div class="context-menu" role="menu" aria-label={label} ref={menuRef}>
      {items.map((item) => (
        <button
          key={item.label}
          type="button"
          role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
          aria-checked={item.checked}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
        >
          {item.checked ? `✓ ${item.label}` : item.label}
          {item.shortcut && <kbd>{item.shortcut}</kbd>}
        </button>
      ))}
    </div>
  );
}
