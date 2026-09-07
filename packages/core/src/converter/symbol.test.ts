import { describe, expect, it } from 'bun:test';

import { findChild, findChildren, getAttr, getPoint, getPointWithRotation, parseSExpr } from '../browser/sexpr-parser.js';
import type { EasyEDAComponentData } from '../types/index.js';
import { parseSymbolEllipse } from '../parsers/easyeda-shapes.js';
import { symbolConverter } from './symbol.js';

function makeDiode(prefix = 'D'): EasyEDAComponentData {
  return {
    info: { name: 'Source Diode', prefix, category: 'Diodes', description: 'Original diode' },
    symbol: {
      pins: [
        { number: '7', name: 'K', electricalType: 'passive', x: 80, y: 190, rotation: 180, hasDot: false, hasClock: false, pinLength: 10 },
        { number: '3', name: 'A', electricalType: 'passive', x: 120, y: 210, rotation: 0, hasDot: false, hasClock: false, pinLength: 10 },
      ],
      rectangles: [], circles: [], ellipses: [], arcs: [], polygons: [], paths: [], texts: [],
      polylines: [{ points: '90 195 110 205', strokeWidth: 1, strokeColor: '#000000', fillColor: 'none' }],
      origin: { x: 100, y: 200 },
    },
    footprint: {
      name: 'Test_Diode', type: 'smd', pads: [], tracks: [], holes: [], circles: [], arcs: [], rects: [], texts: [], vias: [], solidRegions: [],
      origin: { x: 0, y: 0 },
    },
    rawData: {},
  };
}

function emittedPins(content: string) {
  const symbol = findChild(parseSExpr(content), 'symbol')!;
  return findChildren(symbol, 'symbol').flatMap(unit => findChildren(unit, 'pin')).map(pin => ({
    number: getAttr(pin, 'number'),
    name: getAttr(pin, 'name'),
    ...getPointWithRotation(pin, 'at'),
    length: getAttr(pin, 'length'),
  }));
}

describe('SymbolConverter diode polarity', () => {
  it('keeps cathode numbers on the bar side for either source order and every diode template route', () => {
    for (const prefix of ['D', 'LED', 'U']) {
      const component = makeDiode(prefix);
      for (let order = 0; order < 2; order++) {
        const pins = emittedPins(symbolConverter.convert(component));
        expect(pins.find(pin => pin.number === '7')).toMatchObject({ name: 'K', x: 0, y: -5.08, rotation: 90 });
        expect(pins.find(pin => pin.number === '3')).toMatchObject({ name: 'A', x: 0, y: 5.08, rotation: 270 });
        component.symbol.pins.reverse();
      }
    }
  });

  it('recognizes explicit long polarity names without using pad numbering', () => {
    const component = makeDiode();
    component.symbol.pins[0].name = ' cathode ';
    component.symbol.pins[1].name = 'Anode';
    const pins = emittedPins(symbolConverter.convert(component));
    expect(pins.find(pin => pin.number === '7')?.y).toBe(-5.08);
    expect(pins.find(pin => pin.number === '3')?.y).toBe(5.08);
  });

  it('retains source pin and body geometry when polarity is ambiguous, including shape-free input', () => {
    for (const prefix of ['D', 'LED', 'U']) {
      const component = makeDiode(prefix);
      component.symbol.pins[0].name = '1';
      component.symbol.pins[0].number = '1';
      component.symbol.pins[1].name = '2';
      component.symbol.pins[1].number = '2';
      const output = symbolConverter.convert(component);
      const expectedPins = [
        { number: '1', name: '1', x: -5.08, y: 2.54, rotation: 0, length: '2.54' },
        { number: '2', name: '2', x: 5.08, y: -2.54, rotation: 180, length: '2.54' },
      ];
      expect(emittedPins(output)).toEqual(expectedPins);
      const symbol = findChild(parseSExpr(output), 'symbol')!;
      const graphics = findChildren(symbol, 'symbol').flatMap(unit => findChildren(unit, 'polyline'));
      expect(graphics).toHaveLength(1);
      const points = findChildren(findChild(graphics[0], 'pts')!, 'xy');
      expect(points.map(point => getPoint(['pts', point], 'xy'))).toEqual([{ x: -2.54, y: 1.27 }, { x: 2.54, y: -1.27 }]);
      component.symbol.polylines = [];
      expect(emittedPins(symbolConverter.convert(component))).toEqual(expectedPins);
    }
  });
});

function makeGeometryComponent(): EasyEDAComponentData {
  const component = makeDiode('U');
  component.info.category = 'Integrated Circuits';
  component.info.description = 'Source geometry';
  component.symbol.origin = { x: 0, y: 0 };
  component.symbol.polylines = [];
  return component;
}

function emittedGraphics(content: string, type: string) {
  const symbol = findChild(parseSExpr(content), 'symbol')!;
  return findChildren(symbol, 'symbol').flatMap(unit => findChildren(unit, type));
}

function emittedPolylines(content: string) {
  return emittedGraphics(content, 'polyline').map(line => ({
    points: findChildren(findChild(line, 'pts')!, 'xy').map(point => getPoint(['pts', point], 'xy')!),
    fill: getAttr(findChild(line, 'fill')!, 'type'),
  }));
}

function distanceToPolyline(point: { x: number; y: number }, points: Array<{ x: number; y: number }>): number {
  let distance = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i];
    const dx = b.x - a.x, dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / lengthSquared));
    distance = Math.min(distance, Math.hypot(point.x - a.x - t * dx, point.y - a.y - t * dy));
  }
  return distance;
}

describe('SymbolConverter source geometry', () => {
  const style = { strokeWidth: 1, strokeColor: '#880000', fillColor: 'none' };

  it('keeps relative and repeated coordinates, origin offsets, and pin identities', () => {
    const component = makeGeometryComponent();
    component.symbol.origin = { x: 100, y: 200 };
    component.symbol.paths = [{ ...style, path: 'm100 200 10 0 0 10 h-5 v-5 l-5 0 z' }];
    const output = symbolConverter.convert(component);
    expect(emittedPolylines(output)).toEqual([{
      points: [{ x: 0, y: 0 }, { x: 2.54, y: 0 }, { x: 2.54, y: -2.54 },
        { x: 1.27, y: -2.54 }, { x: 1.27, y: -1.27 }, { x: 0, y: -1.27 }, { x: 0, y: 0 }],
      fill: 'none',
    }]);
    expect(emittedPins(output)).toEqual([
      { number: '7', name: 'K', x: -5.08, y: 2.54, rotation: 0, length: '2.54' },
      { number: '3', name: 'A', x: 5.08, y: -2.54, rotation: 180, length: '2.54' },
    ]);
  });

  it('keeps visible properties with translated source geometry instead of at the document origin', () => {
    const component = makeGeometryComponent();
    component.symbol.paths = [{ ...style, path: 'M-10 -10H10V10H-10Z' }];
    const translated = structuredClone(component);
    translated.symbol.pins = translated.symbol.pins.map(pin => ({ ...pin, x: pin.x + 3000, y: pin.y + 4000 }));
    translated.symbol.paths[0].path = 'M2990 3990H3010V4010H2990Z';
    const properties = (data: EasyEDAComponentData) => {
      const symbol = findChild(parseSExpr(symbolConverter.convert(data)), 'symbol')!;
      return findChildren(symbol, 'property').filter(property => property[1] === 'Reference' || property[1] === 'Value')
        .map(property => getPoint(property, 'at')!);
    };
    const original = properties(component), shifted = properties(translated);
    expect(shifted).toHaveLength(2);
    for (let i = 0; i < original.length; i++) {
      expect(shifted[i].x - original[i].x).toBeCloseTo(3000 * 0.254, 3);
      expect(shifted[i].y - original[i].y).toBeCloseTo(-4000 * 0.254, 3);
    }
  });

  it('bounds cubic, smooth cubic, quadratic and smooth quadratic error after rounding', () => {
    const component = makeGeometryComponent();
    component.symbol.paths = [
      { ...style, path: 'M0 0 c0 20 20 20 20 0 s20 -20 20 0' },
      { ...style, path: 'M0 30 q10 20 20 0 t20 0' },
    ];
    const lines = emittedPolylines(symbolConverter.convert(component));
    expect(lines).toHaveLength(2);
    expect(lines[0].points[0]).toEqual({ x: 0, y: 0 });
    expect(lines[0].points.at(-1)).toEqual({ x: 10.16, y: 0 });
    expect(lines[1].points.at(-1)).toEqual({ x: 10.16, y: -7.62 });
    for (let i = 0; i <= 1000; i++) {
      const t = i / 1000, u = 1 - t;
      const x = 60 * u * t * t + 20 * t * t * t;
      const y = 60 * u * t;
      expect(distanceToPolyline({ x: x * 0.254, y: -y * 0.254 }, lines[0].points)).toBeLessThanOrEqual(0.005);
      expect(distanceToPolyline({ x: (20 + x) * 0.254, y: y * 0.254 }, lines[0].points)).toBeLessThanOrEqual(0.005);
      const qy = 40 * u * t;
      expect(distanceToPolyline({ x: 20 * t * 0.254, y: -(30 + qy) * 0.254 }, lines[1].points)).toBeLessThanOrEqual(0.005);
      expect(distanceToPolyline({ x: (20 + 20 * t) * 0.254, y: -(30 - qy) * 0.254 }, lines[1].points)).toBeLessThanOrEqual(0.005);
    }
  });

  it('never joins disconnected open contours and closes each closed contour independently', () => {
    const component = makeGeometryComponent();
    component.symbol.paths = [{ ...style, path: 'M0 0 10 0 M30 0 40 0 40 10 Z m20 0 10 0' }];
    expect(emittedPolylines(symbolConverter.convert(component)).map(line => line.points)).toEqual([
      [{ x: 0, y: 0 }, { x: 2.54, y: 0 }],
      [{ x: 7.62, y: 0 }, { x: 10.16, y: 0 }, { x: 10.16, y: -2.54 }, { x: 7.62, y: 0 }],
      [{ x: 12.7, y: 0 }, { x: 15.24, y: 0 }],
    ]);
  });

  it('preserves unequal ellipse bounds and contour distance rather than averaging radii', () => {
    const component = makeGeometryComponent();
    component.symbol.ellipses = [{ ...style, cx: 10, cy: 20, radiusX: 20, radiusY: 5, fillColor: '#880000' }];
    const output = symbolConverter.convert(component);
    expect(emittedGraphics(output, 'circle')).toHaveLength(0);
    const [ellipse] = emittedPolylines(output);
    expect(ellipse.fill).toBe('outline');
    expect(ellipse.points[0]).toEqual(ellipse.points.at(-1)!);
    expect(Math.min(...ellipse.points.map(point => point.x))).toBe(-2.54);
    expect(Math.max(...ellipse.points.map(point => point.x))).toBe(7.62);
    expect(Math.min(...ellipse.points.map(point => point.y))).toBe(-6.35);
    expect(Math.max(...ellipse.points.map(point => point.y))).toBe(-3.81);
    for (let i = 0; i < 2000; i++) {
      const angle = i * 2 * Math.PI / 2000;
      expect(distanceToPolyline({ x: (10 + 20 * Math.cos(angle)) * 0.254,
        y: -(20 + 5 * Math.sin(angle)) * 0.254 }, ellipse.points)).toBeLessThanOrEqual(0.005);
    }
  });

  it('preserves relative elliptical arcs in arc records as well as path records', () => {
    const component = makeGeometryComponent();
    component.symbol.arcs = [{ ...style, path: 'M20 0 a20 5 0 0 1 -20 5' }];
    const [arc] = emittedPolylines(symbolConverter.convert(component));
    expect(arc.points[0]).toEqual({ x: 5.08, y: 0 });
    expect(arc.points.at(-1)).toEqual({ x: 0, y: -1.27 });
    for (let i = 0; i <= 500; i++) {
      const angle = i * Math.PI / 1000;
      expect(distanceToPolyline({ x: 5.08 * Math.cos(angle), y: -1.27 * Math.sin(angle) }, arc.points)).toBeLessThanOrEqual(0.005);
    }
  });

  it('preserves live LED pin-one fill and distinguishes filled and unfilled source shapes', () => {
    const component = makeGeometryComponent();
    component.symbol.origin = { x: 380, y: 290 };
    // Captured C42417612 source marker; equal radii should remain a circle.
    component.symbol.ellipses = [parseSymbolEllipse('E~380~290~1.5~1.5~#880000~1~0~#880000~gge2~0')!];
    component.symbol.circles = [{ ...style, cx: 390, cy: 290, radius: 2 }];
    component.symbol.rectangles = [
      { ...style, x: 375, y: 285, width: 50, height: 30, rx: 0, ry: 0 },
      { ...style, x: 375, y: 285, width: 5, height: 3, rx: 0, ry: 0, fillColor: '#880000' },
    ];
    component.symbol.polygons = [{ ...style, points: '380 290 390 290 390 300' }];
    component.symbol.polylines = [{ ...style, points: '380 290 385 290 385 295', fillColor: '#880000' }];
    const output = symbolConverter.convert(component);
    const circles = emittedGraphics(output, 'circle');
    expect(circles.map(circle => getAttr(findChild(circle, 'fill')!, 'type'))).toEqual(['none', 'outline']);
    expect(getPoint(circles[1], 'center')).toEqual({ x: 0, y: 0 });
    expect(getAttr(circles[1], 'radius')).toBe('0.381');
    expect(emittedGraphics(output, 'rectangle').map(rect => getAttr(findChild(rect, 'fill')!, 'type'))).toEqual(['none', 'outline']);
    const lines = emittedPolylines(output);
    expect(lines.map(line => line.fill)).toEqual(['outline', 'none']);
    for (const line of lines) expect(line.points.at(-1)).toEqual(line.points[0]);
  });

  it('keeps disjoint filled islands but refuses nested or intersecting compound fills', () => {
    const component = makeGeometryComponent();
    component.symbol.paths = [{ ...style, fillColor: '#880000', path: 'M0 0 10 0 10 10 0 10 Z M20 0 30 0 30 10 20 10' }];
    const islands = emittedPolylines(symbolConverter.convert(component));
    expect(islands).toHaveLength(2);
    expect(islands.map(line => line.fill)).toEqual(['outline', 'outline']);
    expect(islands.map(line => line.points[0])).toEqual([{ x: 0, y: 0 }, { x: 5.08, y: 0 }]);
    for (const island of islands) expect(island.points.at(-1)).toEqual(island.points[0]);
    for (const contour of [
      'M2 2 2 8 8 8 8 2 Z',
      'M5 -5 15 -5 15 5 5 5 Z',
    ]) {
      component.symbol.paths[0].path = `M0 0 10 0 10 10 0 10 Z ${contour}`;
      expect(() => symbolConverter.convert(component)).toThrow(/compound contours/);
    }
    component.symbol.paths[0].path = 'M0 0 10 0 20 0 Z';
    expect(() => symbolConverter.convert(component)).toThrow(/degenerate contour/);
  });
});

describe('SymbolConverter library identity', () => {
  it('replaces the final custom identity repeatedly without duplicating it or replacing the source name', () => {
    const component = makeDiode();
    const options = { symbolName: 'Custom diode/part' };
    let library = symbolConverter.convert(component);
    library = symbolConverter.appendToLibrary(library, component, options);
    for (const description of ['First replacement', 'Second replacement']) {
      component.info.description = description;
      library = symbolConverter.replaceInLibrary(library, component, options);
      const symbols = findChildren(parseSExpr(library), 'symbol');
      expect(symbols.map(symbol => symbol[1]).sort()).toEqual(['Custom_diode_part', 'Source_Diode']);
      const custom = symbols.find(symbol => symbol[1] === 'Custom_diode_part')!;
      const source = symbols.find(symbol => symbol[1] === 'Source_Diode')!;
      expect(findChildren(custom, 'property').find(property => property[1] === 'Description')?.[2]).toBe(description);
      expect(findChildren(source, 'property').find(property => property[1] === 'Description')?.[2]).toBe('Original diode');
    }
    expect(symbolConverter.appendToLibrary(library, component, options)).toBe(library);
  });

  it('replaces custom entries with valid noncanonical whitespace instead of appending a duplicate', () => {
    const component = makeDiode();
    const options = { symbolName: 'Custom' };
    const library = symbolConverter.convert(component, options).replace('(symbol "Custom"', '( \n symbol\n "Custom"');
    component.info.description = 'Updated';
    const replaced = symbolConverter.replaceInLibrary(library, component, options);
    const symbols = findChildren(parseSExpr(replaced), 'symbol');
    expect(symbols).toHaveLength(1);
    expect(findChildren(symbols[0], 'property').find(property => property[1] === 'Description')?.[2]).toBe('Updated');
  });

  it('ignores nested unit identities when appending and replacing a top-level symbol', () => {
    const component = makeDiode();
    const foo = symbolConverter.convertToSymbolEntry(component, { symbolName: 'Foo' });
    const library = `(kicad_symbol_lib\n${foo})\n`;
    expect(symbolConverter.symbolExistsInLibrary(library, 'Foo')).toBe(true);
    expect(symbolConverter.symbolExistsInLibrary(library, 'Foo_0_1')).toBe(false);
    const options = { symbolName: 'Foo_0_1' };

    for (const updated of [
      symbolConverter.appendToLibrary(library, component, options),
      symbolConverter.replaceInLibrary(library, component, options),
    ]) {
      expect(updated).toContain(foo);
      expect(findChildren(parseSExpr(updated), 'symbol').map(symbol => symbol[1])).toEqual(['Foo', 'Foo_0_1']);
      expect(symbolConverter.symbolExistsInLibrary(updated, 'Foo_0_1')).toBe(true);

      component.info.description = 'Updated nested-name entry';
      const replaced = symbolConverter.replaceInLibrary(updated, component, options);
      expect(replaced).toContain(foo);
      const symbols = findChildren(parseSExpr(replaced), 'symbol');
      expect(symbols.map(symbol => symbol[1])).toEqual(['Foo', 'Foo_0_1']);
      const replacement = symbols.find(symbol => symbol[1] === 'Foo_0_1')!;
      expect(findChildren(replacement, 'property').find(property => property[1] === 'Description')?.[2])
        .toBe('Updated nested-name entry');
    }
  });

  it('replaces a symbol whose quoted property ends in a literal backslash without changing its neighbor', () => {
    const component = makeDiode();
    component.info.description = 'Original "quoted (value)" ending in \\';
    const custom = symbolConverter.convertToSymbolEntry(component, { symbolName: 'Custom' });
    const other = symbolConverter.convertToSymbolEntry(component, { symbolName: 'Other' });
    const library = `(kicad_symbol_lib\n${custom}${other})\n`;

    component.info.description = 'Updated';
    const replaced = symbolConverter.replaceInLibrary(library, component, { symbolName: 'Custom' });
    const symbols = findChildren(parseSExpr(replaced), 'symbol');
    expect(symbols.map(symbol => symbol[1])).toEqual(['Custom', 'Other']);
    expect(replaced).toContain(other);
    const replacement = symbols.find(symbol => symbol[1] === 'Custom')!;
    expect(findChildren(replacement, 'property').find(property => property[1] === 'Description')?.[2]).toBe('Updated');
  });
});
