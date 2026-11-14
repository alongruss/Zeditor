import * as Zdog from 'zdog';

/**
 * The nine-shape scene the 2020 editor opened with. For now it is created
 * directly as zdog objects; the next phase turns it into scene data.
 */
export function addStarterScene(addTo: Zdog.Anchor): void {
  new Zdog.Rect({
    addTo,
    width: 4,
    height: 4,
    translate: { x: -4, y: -4, z: 4 },
    stroke: 1,
    color: '#ee6622',
  });

  new Zdog.RoundedRect({
    addTo,
    width: 4,
    height: 4,
    cornerRadius: 1,
    translate: { x: -4, y: 4, z: -4 },
    stroke: 1,
    color: '#33AA6633',
  });

  new Zdog.Ellipse({
    addTo,
    diameter: 4,
    translate: { x: 4, y: 4, z: 4 },
    stroke: 1,
    color: '#cc2255',
  });

  new Zdog.Polygon({
    addTo,
    sides: 3,
    radius: 2.5,
    translate: { x: 4, y: -4, z: -4 },
    stroke: 1,
    color: '#ee6622',
  });

  new Zdog.Shape({
    addTo,
    path: [{ x: -1 }, { x: 1 }, { move: { y: -1 } }, { y: 1 }, { move: { z: -1 } }, { z: 1 }],
    scale: 1.25,
    stroke: 1,
    color: '#FFEEDD',
  });

  new Zdog.Hemisphere({
    addTo,
    diameter: 5,
    translate: { x: -4, y: -4, z: -4 },
    color: '#cc2255',
    backface: '#eeaa00',
    stroke: false,
  });

  new Zdog.Cylinder({
    addTo,
    diameter: 5,
    length: 4,
    translate: { x: -4, y: 4, z: 4 },
    color: '#eeaa00',
    backface: '#FFEEDD',
    stroke: false,
  });

  new Zdog.Cone({
    addTo,
    diameter: 5,
    length: 4,
    translate: { x: 12, y: -4, z: 4 },
    color: '#663366',
    backface: '#cc2255',
    stroke: false,
  });

  new Zdog.Box({
    addTo,
    width: 5,
    height: 5,
    depth: 5,
    translate: { x: 4, y: 4, z: -4 },
    color: '#ee6622',
    topFace: '#eeaa00',
    leftFace: '#cc2255',
    rightFace: '#cc2255',
    bottomFace: '#663366',
    stroke: false,
  });
}
