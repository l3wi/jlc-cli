/**
 * Footprint Comparator
 *
 * Extracts and compares pads, vias, and holes from:
 * 1. Reference SVGs from JLCPCB/EasyEDA API
 * 2. Generated KiCad footprint S-expressions
 */

import type {
  PadInfo,
  ViaInfo,
  HoleInfo,
  FootprintData,
  FootprintComparisonResult,
  PadDiff,
  ComparisonOptions,
  PadShape,
} from './types.js';
import { DEFAULT_COMPARISON_OPTIONS } from './types.js';

// EasyEDA uses 10mil units (0.254mm per unit)
const EE_TO_MM = 10 * 0.0254; // = 0.254

// =============================================================================
// Reference SVG Extraction (EasyEDA format)
// =============================================================================

/**
 * Extract footprint data from EasyEDA reference SVG
 *
 * SVG structure:
 * - <g c_partid="part_pad" number="1" c_origin="x,y" ...>
 * - <g c_partid="part_via" c_origin="x,y" ...>
 * - <g c_partid="part_hole" c_origin="x,y" ...>
 */
export function extractFromReferenceSVG(svg: string): FootprintData {
  const rawPads: PadInfo[] = [];
  const rawVias: ViaInfo[] = [];
  const rawHoles: HoleInfo[] = [];

  // Extract pads: <g c_partid="part_pad" ...>
  const padRegex = /<g[^>]*c_partid="part_pad"[^>]*>/g;
  let match;

  while ((match = padRegex.exec(svg)) !== null) {
    const groupTag = match[0];
    const endIndex = findGroupEnd(svg, match.index);
    const groupContent = svg.slice(match.index, endIndex);

    const pad = parsePadGroup(groupTag, groupContent);
    if (pad) {
      rawPads.push(pad);
    }
  }

  // Extract vias: <g c_partid="part_via" ...>
  const viaRegex = /<g[^>]*c_partid="part_via"[^>]*>/g;

  while ((match = viaRegex.exec(svg)) !== null) {
    const groupTag = match[0];
    const endIndex = findGroupEnd(svg, match.index);
    const groupContent = svg.slice(match.index, endIndex);

    const via = parseViaGroup(groupTag, groupContent);
    if (via) {
      rawVias.push(via);
    }
  }

  // Extract holes: <g c_partid="part_hole" ...>
  const holeRegex = /<g[^>]*c_partid="part_hole"[^>]*>/g;

  while ((match = holeRegex.exec(svg)) !== null) {
    const groupTag = match[0];
    const endIndex = findGroupEnd(svg, match.index);
    const groupContent = svg.slice(match.index, endIndex);

    const hole = parseHoleGroup(groupTag, groupContent);
    if (hole) {
      rawHoles.push(hole);
    }
  }

  // Normalize coordinates: center the footprint at (0,0) like KiCad does
  // Use bounding box center (including pad dimensions) to match KiCad converter
  const centroid = calculateBoundingBoxCenter(rawPads);

  // Apply offset to all elements
  const pads = rawPads.map((p) => ({
    ...p,
    x: roundTo(p.x - centroid.x, 4),
    y: roundTo(p.y - centroid.y, 4),
  }));

  const vias = rawVias.map((v) => ({
    ...v,
    x: roundTo(v.x - centroid.x, 4),
    y: roundTo(v.y - centroid.y, 4),
  }));

  const holes = rawHoles.map((h) => ({
    ...h,
    x: roundTo(h.x - centroid.x, 4),
    y: roundTo(h.y - centroid.y, 4),
  }));

  // Calculate bounds from normalized coordinates
  const allPoints = [
    ...pads.map((p) => ({ x: p.x, y: p.y })),
    ...vias.map((v) => ({ x: v.x, y: v.y })),
    ...holes.map((h) => ({ x: h.x, y: h.y })),
  ];

  const bounds = calculateBounds(allPoints);

  return { pads, vias, holes, bounds };
}

/**
 * Calculate centroid from a set of points (simple average)
 * @deprecated Use calculateBoundingBoxCenter for pad-based centering
 */
function calculateCentroid(points: Array<{ x: number; y: number }>): { x: number; y: number } {
  if (points.length === 0) {
    return { x: 0, y: 0 };
  }

  const sum = points.reduce(
    (acc, p) => ({ x: acc.x + p.x, y: acc.y + p.y }),
    { x: 0, y: 0 }
  );

  return {
    x: sum.x / points.length,
    y: sum.y / points.length,
  };
}

/**
 * Calculate bounding box center from pads, including pad dimensions
 * This matches the method used by the KiCad footprint converter
 */
function calculateBoundingBoxCenter(pads: PadInfo[]): { x: number; y: number } {
  if (pads.length === 0) {
    return { x: 0, y: 0 };
  }

  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;

  for (const pad of pads) {
    const hw = pad.width / 2;
    const hh = pad.height / 2;
    minX = Math.min(minX, pad.x - hw);
    maxX = Math.max(maxX, pad.x + hw);
    minY = Math.min(minY, pad.y - hh);
    maxY = Math.max(maxY, pad.y + hh);
  }

  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
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
 * Parse a pad group from SVG
 */
function parsePadGroup(groupTag: string, groupContent: string): PadInfo | null {
  // Extract number attribute
  const numberMatch = groupTag.match(/number="([^"]+)"/);
  const number = numberMatch?.[1] || '';

  // Extract c_origin (position in EasyEDA units)
  const originMatch = groupTag.match(/c_origin="([^"]+)"/);
  if (!originMatch) return null;

  const [xStr, yStr] = originMatch[1].split(',');
  const x = parseFloat(xStr) * EE_TO_MM;
  const y = parseFloat(yStr) * EE_TO_MM; // KiCad uses same Y convention as EasyEDA (Y-down)

  // Extract layer ID
  const layerMatch = groupTag.match(/layerid="(\d+)"/);
  const layerId = layerMatch ? parseInt(layerMatch[1], 10) : 1;

  // Determine shape and size from child elements
  const { shape, width, height, hasHole, holeRadius, rotation } = extractPadShape(groupContent);

  return {
    number,
    x,
    y,
    width,
    height,
    shape,
    layerId,
    hasHole,
    holeRadius,
    rotation,
  };
}

/**
 * Extract pad shape and dimensions from SVG content
 */
function extractPadShape(content: string): {
  shape: PadShape;
  width: number;
  height: number;
  hasHole: boolean;
  holeRadius?: number;
  rotation?: number;
} {
  let shape: PadShape = 'rect';
  let width = 0;
  let height = 0;
  let hasHole = false;
  let holeRadius: number | undefined;
  let rotation: number | undefined;

  // Check for rect
  const rectMatch = content.match(/<rect[^>]*width="([^"]+)"[^>]*height="([^"]+)"[^>]*>/);
  if (rectMatch) {
    width = parseFloat(rectMatch[1]) * EE_TO_MM;
    height = parseFloat(rectMatch[2]) * EE_TO_MM;
    shape = 'rect';

    // Check for roundrect (rx attribute)
    if (content.match(/<rect[^>]*rx="[^"]+"/)) {
      shape = 'roundrect';
    }
  }

  // Check for circle
  const circleMatch = content.match(/<circle[^>]*r="([^"]+)"[^>]*>/);
  if (circleMatch) {
    const r = parseFloat(circleMatch[1]) * EE_TO_MM;
    width = r * 2;
    height = r * 2;
    shape = 'circle';
  }

  // Check for ellipse (oval)
  const ellipseMatch = content.match(/<ellipse[^>]*rx="([^"]+)"[^>]*ry="([^"]+)"[^>]*>/);
  if (ellipseMatch) {
    width = parseFloat(ellipseMatch[1]) * 2 * EE_TO_MM;
    height = parseFloat(ellipseMatch[2]) * 2 * EE_TO_MM;
    shape = 'oval';
  }

  // Check for polygon/path (custom shape)
  if (content.match(/<polygon[^>]*>/) || content.match(/<path[^>]*d="[^"]*[Cc][^"]*"/)) {
    shape = 'polygon';
    // Calculate bounding box from polygon points or path
    const polyMatch = content.match(/<polygon[^>]*points="([^"]+)"/);
    if (polyMatch) {
      const points = polyMatch[1].split(/[\s,]+/).map(parseFloat);
      let minX = Infinity,
        maxX = -Infinity,
        minY = Infinity,
        maxY = -Infinity;
      for (let i = 0; i < points.length; i += 2) {
        minX = Math.min(minX, points[i]);
        maxX = Math.max(maxX, points[i]);
        minY = Math.min(minY, points[i + 1]);
        maxY = Math.max(maxY, points[i + 1]);
      }
      width = (maxX - minX) * EE_TO_MM;
      height = (maxY - minY) * EE_TO_MM;
    }
  }

  // Check for hole (inner circle with different color/fill)
  // Holes are typically rendered as inner circles
  const holeMatch = content.match(/<circle[^>]*class="[^"]*hole[^"]*"[^>]*r="([^"]+)"[^>]*>/i);
  if (holeMatch) {
    hasHole = true;
    holeRadius = parseFloat(holeMatch[1]) * EE_TO_MM;
  }

  // Also check for c_etype="pinhole" attribute
  if (content.includes('c_etype="pinhole"')) {
    hasHole = true;
    // Try to find the hole radius
    const innerCircle = content.match(/<circle[^>]*fill="[^"]*(?:white|#fff)[^"]*"[^>]*r="([^"]+)"/i);
    if (innerCircle) {
      holeRadius = parseFloat(innerCircle[1]) * EE_TO_MM;
    }
  }

  // Check for transform rotation
  const transformMatch = content.match(/transform="[^"]*rotate\(([^)]+)\)"/);
  if (transformMatch) {
    rotation = parseFloat(transformMatch[1].split(',')[0]);
  }

  return { shape, width, height, hasHole, holeRadius, rotation };
}

/**
 * Parse a via group from SVG
 */
function parseViaGroup(groupTag: string, groupContent: string): ViaInfo | null {
  // Extract c_origin
  const originMatch = groupTag.match(/c_origin="([^"]+)"/);
  if (!originMatch) return null;

  const [xStr, yStr] = originMatch[1].split(',');
  const x = parseFloat(xStr) * EE_TO_MM;
  const y = parseFloat(yStr) * EE_TO_MM; // KiCad uses same Y convention as EasyEDA

  // Extract outer and inner diameter from circles
  const circles = [...groupContent.matchAll(/<circle[^>]*r="([^"]+)"[^>]*>/g)];
  if (circles.length === 0) return null;

  const radii = circles.map((m) => parseFloat(m[1]) * EE_TO_MM);
  const outerDiameter = Math.max(...radii) * 2;
  const holeDiameter = Math.min(...radii) * 2;

  return { x, y, outerDiameter, holeDiameter };
}

/**
 * Parse a hole group from SVG
 */
function parseHoleGroup(groupTag: string, groupContent: string): HoleInfo | null {
  // Extract c_origin
  const originMatch = groupTag.match(/c_origin="([^"]+)"/);
  if (!originMatch) return null;

  const [xStr, yStr] = originMatch[1].split(',');
  const x = parseFloat(xStr) * EE_TO_MM;
  const y = parseFloat(yStr) * EE_TO_MM; // KiCad uses same Y convention as EasyEDA

  // Extract diameter from circle
  const circleMatch = groupContent.match(/<circle[^>]*r="([^"]+)"[^>]*>/);
  if (!circleMatch) return null;

  const diameter = parseFloat(circleMatch[1]) * 2 * EE_TO_MM;

  // Check if plated (multi-layer holes are typically plated)
  const plated = groupTag.includes('layerid="11"') || groupTag.includes('c_etype="plated"');

  return { x, y, diameter, plated };
}

// =============================================================================
// KiCad S-expression Extraction
// =============================================================================

/**
 * Extract footprint data from KiCad S-expression
 *
 * Parses (pad ...) (via ...) expressions from .kicad_mod format
 */
export function extractFromKiCadFootprint(sexp: string): FootprintData {
  const pads: PadInfo[] = [];
  const vias: ViaInfo[] = [];
  const holes: HoleInfo[] = [];

  // Extract pads
  const padRegex = /\(pad\s+"([^"]*)"\s+(\w+)\s+(\w+)/g;
  let match;

  while ((match = padRegex.exec(sexp)) !== null) {
    const padStart = match.index;
    const padEnd = findSexpEnd(sexp, padStart);
    const padSexp = sexp.slice(padStart, padEnd);

    const pad = parseKiCadPad(match[1], match[2], match[3], padSexp);
    if (pad) {
      // Vias are represented as pads with empty number
      if (pad.number === '' && pad.hasHole) {
        vias.push({
          x: pad.x,
          y: pad.y,
          outerDiameter: pad.width,
          holeDiameter: pad.holeRadius ? pad.holeRadius * 2 : 0,
        });
      } else {
        pads.push(pad);
      }
    }
  }

  // Extract standalone holes (non-plated)
  const holeRegex = /\(pad\s+""\s+np_thru_hole/g;
  while ((match = holeRegex.exec(sexp)) !== null) {
    const holeStart = match.index;
    const holeEnd = findSexpEnd(sexp, holeStart);
    const holeSexp = sexp.slice(holeStart, holeEnd);

    const hole = parseKiCadHole(holeSexp);
    if (hole) {
      holes.push(hole);
    }
  }

  // Calculate bounds
  const allPoints = [
    ...pads.map((p) => ({ x: p.x, y: p.y })),
    ...vias.map((v) => ({ x: v.x, y: v.y })),
    ...holes.map((h) => ({ x: h.x, y: h.y })),
  ];

  const bounds = calculateBounds(allPoints);

  return { pads, vias, holes, bounds };
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
 * Parse a KiCad pad S-expression
 */
function parseKiCadPad(
  number: string,
  padType: string,
  shape: string,
  sexp: string
): PadInfo | null {
  // Extract position: (at x y [rotation])
  const atMatch = sexp.match(/\(at\s+([\d.-]+)\s+([\d.-]+)(?:\s+([\d.-]+))?\)/);
  if (!atMatch) return null;

  const x = parseFloat(atMatch[1]);
  const y = parseFloat(atMatch[2]);
  const rotation = atMatch[3] ? parseFloat(atMatch[3]) : 0;

  // Extract size: (size width height)
  const sizeMatch = sexp.match(/\(size\s+([\d.-]+)\s+([\d.-]+)\)/);
  if (!sizeMatch) return null;

  const width = parseFloat(sizeMatch[1]);
  const height = parseFloat(sizeMatch[2]);

  // Determine layer ID
  let layerId = 1; // F.Cu
  if (sexp.includes('B.Cu')) {
    layerId = 2;
  }
  if (sexp.includes('*.Cu')) {
    layerId = 11; // Multi-layer
  }

  // Check for drill hole
  const drillMatch = sexp.match(/\(drill\s+([\d.-]+)/);
  const hasHole = padType === 'thru_hole' || padType === 'np_thru_hole' || drillMatch !== null;
  const holeRadius = drillMatch ? parseFloat(drillMatch[1]) / 2 : undefined;

  // Map shape
  const shapeMap: Record<string, PadShape> = {
    rect: 'rect',
    circle: 'circle',
    oval: 'oval',
    roundrect: 'roundrect',
    custom: 'custom',
    polygon: 'polygon',
  };

  return {
    number,
    x,
    y,
    width,
    height,
    shape: shapeMap[shape] || 'rect',
    layerId,
    hasHole,
    holeRadius,
    rotation: rotation !== 0 ? rotation : undefined,
  };
}

/**
 * Parse a KiCad hole from pad expression
 */
function parseKiCadHole(sexp: string): HoleInfo | null {
  const atMatch = sexp.match(/\(at\s+([\d.-]+)\s+([\d.-]+)/);
  const drillMatch = sexp.match(/\(drill\s+([\d.-]+)/);

  if (!atMatch || !drillMatch) return null;

  return {
    x: parseFloat(atMatch[1]),
    y: parseFloat(atMatch[2]),
    diameter: parseFloat(drillMatch[1]),
    plated: !sexp.includes('np_thru_hole'),
  };
}

// =============================================================================
// Comparison Logic
// =============================================================================

/**
 * Check if two pad shapes are functionally equivalent
 * - Rectangular shapes: polygon, rect, roundrect are treated as equivalent
 * - Round shapes: circle, oval are treated as equivalent
 */
function areShapesEquivalent(shape1: PadShape, shape2: PadShape): boolean {
  if (shape1 === shape2) return true;

  const rectangularShapes: PadShape[] = ['polygon', 'rect', 'roundrect'];
  const roundShapes: PadShape[] = ['circle', 'oval'];

  // Both are rectangular shapes
  if (rectangularShapes.includes(shape1) && rectangularShapes.includes(shape2)) {
    return true;
  }

  // Both are round shapes
  if (roundShapes.includes(shape1) && roundShapes.includes(shape2)) {
    return true;
  }

  return false;
}

/**
 * Compare reference and generated footprint data
 */
export function compareFootprints(
  reference: FootprintData,
  generated: FootprintData,
  options: ComparisonOptions = {}
): FootprintComparisonResult {
  const opts = { ...DEFAULT_COMPARISON_OPTIONS, ...options };
  const diffs: PadDiff[] = [];

  // Compare pad counts
  const padCountMatch = reference.pads.length === generated.pads.length;

  // Compare via counts
  const viaCountMatch = reference.vias.length === generated.vias.length;

  // Compare hole counts
  const holeCountMatch = reference.holes.length === generated.holes.length;

  // Match and compare pads
  // Track used indices to handle duplicate pad numbers (like shield pads)
  const usedGenIndices = new Set<number>();

  for (const refPad of reference.pads) {
    const match = findMatchingPad(refPad, generated.pads, usedGenIndices, opts.positionTolerance!);

    if (!match) {
      diffs.push({
        padNumber: refPad.number,
        field: 'missing',
        severity: 'error',
        message: `Pad ${refPad.number} missing in generated output`,
      });
      continue;
    }

    const genPad = match.pad;
    usedGenIndices.add(match.index);

    // Compare position
    const dx = Math.abs(refPad.x - genPad.x);
    const dy = Math.abs(refPad.y - genPad.y);
    if (dx > opts.positionTolerance! || dy > opts.positionTolerance!) {
      diffs.push({
        padNumber: refPad.number,
        field: 'position',
        severity: 'error',
        message: `Position differs: expected (${refPad.x.toFixed(3)}, ${refPad.y.toFixed(3)}), got (${genPad.x.toFixed(3)}, ${genPad.y.toFixed(3)})`,
        expected: `(${refPad.x.toFixed(3)}, ${refPad.y.toFixed(3)})`,
        actual: `(${genPad.x.toFixed(3)}, ${genPad.y.toFixed(3)})`,
      });
    }

    // Compare size - also check if dimensions are swapped (rotated pad)
    const dw = Math.abs(refPad.width - genPad.width);
    const dh = Math.abs(refPad.height - genPad.height);
    const dwSwapped = Math.abs(refPad.width - genPad.height);
    const dhSwapped = Math.abs(refPad.height - genPad.width);

    // Check if sizes match normally or with swapped dimensions (rotation)
    const sizeMatches =
      (dw <= opts.sizeTolerance! && dh <= opts.sizeTolerance!) ||
      (dwSwapped <= opts.sizeTolerance! && dhSwapped <= opts.sizeTolerance!);

    if (!sizeMatches) {
      // Include position in message for pads with duplicate numbers
      const posInfo = ` at (${refPad.x.toFixed(2)}, ${refPad.y.toFixed(2)})`;
      diffs.push({
        padNumber: refPad.number,
        field: 'size',
        severity: opts.sizeWarningsOnly ? 'warning' : 'error',
        message: `Size differs${posInfo}: expected ${refPad.width.toFixed(3)}x${refPad.height.toFixed(3)}mm, got ${genPad.width.toFixed(3)}x${genPad.height.toFixed(3)}mm`,
        expected: `${refPad.width.toFixed(3)}x${refPad.height.toFixed(3)}`,
        actual: `${genPad.width.toFixed(3)}x${genPad.height.toFixed(3)}`,
      });
    }

    // Compare shape - only warn if fundamentally different shape categories
    // Treat polygon/rect/roundrect as equivalent (rectangular shapes)
    // Treat circle/oval as equivalent (round shapes)
    if (!areShapesEquivalent(refPad.shape, genPad.shape)) {
      diffs.push({
        padNumber: refPad.number,
        field: 'shape',
        severity: 'warning',
        message: `Shape differs: expected ${refPad.shape}, got ${genPad.shape}`,
        expected: refPad.shape,
        actual: genPad.shape,
      });
    }

    // Compare hole
    if (refPad.hasHole !== genPad.hasHole) {
      diffs.push({
        padNumber: refPad.number,
        field: 'hole',
        severity: 'error',
        message: `Hole mismatch: expected ${refPad.hasHole ? 'THT' : 'SMD'}, got ${genPad.hasHole ? 'THT' : 'SMD'}`,
      });
    } else if (refPad.hasHole && refPad.holeRadius && genPad.holeRadius) {
      const drillDiff = Math.abs(refPad.holeRadius - genPad.holeRadius);
      if (drillDiff > opts.holeTolerance!) {
        diffs.push({
          padNumber: refPad.number,
          field: 'hole',
          severity: 'warning',
          message: `Hole size differs: expected ø${(refPad.holeRadius * 2).toFixed(3)}mm, got ø${(genPad.holeRadius * 2).toFixed(3)}mm`,
          expected: (refPad.holeRadius * 2).toFixed(3),
          actual: (genPad.holeRadius * 2).toFixed(3),
        });
      }
    }
  }

  // Check for extra pads in generated output
  if (!opts.ignoreExtraPads) {
    for (let i = 0; i < generated.pads.length; i++) {
      if (usedGenIndices.has(i)) continue; // Skip already matched pads

      const genPad = generated.pads[i];
      // Try to find by position in reference
      const matchByPos = reference.pads.find(
        (p) =>
          Math.abs(p.x - genPad.x) < opts.positionTolerance! &&
          Math.abs(p.y - genPad.y) < opts.positionTolerance!
      );

      if (!matchByPos) {
        diffs.push({
          padNumber: genPad.number,
          field: 'extra',
          severity: 'warning',
          message: `Extra pad ${genPad.number} in generated output at (${genPad.x.toFixed(3)}, ${genPad.y.toFixed(3)})`,
        });
      }
    }
  }

  // Categorize diffs
  const errors = diffs.filter((d) => d.severity === 'error');
  const warnings = diffs.filter((d) => d.severity === 'warning');

  // Determine pass/fail
  const passed = errors.length === 0 && padCountMatch;

  return {
    passed,
    padCountMatch,
    viaCountMatch,
    holeCountMatch,
    referencePadCount: reference.pads.length,
    generatedPadCount: generated.pads.length,
    referenceViaCount: reference.vias.length,
    generatedViaCount: generated.vias.length,
    diffs,
    errors,
    warnings,
  };
}

/**
 * Find a matching pad by number and position
 * For pads with duplicate numbers (like shield pads), matches by closest position
 */
function findMatchingPad(
  refPad: PadInfo,
  generatedPads: PadInfo[],
  usedIndices: Set<number>,
  tolerance: number
): { pad: PadInfo; index: number } | null {
  // Find all pads with matching number that haven't been used yet
  const candidates: Array<{ pad: PadInfo; index: number; distance: number }> = [];

  for (let i = 0; i < generatedPads.length; i++) {
    if (usedIndices.has(i)) continue;
    const p = generatedPads[i];

    if (p.number === refPad.number) {
      const distance = Math.sqrt((p.x - refPad.x) ** 2 + (p.y - refPad.y) ** 2);
      candidates.push({ pad: p, index: i, distance });
    }
  }

  // If we have candidates with matching number, return the closest one
  if (candidates.length > 0) {
    candidates.sort((a, b) => a.distance - b.distance);
    return { pad: candidates[0].pad, index: candidates[0].index };
  }

  // Fall back to matching by position only (for unnumbered pads)
  for (let i = 0; i < generatedPads.length; i++) {
    if (usedIndices.has(i)) continue;
    const p = generatedPads[i];

    if (Math.abs(p.x - refPad.x) < tolerance && Math.abs(p.y - refPad.y) < tolerance) {
      return { pad: p, index: i };
    }
  }

  return null;
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

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Format comparison result for console output
 */
export function formatComparisonResult(result: FootprintComparisonResult): string {
  const lines: string[] = [];

  // Overall status
  const status = result.passed ? '✓ PASS' : '✗ FAIL';
  lines.push(`Footprint Comparison: ${status}`);
  lines.push('');

  // Counts
  lines.push(`  Pad count: ${result.generatedPadCount}/${result.referencePadCount} ${result.padCountMatch ? '✓' : '✗'}`);
  lines.push(`  Via count: ${result.generatedViaCount}/${result.referenceViaCount} ${result.viaCountMatch ? '✓' : '✗'}`);
  lines.push('');

  // Errors
  if (result.errors.length > 0) {
    lines.push(`  Errors (${result.errors.length}):`);
    for (const err of result.errors) {
      lines.push(`    ✗ Pad ${err.padNumber}: ${err.message}`);
    }
    lines.push('');
  }

  // Warnings
  if (result.warnings.length > 0) {
    lines.push(`  Warnings (${result.warnings.length}):`);
    for (const warn of result.warnings) {
      lines.push(`    ⚠ Pad ${warn.padNumber}: ${warn.message}`);
    }
  }

  return lines.join('\n');
}
