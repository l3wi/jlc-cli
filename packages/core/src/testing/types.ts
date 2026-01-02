/**
 * Shared types for the footprint/symbol validation test suite
 */

// =============================================================================
// Test Fixture Types
// =============================================================================

export type ComponentFeature =
  | 'thermal'
  | 'vias'
  | 'castellated'
  | 'shield'
  | 'complex_pads'
  | 'tht'
  | 'smd'
  | 'fine_pitch'
  | 'high_pin_count'
  | 'antenna'
  | 'leds'
  | 'tab'
  | 'qfn'
  | 'qfp'
  | 'bga';

export interface TestComponent {
  /** LCSC part number (e.g., 'C22467599') */
  lcsc: string;
  /** Human-readable name */
  name: string;
  /** Features to test for this component */
  features: ComponentFeature[];
  /** Expected pad count (optional, for quick validation) */
  expectedPadCount?: number;
  /** Expected pin count for symbol (optional) */
  expectedPinCount?: number;
  /** Skip this component in CI (e.g., known issues) */
  skip?: boolean;
  /** Notes about this test case */
  notes?: string;
}

export interface TestCategory {
  name: string;
  description: string;
  components: TestComponent[];
}

// =============================================================================
// Reference SVG Types
// =============================================================================

export interface ReferenceSVG {
  lcscCode: string;
  /** Schematic symbol SVG (docType: 2) */
  symbolSvg: string | null;
  /** PCB footprint SVG (docType: 4) */
  footprintSvg: string | null;
  /** EasyEDA component UUID */
  componentUuid: string | null;
  /** Bounding box from API */
  bbox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

// =============================================================================
// Footprint Comparison Types
// =============================================================================

export type PadShape = 'rect' | 'circle' | 'oval' | 'polygon' | 'roundrect' | 'custom';

export interface PadInfo {
  /** Pad number/name (e.g., '1', '2', 'GND') */
  number: string;
  /** X position in mm */
  x: number;
  /** Y position in mm */
  y: number;
  /** Width in mm */
  width: number;
  /** Height in mm */
  height: number;
  /** Pad shape */
  shape: PadShape;
  /** Layer (1=F.Cu, 2=B.Cu, 11=multi) */
  layerId: number;
  /** Has drill hole (THT) */
  hasHole: boolean;
  /** Drill hole radius in mm (if THT) */
  holeRadius?: number;
  /** Rotation in degrees */
  rotation?: number;
}

export interface ViaInfo {
  /** X position in mm */
  x: number;
  /** Y position in mm */
  y: number;
  /** Outer diameter in mm */
  outerDiameter: number;
  /** Hole diameter in mm */
  holeDiameter: number;
}

export interface HoleInfo {
  /** X position in mm */
  x: number;
  /** Y position in mm */
  y: number;
  /** Hole diameter in mm */
  diameter: number;
  /** Is this a plated hole */
  plated: boolean;
}

export interface FootprintData {
  pads: PadInfo[];
  vias: ViaInfo[];
  holes: HoleInfo[];
  /** Bounding box */
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

// =============================================================================
// Symbol Comparison Types
// =============================================================================

export type PinElectrical =
  | 'input'
  | 'output'
  | 'bidirectional'
  | 'tri_state'
  | 'passive'
  | 'free'
  | 'unspecified'
  | 'power_in'
  | 'power_out'
  | 'open_collector'
  | 'open_emitter'
  | 'no_connect';

export interface PinInfo {
  /** Pin number (e.g., '1', '2') */
  number: string;
  /** Pin name (e.g., 'VCC', 'GND', 'PA0') */
  name: string;
  /** X position */
  x: number;
  /** Y position */
  y: number;
  /** Rotation in degrees (0, 90, 180, 270) */
  rotation: number;
  /** Electrical type */
  electrical?: PinElectrical;
}

export interface SymbolData {
  pins: PinInfo[];
  /** Bounding box */
  bounds: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

// =============================================================================
// Comparison Result Types
// =============================================================================

export type DiffSeverity = 'error' | 'warning' | 'info';

export interface PadDiff {
  padNumber: string;
  field: 'position' | 'size' | 'shape' | 'hole' | 'missing' | 'extra';
  severity: DiffSeverity;
  message: string;
  expected?: string | number;
  actual?: string | number;
}

export interface PinDiff {
  pinNumber: string;
  field: 'position' | 'name' | 'rotation' | 'electrical' | 'missing' | 'extra';
  severity: DiffSeverity;
  message: string;
  expected?: string | number;
  actual?: string | number;
}

export interface FootprintComparisonResult {
  /** Overall pass/fail */
  passed: boolean;
  /** Pad count matches */
  padCountMatch: boolean;
  /** Via count matches */
  viaCountMatch: boolean;
  /** Hole count matches */
  holeCountMatch: boolean;
  /** Reference pad count */
  referencePadCount: number;
  /** Generated pad count */
  generatedPadCount: number;
  /** Reference via count */
  referenceViaCount: number;
  /** Generated via count */
  generatedViaCount: number;
  /** List of differences */
  diffs: PadDiff[];
  /** Errors (blocking) */
  errors: PadDiff[];
  /** Warnings (non-blocking) */
  warnings: PadDiff[];
}

export interface SymbolComparisonResult {
  /** Overall pass/fail */
  passed: boolean;
  /** Pin count matches */
  pinCountMatch: boolean;
  /** Reference pin count */
  referencePinCount: number;
  /** Generated pin count */
  generatedPinCount: number;
  /** List of differences */
  diffs: PinDiff[];
  /** Errors (blocking) */
  errors: PinDiff[];
  /** Warnings (non-blocking) */
  warnings: PinDiff[];
}

export interface ValidationResult {
  lcscCode: string;
  componentName: string;
  /** Overall pass/fail */
  passed: boolean;
  /** Footprint validation result */
  footprint: FootprintComparisonResult | null;
  /** Symbol validation result */
  symbol: SymbolComparisonResult | null;
  /** Timestamp */
  timestamp: Date;
  /** Duration in ms */
  durationMs: number;
  /** Error message if validation failed entirely */
  error?: string;
}

// =============================================================================
// Comparison Options
// =============================================================================

export interface ComparisonOptions {
  /** Position tolerance in mm (default: 0.05) */
  positionTolerance?: number;
  /** Size tolerance in mm (default: 0.02) */
  sizeTolerance?: number;
  /** Hole size tolerance in mm (default: 0.02) */
  holeTolerance?: number;
  /** Treat size differences as warnings instead of errors */
  sizeWarningsOnly?: boolean;
  /** Ignore extra pads in generated output */
  ignoreExtraPads?: boolean;
  /** Ignore pin name differences */
  ignorePinNames?: boolean;
}

export const DEFAULT_COMPARISON_OPTIONS: Required<ComparisonOptions> = {
  positionTolerance: 0.05,
  sizeTolerance: 0.02,
  holeTolerance: 0.02,
  sizeWarningsOnly: false,
  ignoreExtraPads: false,
  ignorePinNames: false,
};
