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
    if (component.expectedMpn !== undefined && componentData.info.name !== component.expectedMpn) {
      throw new Error(`Fixture MPN differs: expected ${component.expectedMpn}, got ${componentData.info.name}`);
    }
    if (component.expectedPackage !== undefined && componentData.footprint.name !== component.expectedPackage) {
      throw new Error(`Fixture package differs: expected ${component.expectedPackage}, got ${componentData.footprint.name}`);
    }

    // 3. Convert to KiCad format
    const kicadContent = symbolConverter.convert(componentData, {
      symbolName: component.name,
    });

    // 4. Extract data from both sources
    const referenceData = extractFromReferenceSVG(reference.symbolSvg);
    const generatedData = extractFromKiCadSymbol(kicadContent);

    // Source geometry is checked strictly, including intentional template differences.
    const comparison = compareSymbols(referenceData, generatedData);

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
            const expectedErrors = [...(component.expectedSymbolErrors ?? [])];
            const byPinAndField = (a: { pinNumber: string; field: string }, b: { pinNumber: string; field: string }) =>
              `${a.pinNumber}:${a.field}`.localeCompare(`${b.pinNumber}:${b.field}`);

            // Log result for debugging
            if (result.error || result.passed !== (expectedErrors.length === 0)) {
              console.log(`\n[${component.lcsc}] ${component.name}`);
              if (result.error) {
                console.log(`  Error: ${result.error}`);
              } else if (result.symbol) {
                console.log(formatSymbolComparisonResult(result.symbol));
              }
            }

            // Assertions
            expect(result.error).toBeUndefined();
            expect(result.symbol).not.toBeNull();
            // Known source deficiencies and deliberate templates remain failures.
            // Assert exact error identities rather than tolerating arbitrary differences.
            expect(result.passed).toBe(expectedErrors.length === 0);
            const errors = [...result.symbol!.errors].sort(byPinAndField);
            expect(errors).toHaveLength(expectedErrors.length);
            expect(errors).toMatchObject(expectedErrors.sort(byPinAndField));

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
