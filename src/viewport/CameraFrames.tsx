import type { CameraData, Vec3 } from '../model/types';
import { unturn } from '../render/view';
import { project, type ScreenPoint, type ViewTransform } from './gizmoMath';

const DEG_TO_RAD = Math.PI / 180;

/**
 * The four corners of a camera's picture in the world (top-left, top-right,
 * bottom-right, bottom-left), on the plane through its target that faces it.
 */
export function cameraCorners(camera: CameraData): [Vec3, Vec3, Vec3, Vec3] {
  const wide = camera.width >= camera.height;
  const halfW = ((wide ? camera.viewSpan * (camera.width / camera.height) : camera.viewSpan) / 2) || 0;
  const halfH = ((wide ? camera.viewSpan : camera.viewSpan * (camera.height / camera.width)) / 2) || 0;
  const rotate = { x: camera.rotate.x * DEG_TO_RAD, y: camera.rotate.y * DEG_TO_RAD, z: camera.rotate.z * DEG_TO_RAD };
  const toWorld = (x: number, y: number): Vec3 => {
    const v = unturn({ x, y, z: 0 }, rotate);
    return { x: v.x + camera.target.x, y: v.y + camera.target.y, z: v.z + camera.target.z };
  };
  return [toWorld(-halfW, -halfH), toWorld(halfW, -halfH), toWorld(halfW, halfH), toWorld(-halfW, halfH)];
}

const toPoints = (points: readonly ScreenPoint[]) => points.map((p) => `${p.x},${p.y}`).join(' ');

interface CameraFramesProps {
  /** The cameras, as posed on the current frame. */
  readonly cameras: readonly CameraData[];
  readonly view: ViewTransform;
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
}

/**
 * In the free view, each camera's picture is drawn as a dashed frame where it
 * sits in the world, with a notch on the side that is up in its picture.
 * Clicking a frame selects its camera.
 */
export function CameraFrames({ cameras, view, selectedId, onSelect }: CameraFramesProps) {
  if (cameras.length === 0) return null;
  return (
    <svg class="camera-frames" width={view.width} height={view.height} aria-hidden="true">
      {cameras.map((camera) => {
        const corners = cameraCorners(camera).map((corner) => project(corner, view));
        const [topLeft, topRight] = corners;
        const mid = { x: (topLeft.x + topRight.x) / 2, y: (topLeft.y + topRight.y) / 2 };
        // The notch points away from the picture's middle, on its top side.
        const middle = {
          x: corners.reduce((sum, p) => sum + p.x, 0) / 4,
          y: corners.reduce((sum, p) => sum + p.y, 0) / 4,
        };
        const away = { x: mid.x - middle.x, y: mid.y - middle.y };
        const length = Math.hypot(away.x, away.y) || 1;
        const tip = { x: mid.x + (away.x / length) * 10, y: mid.y + (away.y / length) * 10 };
        const along = { x: (topRight.x - topLeft.x) / (Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y) || 1), y: (topRight.y - topLeft.y) / (Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y) || 1) };
        const notch = [
          { x: mid.x - along.x * 7, y: mid.y - along.y * 7 },
          tip,
          { x: mid.x + along.x * 7, y: mid.y + along.y * 7 },
        ];
        const points = toPoints([...corners, corners[0]]);
        return (
          <g
            key={camera.id}
            class={camera.id === selectedId ? 'camera-frame is-selected' : 'camera-frame'}
            data-camera-id={camera.id}
            onPointerDown={(event) => {
              if (event.button !== 0) return;
              event.stopPropagation();
              onSelect(camera.id);
            }}
          >
            <polyline class="camera-frame-hit" points={points} />
            <polyline class="camera-frame-line" points={points} />
            <polygon class="camera-frame-notch" points={toPoints(notch)} />
            <text class="camera-frame-label" x={topLeft.x + 4} y={topLeft.y - 6}>
              {camera.name}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
