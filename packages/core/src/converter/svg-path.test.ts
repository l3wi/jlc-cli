import { describe, expect, it } from 'bun:test';

import { flattenSvgPath } from './svg-path.js';

type Point = { x: number; y: number };

function polylineDistance(p: Point, points: Point[]): number {
  let result = Infinity;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lengthSquared = dx * dx + dy * dy;
    const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lengthSquared));
    result = Math.min(result, Math.hypot(p.x - a.x - t * dx, p.y - a.y - t * dy));
  }
  return result;
}

function expectCurveWithin(path: string, curve: (t: number) => Point, tolerance: number): void {
  const points = flattenSvgPath(path, tolerance)[0].points;
  let maximum = 0;
  for (let i = 0; i <= 2000; i++) maximum = Math.max(maximum, polylineDistance(curve(i / 2000), points));
  expect(maximum).toBeLessThanOrEqual(tolerance + 1e-10);
}

describe('SVG path flattening', () => {
  it('preserves a relative square and its closing edge', () => {
    expect(flattenSvgPath('m10 20h5v5h-5z', 0.01)).toEqual([{
      points: [{ x: 10, y: 20 }, { x: 15, y: 20 }, { x: 15, y: 25 }, { x: 10, y: 25 }],
      closed: true,
    }]);
  });

  it('reads signed adjacent numbers, decimals, exponents and implicit repeated lines', () => {
    expect(flattenSvgPath('M.5-.5 1e1,+2E0 3.5.6l1-2 3,4', 0.01)).toEqual([{
      points: [{ x: 0.5, y: -0.5 }, { x: 10, y: 2 }, { x: 3.5, y: 0.6 }, { x: 4.5, y: -1.4 }, { x: 7.5, y: 2.6 }],
      closed: false,
    }]);
  });

  it('keeps separate subpaths and resumes from the correct closed start', () => {
    expect(flattenSvgPath('M1 2L3 4Z m10 20l1 1 M30 40h2v3z l5 0', 0.01)).toEqual([
      { points: [{ x: 1, y: 2 }, { x: 3, y: 4 }], closed: true },
      { points: [{ x: 11, y: 22 }, { x: 12, y: 23 }], closed: false },
      { points: [{ x: 30, y: 40 }, { x: 32, y: 40 }, { x: 32, y: 43 }], closed: true },
      { points: [{ x: 30, y: 40 }, { x: 35, y: 40 }], closed: false },
    ]);
    expect(flattenSvgPath(' \t\r\n', 0.01)).toEqual([]);
  });

  it('interprets relative curve controls from the unchanged segment origin', () => {
    const relative = 'M10 20c1 2 3 4 5 6 2 3 4 5 6 7s2 3 4 5q1 2 3 4t5 6a5 6 30 0 1 7 8';
    const absolute = 'M10 20C11 22 13 24 15 26 17 29 19 31 21 33S23 36 25 38Q26 40 28 42T33 48A5 6 30 0 1 40 56';
    expect(flattenSvgPath(relative, 0.01)).toEqual(flattenSvgPath(absolute, 0.01));
  });

  it('reflects successive smooth cubic and quadratic controls', () => {
    expect(flattenSvgPath('M0 0C1 2 2 2 3 0S5-2 6 0 8 2 9 0', 0.01))
      .toEqual(flattenSvgPath('M0 0C1 2 2 2 3 0C4-2 5-2 6 0C7 2 8 2 9 0', 0.01));
    expect(flattenSvgPath('M0 0Q1 2 2 0T4 0 6 0', 0.01))
      .toEqual(flattenSvgPath('M0 0Q1 2 2 0Q3-2 4 0Q5 2 6 0', 0.01));
  });

  it('resets reflection across nonmatching curves, lines, arcs, moves and closes', () => {
    const cases = [
      ['M0 0C1 2 2 2 3 0L4 0S5 2 6 0', 'M0 0C1 2 2 2 3 0L4 0C4 0 5 2 6 0'],
      ['M0 0Q1 2 2 0H3T4 0', 'M0 0Q1 2 2 0H3Q3 0 4 0'],
      ['M0 0Q1 2 2 0V3T4 0', 'M0 0Q1 2 2 0V3Q2 3 4 0'],
      ['M0 0C1 2 2 2 3 0Q4 2 5 0S6 2 7 0', 'M0 0C1 2 2 2 3 0Q4 2 5 0C5 0 6 2 7 0'],
      ['M0 0Q1 2 2 0C3 2 4 2 5 0T6 0', 'M0 0Q1 2 2 0C3 2 4 2 5 0Q5 0 6 0'],
      ['M0 0Q1 2 2 0A2 2 0 0 1 4 0T6 0', 'M0 0Q1 2 2 0A2 2 0 0 1 4 0Q4 0 6 0'],
      ['M0 0Q1 2 2 0M4 0T6 0', 'M0 0Q1 2 2 0M4 0Q4 0 6 0'],
      ['M0 0C1 2 2 2 3 0ZS5 2 6 0', 'M0 0C1 2 2 2 3 0ZC0 0 5 2 6 0'],
    ];
    for (const [smooth, explicit] of cases) expect(flattenSvgPath(smooth, 0.01)).toEqual(flattenSvgPath(explicit, 0.01));
  });

  it('bounds quadratic and inflected cubic deviation rather than sampling a fixed count', () => {
    expectCurveWithin('M0 0Q5 20 10 0', (t) => ({ x: 10 * t, y: 40 * (1 - t) * t }), 0.001);
    expectCurveWithin('M0 0C0 20 10-20 10 0', (t) => ({
      x: 30 * (1 - t) * t * t + 10 * t ** 3,
      y: 60 * (1 - t) ** 2 * t - 60 * (1 - t) * t * t,
    }), 0.001);
  });

  it('retains collinear overshoot and closed cubic loops', () => {
    expectCurveWithin('M0 0Q20 0 1 0', (t) => ({ x: 40 * (1 - t) * t + t * t, y: 0 }), 0.001);
    expectCurveWithin('M0 0C20 0-20 0 1 0', (t) => ({
      x: 60 * (1 - t) ** 2 * t - 60 * (1 - t) * t * t + t ** 3, y: 0,
    }), 0.001);
    expectCurveWithin('M0 0C10 20-10 20 0 0', (t) => ({
      x: 30 * (1 - t) ** 2 * t - 30 * (1 - t) * t * t, y: 60 * (1 - t) * t,
    }), 0.001);
  });

  it('bounds rotated eccentric ellipses for both sweep directions and large arcs', () => {
    const phi = Math.PI / 6;
    const ellipse = (angle: number): Point => ({
      x: 7 + 20 * Math.cos(angle) * Math.cos(phi) - 2 * Math.sin(angle) * Math.sin(phi),
      y: -3 + 20 * Math.cos(angle) * Math.sin(phi) + 2 * Math.sin(angle) * Math.cos(phi),
    });
    const a = ellipse(0);
    for (const delta of [Math.PI / 2, -Math.PI / 2, 3 * Math.PI / 2, -3 * Math.PI / 2]) {
      const b = ellipse(delta);
      const path = `M${a.x} ${a.y}A20 2 30 ${Math.abs(delta) > Math.PI ? 1 : 0} ${delta > 0 ? 1 : 0} ${b.x} ${b.y}`;
      expectCurveWithin(path, (t) => ellipse(t * delta), 0.001);
    }
  });

  it('corrects undersized and negative radii and accepts compact arc flags', () => {
    expectCurveWithin('M0 0A1 1 0 0 1 10 0', (t) => ({ x: 5 - 5 * Math.cos(Math.PI * t), y: -5 * Math.sin(Math.PI * t) }), 0.001);
    expect(flattenSvgPath('M0 0A-5-3 20 0110 0', 0.01))
      .toEqual(flattenSvgPath('M0 0A5 3 20 0 1 10 0', 0.01));
  });

  it('turns zero-radius arcs into lines and omits coincident endpoint arcs', () => {
    expect(flattenSvgPath('M1 2A0 5 30 0 1 3 4A5 0 30 1 0 5 6A4 3 0 1 1 5 6', 0.01)).toEqual([{
      points: [{ x: 1, y: 2 }, { x: 3, y: 4 }, { x: 5, y: 6 }], closed: false,
    }]);
  });

  it('rejects malformed input instead of dropping commands or incomplete geometry', () => {
    const malformed = [
      'L1 2', 'Z', 'M', 'M0', 'M0 0L1', 'M0 0C1 2 3 4 5', 'M0 0Q1 2 3',
      'M0 0A1 2 3 0 1 4', 'M0 0A1 2 3 2 1 4 5', 'M0 0A1 2 3 0 -1 4 5',
      'M0 0A1 2 3 0 1.0 4 5', 'M0 0R1 2', 'M0 0 hello', 'M0 0LNaN 1',
      'M0 0LInfinity 1', 'M0 0L1e999 1', 'M0 0L1e- 2', 'M,0 0', 'M0,,0',
      'M0 0,', 'M0 0,L1 2', 'M0 0L,1 2', 'M0 0Z1 2', 'M0 0;',
      'M1e308 0l1e308 0',
    ];
    for (const path of malformed) expect(() => flattenSvgPath(path, 0.01)).toThrow();
    for (const tolerance of [0, -1, NaN, Infinity]) expect(() => flattenSvgPath('', tolerance)).toThrow();
  });

  it('throws when precision or output bounds cannot be satisfied', () => {
    expect(() => flattenSvgPath('M0 0Q0 1 1 0', Number.MIN_VALUE)).toThrow(/depth|limit/);
    expect(() => flattenSvgPath('M0 0A1 1 0 0 1 2 0', 1e-20)).toThrow(/limit/);
  });
});
