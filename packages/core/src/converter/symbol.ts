/**
 * EasyEDA Symbol to KiCad Symbol Converter
 * Converts EasyEDA symbol format to KiCad .kicad_sym format (KiCad 9 compatible)
 */

import type {
  EasyEDAComponentData,
  EasyEDAPin,
  EasyEDASymbolData,
  EasyEDASymbolRect,
  EasyEDASymbolCircle,
  EasyEDASymbolEllipse,
  EasyEDASymbolPath,
  EasyEDASymbolText,
} from '../types/index.js';
import { KICAD_SYMBOL_VERSION, KICAD_DEFAULTS } from '../constants/index.js';
import { roundTo, childExpressions } from '../utils/index.js';
import { extractDisplayValue } from './value-normalizer.js';
import { getSymbolTemplate, type SymbolTemplate } from './symbol-templates.js';
import { getLibraryCategory, type LibraryCategory } from './category-router.js';
import { flattenSvgPath, type SvgSubpath } from './svg-path.js';

// Map library categories to template prefixes for passive components
const CATEGORY_TO_PREFIX: Partial<Record<LibraryCategory, string>> = {
  Resistors: 'R',
  Capacitors: 'C',
  Inductors: 'L',
  Diodes: 'D',
};

// EasyEDA uses 10mil units (0.254mm per unit)
const EE_TO_MM = 0.254;
// Leave room for the final 0.001 mm coordinate rounding inside the error bound.
const CURVE_TOLERANCE = (0.005 - Math.SQRT2 * 0.0005) / EE_TO_MM;

type Point = SvgSubpath['points'][number];

// Match the footprint region policy: independent islands are representable,
// but KiCad's separate filled polylines cannot preserve compound holes.
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

// IC symbol layout constants (matching CDFER/KiCad conventions)
const IC_PIN_LENGTH = 2.54;       // mm (100 mil) - standard pin length
const IC_PIN_SPACING = 2.54;      // mm (100 mil) - vertical spacing between pins
const IC_BODY_HALF_WIDTH = 12.7;  // mm (500 mil) - half body width (full = 25.4mm)
const IC_PIN_FONT_SIZE = 1.0;     // mm - smaller font for pin names/numbers
const IC_MIN_BODY_SIZE = 5.08;    // mm (200 mil) - minimum body dimension
const IC_BODY_PADDING = 2.54;     // mm (100 mil) - padding from pins to body edge

export interface SymbolConversionOptions {
  libraryName?: string;
  symbolName?: string;
  includeDatasheet?: boolean;
  includeManufacturer?: boolean;
}

interface BoundingBox {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

/**
 * DIP-style IC layout with calculated pin positions
 */
interface ICLayout {
  bodyWidth: number;
  bodyHeight: number;
  leftPins: Array<{ pin: EasyEDAPin; x: number; y: number }>;
  rightPins: Array<{ pin: EasyEDAPin; x: number; y: number }>;
}

export class SymbolConverter {
  /**
   * Convert EasyEDA component data to KiCad symbol format string (standalone library)
   */
  convert(
    component: EasyEDAComponentData,
    options: SymbolConversionOptions = {}
  ): string {
    const symbolEntry = this.convertToSymbolEntry(component, options);
    return this.generateHeader() + symbolEntry + ')\n';
  }

  /**
   * Convert component to a symbol entry (without library wrapper)
   * Used for appending to existing libraries
   */
  convertToSymbolEntry(
    component: EasyEDAComponentData,
    options: SymbolConversionOptions = {}
  ): string {
    const { info, symbol } = component;

    // Try prefix-based template first
    let templatePrefix = info.prefix.toUpperCase();
    let template = getSymbolTemplate(templatePrefix);

    // If no template from prefix, check if category maps to a passive template
    if (!template) {
      const category = getLibraryCategory(info.prefix, info.category, info.description);
      const categoryPrefix = CATEGORY_TO_PREFIX[category];
      if (categoryPrefix) {
        templatePrefix = categoryPrefix;
        template = getSymbolTemplate(categoryPrefix);
      }
    }

    if (template && symbol.pins.length === 2) {
      let pins = symbol.pins;
      if (templatePrefix === 'D' || templatePrefix === 'LED') {
        const anode = pins.find(pin => /^(a|anode)$/i.test(pin.name.trim()));
        const cathode = pins.find(pin => /^(k|cathode)$/i.test(pin.name.trim()));
        if (!anode || !cathode) {
          // Numbers alone do not establish polarity; retain the source geometry.
          return this.generateFromShapes(component, this.getSymbolName(component, options));
        }
        // The template's cathode bar is below the body.
        if (pins[0] !== anode) pins = [anode, cathode];
      }
      // Multi-pin components (bridge rectifiers, multi-terminal LEDs) use EasyEDA layout.
      return this.generateFromTemplate(component, template, pins, options);
    } else {
      // Fall back to improved EasyEDA-derived layout for ICs
      return this.generateFromEasyEDA(component, options);
    }
  }

  /**
   * Generate symbol from fixed template (for passives)
   */
  private generateFromTemplate(
    component: EasyEDAComponentData,
    template: SymbolTemplate,
    pins: EasyEDAPin[],
    options: SymbolConversionOptions = {}
  ): string {
    const { info } = component;
    const name = this.getSymbolName(component, options);

    let output = this.generateSymbolStart(name);
    output += this.generateTemplateProperties(info, name, template);
    output += this.generateTemplateGraphics(name, template);
    output += this.generateTemplatePins(name, pins, template);
    output += this.generateSymbolEnd();

    return output;
  }

  /**
   * Generate symbol from EasyEDA data (for ICs and complex components)
   * Uses parsed shapes if available, otherwise falls back to DIP-style layout
   */
  private generateFromEasyEDA(
    component: EasyEDAComponentData,
    options: SymbolConversionOptions = {}
  ): string {
    const { info, symbol } = component;
    const name = this.getSymbolName(component, options);

    // Check if we have non-trivial shapes to render
    if (this.hasRenderableShapes(symbol)) {
      return this.generateFromShapes(component, name);
    }

    // Fall back to DIP-style layout
    const layout = this.calculateICLayout(symbol.pins);

    let output = this.generateSymbolStart(name, false); // Show pin numbers for ICs
    output += this.generateProperties(info);
    output += this.generateICGraphics(name, layout);
    output += this.generateSymbolEnd();

    return output;
  }

  /**
   * Check if symbol has shapes worth rendering (not just pins)
   */
  private hasRenderableShapes(symbol: EasyEDASymbolData): boolean {
    // Check for decorative text elements (not pin name labels like Jn/...)
    const pinNamePattern = /^J\d+(?:\/|$)/i;
    const hasDecorativeText = (symbol.texts || []).some(t => {
      const text = t.text.trim();
      return text && !pinNamePattern.test(text);
    });

    return (
      symbol.rectangles.length > 0 ||
      symbol.circles.length > 0 ||
      symbol.ellipses.length > 0 ||
      symbol.polylines.length > 0 ||
      symbol.polygons.length > 0 ||
      symbol.arcs.length > 0 ||
      symbol.paths.length > 0 ||
      hasDecorativeText
    );
  }

  /**
   * Generate symbol using parsed EasyEDA shapes
   */
  private generateFromShapes(
    component: EasyEDAComponentData,
    name: string
  ): string {
    const { info, symbol } = component;
    const origin = symbol.origin;

    let output = this.generateSymbolStart(name, false);
    const bounds = this.calculateBoundingBox(symbol.pins, origin);
    output += this.generateProperties(info, {
      x: (bounds.minX + bounds.maxX) / 2,
      top: bounds.maxY + IC_BODY_PADDING * 2,
    });

    // Generate graphics unit with shapes
    output += `\t\t(symbol "${name}_0_1"\n`;

    // Convert each shape type
    for (const rect of symbol.rectangles) {
      output += this.convertRectangle(rect, origin);
    }
    for (const circle of symbol.circles) {
      output += this.convertCircle(circle, origin);
    }
    for (const ellipse of symbol.ellipses) {
      output += this.convertEllipse(ellipse, origin);
    }
    for (const polyline of symbol.polylines) {
      output += this.generatePolyline(this.parsePoints(polyline.points, origin), polyline.strokeWidth, polyline.fillColor, false);
    }
    for (const polygon of symbol.polygons) {
      output += this.generatePolyline(this.parsePoints(polygon.points, origin), polygon.strokeWidth, polygon.fillColor, true);
    }
    for (const arc of symbol.arcs) {
      output += this.convertPath(arc, origin);
    }
    for (const path of symbol.paths) {
      output += this.convertPath(path, origin);
    }

    // Render decorative text elements as symbol graphics
    // Filter out texts that were used for pin name association (Jn/... pattern)
    const pinNamePattern = /^J\d+(?:\/|$)/i;
    const decorativeTexts = (symbol.texts || []).filter(t => {
      const text = t.text.trim();
      if (!text) return false;
      // Skip texts that match the Jn/... pattern (used for pin names)
      return !pinNamePattern.test(text);
    });
    for (const text of decorativeTexts) {
      const textOutput = this.convertText(text, origin);
      if (textOutput) output += textOutput;
    }

    output += `\t\t)\n`;

    // Generate pins unit
    output += `\t\t(symbol "${name}_1_1"\n`;
    for (const pin of symbol.pins) {
      output += this.generateShapePin(pin, origin);
    }
    output += `\t\t)\n`;

    output += this.generateSymbolEnd();

    return output;
  }

  /**
   * Convert EasyEDA X coordinate to KiCad (with origin offset)
   */
  private convertX(x: number, originX: number): number {
    return roundTo((x - originX) * EE_TO_MM, 3);
  }

  /**
   * Convert EasyEDA Y coordinate to KiCad (Y-flipped with origin offset)
   */
  private convertY(y: number, originY: number): number {
    return roundTo(-(y - originY) * EE_TO_MM, 3);
  }

  /**
   * Convert stroke width from EasyEDA to KiCad
   */
  private convertStrokeWidth(width: number): number {
    return roundTo(Math.max(width * EE_TO_MM, 0.1), 3);
  }

  private hasFill(fillColor: string): boolean {
    return fillColor.trim() !== '' && fillColor.trim().toLowerCase() !== 'none';
  }

  /**
   * Convert EasyEDA rectangle to KiCad format
   */
  private convertRectangle(rect: EasyEDASymbolRect, origin: { x: number; y: number }): string {
    const x1 = this.convertX(rect.x, origin.x);
    const y1 = this.convertY(rect.y, origin.y);
    const x2 = this.convertX(rect.x + rect.width, origin.x);
    const y2 = this.convertY(rect.y + rect.height, origin.y);
    const strokeWidth = this.convertStrokeWidth(rect.strokeWidth);

    return `\t\t\t(rectangle
\t\t\t\t(start ${x1} ${y1})
\t\t\t\t(end ${x2} ${y2})
\t\t\t\t(stroke
\t\t\t\t\t(width ${strokeWidth})
\t\t\t\t\t(type default)
\t\t\t\t)
\t\t\t\t(fill
\t\t\t\t\t(type ${this.hasFill(rect.fillColor) ? 'outline' : 'none'})
\t\t\t\t)
\t\t\t)
`;
  }

  /**
   * Convert EasyEDA circle to KiCad format
   */
  private convertCircle(circle: EasyEDASymbolCircle, origin: { x: number; y: number }): string {
    const cx = this.convertX(circle.cx, origin.x);
    const cy = this.convertY(circle.cy, origin.y);
    const radius = roundTo(circle.radius * EE_TO_MM, 3);
    const strokeWidth = this.convertStrokeWidth(circle.strokeWidth);

    return `\t\t\t(circle
\t\t\t\t(center ${cx} ${cy})
\t\t\t\t(radius ${radius})
\t\t\t\t(stroke
\t\t\t\t\t(width ${strokeWidth})
\t\t\t\t\t(type default)
\t\t\t\t)
\t\t\t\t(fill
\t\t\t\t\t(type ${this.hasFill(circle.fillColor) ? 'outline' : 'none'})
\t\t\t\t)
\t\t\t)
`;
  }

  /** KiCad has no ellipse primitive; flatten unequal radii without changing their bounds. */
  private convertEllipse(ellipse: EasyEDASymbolEllipse, origin: { x: number; y: number }): string {
    const { cx, cy, radiusX: rx, radiusY: ry } = ellipse;
    if (!Number.isFinite(rx) || !Number.isFinite(ry) || rx <= 0 || ry <= 0) {
      throw new Error('Cannot convert symbol ellipse: radii must be finite and positive');
    }
    if (rx === ry) return this.convertCircle({ ...ellipse, radius: rx }, origin);
    return this.convertPath({
      ...ellipse,
      path: `M ${cx + rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx} ${cy + ry} A ${rx} ${ry} 0 0 1 ${cx - rx} ${cy} A ${rx} ${ry} 0 0 1 ${cx} ${cy - ry} A ${rx} ${ry} 0 0 1 ${cx + rx} ${cy} Z`,
    }, origin);
  }

  /** Flatten each SVG contour separately, retaining closure and source fill. */
  private convertPath(path: EasyEDASymbolPath, origin: { x: number; y: number }): string {
    const subpaths = flattenSvgPath(path.path, CURVE_TOLERANCE);
    if (this.hasFill(path.fillColor)) {
      for (const { points } of subpaths) {
        const area = points.reduce((sum, point, i) => {
          const next = points[(i + 1) % points.length];
          return sum + point.x * next.y - point.y * next.x;
        }, 0);
        if (points.length < 3 || Math.abs(area) < 1e-12) {
          throw new Error('Cannot convert filled symbol path: degenerate contour');
        }
      }
      for (let i = 0; i < subpaths.length; i++) {
        for (let j = i + 1; j < subpaths.length; j++) {
          if (contoursOverlap(subpaths[i].points, subpaths[j].points)) {
            throw new Error('Cannot convert filled symbol path: compound contours contain holes or overlap');
          }
        }
      }
    }
    return subpaths.map(subpath => this.generatePolyline(
      subpath.points.map(point => ({ x: this.convertX(point.x, origin.x), y: this.convertY(point.y, origin.y) })),
      path.strokeWidth, path.fillColor, subpath.closed,
    )).join('');
  }

  private generatePolyline(points: Point[], strokeWidth: number, fillColor: string, closed: boolean): string {
    if (points.length < 2) return '';
    const filled = this.hasFill(fillColor);
    // SVG fill implicitly closes an open contour.
    if (closed || filled) {
      const first = points[0], last = points[points.length - 1];
      if (first.x !== last.x || first.y !== last.y) points.push(first);
    }
    return `\t\t\t(polyline
\t\t\t\t(pts
\t\t\t\t\t${points.map(point => `(xy ${point.x} ${point.y})`).join('\n\t\t\t\t\t')}
\t\t\t\t)
\t\t\t\t(stroke
\t\t\t\t\t(width ${this.convertStrokeWidth(strokeWidth)})
\t\t\t\t\t(type default)
\t\t\t\t)
\t\t\t\t(fill
\t\t\t\t\t(type ${filled ? 'outline' : 'none'})
\t\t\t\t)
\t\t\t)
`;
  }

  /**
   * Convert EasyEDA text to KiCad format
   * Renders decorative text labels inside the symbol
   */
  private convertText(text: EasyEDASymbolText, origin: { x: number; y: number }): string | null {
    if (!text.text || text.text.trim() === '') return null;

    const x = this.convertX(text.x, origin.x);
    const y = this.convertY(text.y, origin.y);

    // Convert font size (EasyEDA uses pts, default ~7)
    const fontSize = roundTo(Math.max(text.fontSize * EE_TO_MM * 0.8, 0.5), 3);

    // Convert rotation (EasyEDA rotation with Y-flip)
    const rotation = ((360 - text.rotation) % 360);

    // Sanitize text content
    const content = text.text.replace(/"/g, "'").replace(/\\/g, '');

    return `\t\t\t(text "${content}"
\t\t\t\t(at ${x} ${y} ${rotation})
\t\t\t\t(effects
\t\t\t\t\t(font
\t\t\t\t\t\t(size ${fontSize} ${fontSize})
\t\t\t\t\t)
\t\t\t\t)
\t\t\t)
`;
  }

  /**
   * Parse space-separated point string to array of {x, y}
   */
  private parsePoints(pointsStr: string, origin: { x: number; y: number }): Array<{ x: number; y: number }> {
    const values = pointsStr.trim().split(/\s+/).map(parseFloat);
    const points: Array<{ x: number; y: number }> = [];

    for (let i = 0; i < values.length - 1; i += 2) {
      points.push({
        x: this.convertX(values[i], origin.x),
        y: this.convertY(values[i + 1], origin.y),
      });
    }

    return points;
  }

  /**
   * Generate a pin using EasyEDA coordinates and rotation
   *
   * EasyEDA: pin.x/y is the WIRE connection point (junction)
   *          rotation points FROM body TO wire
   * KiCad: pin position is the WIRE connection point
   *        rotation points FROM wire TO body
   *
   * Positions need a Y flip; counterclockwise pin angles need a 180° reversal.
   */
  private generateShapePin(pin: EasyEDAPin, origin: { x: number; y: number }): string {
    const pinType = this.mapPinType(pin.electricalType);

    // Convert wire/junction position to KiCad coordinates (with Y-flip)
    const x = this.convertX(pin.x, origin.x);
    const y = this.convertY(pin.y, origin.y);

    // Map EasyEDA rotation to KiCad rotation
    // Both formats use counterclockwise angles, but opposite pin directions.
    const rotation = this.mapPinRotation(pin.rotation);

    // Convert pin length
    const pinLength = roundTo(pin.pinLength * EE_TO_MM, 2);

    // Determine pin style based on indicators
    const pinStyle = this.getPinStyle(pin);

    const ts = IC_PIN_FONT_SIZE;

    return `\t\t\t(pin ${pinType} ${pinStyle}
\t\t\t\t(at ${x} ${y} ${rotation})
\t\t\t\t(length ${pinLength})
\t\t\t\t(name "${this.sanitizePinName(pin.name)}"
\t\t\t\t\t(effects
\t\t\t\t\t\t(font
\t\t\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t\t\t)
\t\t\t\t\t)
\t\t\t\t)
\t\t\t\t(number "${pin.number}"
\t\t\t\t\t(effects
\t\t\t\t\t\t(font
\t\t\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t\t\t)
\t\t\t\t\t)
\t\t\t\t)
\t\t\t)
`;
  }

  /**
   * Map EasyEDA pin rotation to KiCad rotation
   *
   * Both formats use counterclockwise angles. EasyEDA describes body-to-wire,
   * whereas KiCad describes wire-to-body, so reverse the direction by 180°.
   * EasyEDA 90 maps to KiCad 270; EasyEDA 270 maps to KiCad 90.
   */
  private mapPinRotation(eeRotation: number): number {
    const normalized = ((eeRotation % 360) + 360) % 360;
    // Coordinate Y inversion does not reverse this angle convention.
    return (normalized + 180) % 360;
  }

  /**
   * Get KiCad pin style from EasyEDA pin indicators
   */
  private getPinStyle(pin: EasyEDAPin): string {
    if (pin.hasDot && pin.hasClock) return 'inverted_clock';
    if (pin.hasDot) return 'inverted';
    if (pin.hasClock) return 'clock';
    return 'line';
  }

  /**
   * Calculate DIP-style IC layout from EasyEDA pins
   * Matches CDFER layout: wide body, pins extending from edges
   */
  private calculateICLayout(pins: EasyEDAPin[]): ICLayout {
    const pinCount = pins.length;
    const halfPins = Math.ceil(pinCount / 2);

    // Sort pins by pin number for proper DIP arrangement
    const sortedPins = [...pins].sort((a, b) => {
      const numA = parseInt(a.number) || 0;
      const numB = parseInt(b.number) || 0;
      return numA - numB;
    });

    // Calculate body dimensions (matching CDFER style)
    // Height based on pin count: top pin at (halfPins-1)*spacing, bottom at 0
    // Add padding above top pin and below bottom pin
    const topY = (halfPins - 1) * IC_PIN_SPACING;
    const bodyHeight = topY + IC_PIN_SPACING * 2; // Add padding top and bottom
    const bodyWidth = IC_BODY_HALF_WIDTH * 2;

    // Pin X positions (body edge + pin length)
    const leftX = roundTo(-(IC_BODY_HALF_WIDTH + IC_PIN_LENGTH), 2);
    const rightX = roundTo(IC_BODY_HALF_WIDTH + IC_PIN_LENGTH, 2);

    // Split pins: 1 to n/2 on left (top to bottom), rest on right (bottom to top)
    const leftPins: ICLayout['leftPins'] = [];
    const rightPins: ICLayout['rightPins'] = [];

    for (let i = 0; i < sortedPins.length; i++) {
      const pin = sortedPins[i];
      if (i < halfPins) {
        // Left side pins (top to bottom): pin 1 at top
        const y = topY - (i * IC_PIN_SPACING);
        leftPins.push({ pin, x: leftX, y: roundTo(y, 3) });
      } else {
        // Right side pins (bottom to top): continues from bottom
        const rightIndex = i - halfPins;
        const y = rightIndex * IC_PIN_SPACING;
        rightPins.push({ pin, x: rightX, y: roundTo(y, 3) });
      }
    }

    return { bodyWidth, bodyHeight, leftPins, rightPins };
  }

  /**
   * Generate IC body rectangle and pins in single _0_1 unit (CDFER style)
   */
  private generateICGraphics(name: string, layout: ICLayout): string {
    // Body: extends from bottom pin - padding to top pin + padding
    const topPinY = layout.leftPins[0]?.y ?? 0;
    const bottomPinY = layout.leftPins[layout.leftPins.length - 1]?.y ?? 0;
    const bodyTop = topPinY + IC_PIN_SPACING;
    const bodyBottom = bottomPinY - IC_PIN_SPACING;

    let output = `\t\t(symbol "${name}_0_1"
\t\t\t(rectangle
\t\t\t\t(start ${-IC_BODY_HALF_WIDTH} ${roundTo(bodyTop, 2)})
\t\t\t\t(end ${IC_BODY_HALF_WIDTH} ${roundTo(bodyBottom, 2)})
\t\t\t\t(stroke
\t\t\t\t\t(width 0)
\t\t\t\t\t(type default)
\t\t\t\t)
\t\t\t\t(fill
\t\t\t\t\t(type background)
\t\t\t\t)
\t\t\t)
`;

    // Add all pins to _0_1 unit (CDFER style - no separate _1_1 unit)
    // Left side pins (pointing right, rotation 0)
    for (const { pin, x, y } of layout.leftPins) {
      const pinType = this.mapPinType(pin.electricalType);
      output += `\t\t\t(pin ${pinType} line
\t\t\t\t(at ${x} ${y} 0)
\t\t\t\t(length ${IC_PIN_LENGTH})
\t\t\t\t(name "${this.sanitizePinName(pin.name)}"
\t\t\t\t\t(effects
\t\t\t\t\t\t(font
\t\t\t\t\t\t\t(size ${IC_PIN_FONT_SIZE} ${IC_PIN_FONT_SIZE})
\t\t\t\t\t\t)
\t\t\t\t\t)
\t\t\t\t)
\t\t\t\t(number "${pin.number}"
\t\t\t\t\t(effects
\t\t\t\t\t\t(font
\t\t\t\t\t\t\t(size ${IC_PIN_FONT_SIZE} ${IC_PIN_FONT_SIZE})
\t\t\t\t\t\t)
\t\t\t\t\t)
\t\t\t\t)
\t\t\t)
`;
    }

    // Right side pins (pointing left, rotation 180)
    for (const { pin, x, y } of layout.rightPins) {
      const pinType = this.mapPinType(pin.electricalType);
      output += `\t\t\t(pin ${pinType} line
\t\t\t\t(at ${x} ${y} 180)
\t\t\t\t(length ${IC_PIN_LENGTH})
\t\t\t\t(name "${this.sanitizePinName(pin.name)}"
\t\t\t\t\t(effects
\t\t\t\t\t\t(font
\t\t\t\t\t\t\t(size ${IC_PIN_FONT_SIZE} ${IC_PIN_FONT_SIZE})
\t\t\t\t\t\t)
\t\t\t\t\t)
\t\t\t\t)
\t\t\t\t(number "${pin.number}"
\t\t\t\t\t(effects
\t\t\t\t\t\t(font
\t\t\t\t\t\t\t(size ${IC_PIN_FONT_SIZE} ${IC_PIN_FONT_SIZE})
\t\t\t\t\t\t)
\t\t\t\t\t)
\t\t\t\t)
\t\t\t)
`;
    }

    output += `\t\t)
`;
    return output;
  }


  /**
   * Create a new library file with multiple symbols
   */
  createLibrary(components: EasyEDAComponentData[]): string {
    let output = this.generateHeader();
    for (const component of components) {
      output += this.convertToSymbolEntry(component);
    }
    output += ')\n';
    return output;
  }

  /**
   * Append a symbol to an existing library file content
   * Returns the updated library content
   */
  appendToLibrary(
    existingLibraryContent: string,
    component: EasyEDAComponentData,
    options: SymbolConversionOptions = {}
  ): string {
    // Remove the closing parenthesis and any trailing whitespace
    const trimmed = existingLibraryContent.trimEnd();
    if (!trimmed.endsWith(')')) {
      throw new Error('Invalid library file format: missing closing parenthesis');
    }

    if (this.symbolExistsInLibrary(existingLibraryContent, this.getSymbolName(component, options))) {
      return existingLibraryContent;
    }

    // Remove the last closing paren
    const withoutClose = trimmed.slice(0, -1);

    // Add the new symbol entry and close the library
    const newSymbol = this.convertToSymbolEntry(component, options);
    return withoutClose + newSymbol + ')\n';
  }

  /**
   * Check if a symbol already exists in a library
   */
  symbolExistsInLibrary(libraryContent: string, componentName: string): boolean {
    const sanitizedName = this.sanitizeName(componentName);
    return this.findSymbolRange(libraryContent, sanitizedName) !== undefined;
  }

  private findSymbolRange(libraryContent: string, sanitizedName: string): { start: number; end: number } | undefined {
    const pattern = new RegExp(`^\\(\\s*symbol\\s+"${sanitizedName}"`);
    for (const range of childExpressions(libraryContent)) {
      if (pattern.test(libraryContent.slice(range.start, range.end))) return range;
    }
    return undefined;
  }

  /**
   * Replace an existing symbol in a library with a new version
   * If the symbol doesn't exist, it will be appended
   */
  replaceInLibrary(
    existingLibraryContent: string,
    component: EasyEDAComponentData,
    options: SymbolConversionOptions = {}
  ): string {
    const sanitizedName = this.getSymbolName(component, options);
    const range = this.findSymbolRange(existingLibraryContent, sanitizedName);
    if (!range) {
      return this.appendToLibrary(existingLibraryContent, component, options);
    }

    const newSymbol = this.convertToSymbolEntry(component, options).trim();
    return existingLibraryContent.slice(0, range.start) + newSymbol + existingLibraryContent.slice(range.end);
  }

  /**
   * Get the sanitized symbol name for a component
   */
  getSymbolName(component: EasyEDAComponentData, options: SymbolConversionOptions = {}): string {
    return this.sanitizeName(options.symbolName || component.info.name);
  }

  /**
   * Generate file header
   */
  private generateHeader(): string {
    return `(kicad_symbol_lib
\t(version ${KICAD_SYMBOL_VERSION})
\t(generator "ai-eda-jlc-mcp")
\t(generator_version "9.0")
`;
  }

  /**
   * Generate symbol start - NO library prefix in symbol name
   */
  private generateSymbolStart(name: string, hideNumbers = true): string {
    // For passives, hide pin numbers; for ICs, show them (CDFER style)
    if (hideNumbers) {
      return `\t(symbol "${name}"
\t\t(pin_numbers
\t\t\t(hide yes)
\t\t)
\t\t(pin_names
\t\t\t(offset 0)
\t\t)
\t\t(exclude_from_sim no)
\t\t(in_bom yes)
\t\t(on_board yes)
`;
    }
    // IC style - no pin_numbers/pin_names sections (show by default)
    return `\t(symbol "${name}"
\t\t(exclude_from_sim no)
\t\t(in_bom yes)
\t\t(on_board yes)
`;
  }

  /**
   * Generate KiCad property entries in KiCad 9 format
   */
  private generateProperties(info: EasyEDAComponentData['info'], placement = { x: 0, top: 5.08 }): string {
    const ts = KICAD_DEFAULTS.TEXT_SIZE;
    let props = '';

    // Extract normalized display value for passives
    const displayValue = extractDisplayValue(
      info.name,
      info.description,
      info.prefix,
      info.category
    );

    // Reference property - centered above body (CDFER style, no "?" suffix)
    const refDesignator = (info.prefix || 'U').replace(/\?$/, '');
    props += `\t\t(property "Reference" "${refDesignator}"
\t\t\t(at ${roundTo(placement.x, 3)} ${roundTo(placement.top + 5.08, 3)} 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t)
\t\t)
`;

    // Value property - centered below reference (CDFER style)
    props += `\t\t(property "Value" "${this.sanitizeText(displayValue)}"
\t\t\t(at ${roundTo(placement.x, 3)} ${roundTo(placement.top + 2.54, 3)} 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t)
\t\t)
`;

    // Footprint property
    props += `\t\t(property "Footprint" "${info.package || ''}"
\t\t\t(at -1.778 0 90)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;

    // Datasheet property - prefer JLC API PDF URL, fallback to constructed URL
    const datasheetUrl = info.datasheetPdf || (info.lcscId ? `https://www.lcsc.com/datasheet/${info.lcscId}.pdf` : '~');
    props += `\t\t(property "Datasheet" "${datasheetUrl}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;

    // Product Page property - link to LCSC product page
    if (info.datasheet) {
      props += `\t\t(property "Product Page" "${info.datasheet}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    // Description property - use actual description if available
    const description = info.description || info.name;
    props += `\t\t(property "Description" "${this.sanitizeText(description)}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;

    // LCSC property
    if (info.lcscId) {
      props += `\t\t(property "LCSC" "${info.lcscId}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    // Manufacturer property
    if (info.manufacturer) {
      props += `\t\t(property "Manufacturer" "${this.sanitizeText(info.manufacturer)}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    // Category property
    if (info.category) {
      props += `\t\t(property "Category" "${this.sanitizeText(info.category)}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    // ki_keywords property - LCSC ID for searchability (CDFER style)
    if (info.lcscId) {
      props += `\t\t(property "ki_keywords" "${info.lcscId}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    // CDFER parity properties
    if (info.stock !== undefined) {
      props += `\t\t(property "Stock" "${info.stock}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    if (info.price !== undefined) {
      props += `\t\t(property "Price" "${info.price}USD"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    if (info.process) {
      props += `\t\t(property "Process" "${info.process}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    if (info.minOrderQty !== undefined) {
      props += `\t\t(property "Minimum Qty" "${info.minOrderQty}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    // Attrition Qty - always add with default 0
    props += `\t\t(property "Attrition Qty" "0"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;

    if (info.partClass) {
      props += `\t\t(property "Class" "${this.sanitizeText(info.partClass)}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    if (info.partNumber) {
      props += `\t\t(property "Part" "${this.sanitizeText(info.partNumber)}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    // Component attributes as custom properties
    if (info.attributes) {
      for (const [key, value] of Object.entries(info.attributes)) {
        props += `\t\t(property "${this.sanitizeText(key)}" "${this.sanitizeText(String(value))}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
      }
    }

    return props;
  }

  /**
   * Calculate bounding box from pins (for IC/complex components)
   * Uses improved padding for better visual appearance
   */
  private calculateBoundingBox(pins: EasyEDAPin[], origin: { x: number; y: number }): BoundingBox {
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;

    for (const pin of pins) {
      const x = (pin.x - origin.x) * EE_TO_MM;
      const y = -(pin.y - origin.y) * EE_TO_MM;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }

    // If no pins, use minimum IC body size
    if (!isFinite(minX)) {
      const half = IC_MIN_BODY_SIZE / 2;
      return { minX: -half, maxX: half, minY: -half, maxY: half };
    }

    // Add padding and shrink to create body rectangle inside pin positions
    // Uses IC_BODY_PADDING for adequate spacing between pins and body edge
    return {
      minX: roundTo(minX + IC_BODY_PADDING, 3),
      maxX: roundTo(maxX - IC_BODY_PADDING, 3),
      minY: roundTo(minY + IC_BODY_PADDING, 3),
      maxY: roundTo(maxY - IC_BODY_PADDING, 3),
    };
  }

  /**
   * Generate _0_1 unit with graphical elements (rectangle body)
   * Uses IC_MIN_BODY_SIZE for minimum dimensions
   */
  private generateGraphicsUnit(name: string, bbox: BoundingBox): string {
    // Ensure minimum size for ICs
    const width = Math.max(bbox.maxX - bbox.minX, IC_MIN_BODY_SIZE);
    const height = Math.max(bbox.maxY - bbox.minY, IC_MIN_BODY_SIZE);

    // Center the rectangle if too small
    let x1 = bbox.minX;
    let x2 = bbox.maxX;
    let y1 = bbox.minY;
    let y2 = bbox.maxY;

    const halfMin = IC_MIN_BODY_SIZE / 2;
    if (width < IC_MIN_BODY_SIZE) {
      x1 = -halfMin;
      x2 = halfMin;
    }
    if (height < IC_MIN_BODY_SIZE) {
      y1 = -halfMin;
      y2 = halfMin;
    }

    return `\t\t(symbol "${name}_0_1"
\t\t\t(rectangle
\t\t\t\t(start ${roundTo(x1, 3)} ${roundTo(y1, 3)})
\t\t\t\t(end ${roundTo(x2, 3)} ${roundTo(y2, 3)})
\t\t\t\t(stroke
\t\t\t\t\t(width 0.254)
\t\t\t\t\t(type default)
\t\t\t\t)
\t\t\t\t(fill
\t\t\t\t\t(type background)
\t\t\t\t)
\t\t\t)
\t\t)
`;
  }

  /**
   * Generate _1_1 unit with pins
   */
  private generatePinsUnit(name: string, pins: EasyEDAPin[], origin: { x: number; y: number }): string {
    let output = `\t\t(symbol "${name}_1_1"
`;

    for (const pin of pins) {
      output += this.generatePin(pin, origin);
    }

    output += `\t\t)
`;
    return output;
  }

  /**
   * Generate a single pin entry in KiCad 9 format
   * Uses IC_PIN_LENGTH for better readability with complex components
   */
  private generatePin(pin: EasyEDAPin, origin: { x: number; y: number }): string {
    const pinType = this.mapPinType(pin.electricalType);
    const x = roundTo((pin.x - origin.x) * EE_TO_MM, 3);
    const y = roundTo(-(pin.y - origin.y) * EE_TO_MM, 3);
    const rotation = this.calculatePinRotation(x, y);
    const ts = KICAD_DEFAULTS.TEXT_SIZE;

    return `\t\t\t(pin ${pinType} line
\t\t\t\t(at ${x} ${y} ${rotation})
\t\t\t\t(length ${IC_PIN_LENGTH})
\t\t\t\t(name "${this.sanitizePinName(pin.name)}"
\t\t\t\t\t(effects
\t\t\t\t\t\t(font
\t\t\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t\t\t)
\t\t\t\t\t)
\t\t\t\t)
\t\t\t\t(number "${pin.number}"
\t\t\t\t\t(effects
\t\t\t\t\t\t(font
\t\t\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t\t\t)
\t\t\t\t\t)
\t\t\t\t)
\t\t\t)
`;
  }

  /**
   * Generate symbol end (closes the symbol, NOT the library)
   */
  private generateSymbolEnd(): string {
    return `\t\t(embedded_fonts no)
\t)
`;
  }

  /**
   * Generate properties for template-based symbols
   */
  private generateTemplateProperties(
    info: EasyEDAComponentData['info'],
    name: string,
    template: SymbolTemplate
  ): string {
    const ts = KICAD_DEFAULTS.TEXT_SIZE;
    let props = '';

    // Extract normalized display value for passives
    const displayValue = extractDisplayValue(
      info.name,
      info.description,
      info.prefix,
      info.category
    );

    // Reference property - positioned from template (no "?" suffix)
    const refDesignator = (info.prefix || 'U').replace(/\?$/, '');
    props += `\t\t(property "Reference" "${refDesignator}"
\t\t\t(at ${template.refPosition.x} ${template.refPosition.y} ${template.refPosition.angle})
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t)
\t\t)
`;

    // Value property - positioned from template
    props += `\t\t(property "Value" "${this.sanitizeText(displayValue)}"
\t\t\t(at ${template.valuePosition.x} ${template.valuePosition.y} ${template.valuePosition.angle})
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t)
\t\t)
`;

    // Footprint property
    props += `\t\t(property "Footprint" "${info.package || ''}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;

    // Datasheet property - prefer JLC API PDF URL, fallback to constructed URL
    const datasheetUrl = info.datasheetPdf || (info.lcscId ? `https://www.lcsc.com/datasheet/${info.lcscId}.pdf` : '~');
    props += `\t\t(property "Datasheet" "${datasheetUrl}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;

    // Product Page property - link to LCSC product page
    if (info.datasheet) {
      props += `\t\t(property "Product Page" "${info.datasheet}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    // Description property
    const description = info.description || info.name;
    props += `\t\t(property "Description" "${this.sanitizeText(description)}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;

    // LCSC property
    if (info.lcscId) {
      props += `\t\t(property "LCSC" "${info.lcscId}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    // Manufacturer property
    if (info.manufacturer) {
      props += `\t\t(property "Manufacturer" "${this.sanitizeText(info.manufacturer)}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    // Category property
    if (info.category) {
      props += `\t\t(property "Category" "${this.sanitizeText(info.category)}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    // ki_keywords property - LCSC ID for searchability (CDFER style)
    if (info.lcscId) {
      props += `\t\t(property "ki_keywords" "${info.lcscId}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    // CDFER parity properties
    if (info.stock !== undefined) {
      props += `\t\t(property "Stock" "${info.stock}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    if (info.price !== undefined) {
      props += `\t\t(property "Price" "${info.price}USD"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    if (info.process) {
      props += `\t\t(property "Process" "${info.process}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    if (info.minOrderQty !== undefined) {
      props += `\t\t(property "Minimum Qty" "${info.minOrderQty}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    // Attrition Qty - always add with default 0
    props += `\t\t(property "Attrition Qty" "0"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;

    if (info.partClass) {
      props += `\t\t(property "Class" "${this.sanitizeText(info.partClass)}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    if (info.partNumber) {
      props += `\t\t(property "Part" "${this.sanitizeText(info.partNumber)}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
    }

    // Component attributes as custom properties
    if (info.attributes) {
      for (const [key, value] of Object.entries(info.attributes)) {
        props += `\t\t(property "${this.sanitizeText(key)}" "${this.sanitizeText(String(value))}"
\t\t\t(at 0 0 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t\t(hide yes)
\t\t\t)
\t\t)
`;
      }
    }

    return props;
  }

  /**
   * Generate graphics unit for template-based symbols
   */
  private generateTemplateGraphics(name: string, template: SymbolTemplate): string {
    return `\t\t(symbol "${name}_0_1"
${template.bodyGraphics}
\t\t)
`;
  }

  /**
   * Generate pins for template-based symbols (2-pin vertical layout)
   */
  private generateTemplatePins(
    name: string,
    pins: EasyEDAPin[],
    template: SymbolTemplate
  ): string {
    const ts = KICAD_DEFAULTS.TEXT_SIZE;
    const halfSpacing = template.pinSpacing / 2;

    let output = `\t\t(symbol "${name}_1_1"
`;

    // For 2-pin components, place at fixed positions
    if (pins.length === 2) {
      // First pin at top (270° points down toward body)
      const pin1 = pins[0];
      output += `\t\t\t(pin passive line
\t\t\t\t(at 0 ${halfSpacing} 270)
\t\t\t\t(length ${template.pinLength})
\t\t\t\t(name "${this.sanitizePinName(pin1.name)}"
\t\t\t\t\t(effects
\t\t\t\t\t\t(font
\t\t\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t\t\t)
\t\t\t\t\t)
\t\t\t\t)
\t\t\t\t(number "${pin1.number}"
\t\t\t\t\t(effects
\t\t\t\t\t\t(font
\t\t\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t\t\t)
\t\t\t\t\t)
\t\t\t\t)
\t\t\t)
`;

      // Second pin at bottom (90° points up toward body)
      const pin2 = pins[1];
      output += `\t\t\t(pin passive line
\t\t\t\t(at 0 ${-halfSpacing} 90)
\t\t\t\t(length ${template.pinLength})
\t\t\t\t(name "${this.sanitizePinName(pin2.name)}"
\t\t\t\t\t(effects
\t\t\t\t\t\t(font
\t\t\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t\t\t)
\t\t\t\t\t)
\t\t\t\t)
\t\t\t\t(number "${pin2.number}"
\t\t\t\t\t(effects
\t\t\t\t\t\t(font
\t\t\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t\t\t)
\t\t\t\t\t)
\t\t\t\t)
\t\t\t)
`;
    } else {
      // For multi-pin components (e.g., LED with 3 pins), fall back to EasyEDA positions
      for (const pin of pins) {
        const pinType = this.mapPinType(pin.electricalType);
        output += `\t\t\t(pin ${pinType} line
\t\t\t\t(at 0 0 0)
\t\t\t\t(length ${template.pinLength})
\t\t\t\t(name "${this.sanitizePinName(pin.name)}"
\t\t\t\t\t(effects
\t\t\t\t\t\t(font
\t\t\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t\t\t)
\t\t\t\t\t)
\t\t\t\t)
\t\t\t\t(number "${pin.number}"
\t\t\t\t\t(effects
\t\t\t\t\t\t(font
\t\t\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t\t\t)
\t\t\t\t\t)
\t\t\t\t)
\t\t\t)
`;
      }
    }

    output += `\t\t)
`;
    return output;
  }

  /**
   * Map EasyEDA pin type to KiCad pin type
   */
  private mapPinType(eeType: string): string {
    const mapping: Record<string, string> = {
      '0': 'unspecified',
      '1': 'input',
      '2': 'output',
      '3': 'bidirectional',
      '4': 'power_in',
      '5': 'power_out',
      '6': 'open_collector',
      '7': 'open_emitter',
      '8': 'passive',
      '9': 'no_connect',
    };
    return mapping[eeType] || 'passive';
  }

  /**
   * Calculate pin rotation based on position (points inward toward center)
   */
  private calculatePinRotation(x: number, y: number): number {
    if (Math.abs(x) > Math.abs(y)) {
      return x > 0 ? 180 : 0;
    } else {
      return y > 0 ? 270 : 90;
    }
  }

  /**
   * Sanitize component name for KiCad (no special chars except underscore/hyphen)
   */
  private sanitizeName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_-]/g, '_');
  }

  /**
   * Sanitize pin name (escape quotes)
   */
  private sanitizePinName(name: string): string {
    if (!name || name.trim() === '') return '~';
    return name.replace(/"/g, "'").replace(/\\/g, '');
  }

  /**
   * Sanitize general text for properties
   */
  private sanitizeText(text: string): string {
    return text.replace(/"/g, "'").replace(/\\/g, '').replace(/\n/g, ' ');
  }
}

export const symbolConverter = new SymbolConverter();
