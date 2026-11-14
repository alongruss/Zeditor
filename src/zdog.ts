import * as ZdogModule from 'zdog';

type ZdogApi = typeof ZdogModule;

/**
 * zdog, for use as a value (`new Zdog.Box(...)`). zdog is a CommonJS package:
 * Vite exposes its classes as named exports, but plain Node ESM (used when the
 * browser tests build their expected output with this code) only on
 * `default`. Importing it from here works in both. For types, use
 * `import type * as ZdogTypes from 'zdog'`.
 */
export const Zdog: ZdogApi = (ZdogModule as unknown as { default?: ZdogApi }).default ?? ZdogModule;
