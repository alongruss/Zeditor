import type { ComponentChildren } from 'preact';
import { groupKeyState, keyState } from '../model/animation';
import { shapeAtFrame } from '../model/evaluate';
import { findShape, type ShapePatch } from '../model/scene';
import { getShapeTypeDef, type FieldDef, type FieldGroup } from '../model/shapeTypes';
import type { FaceValue, PropValue, PropertyPath, ShapeData, Vec3 } from '../model/types';
import { edit, toggleKey } from '../state/commands';
import { dispatch, useEditorState } from '../state/store';
import { pause, useTimeline } from '../state/timeline';
import { CheckboxInput, ColorInput, FaceInput, NumberInput } from './fields';
import { KeyButton, type KeyButtonState } from './KeyButton';

const UNIT_STEP = 0.5;
const ANGLE_STEP = 1;
const ANGLE_SHIFT_STEP = 15;
const SCALE_STEP = 0.1;
const PERCENT_STEP = 1;
const AXES = ['x', 'y', 'z'] as const;

/** Edits the selected shape. Built from the shape type's field list. */
export function Inspector() {
  const { scene, selectedId } = useEditorState();
  const shape = findShape(scene, selectedId);
  if (!shape) return <p class="panel-empty">Select a shape to edit it.</p>;
  // Keyed by id so half-typed text never carries over to another shape.
  return <ShapeInspector key={shape.id} shape={shape} />;
}

type SetPatch = (patch: ShapePatch, group?: string) => void;

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
  // Changes sharing a group (one drag, one visit to a field) undo as one step.
  const set: SetPatch = (patch, group) => {
    pause();
    dispatch(edit(shape.id, patch, frame), { group });
  };
  const keys: Keys = {
    frame,
    state: (paths) => (paths.length === 1 ? keyState(shape, paths[0], frame) : groupKeyState(shape, paths, frame)),
    toggle: (paths) => {
      pause();
      dispatch(toggleKey(shape.id, paths, frame));
    },
  };
  const fieldsIn = (group: FieldGroup) => def.fields.filter((field) => field.group === group);

  return (
    <div class="inspector">
      <div class="inspector-heading">
        <span class="inspector-name">{shape.name}</span>
        <span class="inspector-type">{def.label}</span>
      </div>

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
  readonly property: 'translate' | 'rotate';
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
