import { describe, expect, it } from 'bun:test';

import { extractDisplayValue, normalizeValue } from './value-normalizer.js';

describe('capacitor value extraction', () => {
  it('finds capacitance after voltage and package fields and retains the voltage rating', () => {
    expect(normalizeValue('50V 100nF', 'capacitor')).toMatchObject({
      displayValue: '100n/50V', params: { value: '100n', voltage: '50V' },
    });
    expect(extractDisplayValue('GRM188R', '0603 X7R 6.3V 4.7µF ±10%', 'C')).toBe('4.7u/6.3V');
  });

  it('prefers explicit farad units to an earlier unit-like shorthand token', () => {
    expect(normalizeValue('2m pitch 100nF 50V', 'capacitor').displayValue).toBe('100n/50V');
  });

  it('preserves supported capacitance unit and shorthand encodings', () => {
    expect(normalizeValue('1000uF/16V', 'capacitor').displayValue).toBe('1000u/16V');
    expect(normalizeValue('10μF', 'capacitor').displayValue).toBe('10u');
    expect(normalizeValue('100n 50V', 'capacitor').displayValue).toBe('100n/50V');
    expect(normalizeValue('1F 5V', 'capacitor').displayValue).toBe('1/5V');
  });

  it('does not interpret voltage, package or part-number digits as capacitance', () => {
    expect(normalizeValue('0603 50V X7R', 'capacitor').displayValue).toBe('0603 50V X7R');
    expect(extractDisplayValue('100nF', ' 0603 50V X7R ', 'C')).toBe('100n');
    expect(extractDisplayValue('GRM188R', '0603 50V X7R', 'C')).toBe('GRM188R');
    expect(normalizeValue('C100NF1 50V', 'capacitor').displayValue).toBe('C100NF1 50V');
  });

  it('uses a valid description even when it is already normalized', () => {
    expect(extractDisplayValue('GRM188R', '100n', 'C')).toBe('100n');
  });
});
