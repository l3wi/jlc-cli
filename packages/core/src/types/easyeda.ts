/**
 * EasyEDA format types for component data from LCSC/EasyEDA API
 *
 * Based on easyeda2kicad.py analysis - supports all footprint shape types
 */

export interface EasyEDAComponent {
  uuid: string;
  lcsc: string;
  title: string;
  description: string;
  symbol: EasyEDASymbol;
  footprint: EasyEDAFootprint;
  attributes: Record<string, string>;
}

export interface EasyEDASymbol {
  docType: string;
  head: EasyEDAHead;
  canvas: string;
  shape: string[];
}

export interface EasyEDAFootprint {
  docType: string;
  head: EasyEDAHead;
  canvas: string;
  shape: string[];
}

export interface EasyEDAHead {
  x: string;
  y: string;
  c_para?: Record<string, string>;
  [key: string]: unknown;
}

export interface EasyEDAPin {
  number: string;
  name: string;
  electricalType: string;
  x: number;
  y: number;
  rotation: number;
  // Pin style indicators (for inverted/clock pins)
  hasDot: boolean;        // Inverted bubble indicator
  hasClock: boolean;      // Clock triangle indicator
  pinLength: number;      // Pin length in EasyEDA units (extracted from SVG path)
}

// =============================================================================
// Symbol Shape Types (different from footprint shapes!)
// =============================================================================

/**
 * Symbol Rectangle - body outlines, IC bodies
 * Format: R~x~y~rx~ry~width~height~strokeColor~strokeWidth~strokeStyle~fillColor~id~locked
 */
export interface EasyEDASymbolRect {
  x: number;
  y: number;
  width: number;
  height: number;
  strokeWidth: number;
  strokeColor: string;
  fillColor: string;
  rx: number;            // corner radius X
  ry: number;            // corner radius Y
}

/**
 * Symbol Circle
 * Format: C~cx~cy~radius~strokeColor~strokeWidth~strokeStyle~fillColor~id~locked
 */
export interface EasyEDASymbolCircle {
  cx: number;
  cy: number;
  radius: number;
  strokeWidth: number;
  strokeColor: string;
  fillColor: string;
}

/**
 * Symbol Ellipse
 * Format: E~cx~cy~rx~ry~strokeColor~strokeWidth~strokeStyle~fillColor~id~locked
 */
export interface EasyEDASymbolEllipse {
  cx: number;
  cy: number;
  radiusX: number;
  radiusY: number;
  strokeWidth: number;
  strokeColor: string;
  fillColor: string;
}

/**
 * Symbol Arc with SVG path
 * Format: A~path~strokeColor~strokeWidth~strokeStyle~fillColor~id~locked
 */
export interface EasyEDASymbolArc {
  path: string;          // SVG arc path "M x1 y1 A rx ry rotation largeArc sweep x2 y2"
  strokeWidth: number;
  strokeColor: string;
  fillColor: string;
}

/**
 * Symbol Polyline - open path
 * Format: PL~points~strokeColor~strokeWidth~strokeStyle~fillColor~id~locked
 */
export interface EasyEDASymbolPolyline {
  points: string;        // Space-separated "x1 y1 x2 y2 ..."
  strokeWidth: number;
  strokeColor: string;
  fillColor: string;
}

/**
 * Symbol Polygon - closed filled path
 * Format: PG~points~strokeColor~strokeWidth~strokeStyle~fillColor~id~locked
 */
export interface EasyEDASymbolPolygon {
  points: string;        // Space-separated "x1 y1 x2 y2 ..."
  strokeWidth: number;
  strokeColor: string;
  fillColor: string;
}

/**
 * Symbol Path - SVG path commands
 * Format: PT~path~strokeColor~strokeWidth~strokeStyle~fillColor~id~locked
 */
export interface EasyEDASymbolPath {
  path: string;          // SVG path commands (M/L/Z/C/A)
  strokeWidth: number;
  strokeColor: string;
  fillColor: string;
}

/**
 * Symbol Text element
 * Format: T~alignment~x~y~rotation~color~~fontSize~...~type~text~...~id~...~pinpart
 * Used for pin labels, reference designators, and decorative text
 */
export interface EasyEDASymbolText {
  x: number;
  y: number;
  rotation: number;
  fontSize: number;
  text: string;
  color: string;
  textType: string;      // "comment", "N" (name), etc.
  isPinPart: boolean;    // true if this text is a pin-related label
  id: string;
}

/**
 * Complete symbol data with all shape types
 */
export interface EasyEDASymbolData {
  pins: EasyEDAPin[];
  rectangles: EasyEDASymbolRect[];
  circles: EasyEDASymbolCircle[];
  ellipses: EasyEDASymbolEllipse[];
  arcs: EasyEDASymbolArc[];
  polylines: EasyEDASymbolPolyline[];
  polygons: EasyEDASymbolPolygon[];
  paths: EasyEDASymbolPath[];
  texts: EasyEDASymbolText[];
  origin: { x: number; y: number };
}

/** Parsed symbol data before origin is added */
export type ParsedSymbolData = Omit<EasyEDASymbolData, 'origin'>;

// =============================================================================
// Footprint Shape Types (all coordinates in 10mil units)
// =============================================================================

/**
 * PAD element - 18 fields
 * Format: PAD~shape~cx~cy~width~height~layerId~net~number~holeRadius~points~rotation~id~holeLength~holePoint~isPlated~isLocked
 */
export interface EasyEDAPad {
  shape: string;           // RECT, ELLIPSE, OVAL, POLYGON
  centerX: number;         // center X coordinate
  centerY: number;         // center Y coordinate
  width: number;           // pad width
  height: number;          // pad height
  layerId: number;         // 1=F.Cu, 2=B.Cu, 11=*.Cu
  net: string;             // net name (usually empty)
  number: string;          // pad number "1", "2", "GND"
  holeRadius: number;      // 0 for SMD, >0 for THT (radius, not diameter)
  points: string;          // space-separated "x1 y1 x2 y2..." for POLYGON shape
  rotation: number;        // rotation in degrees
  id: string;              // unique element ID
  holeLength: number;      // for slot/oval holes
  holePoint: string;       // slot orientation
  isPlated: boolean;       // true for PTH, false for NPTH
  isLocked: boolean;       // locked in editor
}

/**
 * TRACK element - silkscreen/fab lines
 * Format: TRACK~strokeWidth~layerId~net~points~id~isLocked
 */
export interface EasyEDATrack {
  strokeWidth: number;     // line width
  layerId: number;         // layer ID
  net: string;             // net name
  points: string;          // space-separated "x1 y1 x2 y2..."
  id: string;              // unique element ID
  isLocked: boolean;
}

/**
 * HOLE element - non-plated through hole (NPTH)
 * Format: HOLE~cx~cy~radius~id~isLocked
 */
export interface EasyEDAHole {
  centerX: number;
  centerY: number;
  radius: number;          // hole radius (NOT diameter)
  id: string;
  isLocked: boolean;
}

/**
 * CIRCLE element - circular graphics
 * Format: CIRCLE~cx~cy~radius~strokeWidth~layerId~id~isLocked
 */
export interface EasyEDACircle {
  cx: number;
  cy: number;
  radius: number;
  strokeWidth: number;
  layerId: number;
  id: string;
  isLocked: boolean;
}

/**
 * ARC element - arc graphics with SVG path
 * Format: ARC~strokeWidth~layerId~net~path~helperDots~id~isLocked
 */
export interface EasyEDAArc {
  strokeWidth: number;
  layerId: number;
  net: string;
  path: string;            // SVG arc path "M x1 y1 A rx ry rotation largeArc sweep x2 y2"
  helperDots: string;
  id: string;
  isLocked: boolean;
}

/**
 * RECT element - rectangle graphics
 * Format: RECT~x~y~width~height~strokeWidth~id~layerId~isLocked
 */
export interface EasyEDARect {
  x: number;
  y: number;
  width: number;
  height: number;
  strokeWidth: number;
  id: string;
  layerId: number;
  isLocked: boolean;
}

/**
 * VIA element - through-hole via
 * Format: VIA~cx~cy~diameter~net~radius~id~isLocked
 */
export interface EasyEDAVia {
  centerX: number;
  centerY: number;
  diameter: number;
  net: string;
  radius: number;          // drill radius
  id: string;
  isLocked: boolean;
}

/**
 * TEXT element - text graphics
 * Format: TEXT~type~cx~cy~strokeWidth~rotation~mirror~layerId~net~fontSize~text~textPath~isDisplayed~id~isLocked
 */
export interface EasyEDAText {
  type: string;            // text type
  centerX: number;
  centerY: number;
  strokeWidth: number;
  rotation: number;
  mirror: string;
  layerId: number;
  net: string;
  fontSize: number;
  text: string;
  textPath: string;
  isDisplayed: boolean;
  id: string;
  isLocked: boolean;
}

/**
 * SOLIDREGION element - filled polygon region
 * Format: SOLIDREGION~layerId~~path~fillType~id~~~~
 * Used for copper fills, solder paste regions, and documentation shapes
 */
export interface EasyEDASolidRegion {
  layerId: number;
  path: string;            // SVG path with M/L/Z commands (e.g., "M425,230L445,230L445,220L425,220Z")
  fillType: string;        // "solid", "none", etc.
  id: string;
}

// =============================================================================
// Parsed Component Data
// =============================================================================

/**
 * Complete footprint data with all shape types
 */
export interface EasyEDAFootprintData {
  name: string;
  type: 'smd' | 'tht';
  pads: EasyEDAPad[];
  tracks: EasyEDATrack[];
  holes: EasyEDAHole[];
  circles: EasyEDACircle[];
  arcs: EasyEDAArc[];
  rects: EasyEDARect[];
  texts: EasyEDAText[];
  vias: EasyEDAVia[];
  solidRegions: EasyEDASolidRegion[];
  origin: { x: number; y: number };
  model3d?: { name: string; uuid: string }; // Extracted from SVGNODE
}

/** Parsed footprint data before origin is added */
export type ParsedFootprintData = Omit<EasyEDAFootprintData, 'origin'>;

export interface EasyEDAComponentData {
  info: {
    name: string;
    prefix: string;
    package?: string;
    manufacturer?: string;
    datasheet?: string;        // Product page URL
    datasheetPdf?: string;     // Actual PDF datasheet URL
    lcscId?: string;
    jlcId?: string;
    description?: string;
    category?: string;
    attributes?: Record<string, string>;
    // CDFER parity fields
    stock?: number;
    price?: number;
    minOrderQty?: number;
    process?: 'SMT' | 'THT';
    partClass?: string;
    partNumber?: string;
  };
  symbol: EasyEDASymbolData;
  footprint: EasyEDAFootprintData;
  model3d?: {
    name: string;
    uuid: string;
  };
  rawData: object;
}
