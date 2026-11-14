import { useEffect, useRef, useState } from 'preact/hooks';

export interface DropdownItem {
  readonly label: string;
  /** Shortcut shown next to the label, e.g. "Ctrl+S". */
  readonly shortcut?: string;
  readonly onSelect: () => void;
}

interface DropdownProps {
  /** Text on the button, e.g. "File". */
  readonly label: string;
  /** Accessible name of the open menu, e.g. "File". */
  readonly menuLabel: string;
  readonly items: readonly DropdownItem[];
}

/** A toolbar button that opens a menu. Escape or a click elsewhere closes it. */
export function Dropdown({ label, menuLabel, items }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div class="toolbar-dropdown" ref={rootRef}>
      <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((was) => !was)}>
        {label} ▾
      </button>
      {open && (
        <div class="dropdown-menu" role="menu" aria-label={menuLabel}>
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
            >
              {item.label}
              {item.shortcut && <kbd>{item.shortcut}</kbd>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
