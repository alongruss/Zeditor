import type { ComponentChildren } from 'preact';
import { groupKeyState, keyState } from '../model/animation';
import { objectAtFrame, shapeAtFrame } from '../model/evaluate';
import type { ObjectPatch } from '../model/animation';
import { findObject } from '../model/scene';
import { findGroup, subtreeIds } from '../model/hierarchy';
import { getShapeTypeDef, type FieldDef, type FieldGroup } from '../model/shapeTypes';
import type { CameraData, FaceValue, GroupData, Placeable, PropValue, PropertyPath, SceneObject, ShapeData, Vec3 } from '../model/types';
import { groupSelection, moveToGroup, ungroupSelection } from '../state/groupActions';
import { edit, selectionOf, toggleKey } from '../state/commands';
import { dispatch, setLookThrough, useEditorState, useLookThrough } from '../state/store';
import { testHooks } from '../state/testHooks';
import { pause, useTimeline } from '../state/timeline';
import { CheckboxInput, ColorInput, FaceInput, NumberInput } from './fields';
import { KeyButton, type KeyButtonState } from './KeyButton';

const UNIT_STEP = 0.5;
const ANGLE_STEP = 1;
const ANGLE_SHIFT_STEP = 15;
const SCALE_STEP = 0.1;
const PERCENT_STEP = 1;
const SPAN_STEP = 1;
const MAX_PICTURE_SIZE = 8192;
const AXES = ['x', 'y', 'z'] as const;

/** Edits the selected shape (built from its type's field list), group or camera. */
export function Inspector() {
  const state = useEditorState();
  const { scene, selectedId } = state;
  const object = findObject(scene, selectedId);
  if (!object) return <p class="panel-empty">Select a shape or camera to edit it.</p>;
  if (testHooks().breakInspectorOf === object.name) throw new Error(`Test: the Inspector fails for "${object.name}" on purpose.`);
  const selection = selectionOf(state);
  if (selection.length > 1) return <SelectionSummary ids={selection} />;
  // Keyed by id so half-typed text never carries over to another object.
  if (object.type === 'Camera') return <CameraInspector key={object.id} camera={object} />;
  if (object.type === 'Group') return <GroupInspector key={object.id} group={object} />;
  return <ShapeInspector key={object.id} shape={object} />;
}

/** How many shown by name when several are selected; the rest are counted. */
const NAMES_SHOWN = 6;

/** Several objects selected: what they are, and grouping them so they can be edited as one. */
function SelectionSummary({ ids }: { ids: readonly string[] }) {
  const { scene } = useEditorState();
  const objects = ids.map((id) => findObject(scene, id)).filter((o): o is SceneObject => o !== undefined);
  const groupable = objects.some((o) => o.type !== 'Camera');
  const rest = objects.length - NAMES_SHOWN;
  return (
    <div class="inspector">
      <div class="inspector-heading">
        <span class="inspector-name">{objects.length} selected</span>
      </div>
      <ul class="selection-names" aria-label="Selected">
        {objects.slice(0, NAMES_SHOWN).map((o) => (
          <li key={o.id}>{o.name}</li>
        ))}
        {rest > 0 && <li class="selection-more">and {rest} more</li>}
      </ul>
      <p class="field-note">
        The gizmo moves and turns them together. To scale them as one, or animate them as one, put them in a group.
        Ctrl-click (Cmd-click) one to leave it out.
      </p>
      {groupable && (
        <button type="button" title="Put these in one new group (Ctrl+G)" onClick={groupSelection}>
          Group them
        </button>
      )}
    </div>
  );
}

/**
 * Which group a shape or group is in. Moving it keeps it where it is in the
 * world. A group can't go into itself or anything inside it, so those
 * aren't offered.
 */
function GroupPicker({ object }: { object: Placeable }) {
  const { scene } = useEditorState();
  const blocked = object.type === 'Group' ? subtreeIds(scene, object.id) : new Set<string>();
  const choices = scene.groups.filter((group) => !blocked.has(group.id));
  const current = findGroup(scene, object.parent)?.id ?? '';
  return (
    <label class="field group-picker">
      <span class="field-label">Group</span>
      <select value={current} onChange={(event) => moveToGroup(object.id, event.currentTarget.value || null)}>
        <option value="">None (top level)</option>
        {choices.map((group) => (
          <option key={group.id} value={group.id}>
            {group.name}
          </option>
        ))}
      </select>
    </label>
  );
}

/**
 * A group: where it is, how it's turned and scaled (everything inside moves
 * with it; each can be animated), and whether its insides are drawn together.
 */
function GroupInspector({ group }: { group: GroupData }) {
  const { frame } = useTimeline();
  const posed = objectAtFrame(group, frame);
  const { set, keys } = editorsFor(group, frame);

  return (
    <div class="inspector">
      <div class="inspector-heading">
        <span class="inspector-name">{group.name}</span>
        <span class="inspector-type">Group</span>
      </div>
      <GroupPicker object={group} />

      <VectorGroup
        legend="Position"
        property="translate"
        value={posed.translate}
        step={UNIT_STEP}
        keys={keys}
        onCommit={(translate, g) => set({ translate }, g)}
      />
      <VectorGroup
        legend="Rotation"
        property="rotate"
        value={posed.rotate}
        step={ANGLE_STEP}
        shiftStep={ANGLE_SHIFT_STEP}
        suffix="°"
        keys={keys}
        onCommit={(rotate, g) => set({ rotate }, g)}
      />
      <fieldset class="group">
        <legend>Scale</legend>
        <KeyedRow label="Scale" paths={['scale']} keys={keys}>
          <NumberInput
            label="Scale"
            shortLabel="Uniform"
            value={posed.scale}
            step={SCALE_STEP}
            min={0}
            onCommit={(scale, g) => set({ scale }, g)}
          />
        </KeyedRow>
      </fieldset>
      <fieldset class="group">
        <legend>Drawing</legend>
        <CheckboxInput
          label="Draw together"
          checked={group.drawTogether}
          onCommit={(drawTogether) => set({ drawTogether })}
        />
        <p class="field-note">
          Draws everything inside as one piece, in its own order, instead of sorting each part by depth.
        </p>
      </fieldset>
      <button type="button" onClick={ungroupSelection}>
        Ungroup
      </button>
    </div>
  );
}

type SetPatch = (patch: ObjectPatch, group?: string) => void;

/** What each field needs to show and change its animation. */
interface Keys {
  readonly frame: number;
  /** The button state for one or more properties. */
  state(paths: readonly PropertyPath[]): KeyButtonState;
  toggle(paths: readonly PropertyPath[]): void;
}

/** Field tint: a key on this frame, animated, or not animated. */
function tint(state: KeyButtonState): string {
  if (state === 'key') return 'anim-key';
  if (state === 'none') return '';
  return 'anim-track';
}

/**
 * The Inspector shows the shape as it is on the playhead's frame. Editing an
 * animated value keys it on that frame; editing any other value changes it
 * for the whole animation.
 */
function ShapeInspector({ shape }: { shape: ShapeData }) {
  const { frame } = useTimeline();
  const posed = shapeAtFrame(shape, frame);
  const def = getShapeTypeDef(shape.type);
  const { set, keys } = editorsFor(shape, frame);
  const fieldsIn = (group: FieldGroup) => def.fields.filter((field) => field.group === group);

  return (
    <div class="inspector">
      <div class="inspector-heading">
        <span class="inspector-name">{shape.name}</span>
        <span class="inspector-type">{def.label}</span>
      </div>
      <GroupPicker object={shape} />

      <VectorGroup
        legend="Position"
        property="translate"
        value={posed.translate}
        step={UNIT_STEP}
        keys={keys}
        onCommit={(translate, group) => set({ translate }, group)}
      />
      <VectorGroup
        legend="Rotation"
        property="rotate"
        value={posed.rotate}
        step={ANGLE_STEP}
        shiftStep={ANGLE_SHIFT_STEP}
        suffix="°"
        keys={keys}
        onCommit={(rotate, group) => set({ rotate }, group)}
      />
      <fieldset class="group">
        <legend>Scale</legend>
        <KeyedRow label="Scale" paths={['scale']} keys={keys}>
          <NumberInput
            label="Scale"
            shortLabel="Uniform"
            value={posed.scale}
            step={SCALE_STEP}
            min={0}
            onCommit={(scale, group) => set({ scale }, group)}
          />
        </KeyedRow>
      </fieldset>

      <FieldGroupView legend="Size" fields={fieldsIn('size')} shape={posed} set={set} keys={keys} />
      <FieldGroupView legend="Appearance" fields={fieldsIn('appearance')} shape={posed} set={set} keys={keys}>
        <KeyedRow label="Opacity" paths={['opacity']} keys={keys}>
          <NumberInput
            label="Opacity"
            value={Math.round(posed.opacity * 100)}
            suffix="%"
            step={PERCENT_STEP}
            min={0}
            max={100}
            integer
            onCommit={(percent, group) => set({ opacity: percent / 100 }, group)}
          />
        </KeyedRow>
      </FieldGroupView>
      <FieldGroupView legend="Faces" fields={fieldsIn('faces')} shape={posed} set={set} keys={keys} />
    </div>
  );
}

/** How the Inspector changes an object and its keys on `frame`. */
function editorsFor(object: SceneObject, frame: number): { set: SetPatch; keys: Keys } {
  // Changes sharing a group (one drag, one visit to a field) undo as one step.
  const set: SetPatch = (patch, group) => {
    pause();
    dispatch(edit(object.id, patch, frame), { group });
  };
  const keys: Keys = {
    frame,
    state: (paths) => (paths.length === 1 ? keyState(object, paths[0], frame) : groupKeyState(object, paths, frame)),
    toggle: (paths) => {
      pause();
      dispatch(toggleKey(object.id, paths, frame));
    },
  };
  return { set, keys };
}

/**
 * A camera, as posed on the playhead's frame: where it looks (angle and
 * target) and how much it shows (view span) can be animated; the picture's
 * size cannot.
 */
function CameraInspector({ camera }: { camera: CameraData }) {
  const { frame } = useTimeline();
  const lookingThrough = useLookThrough() === camera.id;
  const posed = objectAtFrame(camera, frame);
  const { set, keys } = editorsFor(camera, frame);

  return (
    <div class="inspector">
      <div class="inspector-heading">
        <span class="inspector-name">{camera.name}</span>
        <span class="inspector-type">Camera</span>
      </div>
      <button
        type="button"
        class="look-through"
        aria-pressed={lookingThrough}
        onClick={() => setLookThrough(lookingThrough ? null : camera.id)}
      >
        {lookingThrough ? 'Back to free view' : 'Look through'}
      </button>

      <VectorGroup
        legend="Angle"
        property="rotate"
        value={posed.rotate}
        step={ANGLE_STEP}
        shiftStep={ANGLE_SHIFT_STEP}
        suffix="°"
        keys={keys}
        onCommit={(rotate, group) => set({ rotate }, group)}
      />
      <VectorGroup
        legend="Target"
        property="target"
        value={posed.target}
        step={UNIT_STEP}
        keys={keys}
        onCommit={(target, group) => set({ target }, group)}
      />
      <fieldset class="group">
        <legend>Lens</legend>
        <KeyedRow label="View span" paths={['viewSpan']} keys={keys}>
          <NumberInput
            label="View span"
            value={posed.viewSpan}
            step={SPAN_STEP}
            min={0.01}
            onCommit={(viewSpan, group) => set({ viewSpan }, group)}
          />
        </KeyedRow>
      </fieldset>
      <fieldset class="group">
        <legend>Picture</legend>
        <div class="tuple">
          <NumberInput
            label="Width"
            shortLabel="W"
            suffix="px"
            value={camera.width}
            step={1}
            min={1}
            max={MAX_PICTURE_SIZE}
            integer
            onCommit={(width, group) => set({ width }, group)}
          />
          <NumberInput
            label="Height"
            shortLabel="H"
            suffix="px"
            value={camera.height}
            step={1}
            min={1}
            max={MAX_PICTURE_SIZE}
            integer
            onCommit={(height, group) => set({ height }, group)}
          />
        </div>
      </fieldset>
    </div>
  );
}

/** A field with its keyframe button in front, tinted when animated. */
function KeyedRow({
  label,
  paths,
  keys,
  children,
}: {
  label: string;
  paths: readonly PropertyPath[];
  keys: Keys;
  children: ComponentChildren;
}) {
  const state = keys.state(paths);
  return (
    <div class={`keyed-row ${tint(state)}`}>
      <KeyButton label={label} state={state} frame={keys.frame} onToggle={() => keys.toggle(paths)} />
      {children}
    </div>
  );
}

interface VectorGroupProps {
  readonly legend: string;
  readonly property: 'translate' | 'rotate' | 'target';
  readonly value: Vec3;
  readonly step: number;
  readonly shiftStep?: number;
  readonly suffix?: string;
  readonly keys: Keys;
  readonly onCommit: (patch: Partial<Vec3>, group: string) => void;
}

/** Position or Rotation: one keyframe button keys x, y and z together. */
function VectorGroup({ legend, property, value, step, shiftStep, suffix, keys, onCommit }: VectorGroupProps) {
  const paths = AXES.map((axis) => `${property}.${axis}`);
  return (
    <fieldset class="group">
      <legend class="keyed-legend">
        <KeyButton label={legend} state={keys.state(paths)} frame={keys.frame} onToggle={() => keys.toggle(paths)} />
        {legend}
      </legend>
      <div class="tuple">
        {AXES.map((axis) => (
          <NumberInput
            key={axis}
            label={`${legend} ${axis.toUpperCase()}`}
            shortLabel={axis.toUpperCase()}
            className={tint(keys.state([`${property}.${axis}`]))}
            value={value[axis]}
            step={step}
            shiftStep={shiftStep}
            suffix={suffix}
            onCommit={(n, group) => onCommit({ [axis]: n }, group)}
          />
        ))}
      </div>
    </fieldset>
  );
}

interface FieldGroupViewProps {
  readonly legend: string;
  readonly fields: readonly FieldDef[];
  /** The shape as posed on the current frame. */
  readonly shape: ShapeData;
  readonly set: SetPatch;
  readonly keys: Keys;
  /** Fields every shape has, shown before the type's own fields. */
  readonly children?: ComponentChildren;
}

function FieldGroupView({ legend, fields, shape, set, keys, children }: FieldGroupViewProps) {
  if (fields.length === 0 && !children) return null;
  return (
    <fieldset class="group">
      <legend>{legend}</legend>
      {children}
      {fields.map((field) => (
        <KeyedRow
          key={field.key}
          label={field.kind === 'face' ? `${field.label} face` : field.label}
          paths={[`props.${field.key}`]}
          keys={keys}
        >
          <FieldControl field={field} shape={shape} set={set} />
        </KeyedRow>
      ))}
    </fieldset>
  );
}

function FieldControl({ field, shape, set }: { field: FieldDef; shape: ShapeData; set: SetPatch }) {
  const defaults = getShapeTypeDef(shape.type).defaults;
  const raw: PropValue | undefined = shape.props[field.key] ?? defaults[field.key];
  const commit = (value: PropValue, group?: string) => set({ props: { [field.key]: value } }, group);

  switch (field.kind) {
    case 'number':
      return (
        <NumberInput
          label={field.label}
          value={typeof raw === 'number' ? raw : 0}
          step={field.step}
          min={field.min}
          max={field.max}
          integer={field.integer}
          onCommit={commit}
        />
      );
    case 'color':
      return (
        <ColorInput label={field.label} value={typeof raw === 'string' ? raw : '#000000'} onCommit={commit} />
      );
    case 'boolean':
      return <CheckboxInput label={field.label} checked={raw === true} onCommit={commit} />;
    case 'face': {
      const mainColor = typeof shape.props.color === 'string' ? shape.props.color : '#000000';
      const value: FaceValue = typeof raw === 'string' || typeof raw === 'boolean' ? raw : true;
      return <FaceInput label={field.label} value={value} mainColor={mainColor} onCommit={commit} />;
    }
  }
}
