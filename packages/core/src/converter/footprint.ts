/**
 * EasyEDA Footprint to KiCad Footprint Converter
 * Complete rewrite to handle all EasyEDA shape types
 *
 * Supported shapes: PAD, TRACK, HOLE, CIRCLE, ARC, RECT, VIA, TEXT, SOLIDREGION
 */

import type {
  EasyEDAComponentData,
  EasyEDAPad,
  EasyEDATrack,
  EasyEDAHole,
  EasyEDACircle,
  EasyEDAArc,
  EasyEDARect,
  EasyEDAVia,
  EasyEDAText,
  EasyEDASolidRegion,
} from '../types/index.js';
import { KICAD_FOOTPRINT_VERSION, KICAD_LAYERS } from '../constants/index.js';
import { roundTo } from '../utils/index.js';
import { mapToKicadFootprint, getKicadFootprintRef, getExpectedPadCount } from './footprint-mapper.js';

// =============================================================================
// Constants - EasyEDA to KiCad mappings from easyeda2kicad.py
// =============================================================================

// EasyEDA uses 10mil units (0.254mm per unit)
const EE_TO_MM = 10 * 0.0254; // = 0.254

// General layer mapping for graphics (TRACK, CIRCLE, ARC, RECT, TEXT)
const KI_LAYERS: Record<number, string> = {
  1: 'F.Cu',
  2: 'B.Cu',
  3: 'F.SilkS',
  4: 'B.SilkS',
  5: 'F.Paste',
  6: 'B.Paste',
  7: 'F.Mask',
  8: 'B.Mask',
  10: 'Edge.Cuts',
  11: 'Edge.Cuts',
  12: 'Cmts.User',
  13: 'F.Fab',
  14: 'B.Fab',
  15: 'Dwgs.User',
  101: 'F.Fab',
};

// Layer mapping for SMD pads (includes paste layer)
const KI_PAD_LAYER_SMD: Record<number, string> = {
  1: '"F.Cu" "F.Paste" "F.Mask"',
  2: '"B.Cu" "B.Paste" "B.Mask"',
  11: '"*.Cu" "*.Paste" "*.Mask"',
};

// Layer mapping for THT pads (no paste layer, all copper layers)
// THT pads go through all layers regardless of original layer ID
const KI_PAD_LAYER_THT: Record<number, string> = {
  1: '"*.Cu" "*.Mask"',
  2: '"*.Cu" "*.Mask"',
  11: '"*.Cu" "*.Mask"',
};

// Pad shape mapping
const KI_PAD_SHAPE: Record<string, string> = {
  ELLIPSE: 'circle',
  RECT: 'rect',
  OVAL: 'oval',
  POLYGON: 'custom',
};

// =============================================================================
// Types
// =============================================================================

export interface FootprintConversionOptions {
  libraryName?: string;
  include3DModel?: boolean;
  modelPath?: string;
}

export interface FootprintResult {
  type: 'reference' | 'generated';
  reference?: string;
  content?: string;
  name: string;
}

interface Point {
  x: number;
  y: number;
}

interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * Calculate the geometric center of pads (in EasyEDA units, before conversion)
 * Used to center the footprint at (0,0) in KiCad
 */
function calculatePadCenter(pads: EasyEDAPad[]): Point {
  if (pads.length === 0) {
    return { x: 0, y: 0 };
  }

  let minX = Infinity,
    maxX = -Infinity;
  let minY = Infinity,
    maxY = -Infinity;

  for (const pad of pads) {
    // Include pad size in bounds calculation
    const hw = pad.width / 2;
    const hh = pad.height / 2;
    minX = Math.min(minX, pad.centerX - hw);
    maxX = Math.max(maxX, pad.centerX + hw);
    minY = Math.min(minY, pad.centerY - hh);
    maxY = Math.max(maxY, pad.centerY + hh);
  }

  return {
    x: (minX + maxX) / 2,
    y: (minY + maxY) / 2,
  };
}

// =============================================================================
// Helper functions
// =============================================================================

/**
 * Convert EasyEDA coordinate to mm (relative to origin)
 */
function toMM(value: number): number {
  return value * EE_TO_MM;
}

/**
 * Convert EasyEDA X coordinate (origin-relative, Y-flipped for KiCad)
 */
function convertX(x: number, originX: number): number {
  return roundTo((x - originX) * EE_TO_MM, 4);
}

/**
 * Convert EasyEDA Y coordinate (origin-relative)
 * Note: KiCad footprints use same Y convention as EasyEDA (Y positive going down)
 */
function convertY(y: number, originY: number): number {
  return roundTo((y - originY) * EE_TO_MM, 4);
}

/**
 * Parse space-separated point string "x1 y1 x2 y2 ..." into Point array
 */
function parsePoints(pointsStr: string): Point[] {
  const values = pointsStr.trim().split(/\s+/).map(Number);
  const points: Point[] = [];
  for (let i = 0; i < values.length - 1; i += 2) {
    points.push({ x: values[i], y: values[i + 1] });
  }
  return points;
}

/**
 * Get KiCad layer name from EasyEDA layer ID
 */
function getLayer(layerId: number): string {
  return KI_LAYERS[layerId] || 'F.SilkS';
}

/**
 * Get KiCad pad layers based on pad type and EasyEDA layer
 */
function getPadLayers(layerId: number, isSmd: boolean): string {
  if (isSmd) {
    return KI_PAD_LAYER_SMD[layerId] || '"F.Cu" "F.Paste" "F.Mask"';
  }
  return KI_PAD_LAYER_THT[layerId] || '"*.Cu" "*.Mask"';
}

/**
 * Parse SVG arc path and extract arc parameters
 * Format: "M x1 y1 A rx ry rotation large_arc sweep x2 y2"
 */
function parseSvgArcPath(
  path: string,
  originX: number,
  originY: number
): { start: Point; end: Point; mid: Point } | null {
  try {
    // Match the SVG arc command pattern
    const pathMatch = path.match(
      /M\s*([\d.-]+)\s*([\d.-]+)\s*A\s*([\d.-]+)\s*([\d.-]+)\s*([\d.-]+)\s*(\d)\s*(\d)\s*([\d.-]+)\s*([\d.-]+)/i
    );

    if (!pathMatch) return null;

    const [, x1, y1, rx, ry, rotation, largeArc, sweep, x2, y2] = pathMatch.map(Number);

    // Convert to KiCad coordinates
    const start: Point = {
      x: convertX(x1, originX),
      y: convertY(y1, originY),
    };
    const end: Point = {
      x: convertX(x2, originX),
      y: convertY(y2, originY),
    };

    // Calculate midpoint on arc (simplified - uses center approximation)
    const centerX = (x1 + x2) / 2;
    const centerY = (y1 + y2) / 2;

    // Offset midpoint perpendicular to chord based on arc direction
    const chordLen = Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2);
    const sagitta = Math.min(rx, ry) * 0.5; // Approximation

    // Normal vector to chord
    const nx = -(y2 - y1) / chordLen;
    const ny = (x2 - x1) / chordLen;

    // Adjust direction based on sweep flag (0 = counter-clockwise, 1 = clockwise)
    const direction = sweep === 1 ? 1 : -1;

    const midX = centerX + nx * sagitta * direction;
    const midY = centerY + ny * sagitta * direction;

    const mid: Point = {
      x: convertX(midX, originX),
      y: convertY(midY, originY),
    };

    return { start, end, mid };
  } catch {
    return null;
  }
}

// =============================================================================
// Footprint Converter Class
// =============================================================================

export class FootprintConverter {
  /**
   * Convert EasyEDA component data to KiCad footprint format string
   */
  convert(component: EasyEDAComponentData, options: FootprintConversionOptions = {}): string {
    const { info, footprint, model3d } = component;
    const name = this.sanitizeName(footprint.name);
    // Calculate geometric center from pads to center footprint at (0,0)
    const origin = calculatePadCenter(footprint.pads);
    const { include3DModel = false } = options;

    // Calculate bounds first (needed for text positioning)
    const bounds = this.calculateBounds(footprint, origin);

    // Map footprint type for attr token
    const attrType = footprint.type === 'tht' ? 'through_hole' : 'smd';

    let output = `(footprint "${name}"
\t(version ${KICAD_FOOTPRINT_VERSION})
\t(generator "ai-eda-jlc-mcp")
\t(layer "${KICAD_LAYERS.F_CU}")
\t(descr "${this.escapeString(info.description || name)}")
\t(tags "${this.escapeString(info.category || 'component')}")
`;

    // Add properties (with bounds for text positioning)
    output += this.generateProperties(info, name, bounds);

    // Add attributes
    output += `\t(attr ${attrType})\n`;

    // Generate all pads
    for (const pad of footprint.pads) {
      output += this.generatePad(pad, origin);
    }

    // Generate HOLEs as NPTH pads
    for (const hole of footprint.holes) {
      output += this.generateHole(hole, origin);
    }

    // Generate VIAs as through-hole pads (rare in footprints but possible)
    for (const via of footprint.vias) {
      output += this.generateVia(via, origin);
    }

    // Generate TRACKs as fp_line (silkscreen, fab, etc.)
    for (const track of footprint.tracks) {
      output += this.generateTrack(track, origin);
    }

    // Generate CIRCLEs as fp_circle
    for (const circle of footprint.circles) {
      output += this.generateCircle(circle, origin);
    }

    // Generate ARCs as fp_arc
    for (const arc of footprint.arcs) {
      output += this.generateArc(arc, origin);
    }

    // Generate RECTs as 4 fp_line elements
    for (const rect of footprint.rects) {
      output += this.generateRect(rect, origin);
    }

    // Generate TEXT elements (not REF/VAL - those are in properties)
    for (const text of footprint.texts) {
      output += this.generateText(text, origin);
    }

    // Generate SOLIDREGION elements as fp_poly
    for (const solidRegion of footprint.solidRegions) {
      output += this.generateSolidRegion(solidRegion, origin);
    }

    // Add fab reference text
    output += this.generateFabReference();

    // Add courtyard
    output += this.generateCourtyard(bounds);

    // Add embedded_fonts declaration
    output += `\t(embedded_fonts no)\n`;

    // Add 3D model reference if available
    if (include3DModel && model3d && options.modelPath) {
      output += this.generate3DModel(options.modelPath);
    }

    output += `)`;

    return output;
  }

  /**
   * Get footprint using hybrid approach:
   * - Use KiCad standard footprint if available (for common 2-pad passives)
   * - Generate custom footprint for all other components
   *
   * CONSERVATIVE APPROACH: Only uses KiCad built-ins for R/C/L passives.
   * This prevents pin-flip issues from pad numbering mismatches in ICs/transistors.
   */
  getFootprint(
    component: EasyEDAComponentData,
    options: FootprintConversionOptions = {}
  ): FootprintResult {
    const { info, footprint } = component;
    const packageName = footprint.name;
    const prefix = info.prefix;
    const actualPadCount = footprint.pads.length;

    // Try to map to KiCad standard footprint (only works for R/C/L passives)
    const mapping = mapToKicadFootprint(packageName, prefix, info.category, info.description);

    if (mapping) {
      // Validate pad count matches expected before using built-in
      const expectedPadCount = getExpectedPadCount(mapping);
      if (expectedPadCount !== null && expectedPadCount !== actualPadCount) {
        // Pad count mismatch - generate custom footprint instead
        // This catches edge cases like multi-element resistor networks
        console.warn(
          `[footprint] Pad count mismatch for ${packageName}: expected ${expectedPadCount}, got ${actualPadCount}. Generating custom footprint.`
        );
      } else {
        // Pad count matches (or unknown) - safe to use built-in
        return {
          type: 'reference',
          reference: getKicadFootprintRef(mapping),
          name: mapping.footprint,
        };
      }
    }

    // Generate custom footprint from EasyEDA data
    const content = this.convert(component, options);
    const name = this.sanitizeName(footprint.name);

    return {
      type: 'generated',
      content,
      name,
    };
  }

  // ===========================================================================
  // Element generators
  // ===========================================================================

  /**
   * Generate PAD element
   * Handles all shapes: RECT, ELLIPSE, OVAL, POLYGON
   */
  private generatePad(pad: EasyEDAPad, origin: Point): string {
    const x = convertX(pad.centerX, origin.x);
    const y = convertY(pad.centerY, origin.y);
    const w = roundTo(toMM(pad.width), 4);
    const h = roundTo(toMM(pad.height), 4);
    const rotation = pad.rotation || 0;

    // Determine if SMD or THT based on hole radius
    const isSmd = pad.holeRadius === 0;
    const padType = isSmd ? 'smd' : 'thru_hole';
    const layers = getPadLayers(pad.layerId, isSmd);

    // Handle POLYGON (custom) pads
    if (pad.shape === 'POLYGON' && pad.points) {
      return this.generatePolygonPad(pad, origin, layers);
    }

    // Map shape
    const shape = KI_PAD_SHAPE[pad.shape] || 'rect';
    const kicadShape = isSmd && shape === 'rect' ? 'roundrect' : shape;

    let output = `\t(pad "${pad.number}" ${padType} ${kicadShape}\n`;
    output += `\t\t(at ${x} ${y}${rotation !== 0 ? ` ${rotation}` : ''})\n`;
    output += `\t\t(size ${w} ${h})\n`;
    output += `\t\t(layers ${layers})\n`;

    // Add roundrect ratio for SMD rect pads
    if (kicadShape === 'roundrect') {
      output += `\t\t(roundrect_rratio 0.25)\n`;
    }

    // Add drill for THT pads
    if (!isSmd) {
      const drillDiameter = roundTo(toMM(pad.holeRadius * 2), 4);

      // Check for slot (oval hole)
      if (pad.holeLength && pad.holeLength > 0) {
        const holeW = drillDiameter;
        const holeH = roundTo(toMM(pad.holeLength), 4);
        output += `\t\t(drill oval ${holeW} ${holeH})\n`;
      } else {
        output += `\t\t(drill ${drillDiameter})\n`;
      }
    }

    output += `\t)\n`;
    return output;
  }

  /**
   * Generate custom POLYGON pad using gr_poly primitive
   * Supports both SMD and through-hole polygon pads
   *
   * Note: EasyEDA polygon pads may have holeRadius=0 even for through-hole pads.
   * We use isPlated=true as a hint and calculate drill size from polygon geometry.
   */
  private generatePolygonPad(pad: EasyEDAPad, origin: Point, _layers: string): string {
    const x = convertX(pad.centerX, origin.x);
    const y = convertY(pad.centerY, origin.y);

    // Parse polygon points
    const points = parsePoints(pad.points);
    if (points.length < 3) {
      // Fallback to rect if not enough points
      return this.generatePad({ ...pad, shape: 'RECT', points: '' }, origin);
    }

    // Determine if SMD or THT
    // Use holeRadius if available, otherwise check isPlated flag for polygon pads
    let holeRadius = pad.holeRadius;
    if (holeRadius === 0 && pad.isPlated && pad.shape === 'POLYGON') {
      // EasyEDA polygon pads often have holeRadius=0 even for THT
      // Calculate drill size from polygon bounds (inscribed circle approximation)
      holeRadius = this.calculateDrillRadiusFromPolygon(points, pad.centerX, pad.centerY);
    }

    const isSmd = holeRadius === 0;
    const padType = isSmd ? 'smd' : 'thru_hole';
    // Recalculate layers based on actual SMD/THT determination
    const layers = getPadLayers(pad.layerId, isSmd);

    // Convert points relative to pad center (no Y-flip - KiCad footprints use same Y convention)
    const polyPoints = points.map((p) => ({
      x: roundTo(toMM(p.x - pad.centerX), 2),
      y: roundTo(toMM(p.y - pad.centerY), 2),
    }));

    // Custom/polygon pads - rotation handled by polygon points
    let output = `\t(pad "${pad.number}" ${padType} custom\n`;
    output += `\t\t(at ${x} ${y})\n`;
    output += `\t\t(size 0.01 0.01)\n`;

    // Add drill for through-hole pads
    if (!isSmd) {
      const drillDiameter = roundTo(toMM(holeRadius * 2), 4);
      if (pad.holeLength && pad.holeLength > 0) {
        // Slot/oval hole
        const holeH = roundTo(toMM(pad.holeLength), 4);
        output += `\t\t(drill oval ${drillDiameter} ${holeH})\n`;
      } else {
        output += `\t\t(drill ${drillDiameter})\n`;
      }
    }

    output += `\t\t(layers ${layers})\n`;
    output += `\t\t(primitives\n`;
    output += `\t\t\t(gr_poly\n`;
    output += `\t\t\t\t(pts\n`;

    for (const pt of polyPoints) {
      output += `\t\t\t\t\t(xy ${pt.x} ${pt.y})\n`;
    }

    output += `\t\t\t\t)\n`;
    output += `\t\t\t\t(width 0.1)\n`;
    output += `\t\t\t)\n`;
    output += `\t\t)\n`;
    output += `\t)\n`;

    return output;
  }

  /**
   * Calculate drill radius from polygon points
   * Uses inscribed circle approximation: smallest distance from center to any edge
   * Returns radius in EasyEDA units (10mil)
   */
  private calculateDrillRadiusFromPolygon(points: Point[], centerX: number, centerY: number): number {
    if (points.length < 3) return 0;

    // Calculate bounding box relative to pad center
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const pt of points) {
      const relX = pt.x - centerX;
      const relY = pt.y - centerY;
      minX = Math.min(minX, relX);
      maxX = Math.max(maxX, relX);
      minY = Math.min(minY, relY);
      maxY = Math.max(maxY, relY);
    }

    // Use smaller dimension as basis for drill size
    const width = maxX - minX;
    const height = maxY - minY;
    const minDim = Math.min(width, height);

    // Drill is typically 60% of the smallest copper dimension
    // This accounts for annular ring requirements
    const drillDiameter = minDim * 0.6;
    return drillDiameter / 2; // Return radius
  }

  /**
   * Generate HOLE as NPTH pad
   */
  private generateHole(hole: EasyEDAHole, origin: Point): string {
    const x = convertX(hole.centerX, origin.x);
    const y = convertY(hole.centerY, origin.y);
    const diameter = roundTo(toMM(hole.radius * 2), 4);

    return `\t(pad "" np_thru_hole circle
\t\t(at ${x} ${y})
\t\t(size ${diameter} ${diameter})
\t\t(drill ${diameter})
\t\t(layers "*.Cu" "*.Mask")
\t)\n`;
  }

  /**
   * Generate VIA as through-hole pad (no number)
   */
  private generateVia(via: EasyEDAVia, origin: Point): string {
    const x = convertX(via.centerX, origin.x);
    const y = convertY(via.centerY, origin.y);
    const outerDiameter = roundTo(toMM(via.diameter), 4);
    const drillDiameter = roundTo(toMM(via.radius * 2), 4);

    return `\t(pad "" thru_hole circle
\t\t(at ${x} ${y})
\t\t(size ${outerDiameter} ${outerDiameter})
\t\t(drill ${drillDiameter})
\t\t(layers "*.Cu" "*.Mask")
\t)\n`;
  }

  /**
   * Generate TRACK as fp_line segments
   */
  private generateTrack(track: EasyEDATrack, origin: Point): string {
    const layer = getLayer(track.layerId);
    const strokeWidth = roundTo(toMM(track.strokeWidth), 2);
    const points = parsePoints(track.points);

    if (points.length < 2) return '';

    let output = '';
    for (let i = 0; i < points.length - 1; i++) {
      const x1 = convertX(points[i].x, origin.x);
      const y1 = convertY(points[i].y, origin.y);
      const x2 = convertX(points[i + 1].x, origin.x);
      const y2 = convertY(points[i + 1].y, origin.y);

      output += `\t(fp_line
\t\t(start ${x1} ${y1})
\t\t(end ${x2} ${y2})
\t\t(stroke
\t\t\t(width ${strokeWidth})
\t\t\t(type solid)
\t\t)
\t\t(layer "${layer}")
\t)\n`;
    }

    return output;
  }

  /**
   * Generate CIRCLE as fp_circle
   */
  private generateCircle(circle: EasyEDACircle, origin: Point): string {
    const cx = convertX(circle.cx, origin.x);
    const cy = convertY(circle.cy, origin.y);
    const r = roundTo(toMM(circle.radius), 4);
    const strokeWidth = roundTo(toMM(circle.strokeWidth), 2);
    const layer = getLayer(circle.layerId);

    // KiCad fp_circle uses center and end point (point on circumference)
    const endX = roundTo(cx + r, 4);

    return `\t(fp_circle
\t\t(center ${cx} ${cy})
\t\t(end ${endX} ${cy})
\t\t(stroke
\t\t\t(width ${strokeWidth})
\t\t\t(type solid)
\t\t)
\t\t(layer "${layer}")
\t)\n`;
  }

  /**
   * Generate ARC as fp_arc (from SVG path)
   */
  private generateArc(arc: EasyEDAArc, origin: Point): string {
    const layer = getLayer(arc.layerId);
    const strokeWidth = roundTo(toMM(arc.strokeWidth), 2);

    const arcData = parseSvgArcPath(arc.path, origin.x, origin.y);
    if (!arcData) return '';

    const { start, end, mid } = arcData;

    return `\t(fp_arc
\t\t(start ${start.x} ${start.y})
\t\t(mid ${mid.x} ${mid.y})
\t\t(end ${end.x} ${end.y})
\t\t(stroke
\t\t\t(width ${strokeWidth})
\t\t\t(type solid)
\t\t)
\t\t(layer "${layer}")
\t)\n`;
  }

  /**
   * Generate RECT as 4 fp_line elements
   */
  private generateRect(rect: EasyEDARect, origin: Point): string {
    const layer = getLayer(rect.layerId);
    const strokeWidth = roundTo(toMM(rect.strokeWidth), 2);

    const x1 = convertX(rect.x, origin.x);
    const y1 = convertY(rect.y, origin.y);
    const x2 = convertX(rect.x + rect.width, origin.x);
    const y2 = convertY(rect.y + rect.height, origin.y);

    // Generate 4 lines for rectangle
    const lines = [
      { start: [x1, y1], end: [x2, y1] }, // top
      { start: [x2, y1], end: [x2, y2] }, // right
      { start: [x2, y2], end: [x1, y2] }, // bottom
      { start: [x1, y2], end: [x1, y1] }, // left
    ];

    let output = '';
    for (const line of lines) {
      output += `\t(fp_line
\t\t(start ${line.start[0]} ${line.start[1]})
\t\t(end ${line.end[0]} ${line.end[1]})
\t\t(stroke
\t\t\t(width ${strokeWidth})
\t\t\t(type solid)
\t\t)
\t\t(layer "${layer}")
\t)\n`;
    }

    return output;
  }

  /**
   * Generate TEXT as fp_text (user text, not REF/VAL)
   */
  private generateText(text: EasyEDAText, origin: Point): string {
    // Skip if not displayed or is reference/value placeholder
    if (!text.isDisplayed) return '';
    if (text.type === 'N' || text.type === 'P') return ''; // Netname or prefix

    const x = convertX(text.centerX, origin.x);
    const y = convertY(text.centerY, origin.y);
    const layer = getLayer(text.layerId);
    const fontSize = roundTo(toMM(text.fontSize), 2);
    const rotation = text.rotation || 0;

    // Use EasyEDA's text alignment type directly
    // type "L" = left-aligned (text starts at position)
    // type "R" = right-aligned (text ends at position)
    // type "C" or others = center-aligned
    let justify = '';
    if (text.type === 'L') {
      justify = 'left';
    } else if (text.type === 'R') {
      justify = 'right';
    }
    // Default (no justify) = center-aligned

    return `\t(fp_text user "${this.escapeString(text.text)}"
\t\t(at ${x} ${y}${rotation !== 0 ? ` ${rotation}` : ''})
\t\t(layer "${layer}")
\t\t(effects
\t\t\t(font
\t\t\t\t(size ${fontSize} ${fontSize})
\t\t\t\t(thickness ${roundTo(fontSize * 0.15, 2)})
\t\t\t)
${justify ? `\t\t\t(justify ${justify})\n` : ''}\t\t)
\t)\n`;
  }

  /**
   * Generate SOLIDREGION as fp_poly (filled polygon)
   * Parses SVG path with M/L/Z commands and converts to KiCad polygon
   */
  private generateSolidRegion(region: EasyEDASolidRegion, origin: Point): string {
    // Skip EasyEDA internal layers (99, 100, 101) - these are hidden visual helpers
    // Layer 99: Component body boundary
    // Layer 100: Pad/solder mask region boundaries
    // Layer 101: Internal reference
    if (region.layerId === 99 || region.layerId === 100 || region.layerId === 101) {
      return '';
    }

    const layer = getLayer(region.layerId);
    const points = this.parseSvgPathToPoints(region.path, origin);

    if (points.length < 3) return '';

    let output = `\t(fp_poly\n`;
    output += `\t\t(pts\n`;

    for (const pt of points) {
      output += `\t\t\t(xy ${pt.x} ${pt.y})\n`;
    }

    output += `\t\t)\n`;
    output += `\t\t(stroke\n`;
    output += `\t\t\t(width 0)\n`;
    output += `\t\t\t(type solid)\n`;
    output += `\t\t)\n`;
    output += `\t\t(fill solid)\n`;
    output += `\t\t(layer "${layer}")\n`;
    output += `\t)\n`;

    return output;
  }

  /**
   * Parse SVG path string to array of points
   * Handles M, L, H, V, C, Q, A, Z commands
   * Curves are simplified to their endpoints (no interpolation)
   */
  private parseSvgPathToPoints(path: string, origin: Point): Point[] {
    const points: Point[] = [];
    let currentX = 0,
      currentY = 0;
    let startX = 0,
      startY = 0;

    // Match all SVG path commands with their arguments
    const commandRegex = /([MLHVCSQTAZ])\s*([^MLHVCSQTAZ]*)/gi;
    let match;

    while ((match = commandRegex.exec(path)) !== null) {
      const cmd = match[1].toUpperCase();
      const args = match[2]
        .trim()
        .split(/[\s,]+/)
        .map(parseFloat)
        .filter((n) => !isNaN(n));

      switch (cmd) {
        case 'M': // moveto
          if (args.length >= 2) {
            currentX = args[0];
            currentY = args[1];
            if (points.length === 0) {
              startX = currentX;
              startY = currentY;
            }
            points.push({
              x: convertX(currentX, origin.x),
              y: convertY(currentY, origin.y),
            });
          }
          break;
        case 'L': // lineto
          if (args.length >= 2) {
            currentX = args[0];
            currentY = args[1];
            points.push({
              x: convertX(currentX, origin.x),
              y: convertY(currentY, origin.y),
            });
          }
          break;
        case 'H': // horizontal lineto
          if (args.length >= 1) {
            currentX = args[0];
            points.push({
              x: convertX(currentX, origin.x),
              y: convertY(currentY, origin.y),
            });
          }
          break;
        case 'V': // vertical lineto
          if (args.length >= 1) {
            currentY = args[0];
            points.push({
              x: convertX(currentX, origin.x),
              y: convertY(currentY, origin.y),
            });
          }
          break;
        case 'C': // cubic bezier - use endpoint (last 2 args)
          if (args.length >= 6) {
            currentX = args[4];
            currentY = args[5];
            points.push({
              x: convertX(currentX, origin.x),
              y: convertY(currentY, origin.y),
            });
          }
          break;
        case 'S': // smooth cubic bezier - use endpoint (last 2 args)
          if (args.length >= 4) {
            currentX = args[2];
            currentY = args[3];
            points.push({
              x: convertX(currentX, origin.x),
              y: convertY(currentY, origin.y),
            });
          }
          break;
        case 'Q': // quadratic bezier - use endpoint (last 2 args)
          if (args.length >= 4) {
            currentX = args[2];
            currentY = args[3];
            points.push({
              x: convertX(currentX, origin.x),
              y: convertY(currentY, origin.y),
            });
          }
          break;
        case 'T': // smooth quadratic bezier - use endpoint
          if (args.length >= 2) {
            currentX = args[0];
            currentY = args[1];
            points.push({
              x: convertX(currentX, origin.x),
              y: convertY(currentY, origin.y),
            });
          }
          break;
        case 'A': // arc - use endpoint (last 2 args)
          if (args.length >= 7) {
            currentX = args[5];
            currentY = args[6];
            points.push({
              x: convertX(currentX, origin.x),
              y: convertY(currentY, origin.y),
            });
          }
          break;
        case 'Z': // closepath - no need to add point, polygon closes automatically
          currentX = startX;
          currentY = startY;
          break;
      }
    }

    return points;
  }

  // ===========================================================================
  // Property and outline generation
  // ===========================================================================

  /**
   * Calculate bounding box from all footprint elements
   */
  private calculateBounds(
    footprint: EasyEDAComponentData['footprint'],
    origin: Point
  ): BoundingBox {
    let minX = Infinity,
      maxX = -Infinity;
    let minY = Infinity,
      maxY = -Infinity;

    const updateBounds = (x: number, y: number, margin = 0) => {
      minX = Math.min(minX, x - margin);
      maxX = Math.max(maxX, x + margin);
      minY = Math.min(minY, y - margin);
      maxY = Math.max(maxY, y + margin);
    };

    // Include pads
    for (const pad of footprint.pads) {
      const x = convertX(pad.centerX, origin.x);
      const y = convertY(pad.centerY, origin.y);
      const hw = toMM(pad.width) / 2;
      const hh = toMM(pad.height) / 2;
      updateBounds(x, y, Math.max(hw, hh));
    }

    // Include holes
    for (const hole of footprint.holes) {
      const x = convertX(hole.centerX, origin.x);
      const y = convertY(hole.centerY, origin.y);
      const r = toMM(hole.radius);
      updateBounds(x, y, r);
    }

    // Include tracks
    for (const track of footprint.tracks) {
      const points = parsePoints(track.points);
      for (const pt of points) {
        const x = convertX(pt.x, origin.x);
        const y = convertY(pt.y, origin.y);
        updateBounds(x, y);
      }
    }

    // Include circles
    for (const circle of footprint.circles) {
      const x = convertX(circle.cx, origin.x);
      const y = convertY(circle.cy, origin.y);
      const r = toMM(circle.radius);
      updateBounds(x, y, r);
    }

    // Handle empty case
    if (!isFinite(minX)) {
      return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    }

    return { minX, maxX, minY, maxY };
  }

  /**
   * Generate footprint properties
   * Positions Reference above courtyard and Value below courtyard
   */
  private generateProperties(info: EasyEDAComponentData['info'], name: string, bounds: BoundingBox): string {
    let props = '';

    // Calculate text positions based on courtyard bounds
    // Add margin for courtyard (0.25) + text offset (1.5)
    const textOffset = 1.75;
    const refY = roundTo(bounds.minY - textOffset, 2);
    const valY = roundTo(bounds.maxY + textOffset, 2);

    // Reference (required, visible on silkscreen) - above courtyard
    props += `\t(property "Reference" "REF**"
\t\t(at 0 ${refY} 0)
\t\t(layer "${KICAD_LAYERS.F_SILKS}")
\t\t(effects
\t\t\t(font
\t\t\t\t(size 1 1)
\t\t\t\t(thickness 0.15)
\t\t\t)
\t\t)
\t)\n`;

    // Value (required, visible on fab layer) - below courtyard
    props += `\t(property "Value" "${this.escapeString(this.sanitizeName(info.name))}"
\t\t(at 0 ${valY} 0)
\t\t(layer "${KICAD_LAYERS.F_FAB}")
\t\t(effects
\t\t\t(font
\t\t\t\t(size 1 1)
\t\t\t\t(thickness 0.15)
\t\t\t)
\t\t)
\t)\n`;

    // Hidden properties
    const hiddenProps: Array<{ key: string; value: string | undefined }> = [
      { key: 'Description', value: info.description },
      { key: 'LCSC', value: info.lcscId },
      { key: 'Manufacturer', value: info.manufacturer },
    ];

    // Add component attributes
    if (info.attributes) {
      for (const [key, value] of Object.entries(info.attributes)) {
        hiddenProps.push({ key, value: String(value) });
      }
    }

    for (const { key, value } of hiddenProps) {
      if (value) {
        props += `\t(property "${this.escapeString(key)}" "${this.escapeString(value)}"
\t\t(at 0 0 0)
\t\t(layer "${KICAD_LAYERS.F_FAB}")
\t\thide
\t\t(effects
\t\t\t(font
\t\t\t\t(size 1.27 1.27)
\t\t\t\t(thickness 0.15)
\t\t\t)
\t\t)
\t)\n`;
      }
    }

    return props;
  }

  /**
   * Generate fab reference text
   */
  private generateFabReference(): string {
    return `\t(fp_text user "\${REFERENCE}"
\t\t(at 0 0 0)
\t\t(layer "${KICAD_LAYERS.F_FAB}")
\t\t(effects
\t\t\t(font
\t\t\t\t(size 0.5 0.5)
\t\t\t\t(thickness 0.08)
\t\t\t)
\t\t)
\t)\n`;
  }

  /**
   * Generate courtyard outline
   */
  private generateCourtyard(bounds: BoundingBox): string {
    const margin = 0.25;
    const minX = roundTo(bounds.minX - margin, 2);
    const maxX = roundTo(bounds.maxX + margin, 2);
    const minY = roundTo(bounds.minY - margin, 2);
    const maxY = roundTo(bounds.maxY + margin, 2);

    const lines = [
      { start: [minX, minY], end: [maxX, minY] },
      { start: [maxX, minY], end: [maxX, maxY] },
      { start: [maxX, maxY], end: [minX, maxY] },
      { start: [minX, maxY], end: [minX, minY] },
    ];

    let output = '';
    for (const line of lines) {
      output += `\t(fp_line
\t\t(start ${line.start[0]} ${line.start[1]})
\t\t(end ${line.end[0]} ${line.end[1]})
\t\t(stroke
\t\t\t(width 0.05)
\t\t\t(type solid)
\t\t)
\t\t(layer "${KICAD_LAYERS.F_CRTYD}")
\t)\n`;
    }

    return output;
  }

  /**
   * Generate 3D model reference
   */
  private generate3DModel(modelPath: string): string {
    return `\t(model "${modelPath}"
\t\t(offset
\t\t\t(xyz 0 0 0)
\t\t)
\t\t(scale
\t\t\t(xyz 1 1 1)
\t\t)
\t\t(rotate
\t\t\t(xyz 0 0 0)
\t\t)
\t)\n`;
  }

  // ===========================================================================
  // Utility methods
  // ===========================================================================

  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_.-]/g, '_');
  }

  private escapeString(str: string): string {
    return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
  }
}

export const footprintConverter = new FootprintConverter();
