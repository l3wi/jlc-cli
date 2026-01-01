/**
 * Shared EasyEDA parsing utilities
 *
 * This module consolidates all EasyEDA parsing logic used by both
 * the LCSC API client and EasyEDA Community API client.
 */

// HTTP client
export { fetchWithCurlFallback, type FetchOptions } from './http-client.js';

// Utility functions
export { parseBool, safeParseFloat, safeParseInt } from './utils.js';

// Shape parsers - Symbol
export {
  parseSymbolPin,
  parseSymbolRect,
  parseSymbolCircle,
  parseSymbolEllipse,
  parseSymbolArc,
  parseSymbolPolyline,
  parseSymbolPolygon,
  parseSymbolPath,
  parseSymbolShapes,
} from './easyeda-shapes.js';

// Shape parsers - Footprint
export {
  parsePad,
  parseTrack,
  parseHole,
  parseCircle,
  parseArc,
  parseRect,
  parseVia,
  parseText,
  parseFootprintShapes,
} from './easyeda-shapes.js';
