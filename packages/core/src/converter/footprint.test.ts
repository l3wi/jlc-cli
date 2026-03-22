import { describe, expect, it } from 'bun:test';

import type { EasyEDAComponentData } from '../types/index.js';
import { footprintConverter } from './footprint.js';

describe('FootprintConverter', () => {
  it('emits KiCad 3D model offsets and rotations from EasyEDA transform data', () => {
    const component: EasyEDAComponentData = {
      info: {
        name: 'Test Component',
        prefix: 'U',
        description: 'Test component',
      },
      symbol: {
        pins: [],
        rectangles: [],
        circles: [],
        ellipses: [],
        arcs: [],
        polylines: [],
        polygons: [],
        paths: [],
        texts: [],
        origin: { x: 0, y: 0 },
      },
      footprint: {
        name: 'Test_Footprint',
        type: 'smd',
        pads: [
          {
            shape: 'RECT',
            centerX: 100,
            centerY: 200,
            width: 10,
            height: 10,
            layerId: 1,
            net: '',
            number: '1',
            holeRadius: 0,
            points: '',
            rotation: 0,
            id: 'pad-1',
            holeLength: 0,
            holePoint: '',
            isPlated: true,
            isLocked: false,
          },
        ],
        tracks: [],
        holes: [],
        circles: [],
        arcs: [],
        rects: [],
        texts: [],
        vias: [],
        solidRegions: [],
        origin: { x: 100, y: 200 },
        model3d: {
          name: 'Test Model',
          uuid: 'model-uuid',
          translation: {
            x: 101,
            y: 198,
            z: 3.5,
          },
          rotation: {
            x: 0,
            y: 90,
            z: 180,
          },
        },
      },
      model3d: {
        name: 'Test Model',
        uuid: 'model-uuid',
        translation: {
          x: 101,
          y: 198,
          z: 3.5,
        },
        rotation: {
          x: 0,
          y: 90,
          z: 180,
        },
      },
      rawData: {},
    };

    const output = footprintConverter.convert(component, {
      include3DModel: true,
      modelPath: './Test Model.step',
    });

    expect(output).toContain('(model "./Test Model.step"');
    expect(output).toContain('(offset\n\t\t\t(xyz 0.254 0.508 -0.889)');
    expect(output).toContain('(rotate\n\t\t\t(xyz 0 270 180)');
  });

  it('preserves Z offsets for through-hole footprints', () => {
    const component: EasyEDAComponentData = {
      info: {
        name: 'THT Component',
        prefix: 'J',
        description: 'Through-hole component',
      },
      symbol: {
        pins: [],
        rectangles: [],
        circles: [],
        ellipses: [],
        arcs: [],
        polylines: [],
        polygons: [],
        paths: [],
        texts: [],
        origin: { x: 0, y: 0 },
      },
      footprint: {
        name: 'THT_Footprint',
        type: 'tht',
        pads: [
          {
            shape: 'ELLIPSE',
            centerX: 100,
            centerY: 200,
            width: 10,
            height: 10,
            layerId: 11,
            net: '',
            number: '1',
            holeRadius: 2,
            points: '',
            rotation: 0,
            id: 'pad-1',
            holeLength: 0,
            holePoint: '',
            isPlated: true,
            isLocked: false,
          },
        ],
        tracks: [],
        holes: [],
        circles: [],
        arcs: [],
        rects: [],
        texts: [],
        vias: [],
        solidRegions: [],
        origin: { x: 100, y: 200 },
        model3d: {
          name: 'THT Model',
          uuid: 'tht-model-uuid',
          translation: {
            x: 100,
            y: 200,
            z: -12.9921,
          },
          rotation: {
            x: 0,
            y: 0,
            z: 0,
          },
        },
      },
      model3d: {
        name: 'THT Model',
        uuid: 'tht-model-uuid',
        translation: {
          x: 100,
          y: 200,
          z: -12.9921,
        },
        rotation: {
          x: 0,
          y: 0,
          z: 0,
        },
      },
      rawData: {},
    };

    const output = footprintConverter.convert(component, {
      include3DModel: true,
      modelPath: './THT Model.step',
    });

    expect(output).toContain('(offset\n\t\t\t(xyz 0 0 3.3)');
  });
});
