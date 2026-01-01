/**
 * Symbol Templates for Passive Components
 * Fixed layouts that produce clean, consistent symbols like CDFER's JLCPCB-Kicad-Library
 */

export interface SymbolTemplate {
  /** Pin length in mm */
  pinLength: number;
  /** Y-distance between pins for 2-pin components (total, not from center) */
  pinSpacing: number;
  /** KiCad S-expression for body graphics */
  bodyGraphics: string;
  /** Reference designator position */
  refPosition: { x: number; y: number; angle: number };
  /** Value property position */
  valuePosition: { x: number; y: number; angle: number };
}

/**
 * Resistor template - Rectangular body
 * Based on CDFER: Body 2.032mm × 5.08mm, pins at ±3.81mm
 */
const RESISTOR_TEMPLATE: SymbolTemplate = {
  pinLength: 2.54,
  pinSpacing: 7.62,  // pins at y = ±3.81mm
  bodyGraphics: `\t\t\t(rectangle
\t\t\t\t(start -1.016 2.54)
\t\t\t\t(end 1.016 -2.54)
\t\t\t\t(stroke
\t\t\t\t\t(width 0.254)
\t\t\t\t\t(type default)
\t\t\t\t)
\t\t\t\t(fill
\t\t\t\t\t(type background)
\t\t\t\t)
\t\t\t)`,
  refPosition: { x: 2.54, y: 0, angle: 90 },
  valuePosition: { x: -1.778, y: 0, angle: 90 },
};

/**
 * Capacitor template - Two parallel plates
 * Based on CDFER: Plates at ±0.635mm, pins at ±2.54mm
 */
const CAPACITOR_TEMPLATE: SymbolTemplate = {
  pinLength: 2.54,
  pinSpacing: 5.08,  // pins at y = ±2.54mm
  bodyGraphics: `\t\t\t(polyline
\t\t\t\t(pts
\t\t\t\t\t(xy -1.27 0.635)
\t\t\t\t\t(xy 1.27 0.635)
\t\t\t\t)
\t\t\t\t(stroke
\t\t\t\t\t(width 0.254)
\t\t\t\t\t(type default)
\t\t\t\t)
\t\t\t\t(fill
\t\t\t\t\t(type none)
\t\t\t\t)
\t\t\t)
\t\t\t(polyline
\t\t\t\t(pts
\t\t\t\t\t(xy -1.27 -0.635)
\t\t\t\t\t(xy 1.27 -0.635)
\t\t\t\t)
\t\t\t\t(stroke
\t\t\t\t\t(width 0.254)
\t\t\t\t\t(type default)
\t\t\t\t)
\t\t\t\t(fill
\t\t\t\t\t(type none)
\t\t\t\t)
\t\t\t)`,
  refPosition: { x: 2.54, y: 0, angle: 0 },
  valuePosition: { x: -2.54, y: 0, angle: 0 },
};

/**
 * Inductor template - 4 semicircular arcs (standard coil symbol)
 * Arcs arranged vertically, bulging to the right
 */
const INDUCTOR_TEMPLATE: SymbolTemplate = {
  pinLength: 2.54,
  pinSpacing: 7.62,  // pins at y = ±3.81mm
  bodyGraphics: `\t\t\t(arc
\t\t\t\t(start 0 2.54)
\t\t\t\t(mid 0.635 1.905)
\t\t\t\t(end 0 1.27)
\t\t\t\t(stroke
\t\t\t\t\t(width 0.254)
\t\t\t\t\t(type default)
\t\t\t\t)
\t\t\t\t(fill
\t\t\t\t\t(type none)
\t\t\t\t)
\t\t\t)
\t\t\t(arc
\t\t\t\t(start 0 1.27)
\t\t\t\t(mid 0.635 0.635)
\t\t\t\t(end 0 0)
\t\t\t\t(stroke
\t\t\t\t\t(width 0.254)
\t\t\t\t\t(type default)
\t\t\t\t)
\t\t\t\t(fill
\t\t\t\t\t(type none)
\t\t\t\t)
\t\t\t)
\t\t\t(arc
\t\t\t\t(start 0 0)
\t\t\t\t(mid 0.635 -0.635)
\t\t\t\t(end 0 -1.27)
\t\t\t\t(stroke
\t\t\t\t\t(width 0.254)
\t\t\t\t\t(type default)
\t\t\t\t)
\t\t\t\t(fill
\t\t\t\t\t(type none)
\t\t\t\t)
\t\t\t)
\t\t\t(arc
\t\t\t\t(start 0 -1.27)
\t\t\t\t(mid 0.635 -1.905)
\t\t\t\t(end 0 -2.54)
\t\t\t\t(stroke
\t\t\t\t\t(width 0.254)
\t\t\t\t\t(type default)
\t\t\t\t)
\t\t\t\t(fill
\t\t\t\t\t(type none)
\t\t\t\t)
\t\t\t)`,
  refPosition: { x: 2.54, y: 0, angle: 90 },
  valuePosition: { x: -1.778, y: 0, angle: 90 },
};

/**
 * Diode template - Triangle with cathode bar
 * Based on CDFER: Triangle 2.54mm wide, pins at ±5.08mm
 */
const DIODE_TEMPLATE: SymbolTemplate = {
  pinLength: 3.81,
  pinSpacing: 10.16,  // pins at y = ±5.08mm
  bodyGraphics: `\t\t\t(polyline
\t\t\t\t(pts
\t\t\t\t\t(xy -1.27 1.27)
\t\t\t\t\t(xy 0 -1.27)
\t\t\t\t\t(xy 1.27 1.27)
\t\t\t\t\t(xy -1.27 1.27)
\t\t\t\t)
\t\t\t\t(stroke
\t\t\t\t\t(width 0.254)
\t\t\t\t\t(type default)
\t\t\t\t)
\t\t\t\t(fill
\t\t\t\t\t(type none)
\t\t\t\t)
\t\t\t)
\t\t\t(polyline
\t\t\t\t(pts
\t\t\t\t\t(xy -1.27 -1.27)
\t\t\t\t\t(xy 1.27 -1.27)
\t\t\t\t)
\t\t\t\t(stroke
\t\t\t\t\t(width 0.254)
\t\t\t\t\t(type default)
\t\t\t\t)
\t\t\t\t(fill
\t\t\t\t\t(type none)
\t\t\t\t)
\t\t\t)`,
  refPosition: { x: 2.54, y: 0, angle: 0 },
  valuePosition: { x: -2.54, y: 0, angle: 0 },
};

/**
 * LED template - Triangle with light rays
 */
const LED_TEMPLATE: SymbolTemplate = {
  ...DIODE_TEMPLATE,
  // Same as diode but could add light rays in future
  bodyGraphics: DIODE_TEMPLATE.bodyGraphics,
};

/**
 * Get symbol template for a component prefix
 * Returns null for components that should use EasyEDA-derived layout
 */
export function getSymbolTemplate(prefix: string): SymbolTemplate | null {
  const p = prefix.toUpperCase();

  switch (p) {
    case 'R':
      return RESISTOR_TEMPLATE;
    case 'C':
      return CAPACITOR_TEMPLATE;
    case 'L':
      return INDUCTOR_TEMPLATE;
    case 'D':
      return DIODE_TEMPLATE;
    case 'LED':
      return LED_TEMPLATE;
    default:
      // No template - use EasyEDA-derived layout for ICs, transistors, etc.
      return null;
  }
}

/**
 * Check if a component should use a fixed template
 */
export function hasFixedTemplate(prefix: string): boolean {
  return getSymbolTemplate(prefix) !== null;
}
