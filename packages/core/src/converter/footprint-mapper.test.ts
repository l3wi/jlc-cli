import { describe, expect, it } from 'bun:test';
import {
  mapToKicadFootprint,
  getExpectedPadCount,
  getKicadFootprintRef,
  isStandardPassive,
} from './footprint-mapper.js';

describe('mapToKicadFootprint', () => {
  describe('2-pad passives (should use built-in)', () => {
    it('maps 0603 resistor to KiCad built-in', () => {
      const result = mapToKicadFootprint('0603', 'R');
      expect(result).toEqual({
        library: 'Resistor_SMD',
        footprint: 'R_0603_1608Metric',
      });
    });

    it('maps 0805 capacitor to KiCad built-in', () => {
      const result = mapToKicadFootprint('0805', 'C');
      expect(result).toEqual({
        library: 'Capacitor_SMD',
        footprint: 'C_0805_2012Metric',
      });
    });

    it('maps 1206 inductor to KiCad built-in', () => {
      const result = mapToKicadFootprint('1206', 'L');
      expect(result).toEqual({
        library: 'Inductor_SMD',
        footprint: 'L_1206_3216Metric',
      });
    });

    it('handles SMD prefix in package name', () => {
      const result = mapToKicadFootprint('SMD0402', 'R');
      expect(result).toEqual({
        library: 'Resistor_SMD',
        footprint: 'R_0402_1005Metric',
      });
    });


    it('handles lowercase prefix', () => {
      const result = mapToKicadFootprint('0603', 'r');
      expect(result).toEqual({
        library: 'Resistor_SMD',
        footprint: 'R_0603_1608Metric',
      });
    });
  });

  describe('non-passives (should return null for custom generation)', () => {
    it('returns null for SOT-23 transistor', () => {
      const result = mapToKicadFootprint('SOT-23', 'Q');
      expect(result).toBeNull();
    });

    it('returns null for SOIC-8 IC', () => {
      const result = mapToKicadFootprint('SOIC-8', 'U');
      expect(result).toBeNull();
    });

    it('returns null for TSSOP-16 IC', () => {
      const result = mapToKicadFootprint('TSSOP-16', 'U');
      expect(result).toBeNull();
    });

    it('returns null for SOD-123 diode', () => {
      const result = mapToKicadFootprint('SOD-123', 'D');
      expect(result).toBeNull();
    });

    it('returns null for LED', () => {
      const result = mapToKicadFootprint('0603', 'LED');
      expect(result).toBeNull();
    });

    it('returns null for diode even with SMD size', () => {
      const result = mapToKicadFootprint('0805', 'D');
      expect(result).toBeNull();
    });
  });

  describe('edge cases', () => {
    it('returns null for unknown package', () => {
      const result = mapToKicadFootprint('CUSTOM-PKG', 'R');
      expect(result).toBeNull();
    });

    it('rejects polarized capacitor metadata despite a chip-size name', () => {
      expect(mapToKicadFootprint('1206', 'C?', 'Tantalum Capacitors')).toBeNull();
      expect(mapToKicadFootprint('1206', 'C', undefined, 'Polarized capacitor')).toBeNull();
    });

    it('normalizes EasyEDA designators and checks metric decorations', () => {
      expect(mapToKicadFootprint('C0603', 'C?')?.footprint).toBe('C_0603_1608Metric');
      expect(mapToKicadFootprint('R_0603_1608Metric', 'R?')?.footprint).toBe('R_0603_1608Metric');
      expect(mapToKicadFootprint('0603(1608)', 'R')?.footprint).toBe('R_0603_1608Metric');
      expect(mapToKicadFootprint('0603(1005)', 'R')).toBeNull();
    });

    it('rejects ambiguous metric codes, embedded sizes and conflicting package identities', () => {
      for (const name of ['C0603Metric', 'C10603', 'LED0805-RD', 'CUSTOM-0603', 'R0603']) {
        expect(mapToKicadFootprint(name, 'C')).toBeNull();
        expect(isStandardPassive(name, 'C')).toBe(false);
      }
    });

    it('does not return nonexistent capacitor library entries', () => {
      expect(mapToKicadFootprint('2010', 'C')).toBeNull();
      expect(mapToKicadFootprint('2512', 'C')).toBeNull();
      expect(mapToKicadFootprint('2512', 'R')?.footprint).toBe('R_2512_6332Metric');
    });
  });
});

describe('getExpectedPadCount', () => {
  it('returns 2 for resistor footprint', () => {
    const mapping = { library: 'Resistor_SMD', footprint: 'R_0603_1608Metric' };
    expect(getExpectedPadCount(mapping)).toBe(2);
  });

  it('returns 2 for capacitor footprint', () => {
    const mapping = { library: 'Capacitor_SMD', footprint: 'C_0805_2012Metric' };
    expect(getExpectedPadCount(mapping)).toBe(2);
  });

  it('returns 2 for inductor footprint', () => {
    const mapping = { library: 'Inductor_SMD', footprint: 'L_1206_3216Metric' };
    expect(getExpectedPadCount(mapping)).toBe(2);
  });

  it('returns null for unknown library', () => {
    const mapping = { library: 'Custom_Lib', footprint: 'CUSTOM-PKG' };
    expect(getExpectedPadCount(mapping)).toBeNull();
  });
});

describe('getKicadFootprintRef', () => {
  it('formats library:footprint reference', () => {
    const mapping = { library: 'Resistor_SMD', footprint: 'R_0603_1608Metric' };
    expect(getKicadFootprintRef(mapping)).toBe('Resistor_SMD:R_0603_1608Metric');
  });
});

describe('isStandardPassive', () => {
  it('returns true for R prefix with SMD size', () => {
    expect(isStandardPassive('0603', 'R')).toBe(true);
  });

  it('returns true for C prefix with SMD size', () => {
    expect(isStandardPassive('0805', 'C')).toBe(true);
  });

  it('returns true for L prefix with SMD size', () => {
    expect(isStandardPassive('1206', 'L')).toBe(true);
  });

  it('returns false for Q prefix', () => {
    expect(isStandardPassive('SOT-23', 'Q')).toBe(false);
  });

  it('returns false for U prefix', () => {
    expect(isStandardPassive('SOIC-8', 'U')).toBe(false);
  });

  it('returns false for unknown package size', () => {
    expect(isStandardPassive('CUSTOM-PKG', 'R')).toBe(false);
  });
});
