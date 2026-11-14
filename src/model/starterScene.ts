import { DEFAULT_BACKGROUND } from './scene';
import { SCENE_VERSION, type Scene, type ShapeData, type ShapeType } from './types';

const noRotation = { x: 0, y: 0, z: 0 };

function shape(
  id: string,
  name: string,
  type: ShapeType,
  translate: { x: number; y: number; z: number },
  props: ShapeData['props'],
  scale = 1,
): ShapeData {
  return { id, name, type, translate, rotate: noRotation, scale, opacity: 1, props };
}

/** The nine-shape scene the 2020 editor opened with. */
export function starterScene(): Scene {
  return {
    version: SCENE_VERSION,
    settings: { background: DEFAULT_BACKGROUND },
    shapes: [
      shape('rect-1', 'Rectangle 1', 'Rect', { x: -4, y: -4, z: 4 }, {
        width: 4,
        height: 4,
        color: '#ee6622',
        stroke: 1,
        fill: false,
      }),
      shape('rounded-rect-1', 'Rounded rectangle 1', 'RoundedRect', { x: -4, y: 4, z: -4 }, {
        width: 4,
        height: 4,
        cornerRadius: 1,
        color: '#33AA6633',
        stroke: 1,
        fill: false,
      }),
      shape('ellipse-1', 'Circle 1', 'Ellipse', { x: 4, y: 4, z: 4 }, {
        diameter: 4,
        color: '#cc2255',
        stroke: 1,
        fill: false,
      }),
      shape('polygon-1', 'Triangle', 'Polygon', { x: 4, y: -4, z: -4 }, {
        sides: 3,
        radius: 2.5,
        color: '#ee6622',
        stroke: 1,
        fill: false,
      }),
      shape(
        'shape-1',
        'Cross',
        'Shape',
        { x: 0, y: 0, z: 0 },
        {
          path: [{ x: -1 }, { x: 1 }, { move: { y: -1 } }, { y: 1 }, { move: { z: -1 } }, { z: 1 }],
          color: '#FFEEDD',
          stroke: 1,
          fill: false,
        },
        1.25,
      ),
      shape('hemisphere-1', 'Hemisphere 1', 'Hemisphere', { x: -4, y: -4, z: -4 }, {
        diameter: 5,
        color: '#cc2255',
        backface: '#eeaa00',
        stroke: 0,
        fill: true,
      }),
      shape('cylinder-1', 'Cylinder 1', 'Cylinder', { x: -4, y: 4, z: 4 }, {
        diameter: 5,
        length: 4,
        color: '#eeaa00',
        backface: '#FFEEDD',
        stroke: 0,
        fill: true,
      }),
      shape('cone-1', 'Cone 1', 'Cone', { x: 12, y: -4, z: 4 }, {
        diameter: 5,
        length: 4,
        color: '#663366',
        backface: '#cc2255',
        stroke: 0,
        fill: true,
      }),
      shape('box-1', 'Box 1', 'Box', { x: 4, y: 4, z: -4 }, {
        width: 5,
        height: 5,
        depth: 5,
        color: '#ee6622',
        stroke: 0,
        fill: true,
        frontFace: true,
        rearFace: true,
        leftFace: '#cc2255',
        rightFace: '#cc2255',
        topFace: '#eeaa00',
        bottomFace: '#663366',
      }),
    ],
  };
}
