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
  EasyEDA3DModel,
} from '../types/index.js';
import { KICAD_FOOTPRINT_VERSION, KICAD_LAYERS } from '../constants/index.js';
import { roundTo } from '../utils/index.js';
import { mapToKicadFootprint, getKicadFootprintRef, getExpectedPadCount } from './footprint-mapper.js';
import { parseSvgArcPath, svgArcToCenter } from './svg-arc.js';
import { flattenSvgPath, type SvgSubpath } from './svg-path.js';

// =============================================================================
// Constants - EasyEDA to KiCad mappings from easyeda2kicad.py
// =============================================================================

// EasyEDA uses 10mil units (0.254mm per unit)
const EE_TO_MM = 10 * 0.0254; // = 0.254
const CURVE_TOLERANCE = 0.005 / EE_TO_MM;

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

// EasyEDA graphics layers with no KiCad counterpart: 0 = unassigned (JLC library
// tooling puts package body outlines here), 99/100/101 = editor doc helpers.
const INTERNAL_LAYER_IDS = [0, 99, 100, 101];

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

function normalize3DModelRotation(rotation: number): number {
  return ((360 - rotation) % 360 + 360) % 360;
}

/**
 * Calculate the geometric center of pads (in EasyEDA units, before conversion)
 * Used to center the footprint at (0,0) in KiCad
 */
function calculatePadCenter(pads: PadGeometry[]): Point {
  if (pads.length === 0) return { x: 0, y: 0 };
  const bounds = mergeBounds(pads.map((pad) => pad.bounds));
  return { x: (bounds.minX + bounds.maxX) / 2, y: (bounds.minY + bounds.maxY) / 2 };
}

interface PadGeometry {
  source: EasyEDAPad;
  points: Point[];
  bounds: BoundingBox;
  drillCenter: Point;
  rotation: number;
  slot: boolean;
  custom: boolean;
}

function finite(value: number, label: string, minimum?: number): void {
  if (!Number.isFinite(value) || (minimum !== undefined && value < minimum)) {
    throw new Error(`Cannot convert ${label}: expected a finite value${minimum === undefined ? '' : ` >= ${minimum}`}`);
  }
}

function positive(value: number, label: string): void {
  finite(value, label);
  if (value <= 0 || roundTo(toMM(value), 4) <= 0) {
    throw new Error(`Cannot convert ${label}: dimension must be positive at KiCad precision`);
  }
}

// KiCad pad angles are counterclockwise in a downward-positive coordinate system.
function rotate(point: Point, angle: number): Point {
  const radians = angle * Math.PI / 180;
  const c = Math.cos(radians), s = Math.sin(radians);
  return { x: point.x * c + point.y * s, y: -point.x * s + point.y * c };
}

function pointBounds(points: Point[], margin = 0): BoundingBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const point of points) {
    finite(point.x, 'geometry X'); finite(point.y, 'geometry Y');
    minX = Math.min(minX, point.x - margin); maxX = Math.max(maxX, point.x + margin);
    minY = Math.min(minY, point.y - margin); maxY = Math.max(maxY, point.y + margin);
  }
  return { minX, maxX, minY, maxY };
}

function mergeBounds(bounds: BoundingBox[]): BoundingBox {
  return pointBounds(bounds.flatMap((box) => [
    { x: box.minX, y: box.minY }, { x: box.maxX, y: box.maxY },
  ]));
}

function insidePolygon(point: Point, polygon: Point[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i], b = polygon[j];
    if ((a.y > point.y) !== (b.y > point.y) &&
      point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

function contoursOverlap(a: Point[], b: Point[]): boolean {
  if (insidePolygon(a[0], b) || insidePolygon(b[0], a)) return true;
  for (let i = 0; i < a.length; i++) {
    const p = a[i], q = a[(i + 1) % a.length];
    for (let j = 0; j < b.length; j++) {
      const r = b[j], s = b[(j + 1) % b.length];
      if (Math.max(p.x, q.x) < Math.min(r.x, s.x) || Math.max(r.x, s.x) < Math.min(p.x, q.x) ||
        Math.max(p.y, q.y) < Math.min(r.y, s.y) || Math.max(r.y, s.y) < Math.min(p.y, q.y)) continue;
      const pqr = (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
      const pqs = (q.x - p.x) * (s.y - p.y) - (q.y - p.y) * (s.x - p.x);
      const rsp = (s.x - r.x) * (p.y - r.y) - (s.y - r.y) * (p.x - r.x);
      const rsq = (s.x - r.x) * (q.y - r.y) - (s.y - r.y) * (q.x - r.x);
      if (pqr * pqs <= 0 && rsp * rsq <= 0) return true;
    }
  }
  return false;
}

function preparePad(pad: EasyEDAPad): PadGeometry {
  const label = `pad "${pad.number}"`;
  finite(pad.centerX, `${label} X`); finite(pad.centerY, `${label} Y`);
  positive(pad.width, `${label} width`); positive(pad.height, `${label} height`);
  finite(pad.rotation, `${label} rotation`);
  finite(pad.holeRadius, `${label} hole radius`, 0);
  finite(pad.holeLength, `${label} hole length`, 0);
  if (!(pad.shape in KI_PAD_SHAPE)) throw new Error(`Cannot convert ${label}: unsupported shape ${pad.shape}`);
  if (![1, 2, 11].includes(pad.layerId)) throw new Error(`Cannot convert ${label}: unsupported pad layer ${pad.layerId}`);
  if (pad.holeRadius === 0 && (pad.layerId === 11 || pad.holeLength > 0 || pad.holePoint.trim())) {
    throw new Error(`Cannot convert ${label}: multilayer or slot pad has no explicit drill diameter; refusing to infer a drill`);
  }
  if (pad.holeRadius > 0) positive(pad.holeRadius * 2, `${label} drill diameter`);
  const diameter = pad.holeRadius * 2;
  if (pad.holeLength > 0 && pad.holeLength < diameter - 1e-9) {
    throw new Error(`Cannot convert ${label}: slot total length is smaller than its drill diameter`);
  }
  const slot = pad.holeLength > diameter + 1e-9;
  let drillCenter = { x: pad.centerX, y: pad.centerY };
  let rotation = pad.shape === 'POLYGON' ? 0 : pad.rotation;
  if (pad.holePoint.trim()) {
    const endpoints = parsePoints(pad.holePoint);
    if (endpoints.length !== 2) throw new Error(`Cannot convert ${label}: holePoint requires two endpoints`);
    const span = Math.hypot(endpoints[1].x - endpoints[0].x, endpoints[1].y - endpoints[0].y);
    // Endpoints locate the straight slot segment, not just its direction.
    // Allow 1 µm for independently rounded source fields.
    if (Math.abs(span - (slot ? pad.holeLength - diameter : 0)) * EE_TO_MM > 0.001) {
      throw new Error(`Cannot convert ${label}: slot endpoints contradict the explicit drill length`);
    }
    drillCenter = { x: (endpoints[0].x + endpoints[1].x) / 2, y: (endpoints[0].y + endpoints[1].y) / 2 };
    if (slot) {
      if (endpoints[0].x === endpoints[1].x && endpoints[0].y === endpoints[1].y) {
        throw new Error(`Cannot convert ${label}: slot endpoints do not define an axis`);
      }
      rotation = -Math.atan2(endpoints[1].y - endpoints[0].y, endpoints[1].x - endpoints[0].x) * 180 / Math.PI;
    }
  } else if (slot) {
    throw new Error(`Cannot convert ${label}: slot orientation is ambiguous without holePoint endpoints`);
  }
  const hw = pad.width / 2, hh = pad.height / 2;
  let points: Point[];
  if (pad.shape === 'POLYGON') {
    points = parsePoints(pad.points);
    if (points.length > 1 && points[0].x === points[points.length - 1].x && points[0].y === points[points.length - 1].y) points.pop();
    if (points.length < 3) throw new Error(`Cannot convert ${label}: polygon needs at least three vertices`);
  } else {
    let local: Point[];
    if (pad.shape === 'RECT') {
      local = [{ x: -hw, y: -hh }, { x: hw, y: -hh }, { x: hw, y: hh }, { x: -hw, y: hh }];
    } else {
      const rx = pad.shape === 'OVAL' ? Math.min(hw, hh) : hw;
      const ry = pad.shape === 'OVAL' ? Math.min(hw, hh) : hh;
      const dx = hw - rx, dy = hh - ry;
      const path = `M${dx + rx} ${-dy} L${dx + rx} ${dy} A${rx} ${ry} 0 0 1 ${dx} ${dy + ry} L${-dx} ${dy + ry} A${rx} ${ry} 0 0 1 ${-dx - rx} ${dy} L${-dx - rx} ${-dy} A${rx} ${ry} 0 0 1 ${-dx} ${-dy - ry} L${dx} ${-dy - ry} A${rx} ${ry} 0 0 1 ${dx + rx} ${-dy} Z`;
      local = flattenSvgPath(path, CURVE_TOLERANCE)[0].points;
    }
    points = local.map((point) => {
      const rotated = rotate(point, pad.rotation);
      return { x: rotated.x + pad.centerX, y: rotated.y + pad.centerY };
    });
  }
  const custom = pad.shape === 'POLYGON' || (pad.shape === 'ELLIPSE' && pad.width !== pad.height) ||
    (slot && Math.abs(Math.sin((rotation - pad.rotation) * Math.PI / 180)) > 1e-9);
  let bounds = pointBounds(points);
  if (pad.shape === 'ELLIPSE' || pad.shape === 'OVAL') {
    const angle = pad.rotation * Math.PI / 180, c = Math.abs(Math.cos(angle)), s = Math.abs(Math.sin(angle));
    const r = Math.min(hw, hh);
    const x = pad.shape === 'ELLIPSE' ? Math.hypot(hw * c, hh * s) : r + (hw - r) * c + (hh - r) * s;
    const y = pad.shape === 'ELLIPSE' ? Math.hypot(hw * s, hh * c) : r + (hw - r) * s + (hh - r) * c;
    bounds = { minX: pad.centerX - x, maxX: pad.centerX + x, minY: pad.centerY - y, maxY: pad.centerY + y };
  }
  return { source: pad, points, bounds, drillCenter, rotation, slot, custom };
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
  if (!pointsStr.trim()) return [];
  const values = pointsStr.trim().split(/[\s,]+/).map(Number);
  if (values.length % 2 !== 0 || values.some((value) => !Number.isFinite(value))) {
    throw new Error('Cannot convert geometry: malformed coordinate pairs');
  }
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
  const layer = KI_LAYERS[layerId];
  if (!layer) throw new Error(`Cannot convert graphics on unsupported layer ${layerId}`);
  return layer;
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
    const pads = footprint.pads.map(preparePad);
    const regions = new Map(footprint.solidRegions.map((region) => [region, this.prepareRegion(region)]));
    const origin = calculatePadCenter(pads);
    const { include3DModel = false } = options;

    // Calculate bounds first (needed for text positioning)
    const bounds = this.calculateBounds(footprint, origin, pads, regions);

    // Map footprint type for attr token
    const attrType = pads.some((pad) => pad.source.holeRadius > 0) || footprint.vias.length > 0 ? 'through_hole' : 'smd';

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
    for (const pad of pads) {
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
      output += this.generateSolidRegion(solidRegion, regions.get(solidRegion)!, origin);
    }

    // Add fab reference text
    output += this.generateFabReference();

    // Add courtyard
    output += this.generateCourtyard(bounds);

    // Add embedded_fonts declaration
    output += `\t(embedded_fonts no)\n`;

    // Add 3D model reference if available
    if (include3DModel && model3d && options.modelPath) {
      output += this.generate3DModel(options.modelPath, model3d, origin);
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
      } else if (
        actualPadCount === 2 &&
        footprint.pads.some((pad) => pad.number === '1') &&
        footprint.pads.some((pad) => pad.number === '2') &&
        this.canSubstituteStandard(footprint)
      ) {
        // Standard passives use pads 1/2; do not break source symbol-to-pad identities.
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
  private generatePad(geometry: PadGeometry, origin: Point): string {
    const { source: pad, drillCenter, rotation, slot, custom } = geometry;
    const isSmd = pad.holeRadius === 0;
    // KiCad's pad position is the drill center; its serialized drill offset moves copper.
    const position = isSmd ? { x: pad.centerX, y: pad.centerY } : drillCenter;
    const offset = rotate({ x: pad.centerX - position.x, y: pad.centerY - position.y }, -rotation);
    const type = isSmd ? 'smd' : pad.isPlated ? 'thru_hole' : 'np_thru_hole';
    const shape = custom ? 'custom' : KI_PAD_SHAPE[pad.shape];
    const mm = (value: number) => roundTo(toMM(value), 4);
    let anchorSize = 0;
    if (custom) {
      const center = { x: pad.centerX, y: pad.centerY };
      if (!insidePolygon(center, geometry.points)) {
        throw new Error(`Cannot convert pad "${pad.number}": custom pad anchor is outside its copper polygon`);
      }
      let clearance = Infinity;
      for (let i = 0; i < geometry.points.length; i++) {
        const a = geometry.points[i], b = geometry.points[(i + 1) % geometry.points.length];
        const dx = b.x - a.x, dy = b.y - a.y;
        const length2 = dx * dx + dy * dy;
        const t = length2 === 0 ? 0 : Math.max(0, Math.min(1, ((center.x - a.x) * dx + (center.y - a.y) * dy) / length2));
        clearance = Math.min(clearance, Math.hypot(center.x - a.x - t * dx, center.y - a.y - t * dy));
      }
      anchorSize = Math.min(0.01, Math.floor(toMM(clearance) * 10000) / 10000);
      if (anchorSize <= 0) throw new Error(`Cannot convert pad "${pad.number}": no interior custom anchor at KiCad precision`);
    }
    let output = `\t(pad "${this.escapeString(pad.number)}" ${type} ${shape}\n`;
    output += `\t\t(at ${convertX(position.x, origin.x)} ${convertY(position.y, origin.y)}${rotation !== 0 ? ` ${roundTo(rotation, 6)}` : ''})\n`;
    output += `\t\t(size ${custom ? `${anchorSize} ${anchorSize}` : `${mm(pad.width)} ${mm(pad.height)}`})\n`;
    output += `\t\t(layers ${getPadLayers(pad.layerId, isSmd)})\n`;
    if (!isSmd) {
      const diameter = mm(pad.holeRadius * 2);
      const dimensions = slot ? `oval ${mm(pad.holeLength)} ${diameter}` : `${diameter}`;
      output += `\t\t(drill ${dimensions}${offset.x !== 0 || offset.y !== 0 ? ` (offset ${mm(offset.x)} ${mm(offset.y)})` : ''})\n`;
    }
    if (custom) {
      output += `\t\t(options (clearance outline) (anchor circle))\n\t\t(primitives\n`;
      if (pad.shape === 'OVAL') {
        // A stroked segment is an exact capsule even when the slot has a different axis.
        const radius = Math.min(pad.width, pad.height) / 2;
        const endpoint = rotate({ x: pad.width / 2 - radius, y: pad.height / 2 - radius }, pad.rotation - rotation);
        output += `\t\t\t(gr_line (start ${mm(-endpoint.x)} ${mm(-endpoint.y)}) (end ${mm(endpoint.x)} ${mm(endpoint.y)}) (width ${mm(radius * 2)}))\n`;
      } else if (pad.shape === 'ELLIPSE' && pad.width === pad.height) {
        output += `\t\t\t(gr_circle (center 0 0) (end ${mm(pad.width / 2)} 0) (width 0) (fill yes))\n`;
      } else {
        const points = geometry.points.map((point) => rotate({ x: point.x - pad.centerX, y: point.y - pad.centerY }, -rotation));
        output += `\t\t\t(gr_poly\n\t\t\t\t(pts\n`;
        output += points.map((point) => `\t\t\t\t\t(xy ${mm(point.x)} ${mm(point.y)})\n`).join('');
        output += `\t\t\t\t)\n\t\t\t\t(width 0)\n\t\t\t\t(fill yes)\n\t\t\t)\n`;
      }
      output += `\t\t)\n`;
    }
    return output + '\t)\n';
  }

  private canSubstituteStandard(footprint: EasyEDAComponentData['footprint']): boolean {
    const benignLayer = (layer: number) => [0, 3, 4, 12, 13, 14, 15, 99, 100, 101].includes(layer);
    if (footprint.holes.length || footprint.vias.length ||
      footprint.solidRegions.some((region) => !INTERNAL_LAYER_IDS.includes(region.layerId)) ||
      [...footprint.tracks, ...footprint.circles, ...footprint.arcs, ...footprint.rects, ...footprint.texts].some((item) => !benignLayer(item.layerId))) return false;
    const [a, b] = footprint.pads;
    if (!a || !b || footprint.pads.some((pad) =>
      pad.shape !== 'RECT' || pad.layerId !== 1 || pad.holeRadius !== 0 || pad.holeLength !== 0 ||
      pad.holePoint.trim() ||
      ![pad.centerX, pad.centerY, pad.width, pad.height, pad.rotation].every(Number.isFinite) ||
      pad.width <= 0 || pad.height <= 0)) return false;
    for (const pad of footprint.pads) {
      if (!pad.points.trim()) continue;
      let supplied: Point[];
      try { supplied = parsePoints(pad.points); } catch { return false; }
      if (supplied.length === 5 && supplied[0].x === supplied[4].x && supplied[0].y === supplied[4].y) supplied.pop();
      const corners = preparePad(pad).points;
      if (supplied.length !== 4 || !corners.every(corner => supplied.some(point =>
        Math.hypot(point.x - corner.x, point.y - corner.y) * EE_TO_MM <= 0.001))) return false;
    }
    if (a.width !== b.width || a.height !== b.height || (a.rotation - b.rotation) % 180 !== 0) return false;
    const delta = rotate({ x: b.centerX - a.centerX, y: b.centerY - a.centerY }, -a.rotation);
    return (Math.abs(delta.x) < 1e-9 && Math.abs(delta.y) > a.height) ||
      (Math.abs(delta.y) < 1e-9 && Math.abs(delta.x) > a.width);
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
    if (INTERNAL_LAYER_IDS.includes(track.layerId)) return '';
    return this.generateLines(parsePoints(track.points), track.strokeWidth, track.layerId, origin);
  }

  private generateLines(points: Point[], width: number, layerId: number, origin: Point): string {
    const layer = getLayer(layerId);
    const strokeWidth = roundTo(toMM(width), 4);

    if (points.length < 2) return '';

    let output = '';
    for (let i = 0; i < points.length - 1; i++) {
      const x1 = convertX(points[i].x, origin.x);
      const y1 = convertY(points[i].y, origin.y);
      const x2 = convertX(points[i + 1].x, origin.x);
      const y2 = convertY(points[i + 1].y, origin.y);
      if (x1 === x2 && y1 === y2) continue;

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
    if (INTERNAL_LAYER_IDS.includes(circle.layerId)) return '';
    const cx = convertX(circle.cx, origin.x);
    const cy = convertY(circle.cy, origin.y);
    const r = roundTo(toMM(circle.radius), 4);
    const strokeWidth = roundTo(toMM(circle.strokeWidth), 4);
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
   * Generate circular SVG arcs as fp_arc and tessellate elliptical arcs as fp_line.
   */
  private generateArc(arc: EasyEDAArc, origin: Point): string {
    if (INTERNAL_LAYER_IDS.includes(arc.layerId)) return '';
    const numericTokens = arc.path.match(/[-+]?(?:\d*\.?\d+)(?:[eE][-+]?\d+)?/g);
    const params = /^\s*M[\s\d.,+-]*A[\s\d.,+-]*\s*$/.test(arc.path) && numericTokens?.length === 9
      ? parseSvgArcPath(arc.path) : null;
    if (!params) {
      return flattenSvgPath(arc.path, CURVE_TOLERANCE)
        .map((subpath) => this.generateLines(subpath.closed ? [...subpath.points, subpath.points[0]] : subpath.points, arc.strokeWidth, arc.layerId, origin)).join('');
    }
    if (params.x1 === params.x2 && params.y1 === params.y2) return '';

    const startPoint = { x: params.x1, y: params.y1 };
    const endPoint = { x: params.x2, y: params.y2 };
    const center = svgArcToCenter(params);
    if (!center) {
      // SVG specifies a straight segment when either radius is zero.
      return this.generateLines([startPoint, endPoint], arc.strokeWidth, arc.layerId, origin);
    }
    if (![center.cx, center.cy, center.rx, center.ry, center.deltaAngle].every(Number.isFinite)) {
      throw new Error(`Cannot convert arc "${arc.id}": non-finite arc geometry`);
    }

    if (center.rx !== center.ry) {
      const points = flattenSvgPath(arc.path, CURVE_TOLERANCE)[0].points;
      return this.generateLines(points, arc.strokeWidth, arc.layerId, origin);
    }

    const angle = center.startAngle + center.deltaAngle / 2 + params.phi * Math.PI / 180;
    const start = { x: convertX(params.x1, origin.x), y: convertY(params.y1, origin.y) };
    const end = { x: convertX(params.x2, origin.x), y: convertY(params.y2, origin.y) };
    const mid = {
      x: convertX(center.cx + center.rx * Math.cos(angle), origin.x),
      y: convertY(center.cy + center.ry * Math.sin(angle), origin.y),
    };
    if (
      (mid.x - start.x) * (end.y - start.y) ===
      (mid.y - start.y) * (end.x - start.x)
    ) {
      // Rounding can collapse a tiny arc; never emit an invalid collinear fp_arc.
      return this.generateLines([startPoint, endPoint], arc.strokeWidth, arc.layerId, origin);
    }

    const layer = getLayer(arc.layerId);
    const strokeWidth = roundTo(toMM(arc.strokeWidth), 4);

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
    if (INTERNAL_LAYER_IDS.includes(rect.layerId)) return '';
    const layer = getLayer(rect.layerId);
    const strokeWidth = roundTo(toMM(rect.strokeWidth), 4);

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
    if (INTERNAL_LAYER_IDS.includes(text.layerId)) return '';
    finite(text.centerX, `text "${text.id}" X`); finite(text.centerY, `text "${text.id}" Y`);
    positive(text.fontSize, `text "${text.id}" font size`); finite(text.rotation, `text "${text.id}" rotation`);
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

  /** Flatten once for both output and physical bounds; never silently fill a compound hole. */
  private prepareRegion(region: EasyEDASolidRegion): SvgSubpath[] {
    if (!['solid', 'npth', 'none', 'cutout'].includes(region.fillType)) {
      throw new Error(`Cannot convert solid region "${region.id}": unsupported fillType "${region.fillType}"`);
    }
    const subpaths = flattenSvgPath(region.path, CURVE_TOLERANCE);
    if (subpaths.length === 0) throw new Error(`Cannot convert solid region "${region.id}": empty path`);
    for (const subpath of subpaths) {
      const points = subpath.points;
      if (points.length > 1 && points[0].x === points[points.length - 1].x && points[0].y === points[points.length - 1].y) points.pop();
      const area = points.reduce((sum, point, i) => {
        const next = points[(i + 1) % points.length];
        return sum + point.x * next.y - point.y * next.x;
      }, 0);
      if (points.length < 3 || Math.abs(area) < 1e-12) {
        throw new Error(`Cannot convert solid region "${region.id}": degenerate contour`);
      }
      // SVG fill implicitly closes open subpaths.
      subpath.closed = true;
    }
    for (let i = 0; i < subpaths.length; i++) {
      for (let j = i + 1; j < subpaths.length; j++) {
        if (contoursOverlap(subpaths[i].points, subpaths[j].points)) {
          throw new Error(`Cannot convert solid region "${region.id}": compound contours contain holes or overlap`);
        }
      }
    }
    return subpaths;
  }

  private generateSolidRegion(region: EasyEDASolidRegion, subpaths: SvgSubpath[], origin: Point): string {
    if (INTERNAL_LAYER_IDS.includes(region.layerId)) return '';
    const cutout = region.fillType === 'cutout' || region.fillType === 'none';
    if (cutout && ![1, 2, 11].includes(region.layerId)) {
      throw new Error(`Cannot convert cutout "${region.id}": requires a copper layer`);
    }
    if (cutout && region.net?.trim()) {
      throw new Error(`Cannot convert cutout "${region.id}": named-net copper-area exceptions cannot be represented by a footprint keepout`);
    }
    return subpaths.map(({ points }) => {
      const pts = points.map((point) => `(xy ${convertX(point.x, origin.x)} ${convertY(point.y, origin.y)})`).join(' ');
      if (region.fillType === 'npth') {
        return this.generateLines([...points, points[0]], 0.05 / EE_TO_MM, 10, origin);
      }
      if (cutout) {
        const layers = region.layerId === 11 ? '(layers "*.Cu")' : `(layer "${getLayer(region.layerId)}")`;
        return `\t(zone (net 0) (net_name "") ${layers}
\t\t(hatch edge 0.5)
\t\t(connect_pads (clearance 0))
\t\t(min_thickness 0.01)
\t\t(keepout (tracks allowed) (vias allowed) (pads allowed) (copperpour not_allowed) (footprints allowed))
\t\t(fill (thermal_gap 0.3) (thermal_bridge_width 0.3))
\t\t(polygon (pts ${pts}))
\t)\n`;
      }
      if (region.layerId === 11) throw new Error(`Cannot convert solid region "${region.id}": multilayer static copper requires explicit copper layers`);
      return `\t(fp_poly\n\t\t(pts ${pts})\n\t\t(stroke (width 0) (type solid))\n\t\t(fill solid)\n\t\t(layer "${getLayer(region.layerId)}")\n\t)\n`;
    }).join('');
  }

  // ===========================================================================
  // Property and outline generation
  // ===========================================================================

  /**
   * Calculate bounding box from all footprint elements
   */
  private calculateBounds(
    footprint: EasyEDAComponentData['footprint'],
    origin: Point,
    pads: PadGeometry[],
    regions: Map<EasyEDASolidRegion, SvgSubpath[]>
  ): BoundingBox {
    const bounds: BoundingBox[] = [];
    for (const pad of pads) {
      bounds.push(pad.bounds);
      if (pad.source.holeRadius > 0) {
        const halfAxis = pad.slot ? (pad.source.holeLength - pad.source.holeRadius * 2) / 2 : 0;
        const axis = rotate({ x: halfAxis, y: 0 }, pad.rotation);
        bounds.push(pointBounds([
          { x: pad.drillCenter.x - axis.x, y: pad.drillCenter.y - axis.y },
          { x: pad.drillCenter.x + axis.x, y: pad.drillCenter.y + axis.y },
        ], pad.source.holeRadius));
      }
    }
    for (const hole of footprint.holes) {
      positive(hole.radius * 2, `hole "${hole.id}" diameter`);
      bounds.push(pointBounds([{ x: hole.centerX, y: hole.centerY }], hole.radius));
    }
    for (const via of footprint.vias) {
      positive(via.diameter, `via "${via.id}" diameter`);
      positive(via.radius * 2, `via "${via.id}" drill`);
      if (via.radius * 2 > via.diameter) throw new Error(`Cannot convert via "${via.id}": drill is larger than copper`);
      bounds.push(pointBounds([{ x: via.centerX, y: via.centerY }], via.diameter / 2));
    }
    for (const track of footprint.tracks) {
      finite(track.strokeWidth, `track "${track.id}" stroke`, 0);
      const points = parsePoints(track.points);
      if (points.length < 2) throw new Error(`Cannot convert track "${track.id}": fewer than two points`);
      bounds.push(pointBounds(points, track.strokeWidth / 2));
    }
    for (const circle of footprint.circles) {
      positive(circle.radius, `circle "${circle.id}" radius`);
      finite(circle.strokeWidth, `circle "${circle.id}" stroke`, 0);
      bounds.push(pointBounds([{ x: circle.cx, y: circle.cy }], circle.radius + circle.strokeWidth / 2));
    }
    for (const rect of footprint.rects) {
      positive(rect.width, `rectangle "${rect.id}" width`); positive(rect.height, `rectangle "${rect.id}" height`);
      finite(rect.strokeWidth, `rectangle "${rect.id}" stroke`, 0);
      bounds.push(pointBounds([{ x: rect.x, y: rect.y }, { x: rect.x + rect.width, y: rect.y + rect.height }], rect.strokeWidth / 2));
    }
    for (const arc of footprint.arcs) {
      finite(arc.strokeWidth, `arc "${arc.id}" stroke`, 0);
      for (const subpath of flattenSvgPath(arc.path, CURVE_TOLERANCE)) {
        if (subpath.points.length) bounds.push(pointBounds(subpath.points, arc.strokeWidth / 2 + CURVE_TOLERANCE));
      }
    }
    for (const subpaths of regions.values()) {
      for (const subpath of subpaths) {
        bounds.push(pointBounds(subpath.points, CURVE_TOLERANCE));
      }
    }
    if (bounds.length === 0) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
    const box = mergeBounds(bounds);
    return {
      minX: toMM(box.minX - origin.x), maxX: toMM(box.maxX - origin.x),
      minY: toMM(box.minY - origin.y), maxY: toMM(box.maxY - origin.y),
    };
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
    // Round outwards; nearest rounding can silently consume the specified clearance.
    const minX = Math.floor((bounds.minX - margin - 0.0001) * 100) / 100;
    const maxX = Math.ceil((bounds.maxX + margin + 0.0001) * 100) / 100;
    const minY = Math.floor((bounds.minY - margin - 0.0001) * 100) / 100;
    const maxY = Math.ceil((bounds.maxY + margin + 0.0001) * 100) / 100;

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
  private generate3DModel(
    modelPath: string,
    model3d: EasyEDA3DModel,
    origin: Point
  ): string {
    const offsetX = roundTo(toMM(model3d.translation.x - origin.x), 3);
    const offsetY = roundTo(-toMM(model3d.translation.y - origin.y), 3);
    const offsetZ = roundTo(-toMM(model3d.translation.z), 3);
    const rotateX = normalize3DModelRotation(model3d.rotation.x);
    const rotateY = normalize3DModelRotation(model3d.rotation.y);
    const rotateZ = normalize3DModelRotation(model3d.rotation.z);

    return `\t(model "${modelPath}"
\t\t(offset
\t\t\t(xyz ${offsetX} ${offsetY} ${offsetZ})
\t\t)
\t\t(scale
\t\t\t(xyz 1 1 1)
\t\t)
\t\t(rotate
\t\t\t(xyz ${rotateX} ${rotateY} ${rotateZ})
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
