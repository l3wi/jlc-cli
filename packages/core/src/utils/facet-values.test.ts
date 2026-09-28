import { describe, expect, it } from 'bun:test';

import type { ComponentFilterAttribute } from '../types/index.js';
import { baseUnitOf, parseFilterValueNumbers } from './facet-values.js';

const AMPS = { fA: 1e-15, pA: 1e-12, nA: 1e-9, uA: 1e-6, mA: 0.001, A: 1 };

describe('parseFilterValueNumbers', () => {
  it('parses scalars with and without a unit into base units', () => {
    expect(parseFilterValueNumbers('1A', AMPS)).toEqual([1]);
    expect(parseFilterValueNumbers('800mA', AMPS)).toEqual([0.8]);
    expect(parseFilterValueNumbers('2.5', AMPS)).toEqual([2.5]);
  });

  it('parses ranges, multi-value cells and measurement qualifiers', () => {
    expect(parseFilterValueNumbers('1.25V~12V', { V: 1 })).toEqual([1.25, 12]);
    // signed bounds, as JLCPCB writes temperature ranges
    expect(parseFilterValueNumbers('-10℃~+110℃', { '℃': 1 })).toEqual([-10, 110]);
    // CJK enumeration comma: multi-value cells, one number per part
    expect(parseFilterValueNumbers('1A、2A', AMPS)).toEqual([1, 2]);
    // measurement condition suffix is not part of the value
    expect(parseFilterValueNumbers('-10℃~+110℃@(Tj)', { '℃': 1 })).toEqual([-10, 110]);
    expect(parseFilterValueNumbers('150℃@(Tj)', { '℃': 1 })).toEqual([150]);
  });

  it('returns undefined when a value carries no parseable number', () => {
    expect(parseFilterValueNumbers('-', AMPS)).toBeUndefined();
    expect(parseFilterValueNumbers('Adjustable', AMPS)).toBeUndefined();
  });
});

describe('baseUnitOf', () => {
  const facet: ComponentFilterAttribute = {
    name: 'Output Current',
    docCount: 1,
    kind: 'range',
    unitConversionMap: AMPS,
    unitList: ['fA', 'pA', 'nA', 'uA', 'mA', 'A', 'kA'],
    values: [],
  };

  it('picks the conversion factor of 1 rather than the first unit', () => {
    expect(baseUnitOf(facet)).toBe('A');
    expect(baseUnitOf({ name: 'x', docCount: 0, kind: 'enum', values: [] })).toBeUndefined();
  });
});
