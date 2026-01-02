/**
 * Testing utilities for footprint/symbol validation
 *
 * @module testing
 */

// Types
export type {
  ComponentFeature,
  TestComponent,
  TestCategory,
  ReferenceSVG,
  PadShape,
  PadInfo,
  ViaInfo,
  HoleInfo,
  FootprintData,
  PinElectrical,
  PinInfo,
  SymbolData,
  DiffSeverity,
  PadDiff,
  PinDiff,
  FootprintComparisonResult,
  SymbolComparisonResult,
  ValidationResult,
  ComparisonOptions,
} from './types.js';

export { DEFAULT_COMPARISON_OPTIONS } from './types.js';

// Reference fetcher
export {
  fetchReferenceSVG,
  fetchReferenceSVGs,
  eeToMm,
  extractViewBox,
  hasFootprint,
  hasSymbol,
} from './reference-fetcher.js';

// Test fixtures
export {
  PASSIVES,
  THERMAL_PADS,
  CASTELLATED,
  CONNECTORS,
  THROUGH_HOLE,
  QFN_QFP,
  POWER,
  SPECIALTY,
  TEST_CATEGORIES,
  getAllTestComponents,
  getTestComponentsByCategory,
  getTestComponent,
  getCategoryNames,
} from './fixtures.js';

// Footprint comparator
export {
  extractFromReferenceSVG,
  extractFromKiCadFootprint,
  compareFootprints,
  formatComparisonResult,
} from './footprint-comparator.js';

// Symbol comparator
export {
  extractFromReferenceSVG as extractSymbolFromReferenceSVG,
  extractFromKiCadSymbol,
  compareSymbols,
  formatSymbolComparisonResult,
} from './symbol-comparator.js';

// HTML Reporter
export { generateValidationReport, generateBatchReport, type ReportSvgs } from './html-reporter.js';

// KiCad SVG Renderer (for generating our output as SVG)
export { renderSymbolSvg, renderFootprintSvg } from '../browser/kicad-renderer.js';
