/**
 * Unified EasyEDA shape parser
 * Parses both symbol and footprint shapes from EasyEDA format
 *
 * Shape format reference (from easyeda2kicad):
 * - All shapes use tilde (~) as field delimiter
 * - Coordinates are in 10mil units (0.254mm per unit)
 * - Symbol shapes have Y-axis flipped relative to footprint
 */

import type {
  // Symbol shape types
  EasyEDAPin,
  EasyEDASymbolRect,
  EasyEDASymbolCircle,
  EasyEDASymbolEllipse,
  EasyEDASymbolArc,
  EasyEDASymbolPolyline,
  EasyEDASymbolPolygon,
  EasyEDASymbolPath,
  EasyEDASymbolText,
  ParsedSymbolData,
  // Footprint shape types
  EasyEDAPad,
  EasyEDATrack,
  EasyEDAHole,
  EasyEDACircle,
  EasyEDAArc,
  EasyEDARect,
  EasyEDAVia,
  EasyEDAText,
  EasyEDASolidRegion,
  ParsedFootprintData,
} from '../types/easyeda.js';

import { parseBool, safeParseFloat, safeParseInt } from './utils.js';

// =============================================================================
// Symbol Shape Parsers
// =============================================================================

/**
 * Parse EasyEDA symbol pin format
 * Format: P~show~type~number~x~y~rotation~id~locked^^dotData^^pathData^^nameData^^numData^^dot^^clock
 *
 * Segments:
 * [0] = P~show~type~number~x~y~rotation~id~locked (main settings)
 * [1] = dot display data (visual dot, not inversion)
 * [2] = SVG path for pin line (M x y h LENGTH or v LENGTH)
 * [3] = name text data (1~x~y~rotation~name~fontSize~...)
 * [4] = number text data
 * [5] = inverted bubble indicator - "1" if inverted
 * [6] = clock triangle indicator - non-empty if clock
 */
export function parseSymbolPin(pinData: string): EasyEDAPin | null {
  try {
    const segments = pinData.split('^^');
    const settings = segments[0].split('~');
    const nameSegment = segments[3]?.split('~') || [];

    // Extract pin length from SVG path segment (segment 2)
    // Path format: "M x y h LENGTH" (horizontal) or "M x y v LENGTH" (vertical)
    let pinLength = 100; // default 100 EasyEDA units
    if (segments[2]) {
      const pathMatch = segments[2].match(/[hv]\s*(-?[\d.]+)/i);
      if (pathMatch) {
        pinLength = Math.abs(parseFloat(pathMatch[1]));
      }
    }

    // Check for inverted (dot/bubble) indicator - segment 5
    // Format: "is_displayed~x~y" where is_displayed=1 means bubble is shown
    const dotFields = segments[5]?.split('~') || [];
    const hasDot = dotFields[0] === '1';

    // Check for clock indicator - segment 6
    // Format: "is_displayed~path" where is_displayed=1 means clock triangle is shown
    const clockFields = segments[6]?.split('~') || [];
    const hasClock = clockFields[0] === '1';

    // Extract rotation from settings
    const rotation = safeParseFloat(settings[6]);

    return {
      number: settings[3] || '',
      name: nameSegment[4] || '',
      electricalType: settings[2] || '0',
      x: safeParseFloat(settings[4]),
      y: safeParseFloat(settings[5]),
      rotation,
      hasDot,
      hasClock,
      pinLength,
    };
  } catch {
    return null;
  }
}

/**
 * Parse symbol Rectangle shape
 * Format: R~x~y~rx~ry~width~height~strokeColor~strokeWidth~strokeStyle~fillColor~id~locked
 */
export function parseSymbolRect(data: string): EasyEDASymbolRect | null {
  try {
    const f = data.split('~');
    return {
      x: safeParseFloat(f[1]),
      y: safeParseFloat(f[2]),
      rx: safeParseFloat(f[3]),        // corner radius X
      ry: safeParseFloat(f[4]),        // corner radius Y
      width: safeParseFloat(f[5]),
      height: safeParseFloat(f[6]),
      strokeColor: f[7] || '#000000',
      strokeWidth: safeParseFloat(f[8], 1),
      fillColor: f[10] || 'none',
    };
  } catch {
    return null;
  }
}

/**
 * Parse symbol Circle shape
 * Format: C~cx~cy~radius~strokeColor~strokeWidth~strokeStyle~fillColor~id~locked
 */
export function parseSymbolCircle(data: string): EasyEDASymbolCircle | null {
  try {
    const f = data.split('~');
    return {
      cx: safeParseFloat(f[1]),
      cy: safeParseFloat(f[2]),
      radius: safeParseFloat(f[3]),
      strokeColor: f[4] || '#000000',
      strokeWidth: safeParseFloat(f[5], 1),
      fillColor: f[7] || 'none',
    };
  } catch {
    return null;
  }
}

/**
 * Parse symbol Ellipse shape
 * Format: E~cx~cy~rx~ry~strokeColor~strokeWidth~strokeStyle~fillColor~id~locked
 */
export function parseSymbolEllipse(data: string): EasyEDASymbolEllipse | null {
  try {
    const f = data.split('~');
    return {
      cx: safeParseFloat(f[1]),
      cy: safeParseFloat(f[2]),
      radiusX: safeParseFloat(f[3]),
      radiusY: safeParseFloat(f[4]),
      strokeColor: f[5] || '#000000',
      strokeWidth: safeParseFloat(f[6], 1),
      fillColor: f[8] || 'none',
    };
  } catch {
    return null;
  }
}

/**
 * Parse symbol Arc shape (SVG path format)
 * Format: A~path~strokeColor~strokeWidth~strokeStyle~fillColor~id~locked
 */
export function parseSymbolArc(data: string): EasyEDASymbolArc | null {
  try {
    const f = data.split('~');
    return {
      path: f[1] || '',              // SVG arc path "M x1 y1 A rx ry rotation largeArc sweep x2 y2"
      strokeColor: f[2] || '#000000',
      strokeWidth: safeParseFloat(f[3], 1),
      fillColor: f[5] || 'none',
    };
  } catch {
    return null;
  }
}

/**
 * Parse symbol Polyline shape (open path)
 * Format: PL~points~strokeColor~strokeWidth~strokeStyle~fillColor~id~locked
 */
export function parseSymbolPolyline(data: string): EasyEDASymbolPolyline | null {
  try {
    const f = data.split('~');
    return {
      points: f[1] || '',             // Space-separated "x1 y1 x2 y2 ..."
      strokeColor: f[2] || '#000000',
      strokeWidth: safeParseFloat(f[3], 1),
      fillColor: f[5] || 'none',
    };
  } catch {
    return null;
  }
}

/**
 * Parse symbol Polygon shape (closed filled path)
 * Format: PG~points~strokeColor~strokeWidth~strokeStyle~fillColor~id~locked
 */
export function parseSymbolPolygon(data: string): EasyEDASymbolPolygon | null {
  try {
    const f = data.split('~');
    return {
      points: f[1] || '',             // Space-separated "x1 y1 x2 y2 ..."
      strokeColor: f[2] || '#000000',
      strokeWidth: safeParseFloat(f[3], 1),
      fillColor: f[5] || 'none',
    };
  } catch {
    return null;
  }
}

/**
 * Parse symbol SVG Path shape
 * Format: PT~path~strokeColor~strokeWidth~strokeStyle~fillColor~id~locked
 */
export function parseSymbolPath(data: string): EasyEDASymbolPath | null {
  try {
    const f = data.split('~');
    return {
      path: f[1] || '',               // SVG path commands (M/L/Z/C/A)
      strokeColor: f[2] || '#000000',
      strokeWidth: safeParseFloat(f[3], 1),
      fillColor: f[5] || 'none',
    };
  } catch {
    return null;
  }
}

/**
 * Parse symbol Text element
 * Format: T~alignment~x~y~rotation~color~~fontSize~...~type~text~...~id~...~pinpart
 *
 * Example: T~L~485~283~0~#8D2323~~7~ ~ ~ ~comment~J1/T+~1~start~gge40~0~pinpart
 * Fields:
 *  [0]: T - marker
 *  [1]: L - alignment (L=left, R=right, C=center)
 *  [2]: x position
 *  [3]: y position
 *  [4]: rotation
 *  [5]: color
 *  [6]: (empty)
 *  [7]: fontSize
 *  [8-10]: spacers
 *  [11]: type ("comment", "N" for name, etc.)
 *  [12]: actual text content
 *  [13-14]: display flags
 *  [15]: id
 *  [16]: locked
 *  [17]: "pinpart" if this is a pin-related label
 */
export function parseSymbolText(data: string): EasyEDASymbolText | null {
  try {
    const f = data.split('~');
    // Check if this is a pinpart label (last field is "pinpart")
    const isPinPart = f[f.length - 1] === 'pinpart' || f.some(field => field === 'pinpart');

    return {
      x: safeParseFloat(f[2]),
      y: safeParseFloat(f[3]),
      rotation: safeParseFloat(f[4]),
      color: f[5] || '#000000',
      fontSize: safeParseFloat(f[7], 7),
      textType: f[11] || '',
      text: f[12] || '',
      id: f[15] || f[13] || '', // ID position varies
      isPinPart,
    };
  } catch {
    return null;
  }
}

// =============================================================================
// Footprint Shape Parsers
// =============================================================================

/**
 * Parse PAD element - 18 fields
 * Format: PAD~shape~cx~cy~width~height~layerId~net~number~holeRadius~points~rotation~id~holeLength~holePoint~isPlated~isLocked
 */
export function parsePad(data: string): EasyEDAPad | null {
  try {
    const f = data.split('~');
    return {
      shape: f[1] || 'RECT',
      centerX: safeParseFloat(f[2]),
      centerY: safeParseFloat(f[3]),
      width: safeParseFloat(f[4]),
      height: safeParseFloat(f[5]),
      layerId: safeParseInt(f[6], 1),
      net: f[7] || '',
      number: f[8] || '',
      holeRadius: safeParseFloat(f[9]),
      points: f[10] || '',
      rotation: safeParseFloat(f[11]),
      id: f[12] || '',
      holeLength: safeParseFloat(f[13]),
      holePoint: f[14] || '',
      isPlated: parseBool(f[15]),
      isLocked: parseBool(f[16]),
    };
  } catch {
    return null;
  }
}

/**
 * Parse TRACK element - silkscreen/fab lines
 * Format: TRACK~strokeWidth~layerId~net~points~id~isLocked
 */
export function parseTrack(data: string): EasyEDATrack | null {
  try {
    const f = data.split('~');
    return {
      strokeWidth: safeParseFloat(f[1]),
      layerId: safeParseInt(f[2], 1),
      net: f[3] || '',
      points: f[4] || '',
      id: f[5] || '',
      isLocked: parseBool(f[6]),
    };
  } catch {
    return null;
  }
}

/**
 * Parse HOLE element - NPTH
 * Format: HOLE~cx~cy~radius~id~isLocked
 */
export function parseHole(data: string): EasyEDAHole | null {
  try {
    const f = data.split('~');
    return {
      centerX: safeParseFloat(f[1]),
      centerY: safeParseFloat(f[2]),
      radius: safeParseFloat(f[3]),
      id: f[4] || '',
      isLocked: parseBool(f[5]),
    };
  } catch {
    return null;
  }
}

/**
 * Parse CIRCLE element (footprint)
 * Format: CIRCLE~cx~cy~radius~strokeWidth~layerId~id~isLocked
 */
export function parseCircle(data: string): EasyEDACircle | null {
  try {
    const f = data.split('~');
    return {
      cx: safeParseFloat(f[1]),
      cy: safeParseFloat(f[2]),
      radius: safeParseFloat(f[3]),
      strokeWidth: safeParseFloat(f[4]),
      layerId: safeParseInt(f[5], 1),
      id: f[6] || '',
      isLocked: parseBool(f[7]),
    };
  } catch {
    return null;
  }
}

/**
 * Parse ARC element (footprint) with SVG path
 * Format: ARC~strokeWidth~layerId~net~path~helperDots~id~isLocked
 */
export function parseArc(data: string): EasyEDAArc | null {
  try {
    const f = data.split('~');
    return {
      strokeWidth: safeParseFloat(f[1]),
      layerId: safeParseInt(f[2], 1),
      net: f[3] || '',
      path: f[4] || '',
      helperDots: f[5] || '',
      id: f[6] || '',
      isLocked: parseBool(f[7]),
    };
  } catch {
    return null;
  }
}

/**
 * Parse RECT element (footprint)
 * Format: RECT~x~y~width~height~strokeWidth~id~layerId~isLocked
 */
export function parseRect(data: string): EasyEDARect | null {
  try {
    const f = data.split('~');
    return {
      x: safeParseFloat(f[1]),
      y: safeParseFloat(f[2]),
      width: safeParseFloat(f[3]),
      height: safeParseFloat(f[4]),
      strokeWidth: safeParseFloat(f[5]),
      id: f[6] || '',
      layerId: safeParseInt(f[7], 1),
      isLocked: parseBool(f[8]),
    };
  } catch {
    return null;
  }
}

/**
 * Parse VIA element
 * Format: VIA~cx~cy~diameter~net~radius~id~isLocked
 */
export function parseVia(data: string): EasyEDAVia | null {
  try {
    const f = data.split('~');
    return {
      centerX: safeParseFloat(f[1]),
      centerY: safeParseFloat(f[2]),
      diameter: safeParseFloat(f[3]),
      net: f[4] || '',
      radius: safeParseFloat(f[5]),
      id: f[6] || '',
      isLocked: parseBool(f[7]),
    };
  } catch {
    return null;
  }
}

/**
 * Parse TEXT element
 * Format: TEXT~type~cx~cy~strokeWidth~rotation~mirror~layerId~net~fontSize~text~textPath~isDisplayed~id~isLocked
 */
export function parseText(data: string): EasyEDAText | null {
  try {
    const f = data.split('~');
    return {
      type: f[1] || '',
      centerX: safeParseFloat(f[2]),
      centerY: safeParseFloat(f[3]),
      strokeWidth: safeParseFloat(f[4]),
      rotation: safeParseFloat(f[5]),
      mirror: f[6] || '',
      layerId: safeParseInt(f[7], 1),
      net: f[8] || '',
      fontSize: safeParseFloat(f[9]),
      text: f[10] || '',
      textPath: f[11] || '',
      // Default to true if not specified - EasyEDA texts are displayed by default
      isDisplayed: f[12] === undefined || f[12] === '' ? true : parseBool(f[12]),
      id: f[13] || '',
      isLocked: parseBool(f[14]),
    };
  } catch {
    return null;
  }
}

/**
 * Parse SOLIDREGION element - filled polygon region
 * Format: SOLIDREGION~layerId~~path~fillType~id~~~~
 */
export function parseSolidRegion(data: string): EasyEDASolidRegion | null {
  try {
    const f = data.split('~');
    const path = f[3] || '';
    // Skip empty paths
    if (!path || path.length < 3) return null;
    return {
      layerId: safeParseInt(f[1], 1),
      path,
      fillType: f[4] || 'solid',
      id: f[5] || '',
    };
  } catch {
    return null;
  }
}

// =============================================================================
// High-Level Dispatch Functions
// =============================================================================

/**
 * Parse all symbol shapes from raw shape strings
 * Returns parsed data without origin - origin is added by client after parsing.
 */
export function parseSymbolShapes(shapes: string[]): ParsedSymbolData {
  const pins: EasyEDAPin[] = [];
  const rectangles: EasyEDASymbolRect[] = [];
  const circles: EasyEDASymbolCircle[] = [];
  const ellipses: EasyEDASymbolEllipse[] = [];
  const arcs: EasyEDASymbolArc[] = [];
  const polylines: EasyEDASymbolPolyline[] = [];
  const polygons: EasyEDASymbolPolygon[] = [];
  const paths: EasyEDASymbolPath[] = [];
  const texts: EasyEDASymbolText[] = [];

  for (const line of shapes) {
    if (typeof line !== 'string') continue;

    const designator = line.split('~')[0];

    switch (designator) {
      case 'P': {
        const pin = parseSymbolPin(line);
        if (pin) pins.push(pin);
        break;
      }
      case 'R': {
        const rect = parseSymbolRect(line);
        if (rect) rectangles.push(rect);
        break;
      }
      case 'C': {
        const circle = parseSymbolCircle(line);
        if (circle) circles.push(circle);
        break;
      }
      case 'E': {
        const ellipse = parseSymbolEllipse(line);
        if (ellipse) ellipses.push(ellipse);
        break;
      }
      case 'A': {
        const arc = parseSymbolArc(line);
        if (arc) arcs.push(arc);
        break;
      }
      case 'PL': {
        const polyline = parseSymbolPolyline(line);
        if (polyline) polylines.push(polyline);
        break;
      }
      case 'PG': {
        const polygon = parseSymbolPolygon(line);
        if (polygon) polygons.push(polygon);
        break;
      }
      case 'PT': {
        const path = parseSymbolPath(line);
        if (path) paths.push(path);
        break;
      }
      case 'T': {
        const text = parseSymbolText(line);
        if (text && text.text.trim()) texts.push(text);
        break;
      }
    }
  }

  // Post-process: associate pinpart texts with pins to extract names
  associatePinNamesFromTexts(pins, texts);

  return {
    pins,
    rectangles,
    circles,
    ellipses,
    arcs,
    polylines,
    polygons,
    paths,
    texts,
  };
}

/**
 * Associate pinpart text labels with pins to extract descriptive names
 * Looks for patterns like "J1/T+" → pin 1, "J2/T-" → pin 2
 * Also handles format "1CT:1" (center tap), "Green/Yellow" (LED colors)
 */
function associatePinNamesFromTexts(pins: EasyEDAPin[], texts: EasyEDASymbolText[]): void {
  // Get pinpart texts only
  const pinpartTexts = texts.filter(t => t.isPinPart && t.text.trim());

  for (const text of pinpartTexts) {
    const textContent = text.text.trim();

    // Try to match "Jn" or "Jn/..." pattern (common for connectors)
    // Examples: "J1/T+", "J2/T-", "J3/R+", "J4", "J5"
    const jMatch = textContent.match(/^J(\d+)(?:\/(.+))?$/i);
    if (jMatch) {
      const pinNum = jMatch[1];
      const pinFunction = jMatch[2] || textContent; // Use full text if no function suffix

      // Find the pin with this number
      const pin = pins.find(p => p.number === pinNum);
      if (pin && (!pin.name || pin.name === pinNum)) {
        // Set the pin name to the descriptive function (e.g., "T+" for TX+, or full "J1/T+")
        pin.name = pinFunction || textContent;
      }
      continue;
    }

    // Try to match just a number (for simple numbered pins)
    const numMatch = textContent.match(/^(\d+)$/);
    if (numMatch) {
      // Don't override - this is just a pin number, not a name
      continue;
    }

    // For other patterns like "1CT:1", "Green", "Yellow", etc.
    // These are decorative labels, not pin names - skip them
  }
}

/**
 * Parse all footprint shapes from raw shape strings
 * Returns parsed data without origin - origin is added by client after parsing.
 */
export function parseFootprintShapes(shapes: string[]): ParsedFootprintData {
  const pads: EasyEDAPad[] = [];
  const tracks: EasyEDATrack[] = [];
  const holes: EasyEDAHole[] = [];
  const circles: EasyEDACircle[] = [];
  const arcs: EasyEDAArc[] = [];
  const rects: EasyEDARect[] = [];
  const texts: EasyEDAText[] = [];
  const vias: EasyEDAVia[] = [];
  const solidRegions: EasyEDASolidRegion[] = [];
  let model3d: { name: string; uuid: string } | undefined;

  for (const line of shapes) {
    if (typeof line !== 'string') continue;

    const designator = line.split('~')[0];

    switch (designator) {
      case 'PAD': {
        const pad = parsePad(line);
        if (pad) pads.push(pad);
        break;
      }
      case 'TRACK': {
        const track = parseTrack(line);
        if (track) tracks.push(track);
        break;
      }
      case 'HOLE': {
        const hole = parseHole(line);
        if (hole) holes.push(hole);
        break;
      }
      case 'CIRCLE': {
        const circle = parseCircle(line);
        if (circle) circles.push(circle);
        break;
      }
      case 'ARC': {
        const arc = parseArc(line);
        if (arc) arcs.push(arc);
        break;
      }
      case 'RECT': {
        const rect = parseRect(line);
        if (rect) rects.push(rect);
        break;
      }
      case 'VIA': {
        const via = parseVia(line);
        if (via) vias.push(via);
        break;
      }
      case 'TEXT': {
        const text = parseText(line);
        if (text) texts.push(text);
        break;
      }
      case 'SVGNODE': {
        // Extract 3D model info
        try {
          const jsonStr = line.split('~')[1];
          const svgData = JSON.parse(jsonStr);
          if (svgData?.attrs?.uuid) {
            model3d = {
              name: svgData.attrs.title || '3D Model',
              uuid: svgData.attrs.uuid,
            };
          }
        } catch {
          // Ignore parse errors
        }
        break;
      }
      case 'SOLIDREGION': {
        const solidRegion = parseSolidRegion(line);
        if (solidRegion) solidRegions.push(solidRegion);
        break;
      }
    }
  }

  // Determine type based on pads
  // Check both holeRadius > 0 and isPlated polygon pads (EasyEDA often has holeRadius=0 for polygon THT)
  const type = pads.some(p => p.holeRadius > 0 || (p.shape === 'POLYGON' && p.isPlated)) ? 'tht' : 'smd';

  return {
    name: 'Unknown', // Will be set by caller
    type,
    pads,
    tracks,
    holes,
    circles,
    arcs,
    rects,
    texts,
    vias,
    solidRegions,
    model3d,
  };
}
