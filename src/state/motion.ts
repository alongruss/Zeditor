/**
 * True when the person has asked their system for less motion. CSS motion
 * is switched off in styles.css; animations run from script (the export
 * card's looping preview) check this and show a still frame instead.
 */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
    : false;
}
