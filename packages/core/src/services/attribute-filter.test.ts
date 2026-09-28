import { describe, expect, it } from 'bun:test';

import type { ComponentFilterAttribute, ComponentFilterValue } from '../types/index.js';
import { resolveAttributeQuery } from './attribute-filter.js';
import { parseFilterValueNumbers } from '../utils/facet-values.js';

const AMPS = { fA: 1e-15, pA: 1e-12, nA: 1e-9, uA: 1e-6, mA: 0.001, A: 1, kA: 1000 };

function value(raw: string, docCount: number): ComponentFilterValue {
  return { value: raw, docCount, numbers: parseFilterValueNumbers(raw, AMPS) };
}

/** Bucket names and counts copied from the live LDO type (2956) facet response */
const outputCurrent: ComponentFilterAttribute = {
  name: 'Output Current',
  docCount: 58111,
  kind: 'range',
  unit: 'A',
  unitConversionMap: AMPS,
  unitList: Object.keys(AMPS),
  values: [
    { value: '-', docCount: 6433 },
    value('500mA', 900),
    value('800mA', 300),
    value('1A', 5125),
    value('1A、2A', 26),
    value('1.5A', 1881),
    value('3A', 340),
  ],
};

describe('resolveAttributeQuery', () => {
  it('selects every value the part can reach at least, in the requested unit', () => {
    const resolution = resolveAttributeQuery(outputCurrent, { attribute: 'Output Current', min: 1, unit: 'A' });

    expect(resolution.values).toEqual(['1A', '1A、2A', '1.5A', '3A']);
    expect(resolution.predictedTotal).toBe(5125 + 26 + 1881 + 340);
    expect(resolution.appliedBounds).toEqual({ min: 1, max: undefined, unit: 'A' });
    // non-numeric buckets cannot prove a capability, so they are excluded
    expect(resolution.values).not.toContain('-');
  });

  it('converts bounds from the requested unit into the attribute base unit', () => {
    const ma = resolveAttributeQuery(outputCurrent, { attribute: 'Output Current', min: 1000, unit: 'mA' });
    expect(ma.appliedBounds).toEqual({ min: 1, max: undefined, unit: 'A' });
    expect(ma.values).toEqual(['1A', '1A、2A', '1.5A', '3A']);

    const ka = resolveAttributeQuery(outputCurrent, { attribute: 'Output Current', min: 0.001, unit: 'kA' });
    expect(ka.values).toEqual(['1A', '1A、2A', '1.5A', '3A']);
  });

  it('uses the max bound for requirements at the low end', () => {
    const resolution = resolveAttributeQuery(outputCurrent, { attribute: 'Output Current', max: 1 });
    expect(resolution.values).toEqual(['500mA', '800mA', '1A', '1A、2A']);
    expect(resolution.values).not.toContain('1.5A');
  });

  it('matches exact vocabulary values and reports the ones that do not exist', () => {
    const resolution = resolveAttributeQuery(outputCurrent, {
      attribute: 'Output Current',
      values: ['1A', '1000mA', '1a'],
    });

    expect(resolution.values).toEqual(['1A']);
    expect(resolution.unmatchedValues).toEqual(['1000mA', '1a']);
    expect(resolution.predictedTotal).toBe(5125);
  });

  it('keeps non-numeric buckets when only exact values are requested', () => {
    const resolution = resolveAttributeQuery(outputCurrent, { attribute: 'Output Current', values: ['-'] });
    expect(resolution.values).toEqual(['-']);
    expect(resolution.predictedTotal).toBe(6433);
  });

  it('rejects a unit the attribute does not define', () => {
    expect(() =>
      resolveAttributeQuery(outputCurrent, { attribute: 'Output Current', min: 1, unit: 'kg' })
    ).toThrow(/Unknown unit "kg" for attribute "Output Current"/);
  });

  it('selects nothing without values or bounds', () => {
    const resolution = resolveAttributeQuery(outputCurrent, { attribute: 'Output Current' });
    expect(resolution).toMatchObject({ values: [], predictedTotal: 0, unmatchedValues: [] });
  });
});
