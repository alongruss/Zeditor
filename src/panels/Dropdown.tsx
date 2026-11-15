import type { ComponentChildren } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';

export interface DropdownItem {
  readonly label: string;
  /** Shortcut shown next to the label, e.g. "Ctrl+S". */
  readonly shortcut?: string;
  readonly onSelect: () => void;
  /** In a grid menu: the item's picture (hidden from screen readers) and its tile color. */
  readonly art?: ComponentChildren;
  readonly tileColor?: string;
  /** In a grid menu: items with the same group share a captioned section. */
  readonly group?: string;
  /** A choice among several (e.g. the theme): shown with a check when it's the current one. */
  readonly checked?: boolean;
}

interface DropdownProps {
  /** Text on the button, e.g. "File". */
  readonly label: string;
  /** Accessible name of the open menu, e.g. "File". */
  readonly menuLabel: string;
  readonly items: readonly DropdownItem[];
  /** The main action's look (filled violet). */
  readonly primary?: boolean;
  /** An extra class on the wrapper, for layout. */
  readonly className?: string;
  /** A picture before the label; hidden from screen readers, so the name stays "{label} ▾". */
  readonly icon?: ComponentChildren;
  /** Show the items as a grid of picture tiles, this many across. */
  readonly columns?: number;
}

/** Gap between a grid menu and its button, and the window's edges. */
const MENU_GAP = 4;

/**
 * A button that opens a menu. Escape or a click elsewhere closes it, and
 * focus goes back to the button. The arrow keys, Home and End move between
 * items (in a grid, up and down move a row), and they never reach the
 * editor's own shortcuts (frame stepping, play).
 */
export function Dropdown({ label, menuLabel, items, primary, className, icon, columns }: DropdownProps) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const grid = columns !== undefined;

  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) buttonRef.current?.focus();
  };

  // Layout effects run before the browser paints, so no key press can land
  // between opening the menu and these being in place.
  useLayoutEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close(rootRef.current?.contains(document.activeElement) ?? false);
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // A grid menu is wider than the panel it opens from, so it is placed in
  // the window (fixed) under its button, where no panel can clip it.
  useLayoutEffect(() => {
    const menu = menuRef.current;
    const button = buttonRef.current;
    if (!open || !grid || !menu || !button) return;
    const bounds = button.getBoundingClientRect();
    const left = Math.min(bounds.left, window.innerWidth - menu.offsetWidth - MENU_GAP);
    menu.style.left = `${Math.max(MENU_GAP, left)}px`;
    menu.style.top = `${bounds.bottom + MENU_GAP}px`;
  }, [open, grid]);

  // The first item takes focus, so the arrow keys work straight away.
  useLayoutEffect(() => {
    if (open) menuRef.current?.querySelector<HTMLElement>('[role^="menuitem"]')?.focus();
  }, [open]);

  const onMenuKeyDown = (event: KeyboardEvent) => {
    const all = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const index = all.indexOf(document.activeElement as HTMLElement);
    const across = columns ?? 1;
    const moves: Record<string, number | undefined> = {
      ArrowDown: index + across,
      ArrowUp: index - across,
      ArrowRight: grid ? index + 1 : undefined,
      ArrowLeft: grid ? index - 1 : undefined,
      Home: 0,
      End: all.length - 1,
    };
    if (!(event.key in moves)) return;
    // Handled here: keep it from the window's shortcuts (they check defaultPrevented).
    event.preventDefault();
    const next = moves[event.key];
    if (next === undefined || all.length === 0) return;
    all[Math.max(0, Math.min(all.length - 1, next))]?.focus();
  };

  const choose = (item: DropdownItem) => {
    close(false);
    item.onSelect();
  };

  const groups: { name: string | undefined; items: DropdownItem[] }[] = [];
  for (const item of items) {
    const last = groups[groups.length - 1];
    if (last && last.name === item.group) last.items.push(item);
    else groups.push({ name: item.group, items: [item] });
  }

  return (
    <div
      class={className ? `toolbar-dropdown ${className}` : 'toolbar-dropdown'}
      ref={rootRef}
      onKeyDown={(event) => {
        // Escape from the button or the menu closes at once, even before the
        // window listener (attached after the menu first paints) exists.
        if (event.key === 'Escape' && open) close(true);
      }}
    >
      <button
        ref={buttonRef}
        type="button"
        class={primary ? 'primary' : undefined}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((was) => !was)}
      >
        {icon && (
          <span class="button-icon" aria-hidden="true">
            {icon}
          </span>
        )}
        {label} ▾
      </button>
      {open && (
        <div
          ref={menuRef}
          class={grid ? 'dropdown-menu is-grid' : 'dropdown-menu'}
          role="menu"
          aria-label={menuLabel}
          onKeyDown={onMenuKeyDown}
        >
          {grid
            ? groups.map((group) => (
                <div key={group.name ?? ''} class="tile-group" role="none">
                  {group.name && (
                    <div class="tile-caption" aria-hidden="true">
                      {group.name}
                    </div>
                  )}
                  <div class="tiles" role="none" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                    {group.items.map((item) => (
                      <button key={item.label} type="button" role="menuitem" class="tile" onClick={() => choose(item)}>
                        <span class="tile-art" aria-hidden="true" style={{ background: item.tileColor }}>
                          {item.art}
                        </span>
                        <span class="tile-name">{item.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))
            : items.map((item) => (
                <button
                  key={item.label}
                  type="button"
                  role={item.checked === undefined ? 'menuitem' : 'menuitemradio'}
                  aria-checked={item.checked}
                  onClick={() => choose(item)}
                >
                  {item.label}
                  {item.shortcut && <kbd>{item.shortcut}</kbd>}
                  {item.checked && (
                    <span class="menu-check" aria-hidden="true">
                      ✓
                    </span>
                  )}
                </button>
              ))}
        </div>
      )}
    </div>
  );
}
