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

  it('preserves explicit unplated drills without changing legacy plated pads', () => {
    const parsed = parseFootprintShapes([
      'PAD~ELLIPSE~0~0~8~8~11~~1~2~~0~npth~0~~N~false',
      'PAD~ELLIPSE~10~0~8~8~11~~2~2~~0~pth',
    ]);
    expect(parsed.pads.map(pad => pad.isPlated)).toEqual([false, true]);
    expect(parsed.type).toBe('tht');
  });

  it('does not classify undrilled polygon copper as a through-hole footprint', () => {
    const parsed = parseFootprintShapes([
      'PAD~POLYGON~0~0~4~4~1~~1~0~-2 -2 2 -2 2 2 -2 2~0~polygon~0~~Y~false',
    ]);
    expect(parsed.pads[0].isPlated).toBe(true);
    expect(parsed.type).toBe('smd');
  });
});
