import { keyExists, keyRefId, type KeyRef } from '../model/keyEdits';
import { closeUndoGroup, createStore, editor, useEditorState, useStore, type Store } from './store';

/**
 * The playhead and playback. Not part of the scene or the undo history:
 * moving the playhead or playing is never an undo step, and isn't saved.
 */
export interface TimelineState {
  /** The frame being shown and edited (0 to duration - 1). */
  readonly frame: number;
  readonly playing: boolean;
  /** Keyframes selected in the timeline panel. */
  readonly selectedKeys: readonly KeyRef[];
  /** Whether the timeline panel under the viewport is open. */
  readonly panelOpen: boolean;
  /** Whether the viewport shows ghosts of the poses on the keys before and after the playhead. */
  readonly ghosts: boolean;
  /** Whether the timeline shows the selected object's curves (a graph) instead of its keys in rows. */
  readonly curves: boolean;
}

export const timeline: Store<TimelineState> = createStore<TimelineState>({
  frame: 0,
  playing: false,
  selectedKeys: [],
  panelOpen: true,
  ghosts: false,
  curves: false,
});

/** Replaces the key selection (duplicates are dropped). */
export function selectKeys(refs: readonly KeyRef[]): void {
  const unique = [...new Map(refs.map((ref) => [keyRefId(ref), ref])).values()];
  timeline.dispatch((state) =>
    state.selectedKeys.length === 0 && unique.length === 0 ? state : { ...state, selectedKeys: unique },
  );
}

export function clearKeySelection(): void {
  selectKeys([]);
}

export function setPanelOpen(open: boolean): void {
  timeline.dispatch((state) => (state.panelOpen === open ? state : { ...state, panelOpen: open }));
}

export function setGhosts(ghosts: boolean): void {
  timeline.dispatch((state) => (state.ghosts === ghosts ? state : { ...state, ghosts }));
}

/** Shows the curves (opening the timeline if it was closed), or the keys in rows. */
export function setCurves(curves: boolean): void {
  timeline.dispatch((state) =>
    state.curves === curves && (!curves || state.panelOpen) ? state : { ...state, curves, panelOpen: curves || state.panelOpen },
  );
}

/** The last frame of the scene's animation. */
export function lastFrame(): number {
  return Math.max(0, editor.get().scene.settings.duration - 1);
}

/** The playhead's frame, never past the end (the length can shrink after it was set). */
export function currentFrame(): number {
  return Math.min(timeline.get().frame, lastFrame());
}

/**
 * While playing, the moment on screen, in frames with a fraction (45.6 is
 * six tenths of the way from frame 45 to 46), so motion moves on every screen
 * refresh, not only 30 times a second. Null when stopped. Not part of the
 * timeline state, so only the viewport redraws for it; the playhead, the
 * Frame box and every edit stay on whole frames.
 */
export const playTime: Store<number | null> = createStore<number | null>(null);

/** The moment the viewport shows: the moment playing, or else the playhead's frame. */
export function shownFrame(): number {
  const time = playTime.get();
  return timeline.get().playing && time !== null ? time : currentFrame();
}

/** shownFrame(), re-rendering on every new moment while playing. */
export function useShownFrame(): number {
  useStore(playTime);
  useStore(timeline);
  return shownFrame();
}

/**
 * Where playback is after `elapsed` milliseconds, starting from `startFrame`:
 * in frames, with a fraction, looping over `duration` frames.
 */
export function playbackTime(elapsed: number, startFrame: number, fps: number, duration: number): number {
  const length = Math.max(1, duration);
  return (((startFrame + (elapsed * fps) / 1000) % length) + length) % length;
}

/**
 * Moves the playhead (and stops playback). Edits on either side of a frame
 * change are separate undo steps, even mid-way through typing in a field.
 */
export function setFrame(frame: number): void {
  // A pointer over a ruler with no width (say) gives no frame at all.
  if (!Number.isFinite(frame)) return;
  const next = Math.min(lastFrame(), Math.max(0, Math.round(frame)));
  const current = timeline.get();
  if (next === current.frame && !current.playing) return;
  closeUndoGroup();
  timeline.dispatch((state) => ({ ...state, frame: next, playing: false }));
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
 * Starts the timeline's background work: playback (see below), and dropping
 * selected keys that no longer exist (after Undo, a delete, ...). Returns a
 * function that stops it.
 *
 * Playback runs while `playing` is on, looping, at the scene's frame rate.
 * Frames come from the clock, so a slow machine drops frames rather than
 * playing slowly.
 */
export function startTimeline(): () => void {
  const unsubscribeEditor = editor.subscribe(({ scene }) => {
    const { selectedKeys } = timeline.get();
    const existing = selectedKeys.filter((ref) => keyExists(scene, ref));
    if (existing.length !== selectedKeys.length) selectKeys(existing);
  });
  let raf = 0;
  let startTime = 0;
  let startFrame = 0;
  const tick = (now: number) => {
    const { fps, duration } = editor.get().scene.settings;
    const time = playbackTime(now - startTime, startFrame, fps, duration);
    const frame = Math.floor(time);
    // The playhead moves on whole frames; the viewport shows the moment in between.
    playTime.dispatch(() => time);
    timeline.dispatch((state) => (state.frame === frame || !state.playing ? state : { ...state, frame }));
    raf = requestAnimationFrame(tick);
  };
  let wasPlaying = false;
  const unsubscribe = timeline.subscribe((state) => {
    if (state.playing === wasPlaying) return;
    wasPlaying = state.playing;
    cancelAnimationFrame(raf);
    // Stopped: back on the playhead's whole frame.
    if (!state.playing) playTime.dispatch(() => null);
    if (state.playing) {
      startTime = performance.now();
      startFrame = state.frame;
      raf = requestAnimationFrame(tick);
    }
  });
  return () => {
    unsubscribe();
    unsubscribeEditor();
    cancelAnimationFrame(raf);
  };
}
