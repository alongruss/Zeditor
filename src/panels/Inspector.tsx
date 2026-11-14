import type { ComponentChildren } from 'preact';
import { findShape, type ShapePatch } from '../model/scene';
import { getShapeTypeDef, type FieldDef, type FieldGroup } from '../model/shapeTypes';
import type { FaceValue, PropValue, ShapeData, Vec3 } from '../model/types';
import { update } from '../state/commands';
import { dispatch, useEditorState } from '../state/store';
import { CheckboxInput, ColorInput, FaceInput, NumberInput } from './fields';

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

function ShapeInspector({ shape }: { shape: ShapeData }) {
  const def = getShapeTypeDef(shape.type);
  // Changes sharing a group (one drag, one visit to a field) undo as one step.
  const set: SetPatch = (patch, group) => dispatch(update(shape.id, patch), { group });
  const fieldsIn = (group: FieldGroup) => def.fields.filter((field) => field.group === group);

  return (
    <div class="inspector">
      <div class="inspector-heading">
        <span class="inspector-name">{shape.name}</span>
        <span class="inspector-type">{def.label}</span>
      </div>

      <VectorGroup
        legend="Position"
        value={shape.translate}
        step={UNIT_STEP}
        onCommit={(translate, group) => set({ translate }, group)}
      />
      <VectorGroup
        legend="Rotation"
        value={shape.rotate}
        step={ANGLE_STEP}
        shiftStep={ANGLE_SHIFT_STEP}
        suffix="°"
        onCommit={(rotate, group) => set({ rotate }, group)}
      />
      <fieldset class="group">
        <legend>Scale</legend>
        <NumberInput
          label="Scale"
          shortLabel="Uniform"
          value={shape.scale}
          step={SCALE_STEP}
          min={0}
          onCommit={(scale, group) => set({ scale }, group)}
        />
      </fieldset>

      <FieldGroupView legend="Size" fields={fieldsIn('size')} shape={shape} set={set} />
      <FieldGroupView legend="Appearance" fields={fieldsIn('appearance')} shape={shape} set={set}>
        <NumberInput
          label="Opacity"
          value={Math.round(shape.opacity * 100)}
          suffix="%"
          step={PERCENT_STEP}
          min={0}
          max={100}
          integer
          onCommit={(percent, group) => set({ opacity: percent / 100 }, group)}
        />
      </FieldGroupView>
      <FieldGroupView legend="Faces" fields={fieldsIn('faces')} shape={shape} set={set} />
    </div>
  );
}

type SetPatch = (patch: ShapePatch, group?: string) => void;

interface VectorGroupProps {
  readonly legend: string;
  readonly value: Vec3;
  readonly step: number;
  readonly shiftStep?: number;
  readonly suffix?: string;
  readonly onCommit: (patch: Partial<Vec3>, group: string) => void;
}

function VectorGroup({ legend, value, step, shiftStep, suffix, onCommit }: VectorGroupProps) {
  return (
    <fieldset class="group">
      <legend>{legend}</legend>
      <div class="tuple">
        {AXES.map((axis) => (
          <NumberInput
            key={axis}
            label={`${legend} ${axis.toUpperCase()}`}
            shortLabel={axis.toUpperCase()}
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
  readonly shape: ShapeData;
  readonly set: SetPatch;
  /** Fields every shape has, shown before the type's own fields. */
  readonly children?: ComponentChildren;
}

function FieldGroupView({ legend, fields, shape, set, children }: FieldGroupViewProps) {
  if (fields.length === 0 && !children) return null;
  return (
    <fieldset class="group">
      <legend>{legend}</legend>
      {children}
      {fields.map((field) => (
        <FieldControl key={field.key} field={field} shape={shape} set={set} />
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
