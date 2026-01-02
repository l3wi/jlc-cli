/**
 * Symbol Comparator
 *
 * Extracts and compares pins from:
 * 1. Reference SVGs from JLCPCB/EasyEDA API (docType: 2)
 * 2. Generated KiCad symbol S-expressions
 */

import type {
  PinInfo,
  SymbolData,
  SymbolComparisonResult,
  PinDiff,
  ComparisonOptions,
  PinElectrical,
} from './types.js';
import { DEFAULT_COMPARISON_OPTIONS } from './types.js';

// EasyEDA uses 10mil units (0.254mm per unit)
const EE_TO_MM = 10 * 0.0254; // = 0.254

// KiCad schematic uses mils (1 mil = 0.0254mm)
const MIL_TO_MM = 0.0254;

// =============================================================================
// Reference SVG Extraction (EasyEDA symbol format)
// =============================================================================

/**
 * Extract symbol data from EasyEDA reference SVG
 *
 * SVG structure:
 * - <g c_partid="part_pin" number="1" name="VCC" c_origin="x,y" ...>
 */
export function extractFromReferenceSVG(svg: string): SymbolData {
  const rawPins: PinInfo[] = [];

  // Extract pins: <g c_partid="part_pin" ...>
  const pinRegex = /<g[^>]*c_partid="part_pin"[^>]*>/g;
  let match;

  while ((match = pinRegex.exec(svg)) !== null) {
    const groupTag = match[0];
    const endIndex = findGroupEnd(svg, match.index);
    const groupContent = svg.slice(match.index, endIndex);

    const pin = parsePinGroup(groupTag, groupContent);
    if (pin) {
      rawPins.push(pin);
    }
  }

  // Normalize coordinates: center at (0,0)
  const centroid = calculateCentroid(rawPins.map((p) => ({ x: p.x, y: p.y })));

  const pins = rawPins.map((p) => ({
    ...p,
    x: roundTo(p.x - centroid.x, 4),
    y: roundTo(p.y - centroid.y, 4),
  }));

  // Calculate bounds
  const bounds = calculateBounds(pins.map((p) => ({ x: p.x, y: p.y })));

  return { pins, bounds };
}

/**
 * Find the closing </g> tag for a group
 */
function findGroupEnd(svg: string, startIndex: number): number {
  let depth = 0;
  let i = startIndex;

  while (i < svg.length) {
    if (svg.slice(i, i + 2) === '<g') {
      depth++;
      i += 2;
    } else if (svg.slice(i, i + 4) === '</g>') {
      depth--;
      if (depth === 0) {
        return i + 4;
      }
      i += 4;
    } else {
      i++;
    }
  }

  return svg.length;
}

/**
 * Parse a pin group from SVG
 */
function parsePinGroup(groupTag: string, groupContent: string): PinInfo | null {
  // Extract number attribute (c_spicepin)
  const spicepinMatch = groupTag.match(/c_spicepin="([^"]+)"/);
  const numberMatch = groupTag.match(/number="([^"]+)"/);
  const number = spicepinMatch?.[1] || numberMatch?.[1] || '';

  // Extract pin name from text element
  const textMatch = groupContent.match(/<text[^>]*>([^<]*)<\/text>/);
  const name = textMatch?.[1]?.trim() || number;

  // Extract c_origin (position in EasyEDA units)
  const originMatch = groupTag.match(/c_origin="([^"]+)"/);
  if (!originMatch) return null;

  const [xStr, yStr] = originMatch[1].split(',');
  const x = parseFloat(xStr) * EE_TO_MM;
  const y = -parseFloat(yStr) * EE_TO_MM; // Y is inverted in SVG

  // Determine rotation from c_rotation or transform
  const rotMatch = groupTag.match(/c_rotation="([^"]+)"/);
  const rotation = rotMatch ? parseFloat(rotMatch[1]) : 0;

  // Determine electrical type from c_etype
  const etypeMatch = groupTag.match(/c_etype="([^"]+)"/);
  const electrical = mapElectricalType(etypeMatch?.[1] || '');

  return {
    number,
    name,
    x,
    y,
    rotation,
    electrical,
  };
}

/**
 * Map EasyEDA electrical type to KiCad type
 */
function mapElectricalType(eeType: string): PinElectrical {
  const typeMap: Record<string, PinElectrical> = {
    input: 'input',
    output: 'output',
    bi: 'bidirectional',
    tristate: 'tri_state',
    passive: 'passive',
    power: 'power_in',
    power_in: 'power_in',
    power_out: 'power_out',
    open_collector: 'open_collector',
    open_emitter: 'open_emitter',
    unconnected: 'no_connect',
    nc: 'no_connect',
  };

  return typeMap[eeType.toLowerCase()] || 'unspecified';
}

// =============================================================================
// KiCad S-expression Extraction
// =============================================================================

/**
 * Extract symbol data from KiCad S-expression
 *
 * Parses (pin ...) expressions from .kicad_sym format
 */
export function extractFromKiCadSymbol(sexp: string): SymbolData {
  const pins: PinInfo[] = [];

  // Extract pins: (pin TYPE STYLE (at X Y ANGLE) (length N) (name "NAME") (number "N"))
  const pinRegex = /\(pin\s+(\w+)\s+(\w+)/g;
  let match;

  while ((match = pinRegex.exec(sexp)) !== null) {
    const pinStart = match.index;
    const pinEnd = findSexpEnd(sexp, pinStart);
    const pinSexp = sexp.slice(pinStart, pinEnd);

    const pin = parseKiCadPin(match[1], match[2], pinSexp);
    if (pin) {
      pins.push(pin);
    }
  }

  // Calculate bounds
  const bounds = calculateBounds(pins.map((p) => ({ x: p.x, y: p.y })));

  return { pins, bounds };
}

/**
 * Find the end of an S-expression (matching parens)
 */
function findSexpEnd(sexp: string, startIndex: number): number {
  let depth = 0;
  let i = startIndex;

  while (i < sexp.length) {
    if (sexp[i] === '(') {
      depth++;
    } else if (sexp[i] === ')') {
      depth--;
      if (depth === 0) {
        return i + 1;
      }
    }
    i++;
  }

  return sexp.length;
}

/**
 * Parse a KiCad pin S-expression
 */
function parseKiCadPin(electricalType: string, shape: string, sexp: string): PinInfo | null {
  // Extract position: (at X Y ANGLE)
  const atMatch = sexp.match(/\(at\s+([\d.-]+)\s+([\d.-]+)(?:\s+([\d.-]+))?\)/);
  if (!atMatch) return null;

  // KiCad symbols use mils
  const x = parseFloat(atMatch[1]) * MIL_TO_MM;
  const y = parseFloat(atMatch[2]) * MIL_TO_MM;
  const rotation = atMatch[3] ? parseFloat(atMatch[3]) : 0;

  // Extract name: (name "NAME")
  const nameMatch = sexp.match(/\(name\s+"([^"]*)"/);
  const name = nameMatch?.[1] || '';

  // Extract number: (number "N")
  const numberMatch = sexp.match(/\(number\s+"([^"]*)"/);
  const number = numberMatch?.[1] || '';

  // Map electrical type
  const electrical = mapKiCadElectricalType(electricalType);

  return {
    number,
    name,
    x,
    y,
    rotation,
    electrical,
  };
}

/**
 * Map KiCad electrical type
 */
function mapKiCadElectricalType(type: string): PinElectrical {
  const typeMap: Record<string, PinElectrical> = {
    input: 'input',
    output: 'output',
    bidirectional: 'bidirectional',
    tri_state: 'tri_state',
    passive: 'passive',
    free: 'free',
    unspecified: 'unspecified',
    power_in: 'power_in',
    power_out: 'power_out',
    open_collector: 'open_collector',
    open_emitter: 'open_emitter',
    no_connect: 'no_connect',
  };

  return typeMap[type.toLowerCase()] || 'unspecified';
}

// =============================================================================
// Comparison Logic
// =============================================================================

/**
 * Compare reference and generated symbol data
 */
export function compareSymbols(
  reference: SymbolData,
  generated: SymbolData,
  options: ComparisonOptions = {}
): SymbolComparisonResult {
  const opts = { ...DEFAULT_COMPARISON_OPTIONS, ...options };
  const diffs: PinDiff[] = [];

  // Compare pin counts
  const pinCountMatch = reference.pins.length === generated.pins.length;

  // Match and compare pins
  const matchedPins = new Set<string>();

  for (const refPin of reference.pins) {
    const genPin = findMatchingPin(refPin, generated.pins, opts.positionTolerance!);

    if (!genPin) {
      diffs.push({
        pinNumber: refPin.number,
        field: 'missing',
        severity: 'error',
        message: `Pin ${refPin.number} (${refPin.name}) missing in generated output`,
      });
      continue;
    }

    matchedPins.add(genPin.number);

    // Compare position (with very lenient tolerance for symbols)
    const dx = Math.abs(refPin.x - genPin.x);
    const dy = Math.abs(refPin.y - genPin.y);
    const posTolerance = opts.positionTolerance! * 10; // More lenient for symbols

    if (dx > posTolerance || dy > posTolerance) {
      diffs.push({
        pinNumber: refPin.number,
        field: 'position',
        severity: 'warning',
        message: `Position differs: expected (${refPin.x.toFixed(2)}, ${refPin.y.toFixed(2)}), got (${genPin.x.toFixed(2)}, ${genPin.y.toFixed(2)})`,
        expected: `(${refPin.x.toFixed(2)}, ${refPin.y.toFixed(2)})`,
        actual: `(${genPin.x.toFixed(2)}, ${genPin.y.toFixed(2)})`,
      });
    }

    // Compare name (if not ignored)
    if (!opts.ignorePinNames && refPin.name !== genPin.name) {
      // Check case-insensitive match
      if (refPin.name.toLowerCase() !== genPin.name.toLowerCase()) {
        diffs.push({
          pinNumber: refPin.number,
          field: 'name',
          severity: 'warning',
          message: `Name differs: expected "${refPin.name}", got "${genPin.name}"`,
          expected: refPin.name,
          actual: genPin.name,
        });
      }
    }

    // Compare rotation
    const rotDiff = Math.abs(refPin.rotation - genPin.rotation) % 360;
    if (rotDiff > 1 && rotDiff < 359) {
      diffs.push({
        pinNumber: refPin.number,
        field: 'rotation',
        severity: 'info',
        message: `Rotation differs: expected ${refPin.rotation}°, got ${genPin.rotation}°`,
        expected: refPin.rotation,
        actual: genPin.rotation,
      });
    }

    // Compare electrical type
    if (refPin.electrical && genPin.electrical && refPin.electrical !== genPin.electrical) {
      diffs.push({
        pinNumber: refPin.number,
        field: 'electrical',
        severity: 'warning',
        message: `Electrical type differs: expected ${refPin.electrical}, got ${genPin.electrical}`,
        expected: refPin.electrical,
        actual: genPin.electrical,
      });
    }
  }

  // Check for extra pins in generated output
  for (const genPin of generated.pins) {
    if (!matchedPins.has(genPin.number)) {
      // Try to find by position
      const matchByPos = reference.pins.find(
        (p) =>
          Math.abs(p.x - genPin.x) < opts.positionTolerance! * 10 &&
          Math.abs(p.y - genPin.y) < opts.positionTolerance! * 10
      );

      if (!matchByPos) {
        diffs.push({
          pinNumber: genPin.number,
          field: 'extra',
          severity: 'warning',
          message: `Extra pin ${genPin.number} (${genPin.name}) in generated output`,
        });
      }
    }
  }

  // Categorize diffs
  const errors = diffs.filter((d) => d.severity === 'error');
  const warnings = diffs.filter((d) => d.severity === 'warning');

  // Determine pass/fail
  const passed = errors.length === 0 && pinCountMatch;

  return {
    passed,
    pinCountMatch,
    referencePinCount: reference.pins.length,
    generatedPinCount: generated.pins.length,
    diffs,
    errors,
    warnings,
  };
}

/**
 * Find a matching pin by number or position
 */
function findMatchingPin(
  refPin: PinInfo,
  generatedPins: PinInfo[],
  tolerance: number
): PinInfo | null {
  // First try to match by number
  const byNumber = generatedPins.find((p) => p.number === refPin.number);
  if (byNumber) return byNumber;

  // Fall back to matching by position
  return (
    generatedPins.find(
      (p) =>
        Math.abs(p.x - refPin.x) < tolerance * 10 && Math.abs(p.y - refPin.y) < tolerance * 10
    ) || null
  );
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Calculate centroid from a set of points
 */
function calculateCentroid(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  const sum = points.reduce((acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });

  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
}

/**
 * Round to specified decimal places
 */
function roundTo(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Calculate bounding box from points
 */
function calculateBounds(points: Array<{ x: number; y: number }>): {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
} {
  if (points.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  }

  return {
    minX: Math.min(...points.map((p) => p.x)),
    maxX: Math.max(...points.map((p) => p.x)),
    minY: Math.min(...points.map((p) => p.y)),
    maxY: Math.max(...points.map((p) => p.y)),
  };
}

/**
 * Format comparison result for console output
 */
export function formatSymbolComparisonResult(result: SymbolComparisonResult): string {
  const lines: string[] = [];

  // Overall status
  const status = result.passed ? '✓ PASS' : '✗ FAIL';
  lines.push(`Symbol Comparison: ${status}`);
  lines.push('');

  // Counts
  lines.push(
    `  Pin count: ${result.generatedPinCount}/${result.referencePinCount} ${result.pinCountMatch ? '✓' : '✗'}`
  );
  lines.push('');

  // Errors
  if (result.errors.length > 0) {
    lines.push(`  Errors (${result.errors.length}):`);
    for (const err of result.errors) {
      lines.push(`    ✗ Pin ${err.pinNumber}: ${err.message}`);
    }
    lines.push('');
  }

  // Warnings
  if (result.warnings.length > 0) {
    lines.push(`  Warnings (${result.warnings.length}):`);
    for (const warn of result.warnings) {
      lines.push(`    ⚠ Pin ${warn.pinNumber}: ${warn.message}`);
    }
  }

  return lines.join('\n');
}
