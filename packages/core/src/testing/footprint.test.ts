/**
 * Footprint Validation Tests
 *
 * Compares generated KiCad footprints against JLCPCB/EasyEDA reference SVGs
 *
 * Run with: bun test packages/core/src/testing/footprint.test.ts
 */

import { describe, it, expect, beforeAll } from 'bun:test';
import { easyedaClient } from '../api/easyeda.js';
import { footprintConverter } from '../converter/footprint.js';
import { fetchReferenceSVG } from './reference-fetcher.js';
import {
  extractFromReferenceSVG,
  extractFromKiCadFootprint,
  compareFootprints,
  formatComparisonResult,
} from './footprint-comparator.js';
import { TEST_CATEGORIES, getAllTestComponents } from './fixtures.js';
import type { TestComponent, ValidationResult } from './types.js';

// Timeout for API calls (ms)
const API_TIMEOUT = 30000;

// Store validation results for reporting
const validationResults: ValidationResult[] = [];

/**
 * Validate a single component's footprint
 */
async function validateFootprint(
  component: TestComponent
): Promise<ValidationResult> {
  const startTime = Date.now();

  try {
    // 1. Fetch reference SVG from JLCPCB
    const reference = await fetchReferenceSVG(component.lcsc);
    if (!reference.footprintSvg) {
      return {
        lcscCode: component.lcsc,
        componentName: component.name,
        passed: false,
        footprint: null,
        symbol: null,
        timestamp: new Date(),
        durationMs: Date.now() - startTime,
        error: 'No footprint SVG available from JLCPCB',
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
    const kicadContent = footprintConverter.convert(componentData, {});

    // 4. Extract data from both sources
    const referenceData = extractFromReferenceSVG(reference.footprintSvg);
    const generatedData = extractFromKiCadFootprint(kicadContent);

    // 5. Compare
    // Note: Position validation is currently imprecise due to different
    // coordinate origins between reference SVG and KiCad output.
    // The reference uses viewBox-relative coords, KiCad uses centroid-based.
    // For now, we focus on pad count and report position differences as warnings.
    const comparison = compareFootprints(referenceData, generatedData, {
      sizeWarningsOnly: true, // Size differences are often acceptable
      positionTolerance: 50, // Very lenient for now - validates structure not exact position
    });

    return {
      lcscCode: component.lcsc,
      componentName: component.name,
      passed: comparison.passed,
      footprint: comparison,
      symbol: null,
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

describe('Footprint Validation', () => {
  // Run tests for each category
  for (const category of TEST_CATEGORIES) {
    describe(category.name, () => {
      for (const component of category.components) {
        // Skip components marked for skip
        const testFn = component.skip ? it.skip : it;

        testFn(
          `${component.lcsc} - ${component.name}`,
          async () => {
            const result = await validateFootprint(component);
            validationResults.push(result);

            // Log result for debugging
            if (!result.passed) {
              console.log(`\n[${component.lcsc}] ${component.name}`);
              if (result.error) {
                console.log(`  Error: ${result.error}`);
              } else if (result.footprint) {
                console.log(formatComparisonResult(result.footprint));
              }
            }

            // Assertions
            expect(result.error).toBeUndefined();

            if (result.footprint) {
              // Pad count should match
              expect(result.footprint.padCountMatch).toBe(true);

              // If expected pad count is specified, verify it
              if (component.expectedPadCount !== undefined) {
                expect(result.footprint.generatedPadCount).toBe(
                  component.expectedPadCount
                );
              }

              // Log any warnings for visibility
              if (result.footprint.warnings.length > 0) {
                console.log(`  Warnings: ${result.footprint.warnings.length}`);
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
// Quick Validation Tests (subset for CI)
// =============================================================================

describe('Quick Validation (CI)', () => {
  // Test a small representative sample of components with known good reference SVGs
  const quickTestComponents = [
    { lcsc: 'C25076', name: '0402 Capacitor' },
    { lcsc: 'C25111', name: '0603 Resistor' },
    { lcsc: 'C22467599', name: 'MicroSD Socket' },
  ];

  for (const component of quickTestComponents) {
    it(
      `${component.name} (${component.lcsc})`,
      async () => {
        const testComp: TestComponent = {
          lcsc: component.lcsc,
          name: component.name,
          features: [],
        };

        const result = await validateFootprint(testComp);

        expect(result.error).toBeUndefined();
        if (result.footprint) {
          expect(result.footprint.padCountMatch).toBe(true);
        }
      },
      API_TIMEOUT
    );
  }
});

// =============================================================================
// Unit Tests for Comparator Functions
// =============================================================================

describe('Footprint Comparator', () => {
  describe('extractFromKiCadFootprint', () => {
    it('extracts SMD pads', () => {
      const sexp = `
        (footprint "Test"
          (pad "1" smd rect (at 0 0) (size 1.0 0.5) (layers "F.Cu"))
          (pad "2" smd rect (at 1.27 0) (size 1.0 0.5) (layers "F.Cu"))
        )
      `;

      const data = extractFromKiCadFootprint(sexp);

      expect(data.pads).toHaveLength(2);
      expect(data.pads[0].number).toBe('1');
      expect(data.pads[0].x).toBe(0);
      expect(data.pads[0].y).toBe(0);
      expect(data.pads[0].width).toBe(1.0);
      expect(data.pads[0].height).toBe(0.5);
      expect(data.pads[0].hasHole).toBe(false);
    });

    it('extracts THT pads', () => {
      const sexp = `
        (footprint "Test"
          (pad "1" thru_hole circle (at 0 0) (size 1.8 1.8) (drill 1.0) (layers "*.Cu"))
          (pad "2" thru_hole circle (at 2.54 0) (size 1.8 1.8) (drill 1.0) (layers "*.Cu"))
        )
      `;

      const data = extractFromKiCadFootprint(sexp);

      expect(data.pads).toHaveLength(2);
      expect(data.pads[0].hasHole).toBe(true);
      expect(data.pads[0].holeRadius).toBe(0.5);
      expect(data.pads[0].layerId).toBe(11); // Multi-layer
    });

    it('extracts vias (empty pad number)', () => {
      const sexp = `
        (footprint "Test"
          (pad "" thru_hole circle (at 0 0) (size 0.6 0.6) (drill 0.3) (layers "*.Cu"))
        )
      `;

      const data = extractFromKiCadFootprint(sexp);

      expect(data.pads).toHaveLength(0); // Vias should be separate
      expect(data.vias).toHaveLength(1);
      expect(data.vias[0].outerDiameter).toBe(0.6);
      expect(data.vias[0].holeDiameter).toBe(0.3);
    });
  });

  describe('compareFootprints', () => {
    it('passes when pads match', () => {
      const reference = {
        pads: [
          { number: '1', x: 0, y: 0, width: 1.0, height: 0.5, shape: 'rect' as const, layerId: 1, hasHole: false },
          { number: '2', x: 1.27, y: 0, width: 1.0, height: 0.5, shape: 'rect' as const, layerId: 1, hasHole: false },
        ],
        vias: [],
        holes: [],
        bounds: { minX: 0, maxX: 1.27, minY: 0, maxY: 0 },
      };

      const generated = {
        pads: [
          { number: '1', x: 0, y: 0, width: 1.0, height: 0.5, shape: 'rect' as const, layerId: 1, hasHole: false },
          { number: '2', x: 1.27, y: 0, width: 1.0, height: 0.5, shape: 'rect' as const, layerId: 1, hasHole: false },
        ],
        vias: [],
        holes: [],
        bounds: { minX: 0, maxX: 1.27, minY: 0, maxY: 0 },
      };

      const result = compareFootprints(reference, generated);

      expect(result.passed).toBe(true);
      expect(result.padCountMatch).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('fails when pad count differs', () => {
      const reference = {
        pads: [
          { number: '1', x: 0, y: 0, width: 1.0, height: 0.5, shape: 'rect' as const, layerId: 1, hasHole: false },
        ],
        vias: [],
        holes: [],
        bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      };

      const generated = {
        pads: [
          { number: '1', x: 0, y: 0, width: 1.0, height: 0.5, shape: 'rect' as const, layerId: 1, hasHole: false },
          { number: '2', x: 1.27, y: 0, width: 1.0, height: 0.5, shape: 'rect' as const, layerId: 1, hasHole: false },
        ],
        vias: [],
        holes: [],
        bounds: { minX: 0, maxX: 1.27, minY: 0, maxY: 0 },
      };

      const result = compareFootprints(reference, generated);

      expect(result.passed).toBe(false);
      expect(result.padCountMatch).toBe(false);
    });

    it('detects position differences', () => {
      const reference = {
        pads: [
          { number: '1', x: 0, y: 0, width: 1.0, height: 0.5, shape: 'rect' as const, layerId: 1, hasHole: false },
        ],
        vias: [],
        holes: [],
        bounds: { minX: 0, maxX: 0, minY: 0, maxY: 0 },
      };

      const generated = {
        pads: [
          { number: '1', x: 0.1, y: 0.1, width: 1.0, height: 0.5, shape: 'rect' as const, layerId: 1, hasHole: false },
        ],
        vias: [],
        holes: [],
        bounds: { minX: 0.1, maxX: 0.1, minY: 0.1, maxY: 0.1 },
      };

      const result = compareFootprints(reference, generated, { positionTolerance: 0.05 });

      expect(result.passed).toBe(false);
      expect(result.errors.some((e) => e.field === 'position')).toBe(true);
    });
  });
});
