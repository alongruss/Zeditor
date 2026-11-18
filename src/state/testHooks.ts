/**
 * Ways for the browser tests to make drawing fail on purpose, so they can
 * check that the editor recovers. Only the browser tests' build (vite's
 * "e2e" mode) reads them, from `window.__zeditorTest`; in the real app they
 * are always empty.
 */
export interface TestHooks {
  /** Drawing the viewport fails while the scene has a shape or group with this name. */
  breakDrawOf?: string;
  /** The Inspector fails to render while an object with this name is selected. */
  breakInspectorOf?: string;
}

const NONE: TestHooks = Object.freeze({});

export function testHooks(): TestHooks {
  if (import.meta.env.MODE !== 'e2e' || typeof window === 'undefined') return NONE;
  const hooks = (window as { __zeditorTest?: TestHooks }).__zeditorTest;
  return hooks ?? NONE;
}
