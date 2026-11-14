import { closeUndoGroup, createStore, editor, useEditorState, useStore, type Store } from './store';

/**
 * The playhead and playback. Not part of the scene or the undo history:
 * moving the playhead or playing is never an undo step, and isn't saved.
 */
export interface TimelineState {
  /** The frame being shown and edited (0 to duration - 1). */
  readonly frame: number;
  readonly playing: boolean;
}

export const timeline: Store<TimelineState> = createStore<TimelineState>({ frame: 0, playing: false });

/** The last frame of the scene's animation. */
export function lastFrame(): number {
  return Math.max(0, editor.get().scene.settings.duration - 1);
}

/** The playhead's frame, never past the end (the length can shrink after it was set). */
export function currentFrame(): number {
  return Math.min(timeline.get().frame, lastFrame());
}

/**
 * Moves the playhead (and stops playback). Edits on either side of a frame
 * change are separate undo steps, even mid-way through typing in a field.
 */
export function setFrame(frame: number): void {
  const next = Math.min(lastFrame(), Math.max(0, Math.round(frame)));
  const current = timeline.get();
  if (next === current.frame && !current.playing) return;
  closeUndoGroup();
  timeline.dispatch(() => ({ frame: next, playing: false }));
}

export function play(): void {
  timeline.dispatch((state) => (state.playing ? state : { ...state, frame: currentFrame(), playing: true }));
}

export function pause(): void {
  timeline.dispatch((state) => (state.playing ? { ...state, playing: false } : state));
}

export function togglePlayback(): void {
  if (timeline.get().playing) pause();
  else play();
}

/** The timeline state, with the frame kept within the scene's length; re-renders on change. */
export function useTimeline(): TimelineState {
  const state = useStore(timeline);
  const { duration } = useEditorState().scene.settings; // re-render when the length changes
  const frame = Math.min(state.frame, Math.max(0, duration - 1));
  return frame === state.frame ? state : { ...state, frame };
}

/**
 * Plays the animation while `playing` is on, looping, at the scene's frame
 * rate. Frames come from the clock, so a slow machine drops frames rather
 * than playing slowly. Returns a function that stops it.
 */
export function startPlaybackLoop(): () => void {
  let raf = 0;
  let startTime = 0;
  let startFrame = 0;
  const tick = (now: number) => {
    const { fps, duration } = editor.get().scene.settings;
    const frame = (startFrame + Math.floor(((now - startTime) * fps) / 1000)) % Math.max(1, duration);
    timeline.dispatch((state) => (state.frame === frame || !state.playing ? state : { ...state, frame }));
    raf = requestAnimationFrame(tick);
  };
  let wasPlaying = false;
  const unsubscribe = timeline.subscribe((state) => {
    if (state.playing === wasPlaying) return;
    wasPlaying = state.playing;
    cancelAnimationFrame(raf);
    if (state.playing) {
      startTime = performance.now();
      startFrame = state.frame;
      raf = requestAnimationFrame(tick);
    }
  });
  return () => {
    unsubscribe();
    cancelAnimationFrame(raf);
  };
}
