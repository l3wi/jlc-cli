import { describe, expect, it } from 'bun:test';

import { findChild, findChildren, getAttr, getPoint, getPointWithRotation, getPoints, parseSExpr, type SExpr } from '../browser/sexpr-parser.js';
import type { EasyEDAComponentData } from '../types/index.js';
import { footprintConverter } from './footprint.js';

function createComponent(padNumbers: string[] = [], arcPath?: string): EasyEDAComponentData {
  return {
    info: { name: 'Resistor', prefix: 'R' },
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
      name: 'R0603',
      type: 'smd',
      pads: padNumbers.map((number, index) => ({
        shape: 'RECT',
        centerX: index === 0 ? -3 : 3,
        centerY: 0,
        width: 2,
        height: 3,
        layerId: 1,
        net: '',
        number,
        holeRadius: 0,
        points: '',
        rotation: 0,
        id: `pad-${index}`,
        holeLength: 0,
        holePoint: '',
        isPlated: true,
        isLocked: false,
      })),
      tracks: [],
      holes: [],
      circles: [],
      arcs: arcPath ? [{
        strokeWidth: 0.5,
        layerId: 3,
        net: '',
        path: arcPath,
        helperDots: '',
        id: 'arc',
        isLocked: false,
      }] : [],
      rects: [],
      texts: [],
      vias: [],
      solidRegions: [],
      origin: { x: 0, y: 0 },
    },
    rawData: {},
  };
}

function padWorldPoints(pad: SExpr[]): { x: number; y: number }[] {
  const at = getPointWithRotation(pad, 'at')!;
  const angle = (at.rotation ?? 0) * Math.PI / 180;
  const drill = findChild(pad, 'drill');
  const offset = drill ? getPoint(drill, 'offset') ?? { x: 0, y: 0 } : { x: 0, y: 0 };
  const primitive = findChild(findChild(pad, 'primitives')!, 'gr_poly')!;
  return getPoints(primitive).map((point) => {
    const x = point.x + offset.x, y = point.y + offset.y;
    return { x: at.x + x * Math.cos(angle) + y * Math.sin(angle), y: at.y - x * Math.sin(angle) + y * Math.cos(angle) };
  });
}

function courtyardBounds(output: string) {
  const lines = findChildren(parseSExpr(output), 'fp_line').filter((line) => getAttr(line, 'layer') === 'F.CrtYd');
  const points = lines.flatMap((line) => [getPoint(line, 'start')!, getPoint(line, 'end')!]);
  return { minX: Math.min(...points.map((p) => p.x)), maxX: Math.max(...points.map((p) => p.x)), minY: Math.min(...points.map((p) => p.y)), maxY: Math.max(...points.map((p) => p.y)) };
}

describe('FootprintConverter', () => {
  it('preserves the true midpoint of a semicircle', () => {
    const output = footprintConverter.convert(createComponent([], 'M0 0 A10 10 0 0 1 20 0'));
    expect(output).toContain('(fp_arc\n\t\t(start 0 0)\n\t\t(mid 2.54 -2.54)\n\t\t(end 5.08 0)');
  });

  it.each([
    [0, 1, '1.7961 1.7961'],
    [1, 1, '4.3361 4.3361'],
    [0, 0, '0.7439 0.7439'],
    [1, 0, '-1.7961 -1.7961'],
  ])('honors largeArc=%i and sweep=%i for a rotated circle', (largeArc, sweep, midpoint) => {
    const output = footprintConverter.convert(
      createComponent([], `M10 0 A10 10 45 ${largeArc} ${sweep} 0 10`)
    );
    expect(output).toContain(
      `(fp_arc\n\t\t(start 2.54 0)\n\t\t(mid ${midpoint})\n\t\t(end 0 2.54)`
    );
  });

  it('corrects undersized SVG radii before emitting a circular arc', () => {
    const output = footprintConverter.convert(createComponent([], 'M0 0 A5 5 0 0 1 20 0'));
    expect(output).toContain('(mid 2.54 -2.54)');
  });

  it('tessellates a rotated ellipse instead of replacing it with a circle', () => {
    const output = footprintConverter.convert(createComponent([], 'M0 -20 A20 10 90 0 1 0 20'));
    expect(output).not.toContain('(fp_arc');
    const lines = [...output.matchAll(
      /\(fp_line\s+\(start ([-\d.]+) ([-\d.]+)\)\s+\(end ([-\d.]+) ([-\d.]+)\)[\s\S]*?\(layer "([^"]+)"\)\s*\)/g
    )].filter((match) => match[5] === 'F.SilkS')
      .map((match) => match.slice(1, 5).map(Number));
    expect(lines[0].slice(0, 2)).toEqual([0, -5.08]);
    expect(lines[lines.length - 1].slice(2)).toEqual([0, 5.08]);
    for (const [x1, y1, x2, y2] of lines) {
      expect(x1).toBeGreaterThanOrEqual(0);
      expect(x2).toBeGreaterThanOrEqual(0);
      expect((x2 / 2.54) ** 2 + (y2 / 5.08) ** 2).toBeCloseTo(1, 4);
      // Compare each chord midpoint with the ellipse at its angular midpoint.
      const angle = (Math.atan2(y1 / 5.08, x1 / 2.54) + Math.atan2(y2 / 5.08, x2 / 2.54)) / 2;
      const error = Math.hypot(
        (x1 + x2) / 2 - 2.54 * Math.cos(angle),
        (y1 + y2) / 2 - 5.08 * Math.sin(angle)
      );
      expect(error).toBeLessThanOrEqual(0.0101);
    }
  });

  it('emits zero-radius arcs as lines and omits coincident endpoints', () => {
    const line = footprintConverter.convert(createComponent([], 'M0 0 A0 10 0 0 1 20 0'));
    expect(line).not.toContain('(fp_arc');
    expect(line).toContain('(fp_line\n\t\t(start 0 0)\n\t\t(end 5.08 0)');
    const empty = footprintConverter.convert(createComponent([], 'M10 10 A10 10 0 1 1 10 10'));
    expect(empty).not.toContain('(fp_arc');
    expect(empty).not.toContain('NaN');
  });

  it.each([
    ['A', 'B'],
    ['1', '1'],
    ['01', '02'],
  ])('preserves incompatible source pad identifiers %s/%s', (first, second) => {
    const result = footprintConverter.getFootprint(createComponent([first, second]));
    expect(result.type).toBe('generated');
    expect(result.content).toContain(`(pad "${first}" smd`);
    expect(result.content).toContain(`(pad "${second}" smd`);
  });

  it('uses a built-in passive only when its pad identifiers match, regardless of source order', () => {
    const result = footprintConverter.getFootprint(createComponent(['2', '1']));
    expect(result.type).toBe('reference');
    expect(result.reference).toBe('Resistor_SMD:R_0603_1608Metric');
  });

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

  it('preserves RECT copper corners instead of inventing rounded corners', () => {
    const pad = findChild(parseSExpr(footprintConverter.convert(createComponent(['1']))), 'pad')!;
    expect(pad[3]).toBe('rect');
    expect(getPoint(pad, 'size')).toEqual({ x: 0.508, y: 0.762 });
    expect(findChild(pad, 'roundrect_rratio')).toBeUndefined();
  });

  it('preserves the live C165948 USB polygon copper at 0.6 by 1.3 mm without a 0.1 mm outline expansion', () => {
    const component = createComponent(['A1B12']);
    Object.assign(component.footprint.pads[0], {
      shape: 'POLYGON', centerX: 3988.091, centerY: 2987.677, width: 2.3621, height: 5.1188,
      points: '3989.2718 2990.2358 3989.2718 2985.1176 3989.2718 2985.1176 3988.0907 2985.1176 3988.0907 2985.1176 3988.0907 2985.1182 3988.0907 2985.1182 3986.9097 2985.1182 3986.9097 2985.1182 3986.9097 2990.2364 3986.9097 2990.2364 3988.0908 2990.2364 3988.0908 2990.2364 3988.0908 2990.2358 3988.0908 2990.2358 3989.2718 2990.2358',
    });
    const pad = findChild(parseSExpr(footprintConverter.convert(component)), 'pad')!;
    const points = padWorldPoints(pad);
    const primitive = findChild(findChild(pad, 'primitives')!, 'gr_poly')!;
    const stroke = Number(getAttr(primitive, 'width'));
    expect(Math.max(...points.map((p) => p.x)) - Math.min(...points.map((p) => p.x)) + stroke).toBeCloseTo(0.6, 4);
    expect(Math.max(...points.map((p) => p.y)) - Math.min(...points.map((p) => p.y)) + stroke).toBeCloseTo(1.3002, 4);
    expect(findChild(pad, 'drill')).toBeUndefined();
  });

  it.each([
    ['horizontal', '-1 0 1 0', 0],
    ['vertical', '0 -1 0 1', -90],
    ['diagonal', '-0.70710678 -0.70710678 0.70710678 0.70710678', -45],
  ])('preserves %s slot axes independently of rectangular copper', (_name, endpoints, expectedAngle) => {
    const component = createComponent(['1']);
    Object.assign(component.footprint.pads[0], {
      centerX: 0, centerY: 0, width: 8, height: 4, layerId: 11,
      holeRadius: 0.5, holeLength: 3, holePoint: endpoints,
    });
    const pad = findChild(parseSExpr(footprintConverter.convert(component)), 'pad')!;
    expect(getPointWithRotation(pad, 'at')?.rotation ?? 0).toBe(expectedAngle);
    expect(findChild(pad, 'drill')?.slice(1, 4)).toEqual(['oval', '0.762', '0.254']);
    if (pad[3] === 'custom') {
      const points = padWorldPoints(pad);
      expect(Math.max(...points.map((p) => p.x))).toBeCloseTo(1.016, 3);
      expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(-1.016, 3);
      expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(0.508, 3);
      expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(-0.508, 3);
    } else {
      expect(getPoint(pad, 'size')).toEqual({ x: 2.032, y: 1.016 });
    }
  });

  it('uses slot endpoint midpoint for the drill and keeps copper at its original center', () => {
    const component = createComponent(['1']);
    Object.assign(component.footprint.pads[0], {
      centerX: 0, centerY: 0, width: 8, height: 6, layerId: 11,
      holeRadius: 0.5, holeLength: 3, holePoint: '1.29289322 0.29289322 2.70710678 1.70710678',
    });
    const pad = findChild(parseSExpr(footprintConverter.convert(component)), 'pad')!;
    expect(getPoint(pad, 'at')).toEqual({ x: 0.508, y: 0.254 });
    const points = padWorldPoints(pad);
    expect(Math.max(...points.map((p) => p.x))).toBeCloseTo(1.016, 3);
    expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(-1.016, 3);
    expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(0.762, 3);
    expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(-0.762, 3);
  });

  it('does not double-rotate polygon copper while aligning its drill', () => {
    const component = createComponent(['1']);
    Object.assign(component.footprint.pads[0], {
      shape: 'POLYGON', centerX: 0, centerY: 0, width: 8, height: 4, rotation: 37, layerId: 11,
      points: '-4 -2 4 -2 4 2 -4 2', holeRadius: 0.5, holeLength: 3, holePoint: '-0.70710678 -0.70710678 0.70710678 0.70710678',
    });
    const points = padWorldPoints(findChild(parseSExpr(footprintConverter.convert(component)), 'pad')!);
    expect(points[0].x).toBeCloseTo(-1.016, 3);
    expect(points[0].y).toBeCloseTo(-0.508, 3);
    expect(points[2].x).toBeCloseTo(1.016, 3);
    expect(points[2].y).toBeCloseTo(0.508, 3);
  });

  it('preserves an explicitly unplated drilled pad, not a plated via or SMD pad', () => {
    const component = createComponent(['1']);
    Object.assign(component.footprint.pads[0], { holeRadius: 0.5, layerId: 11, isPlated: false });
    const pad = findChild(parseSExpr(footprintConverter.convert(component)), 'pad')!;
    expect(pad[2]).toBe('np_thru_hole');
    expect(getAttr(pad, 'drill')).toBe('0.254');
  });

  it('rejects missing multilayer drills and ambiguous slot axes rather than inventing manufacturing geometry', () => {
    const component = createComponent(['1']);
    const pad = component.footprint.pads[0];
    pad.layerId = 11;
    expect(() => footprintConverter.convert(component)).toThrow(/no explicit drill/);
    Object.assign(pad, { holeRadius: 0.5, holeLength: 3 });
    expect(() => footprintConverter.convert(component)).toThrow(/slot orientation is ambiguous/);
    pad.holeLength = 1;
    expect(getAttr(findChild(parseSExpr(footprintConverter.convert(component)), 'pad')!, 'drill')).toBe('0.254');
  });

  it('rejects conflicting endpoint and scalar slot lengths rather than selecting one', () => {
    const component = createComponent(['1']);
    Object.assign(component.footprint.pads[0], {
      width: 30, height: 30, layerId: 11, holeRadius: 0.5, holeLength: 3, holePoint: '-10 0 10 0',
    });
    expect(() => footprintConverter.convert(component)).toThrow(/endpoints contradict/);
  });

  it.each([0, -1, NaN, Infinity])('rejects invalid pad width %s', (width) => {
    const component = createComponent(['1']);
    component.footprint.pads[0].width = width;
    expect(() => footprintConverter.convert(component)).toThrow(/pad "1" width/);
  });

  it('keeps copper-pour exclusions separate from static pads and copper graphics', () => {
    const component = createComponent(['1']);
    component.footprint.solidRegions.push(
      { id: 'copper', layerId: 1, fillType: 'solid', path: 'M-5 -5 L5 -5 L5 5 L-5 5Z' },
      { id: 'exclude', layerId: 1, fillType: 'none', path: 'M-4 -4 L4 -4 L4 4 L-4 4Z' },
    );
    const output = parseSExpr(footprintConverter.convert(component));
    const polygons = findChildren(output, 'fp_poly');
    expect(polygons).toHaveLength(1);
    expect(getPoints(polygons[0])[0]).toEqual({ x: -0.508, y: -1.27 });
    const zone = findChild(output, 'zone')!;
    const keepout = findChild(zone, 'keepout')!;
    expect(getAttr(keepout, 'copperpour')).toBe('not_allowed');
    expect(getAttr(keepout, 'pads')).toBe('allowed');
    expect(getAttr(keepout, 'tracks')).toBe('allowed');
    expect(findChildren(output, 'pad')).toHaveLength(1);
  });

  it('emits a board-cutout region as a closed Edge.Cuts contour without copper fill', () => {
    const component = createComponent();
    component.footprint.solidRegions.push({ id: 'slot', layerId: 11, fillType: 'npth', path: 'm0 0 h4 v2 h-4z' });
    const output = parseSExpr(footprintConverter.convert(component));
    expect(findChildren(output, 'fp_poly')).toHaveLength(0);
    const edges = findChildren(output, 'fp_line').filter((line) => getAttr(line, 'layer') === 'Edge.Cuts');
    expect(edges).toHaveLength(4);
    expect(getPoint(edges[3], 'end')).toEqual(getPoint(edges[0], 'start'));
    expect(getPoint(edges[1], 'end')).toEqual({ x: 1.016, y: 0.508 });
  });

  it('keeps disjoint solid subpaths separate and rejects compound holes and unknown fill semantics', () => {
    const component = createComponent();
    const region = { id: 'region', layerId: 1, fillType: 'solid', path: 'M0 0 H2 V2 H0Z M4 0 H6 V2 H4Z' };
    component.footprint.solidRegions.push(region);
    const output = parseSExpr(footprintConverter.convert(component));
    expect(findChildren(output, 'fp_poly').map((polygon) => getPoints(polygon)[0])).toEqual([{ x: 0, y: 0 }, { x: 1.016, y: 0 }]);
    region.path = 'M0 0 H10 V10 H0Z M2 2 H4 V4 H2Z';
    expect(() => footprintConverter.convert(component)).toThrow(/compound contours/);
    region.fillType = 'mystery';
    expect(() => footprintConverter.convert(component)).toThrow(/unsupported fillType/);
  });

  it('rejects named-net pour exclusions rather than dropping their exceptions', () => {
    const component = createComponent();
    component.footprint.solidRegions.push({ id: 'exclude', layerId: 1, fillType: 'cutout', net: 'GND', path: 'M0 0 H2 V2 H0Z' });
    expect(() => footprintConverter.convert(component)).toThrow(/named-net/);
  });

  it('encloses rotated pad corners and far internal body geometry with at least 0.25 mm courtyard clearance', () => {
    const component = createComponent(['1']);
    Object.assign(component.footprint.pads[0], { centerX: 0, width: 10, height: 10, rotation: 45 });
    let bounds = courtyardBounds(footprintConverter.convert(component));
    const corner = 5 * Math.SQRT2 * 0.254;
    expect(bounds.maxX - corner).toBeGreaterThanOrEqual(0.25);
    expect(-corner - bounds.minY).toBeGreaterThanOrEqual(0.25);
    component.footprint.solidRegions.push({ id: 'body', layerId: 99, fillType: 'solid', path: 'M20 -2 H30 V2 H20Z' });
    const output = footprintConverter.convert(component);
    bounds = courtyardBounds(output);
    expect(bounds.maxX - 30 * 0.254).toBeGreaterThanOrEqual(0.25);
    expect(findChildren(parseSExpr(output), 'fp_poly')).toHaveLength(0);
  });

  it('includes rectangle strokes, arc extrema, vias and holes in the courtyard', () => {
    const component = createComponent([], 'M0 0 A10 10 0 0 1 20 0');
    component.footprint.rects.push({ x: -20, y: -2, width: 2, height: 4, strokeWidth: 2, layerId: 13, id: 'body', isLocked: false });
    component.footprint.vias.push({ centerX: 30, centerY: 0, diameter: 4, radius: 1, net: '', id: 'via', isLocked: false });
    component.footprint.holes.push({ centerX: 0, centerY: 20, radius: 2, id: 'hole', isLocked: false });
    const bounds = courtyardBounds(footprintConverter.convert(component));
    expect(-21 * 0.254 - bounds.minX).toBeGreaterThanOrEqual(0.25);
    expect(bounds.maxX - 32 * 0.254).toBeGreaterThanOrEqual(0.25);
    expect(-10.25 * 0.254 - bounds.minY).toBeGreaterThanOrEqual(0.25);
    expect(bounds.maxY - 22 * 0.254).toBeGreaterThanOrEqual(0.25);
  });

  it('uses rotated and polygon copper boundaries to choose the pad-center origin', () => {
    const component = createComponent(['1', '2']);
    Object.assign(component.footprint.pads[0], { centerX: 0, width: 10, height: 2, rotation: 90 });
    Object.assign(component.footprint.pads[1], { centerX: 10, width: 2, height: 2 });
    const pads = findChildren(parseSExpr(footprintConverter.convert(component)), 'pad');
    expect(getPoint(pads[0], 'at')).toEqual({ x: -1.27, y: 0 });
    expect(getPoint(pads[1], 'at')).toEqual({ x: 1.27, y: 0 });
  });

  it('does not replace nominal chip names when auxiliary manufacturing features would disappear', () => {
    const component = createComponent(['1', '2']);
    component.footprint.solidRegions.push({ id: 'body', layerId: 99, fillType: 'solid', path: 'M-2 -2 H2 V2 H-2Z' });
    expect(footprintConverter.getFootprint(component).type).toBe('reference');
    component.footprint.holes.push({ id: 'hole', centerX: 0, centerY: 0, radius: 0.5, isLocked: false });
    expect(footprintConverter.getFootprint(component).type).toBe('generated');
    component.footprint.holes = [];
    component.footprint.pads[1].layerId = 2;
    expect(footprintConverter.getFootprint(component).type).toBe('generated');
    component.footprint.pads[1].layerId = 1;
    component.footprint.pads[1].centerY = 1;
    expect(footprintConverter.getFootprint(component).type).toBe('generated');
  });

  it('recognizes verified EasyEDA RECT outlines without accepting conflicting copper', () => {
    const component = createComponent(['1', '2']);
    component.info.prefix = 'R?';
    component.footprint.pads[0].points = '-4 -1.5 -2 -1.5 -2 1.5 -4 1.5';
    component.footprint.pads[1].points = '2 -1.5 4 -1.5 4 1.5 2 1.5';
    expect(footprintConverter.getFootprint(component).reference).toBe('Resistor_SMD:R_0603_1608Metric');
    component.footprint.pads[1].points = '2 -1.5 4 -1.5 4 3 2 1.5';
    expect(footprintConverter.getFootprint(component).type).toBe('generated');
  });
});
