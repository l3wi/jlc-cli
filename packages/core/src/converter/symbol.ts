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
  EasyEDASymbolArc,
  EasyEDASymbolPolyline,
  EasyEDASymbolPolygon,
  EasyEDASymbolPath,
} from '../types/index.js';
import { KICAD_SYMBOL_VERSION, KICAD_DEFAULTS } from '../constants/index.js';
import { roundTo } from '../utils/index.js';
import { extractDisplayValue } from './value-normalizer.js';
import { getSymbolTemplate, type SymbolTemplate } from './symbol-templates.js';
import { getLibraryCategory, type LibraryCategory } from './category-router.js';
import { parseSvgArcPath, svgArcToCenter, radToDeg, normalizeAngle } from './svg-arc.js';

// Map library categories to template prefixes for passive components
const CATEGORY_TO_PREFIX: Partial<Record<LibraryCategory, string>> = {
  Resistors: 'R',
  Capacitors: 'C',
  Inductors: 'L',
  Diodes: 'D',
};

// EasyEDA uses 10mil units (0.254mm per unit)
const EE_TO_MM = 0.254;

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
    let template = getSymbolTemplate(info.prefix);

    // If no template from prefix, check if category maps to a passive template
    if (!template) {
      const category = getLibraryCategory(info.prefix, info.category, info.description);
      const categoryPrefix = CATEGORY_TO_PREFIX[category];
      if (categoryPrefix) {
        template = getSymbolTemplate(categoryPrefix);
      }
    }

    if (template && symbol.pins.length === 2) {
      // Use fixed layout for 2-pin passives only (R, C, L, D with 2 pins)
      // Multi-pin components (bridge rectifiers, multi-terminal LEDs) use EasyEDA layout
      return this.generateFromTemplate(component, template, options);
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
    options: SymbolConversionOptions = {}
  ): string {
    const { info, symbol } = component;
    const name = options.symbolName ? this.sanitizeName(options.symbolName) : this.sanitizeName(info.name);
    const pins = symbol.pins;

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
    const name = options.symbolName ? this.sanitizeName(options.symbolName) : this.sanitizeName(info.name);

    // Check if we have non-trivial shapes to render
    if (this.hasRenderableShapes(symbol)) {
      return this.generateFromShapes(component, name);
    }

    // Fall back to DIP-style layout
    const layout = this.calculateICLayout(symbol.pins);

    let output = this.generateSymbolStart(name, false); // Show pin numbers for ICs
    output += this.generateProperties(info, name);
    output += this.generateICGraphics(name, layout);
    output += this.generateICPins(name, layout);
    output += this.generateSymbolEnd();

    return output;
  }

  /**
   * Check if symbol has shapes worth rendering (not just pins)
   */
  private hasRenderableShapes(symbol: EasyEDASymbolData): boolean {
    return (
      symbol.rectangles.length > 0 ||
      symbol.circles.length > 0 ||
      symbol.ellipses.length > 0 ||
      symbol.polylines.length > 0 ||
      symbol.polygons.length > 0 ||
      symbol.arcs.length > 0 ||
      symbol.paths.length > 0
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
    output += this.generateProperties(info, name);

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
      output += this.convertPolyline(polyline, origin);
    }
    for (const polygon of symbol.polygons) {
      output += this.convertPolygon(polygon, origin);
    }
    for (const arc of symbol.arcs) {
      const arcOutput = this.convertArc(arc, origin);
      if (arcOutput) output += arcOutput;
    }
    for (const path of symbol.paths) {
      const pathOutput = this.convertPath(path, origin);
      if (pathOutput) output += pathOutput;
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
\t\t\t\t\t(type background)
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
\t\t\t\t\t(type none)
\t\t\t\t)
\t\t\t)
`;
  }

  /**
   * Convert EasyEDA ellipse to KiCad format (approximated as circle if rx≈ry)
   * KiCad symbols don't support true ellipses, so we use a circle with average radius
   */
  private convertEllipse(ellipse: EasyEDASymbolEllipse, origin: { x: number; y: number }): string {
    const cx = this.convertX(ellipse.cx, origin.x);
    const cy = this.convertY(ellipse.cy, origin.y);
    // Use average radius for approximation
    const radius = roundTo(((ellipse.radiusX + ellipse.radiusY) / 2) * EE_TO_MM, 3);
    const strokeWidth = this.convertStrokeWidth(ellipse.strokeWidth);

    return `\t\t\t(circle
\t\t\t\t(center ${cx} ${cy})
\t\t\t\t(radius ${radius})
\t\t\t\t(stroke
\t\t\t\t\t(width ${strokeWidth})
\t\t\t\t\t(type default)
\t\t\t\t)
\t\t\t\t(fill
\t\t\t\t\t(type none)
\t\t\t\t)
\t\t\t)
`;
  }

  /**
   * Convert EasyEDA polyline to KiCad format
   */
  private convertPolyline(polyline: EasyEDASymbolPolyline, origin: { x: number; y: number }): string {
    const points = this.parsePoints(polyline.points, origin);
    if (points.length < 2) return '';

    const strokeWidth = this.convertStrokeWidth(polyline.strokeWidth);
    const pointsStr = points.map(p => `(xy ${p.x} ${p.y})`).join('\n\t\t\t\t\t');

    return `\t\t\t(polyline
\t\t\t\t(pts
\t\t\t\t\t${pointsStr}
\t\t\t\t)
\t\t\t\t(stroke
\t\t\t\t\t(width ${strokeWidth})
\t\t\t\t\t(type default)
\t\t\t\t)
\t\t\t\t(fill
\t\t\t\t\t(type none)
\t\t\t\t)
\t\t\t)
`;
  }

  /**
   * Convert EasyEDA polygon to KiCad format (closed, filled polyline)
   */
  private convertPolygon(polygon: EasyEDASymbolPolygon, origin: { x: number; y: number }): string {
    const points = this.parsePoints(polygon.points, origin);
    if (points.length < 3) return '';

    const strokeWidth = this.convertStrokeWidth(polygon.strokeWidth);
    const pointsStr = points.map(p => `(xy ${p.x} ${p.y})`).join('\n\t\t\t\t\t');

    return `\t\t\t(polyline
\t\t\t\t(pts
\t\t\t\t\t${pointsStr}
\t\t\t\t)
\t\t\t\t(stroke
\t\t\t\t\t(width ${strokeWidth})
\t\t\t\t\t(type default)
\t\t\t\t)
\t\t\t\t(fill
\t\t\t\t\t(type background)
\t\t\t\t)
\t\t\t)
`;
  }

  /**
   * Convert EasyEDA arc to KiCad format
   * Uses SVG arc to center parameterization conversion
   */
  private convertArc(arc: EasyEDASymbolArc, origin: { x: number; y: number }): string | null {
    // Parse SVG arc path
    const params = parseSvgArcPath(arc.path);
    if (!params) return null;

    // Convert to center parameterization
    const center = svgArcToCenter(params);
    if (!center) return null;

    // Convert coordinates from EasyEDA to KiCad
    const cx = this.convertX(center.cx, origin.x);
    const cy = this.convertY(center.cy, origin.y);
    const radius = roundTo(center.rx * EE_TO_MM, 3); // Use rx (arcs are typically circular)

    // Convert start and end points
    const startX = this.convertX(params.x1, origin.x);
    const startY = this.convertY(params.y1, origin.y);
    const endX = this.convertX(params.x2, origin.x);
    const endY = this.convertY(params.y2, origin.y);

    // Calculate mid-point on arc for KiCad
    const midAngle = center.startAngle + center.deltaAngle / 2;
    const midX = roundTo(cx + radius * Math.cos(midAngle), 3);
    const midY = roundTo(cy - radius * Math.sin(midAngle), 3); // Y inverted

    const strokeWidth = this.convertStrokeWidth(arc.strokeWidth);

    return `\t\t\t(arc
\t\t\t\t(start ${startX} ${startY})
\t\t\t\t(mid ${midX} ${midY})
\t\t\t\t(end ${endX} ${endY})
\t\t\t\t(stroke
\t\t\t\t\t(width ${strokeWidth})
\t\t\t\t\t(type default)
\t\t\t\t)
\t\t\t\t(fill
\t\t\t\t\t(type none)
\t\t\t\t)
\t\t\t)
`;
  }

  /**
   * Convert EasyEDA SVG path to KiCad polyline
   * Supports M (move), L (line), Z (close) commands
   */
  private convertPath(path: EasyEDASymbolPath, origin: { x: number; y: number }): string | null {
    const points = this.parseSvgPath(path.path, origin);
    if (points.length < 2) return null;

    const strokeWidth = this.convertStrokeWidth(path.strokeWidth);
    const hasFill = path.fillColor && path.fillColor !== 'none' && path.fillColor !== '';

    let output = `\t\t\t(polyline\n`;
    output += `\t\t\t\t(pts\n`;

    for (const pt of points) {
      output += `\t\t\t\t\t(xy ${pt.x} ${pt.y})\n`;
    }

    output += `\t\t\t\t)\n`;
    output += `\t\t\t\t(stroke\n`;
    output += `\t\t\t\t\t(width ${strokeWidth})\n`;
    output += `\t\t\t\t\t(type default)\n`;
    output += `\t\t\t\t)\n`;
    output += `\t\t\t\t(fill\n`;
    output += `\t\t\t\t\t(type ${hasFill ? 'outline' : 'none'})\n`;
    output += `\t\t\t\t)\n`;
    output += `\t\t\t)\n`;

    return output;
  }

  /**
   * Parse SVG path string (M/L/Z commands) to array of points
   * Format: "M x1,y1 L x2,y2 L x3,y3 Z" or "M x1 y1 L x2 y2 ..."
   */
  private parseSvgPath(pathStr: string, origin: { x: number; y: number }): Array<{ x: number; y: number }> {
    const points: Array<{ x: number; y: number }> = [];
    let firstPoint: { x: number; y: number } | null = null;

    // Match M and L commands with coordinates (supports both comma and space separators)
    const commandRegex = /([MLZ])\s*([\d.-]+)?[,\s]*([\d.-]+)?/gi;
    let match;

    while ((match = commandRegex.exec(pathStr)) !== null) {
      const cmd = match[1].toUpperCase();

      if (cmd === 'M' || cmd === 'L') {
        const x = parseFloat(match[2]);
        const y = parseFloat(match[3]);

        if (!isNaN(x) && !isNaN(y)) {
          const point = {
            x: this.convertX(x, origin.x),
            y: this.convertY(y, origin.y),
          };
          points.push(point);

          if (cmd === 'M' && !firstPoint) {
            firstPoint = point;
          }
        }
      } else if (cmd === 'Z' && firstPoint) {
        // Close path - add first point if not already there
        const lastPoint = points[points.length - 1];
        if (lastPoint && (lastPoint.x !== firstPoint.x || lastPoint.y !== firstPoint.y)) {
          points.push({ ...firstPoint });
        }
      }
    }

    return points;
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
   *          rotation points FROM wire TO body
   * KiCad: pin position is the WIRE connection point
   *        rotation points FROM wire TO body
   *
   * So we just need coordinate conversion with Y-flip!
   */
  private generateShapePin(pin: EasyEDAPin, origin: { x: number; y: number }): string {
    const pinType = this.mapPinType(pin.electricalType);

    // Convert wire/junction position to KiCad coordinates (with Y-flip)
    const x = this.convertX(pin.x, origin.x);
    const y = this.convertY(pin.y, origin.y);

    // Map EasyEDA rotation to KiCad rotation
    // Both point FROM wire TO body, but Y-axis is flipped
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
   * EasyEDA: rotation indicates direction pin EXTENDS from wire (away from body)
   * KiCad: rotation indicates direction pin POINTS (from wire toward body)
   *
   * So we need to flip by 180°, then account for Y-axis flip:
   * - EasyEDA 0 (extends right, body on left) -> KiCad 180 (points left toward body)
   * - EasyEDA 180 (extends left, body on right) -> KiCad 0 (points right toward body)
   * - EasyEDA 90 (extends down, body on top) -> KiCad 90 (points up toward body, Y-flipped)
   * - EasyEDA 270 (extends up, body on bottom) -> KiCad 270 (points down toward body, Y-flipped)
   */
  private mapPinRotation(eeRotation: number): number {
    const normalized = ((eeRotation % 360) + 360) % 360;
    // Flip 180° to point toward body instead of away
    // Then swap vertical due to Y-flip (but 180° flip already handles this naturally)
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
    const halfHeight = bodyHeight / 2;

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
   * Generate empty IC pins unit (pins are in _0_1 for CDFER compatibility)
   */
  private generateICPins(name: string, layout: ICLayout): string {
    // No _1_1 unit needed - all pins in _0_1
    return '';
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
    // Look for (symbol "NAME" pattern
    const pattern = new RegExp(`\\(symbol\\s+"${sanitizedName}"`, 'm');
    return pattern.test(libraryContent);
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
    const sanitizedName = this.sanitizeName(component.info.name);

    // Check if symbol exists
    if (!this.symbolExistsInLibrary(existingLibraryContent, component.info.name)) {
      // Symbol doesn't exist, just append it
      return this.appendToLibrary(existingLibraryContent, component, options);
    }

    // Remove the existing symbol
    // Symbol format: (symbol "NAME" ... ) with nested parens
    // We need to find the start and match balanced parens to find the end

    const symbolStart = existingLibraryContent.indexOf(`(symbol "${sanitizedName}"`);
    if (symbolStart === -1) {
      // Shouldn't happen since we checked above, but fallback to append
      return this.appendToLibrary(existingLibraryContent, component, options);
    }

    // Find the matching closing paren by counting balance
    let depth = 0;
    let symbolEnd = symbolStart;
    let inString = false;
    let prevChar = '';

    for (let i = symbolStart; i < existingLibraryContent.length; i++) {
      const char = existingLibraryContent[i];

      // Handle string escaping
      if (char === '"' && prevChar !== '\\') {
        inString = !inString;
      }

      if (!inString) {
        if (char === '(') depth++;
        if (char === ')') {
          depth--;
          if (depth === 0) {
            symbolEnd = i + 1;
            break;
          }
        }
      }

      prevChar = char;
    }

    // Remove the old symbol (including any trailing newline)
    let contentWithoutOldSymbol = existingLibraryContent.slice(0, symbolStart);
    let afterSymbol = existingLibraryContent.slice(symbolEnd);

    // Trim leading newlines from afterSymbol to avoid double spacing
    while (afterSymbol.startsWith('\n')) {
      afterSymbol = afterSymbol.slice(1);
    }

    contentWithoutOldSymbol = contentWithoutOldSymbol + afterSymbol;

    // Now append the new version
    return this.appendToLibrary(contentWithoutOldSymbol, component, options);
  }

  /**
   * Get the sanitized symbol name for a component
   */
  getSymbolName(component: EasyEDAComponentData): string {
    return this.sanitizeName(component.info.name);
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
  private generateProperties(info: EasyEDAComponentData['info'], name: string): string {
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
\t\t\t(at 0 10.16 0)
\t\t\t(effects
\t\t\t\t(font
\t\t\t\t\t(size ${ts} ${ts})
\t\t\t\t)
\t\t\t)
\t\t)
`;

    // Value property - centered below reference (CDFER style)
    props += `\t\t(property "Value" "${this.sanitizeText(displayValue)}"
\t\t\t(at 0 7.62 0)
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
      // Pin 1 at top (270° points down toward body)
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

      // Pin 2 at bottom (90° points up toward body)
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
