import { createStore, useStore, type Store } from './store';

export interface Size {
  readonly width: number;
  readonly height: number;
}

/**
 * The viewport's size in pixels (null before it is laid out). Set by the
 * Viewport; new cameras and the Lottie export start at this size, because it
 * is the part of the scene you can see.
 */
export const viewportSize: Store<Size | null> = createStore<Size | null>(null);

export function setViewportSize(size: Size): void {
  viewportSize.dispatch((current) =>
    current?.width === size.width && current.height === size.height ? current : size,
  );
}

export function useViewportSize(): Size | null {
  return useStore(viewportSize);
}
