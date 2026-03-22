import { describe, expect, it } from 'bun:test';

import { parseFootprintShapes } from './easyeda-shapes.js';

describe('parseFootprintShapes', () => {
  it('extracts 3D model translation and rotation from SVGNODE data', () => {
    const parsed = parseFootprintShapes([
      'PAD~RECT~100~200~10~12~1~~1~0~~0~pad-1~0~~true~false',
      'SVGNODE~{"attrs":{"uuid":"model-uuid","title":"Test Model","c_origin":"101.5,198.25","z":"3.5","c_rotation":"0,90,180"}}',
    ]);

    expect(parsed.model3d).toEqual({
      name: 'Test Model',
      uuid: 'model-uuid',
      translation: {
        x: 101.5,
        y: 198.25,
        z: 3.5,
      },
      rotation: {
        x: 0,
        y: 90,
        z: 180,
      },
    });
  });
});
