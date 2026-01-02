/**
 * Symbol Validation Tests
 *
 * Compares generated KiCad symbols against JLCPCB/EasyEDA reference SVGs
 *
 * Run with: bun test packages/core/src/testing/symbol.test.ts
 */

import { describe, it, expect } from 'bun:test';
import { easyedaClient } from '../api/easyeda.js';
import { symbolConverter } from '../converter/symbol.js';
import { fetchReferenceSVG } from './reference-fetcher.js';
import {
  extractFromReferenceSVG,
  extractFromKiCadSymbol,
  compareSymbols,
  formatSymbolComparisonResult,
} from './symbol-comparator.js';
import { TEST_CATEGORIES } from './fixtures.js';
import type { TestComponent, ValidationResult } from './types.js';

// Timeout for API calls (ms)
const API_TIMEOUT = 30000;

/**
 * Validate a single component's symbol
 */
async function validateSymbol(component: TestComponent): Promise<ValidationResult> {
  const startTime = Date.now();

  try {
    // 1. Fetch reference SVG from JLCPCB
    const reference = await fetchReferenceSVG(component.lcsc);
    if (!reference.symbolSvg) {
      return {
        lcscCode: component.lcsc,
        componentName: component.name,
        passed: false,
        footprint: null,
        symbol: null,
        timestamp: new Date(),
        durationMs: Date.now() - startTime,
        error: 'No symbol SVG available from JLCPCB',
      };
    }

    // 2. Fetch component data from EasyEDA
    const componentData = await easyedaClient.getComponentData(component.lcsc);
    if (!componentData) {
      return {
        lcscCode: component.lcsc,
        componentName: component.name,
        passed: false,
        footprint: null,
        symbol: null,
        timestamp: new Date(),
        durationMs: Date.now() - startTime,
        error: 'Failed to fetch component data from EasyEDA',
      };
    }

    // 3. Convert to KiCad format
    const kicadContent = symbolConverter.convert(componentData, {
      symbolName: component.name,
    });

    // 4. Extract data from both sources
    const referenceData = extractFromReferenceSVG(reference.symbolSvg);
    const generatedData = extractFromKiCadSymbol(kicadContent);

    // 5. Compare (with lenient tolerance for coordinate differences)
    const comparison = compareSymbols(referenceData, generatedData, {
      positionTolerance: 50, // Very lenient for symbols
      ignorePinNames: false,
    });

    return {
      lcscCode: component.lcsc,
      componentName: component.name,
      passed: comparison.passed,
      footprint: null,
      symbol: comparison,
      timestamp: new Date(),
      durationMs: Date.now() - startTime,
    };
  } catch (error) {
    return {
      lcscCode: component.lcsc,
      componentName: component.name,
      passed: false,
      footprint: null,
      symbol: null,
      timestamp: new Date(),
      durationMs: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

// =============================================================================
// Test Suites by Category
// =============================================================================

describe('Symbol Validation', () => {
  // Run tests for each category
  for (const category of TEST_CATEGORIES) {
    describe(category.name, () => {
      for (const component of category.components) {
        // Skip components marked for skip
        const testFn = component.skip ? it.skip : it;

        testFn(
          `${component.lcsc} - ${component.name}`,
          async () => {
            const result = await validateSymbol(component);

            // Log result for debugging
            if (!result.passed) {
              console.log(`\n[${component.lcsc}] ${component.name}`);
              if (result.error) {
                console.log(`  Error: ${result.error}`);
              } else if (result.symbol) {
                console.log(formatSymbolComparisonResult(result.symbol));
              }
            }

            // Assertions
            expect(result.error).toBeUndefined();

            if (result.symbol) {
              // Pin count should match
              expect(result.symbol.pinCountMatch).toBe(true);

              // If expected pin count is specified, verify it
              if (component.expectedPinCount !== undefined) {
                expect(result.symbol.generatedPinCount).toBe(component.expectedPinCount);
              }

              // Log any warnings for visibility
              if (result.symbol.warnings.length > 0) {
                console.log(`  Warnings: ${result.symbol.warnings.length}`);
              }
            }
          },
          API_TIMEOUT
        );
      }
    });
  }
});

// =============================================================================
// Unit Tests for Comparator Functions
// =============================================================================

describe('Symbol Comparator', () => {
  describe('extractFromKiCadSymbol', () => {
    it('extracts basic pins', () => {
      const sexp = `
        (symbol "TEST"
          (pin input line (at -5.08 2.54 0) (length 2.54)
            (name "IN") (number "1"))
          (pin output line (at 5.08 2.54 180) (length 2.54)
            (name "OUT") (number "2"))
        )
      `;

      const data = extractFromKiCadSymbol(sexp);

      expect(data.pins).toHaveLength(2);
      expect(data.pins[0].number).toBe('1');
      expect(data.pins[0].name).toBe('IN');
      expect(data.pins[0].electrical).toBe('input');
      expect(data.pins[1].number).toBe('2');
      expect(data.pins[1].name).toBe('OUT');
      expect(data.pins[1].electrical).toBe('output');
    });

    it('extracts power pins', () => {
      const sexp = `
        (symbol "TEST"
          (pin power_in line (at 0 5.08 270) (length 2.54)
            (name "VCC") (number "3"))
          (pin power_in line (at 0 -5.08 90) (length 2.54)
            (name "GND") (number "4"))
        )
      `;

      const data = extractFromKiCadSymbol(sexp);

      expect(data.pins).toHaveLength(2);
      expect(data.pins[0].name).toBe('VCC');
      expect(data.pins[0].electrical).toBe('power_in');
      expect(data.pins[1].name).toBe('GND');
      expect(data.pins[1].electrical).toBe('power_in');
    });
  });

  describe('compareSymbols', () => {
    it('passes when pins match', () => {
      const reference = {
        pins: [
          { number: '1', name: 'IN', x: 0, y: 0, rotation: 0, electrical: 'input' as const },
          { number: '2', name: 'OUT', x: 1, y: 0, rotation: 180, electrical: 'output' as const },
        ],
        bounds: { minX: 0, maxX: 1, minY: 0, maxY: 0 },
      };

      const generated = {
        pins: [
          { number: '1', name: 'IN', x: 0, y: 0, rotation: 0, electrical: 'input' as const },
          { number: '2', name: 'OUT', x: 1, y: 0, rotation: 180, electrical: 'output' as const },
        ],
        bounds: { minX: 0, maxX: 1, minY: 0, maxY: 0 },
      };

      const result = compareSymbols(reference, generated);

      expect(result.passed).toBe(true);
      expect(result.pinCountMatch).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails when pin count differs', () => {
      const reference = {
        pins: [{ number: '1', name: 'IN', x: 0, y: 0, rotation: 0, electrical: 'input' as const }],
        bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      };

      const generated = {
        pins: [
          { number: '1', name: 'IN', x: 0, y: 0, rotation: 0, electrical: 'input' as const },
          { number: '2', name: 'OUT', x: 1, y: 0, rotation: 0, electrical: 'output' as const },
        ],
        bounds: { minX: 0, maxX: 1, minY: 0, maxY: 0 },
      };

      const result = compareSymbols(reference, generated);

      expect(result.passed).toBe(false);
      expect(result.pinCountMatch).toBe(false);
    });

    it('detects missing pins', () => {
      const reference = {
        pins: [
          { number: '1', name: 'A', x: 0, y: 0, rotation: 0 },
          { number: '2', name: 'B', x: 1, y: 0, rotation: 0 },
        ],
        bounds: { minX: 0, maxX: 1, minY: 0, maxY: 0 },
      };

      const generated = {
        pins: [{ number: '1', name: 'A', x: 0, y: 0, rotation: 0 }],
        bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      };

      const result = compareSymbols(reference, generated);

      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.field === 'missing')).toBe(true);
    });
  });
});
