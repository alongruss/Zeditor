import { useRef } from 'preact/hooks';
import { findShape } from '../model/scene';
import { setTiming } from '../state/commands';
import { dispatch, useEditorState } from '../state/store';
import { pause, setFrame, togglePlayback, useTimeline } from '../state/timeline';
import { NumberInput } from './fields';

const MAX_FPS = 120;
const MAX_LENGTH = 100000;
/** Ruler ticks are at least this far apart, in pixels. */
const MIN_TICK_GAP = 8;
/** Ruler labels are at least this far apart, in pixels. */
const MIN_LABEL_GAP = 44;
const NICE_STEPS = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 1200, 3000, 6000, 12000, 30000];

/** The smallest "nice" frame step that keeps marks at least `gap` pixels apart. */
function niceStep(pixelsPerFrame: number, gap: number): number {
  return NICE_STEPS.find((step) => step * pixelsPerFrame >= gap) ?? NICE_STEPS[NICE_STEPS.length - 1];
}

/**
 * Below the viewport: play and pause, the current frame, a ruler to move the
 * playhead (it shows the selected shape's keyframes), and the frame rate and
 * length. Changing fps or length is undoable; moving the playhead isn't.
 */
export function TransportBar() {
  const { scene, selectedId } = useEditorState();
  const { frame, playing } = useTimeline();
  const { fps, duration } = scene.settings;
  const last = Math.max(0, duration - 1);
  const rulerRef = useRef<HTMLDivElement>(null);
  const width = rulerRef.current?.clientWidth ?? 0;

  const frameAt = (clientX: number): number => {
    const ruler = rulerRef.current;
    if (!ruler || last === 0) return 0;
    const bounds = ruler.getBoundingClientRect();
    return Math.round(((clientX - bounds.left) / bounds.width) * last);
  };
  const percent = (f: number) => (last === 0 ? 0 : (f / last) * 100);

  const selected = findShape(scene, selectedId);
  const keyFrames = [...new Set(Object.values(selected?.tracks ?? {}).flatMap((track) => track.map((k) => k.frame)))];

  const pixelsPerFrame = last === 0 ? width : width / last;
  const tickStep = niceStep(pixelsPerFrame, MIN_TICK_GAP);
  const labelStep = niceStep(pixelsPerFrame, MIN_LABEL_GAP);
  const ticks: number[] = [];
  if (width > 0) for (let f = 0; f <= last; f += tickStep) ticks.push(f);

  return (
    <div class="transport" role="group" aria-label="Animation">
      <button
        type="button"
        class="transport-play"
        aria-label={playing ? 'Pause' : 'Play'}
        title={playing ? 'Pause' : 'Play'}
        onClick={togglePlayback}
      >
        {playing ? '❚❚' : '▶'}
      </button>

      <NumberInput
        label="Frame"
        className="transport-frame"
        value={frame}
        step={1}
        shiftStep={10}
        min={0}
        max={last}
        integer
        onCommit={(value) => setFrame(value)}
      />

      <div
        ref={rulerRef}
        class="ruler"
        role="slider"
        aria-label="Playhead"
        aria-valuemin={0}
        aria-valuemax={last}
        aria-valuenow={frame}
        aria-valuetext={`Frame ${frame} of ${last}`}
        tabIndex={0}
        onPointerDown={(event) => {
          if (event.button !== 0) return;
          event.currentTarget.setPointerCapture(event.pointerId);
          setFrame(frameAt(event.clientX));
        }}
        onPointerMove={(event) => {
          if (event.currentTarget.hasPointerCapture(event.pointerId)) setFrame(frameAt(event.clientX));
        }}
        onKeyDown={(event) => {
          const step = event.shiftKey ? 10 : 1;
          const moves: Record<string, number> = {
            ArrowLeft: frame - step,
            ArrowRight: frame + step,
            Home: 0,
            End: last,
          };
          if (event.key in moves) {
            event.preventDefault();
            setFrame(moves[event.key]);
          }
        }}
      >
        {ticks.map((f) => (
          <span
            key={f}
            class={f % labelStep === 0 ? 'ruler-tick major' : 'ruler-tick'}
            style={{ left: `${percent(f)}%` }}
          >
            {f % labelStep === 0 && <span class="ruler-label">{f}</span>}
          </span>
        ))}
        {keyFrames.map((f) => (
          <span key={`key-${f}`} class="ruler-key" style={{ left: `${percent(f)}%` }} aria-hidden="true" />
        ))}
        <span class="ruler-playhead" style={{ left: `${percent(frame)}%` }} aria-hidden="true" />
      </div>

      <span class="transport-time" aria-label="Time">
        {(frame / fps).toFixed(2)} s
      </span>
      <NumberInput
        label="Frames per second"
        shortLabel="fps"
        className="transport-setting"
        value={fps}
        step={1}
        shiftStep={10}
        min={1}
        max={MAX_FPS}
        integer
        onCommit={(value, group) => {
          pause();
          dispatch(setTiming({ fps: value }), { group });
        }}
      />
      <NumberInput
        label="Length in frames"
        shortLabel="Length"
        className="transport-setting"
        value={duration}
        step={1}
        shiftStep={10}
        min={1}
        max={MAX_LENGTH}
        integer
        onCommit={(value, group) => {
          pause();
          dispatch(setTiming({ duration: value }), { group });
        }}
      />
    </div>
  );
}
