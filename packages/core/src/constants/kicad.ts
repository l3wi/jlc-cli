/**
 * KiCad layer names and constants
 */

// Standard layer names
export const KICAD_LAYERS = {
  // Copper layers
  F_CU: 'F.Cu',
  B_CU: 'B.Cu',
  IN1_CU: 'In1.Cu',
  IN2_CU: 'In2.Cu',
  IN3_CU: 'In3.Cu',
  IN4_CU: 'In4.Cu',

  // Technical layers - front
  F_ADHES: 'F.Adhes',
  F_PASTE: 'F.Paste',
  F_SILKS: 'F.SilkS',
  F_MASK: 'F.Mask',
  F_CRTYD: 'F.CrtYd',
  F_FAB: 'F.Fab',

  // Technical layers - back
  B_ADHES: 'B.Adhes',
  B_PASTE: 'B.Paste',
  B_SILKS: 'B.SilkS',
  B_MASK: 'B.Mask',
  B_CRTYD: 'B.CrtYd',
  B_FAB: 'B.Fab',

  // Other layers
  EDGE_CUTS: 'Edge.Cuts',
  MARGIN: 'Margin',
  DWGS_USER: 'Dwgs.User',
  CMTS_USER: 'Cmts.User',
  ECO1_USER: 'Eco1.User',
  ECO2_USER: 'Eco2.User',
} as const;

// Layer groups for common operations
export const KICAD_LAYER_GROUPS = {
  ALL_CU: ['*.Cu'],
  ALL_MASK: ['*.Mask'],
  FRONT_LAYERS: ['F.Cu', 'F.Paste', 'F.Mask'],
  BACK_LAYERS: ['B.Cu', 'B.Paste', 'B.Mask'],
  SMD_FRONT: ['F.Cu', 'F.Paste', 'F.Mask'],
  SMD_BACK: ['B.Cu', 'B.Paste', 'B.Mask'],
  THT: ['*.Cu', '*.Mask'],
} as const;

// Default text sizes
export const KICAD_DEFAULTS = {
  TEXT_SIZE: 1.27,      // mm (standard KiCad 9)
  TEXT_THICKNESS: 0.15, // mm
  WIRE_WIDTH: 0.25,    // mm (schematic)
  GRID_SCHEMATIC: 2.54, // mm (100 mil)
  GRID_PCB: 0.25,      // mm
  PIN_LENGTH: 1.27,    // mm (50 mil - KiCad 9 default)
  PIN_NAME_OFFSET: 0,  // mm (0 for hidden names)
} as const;

// Symbol generator version (KiCad 9 format)
export const KICAD_SYMBOL_VERSION = '20241209';
export const KICAD_FOOTPRINT_VERSION = '20241209';

// Pin electrical types
export const KICAD_PIN_TYPES = [
  'input',
  'output',
  'bidirectional',
  'tri_state',
  'passive',
  'free',
  'unspecified',
  'power_in',
  'power_out',
  'open_collector',
  'open_emitter',
  'no_connect',
] as const;

// Pad shapes
export const KICAD_PAD_SHAPES = [
  'circle',
  'rect',
  'oval',
  'trapezoid',
  'roundrect',
  'custom',
] as const;

// Pad types
export const KICAD_PAD_TYPES = [
  'thru_hole',
  'smd',
  'connect',
  'np_thru_hole',
] as const;

// Global library configuration
export const KICAD_LIBRARY_NAME = 'EDA-MCP';
export const KICAD_LIBRARY_DESCRIPTION = 'AI-EDA Component Library (JLC/EasyEDA)';

// Supported KiCad versions (newest first)
export const KICAD_VERSIONS = ['9.0', '8.0'] as const;
export type KiCadVersion = (typeof KICAD_VERSIONS)[number];

/**
 * Get global KiCad library paths for a specific platform
 * Returns paths in the format that kicad-sch-mcp's search pattern expects:
 * ~/Documents/KiCad/{version}/symbols/*.kicad_sym
 */
export function getGlobalKicadLibraryPaths(
  homeDir: string,
  platform: 'darwin' | 'win32' | 'linux',
  version: string = '9.0'
): {
  base: string;
  symbols: string;
  footprints: string;
  models3d: string;
} | null {
  let baseDir: string;

  switch (platform) {
    case 'darwin':
      // macOS: ~/Documents/KiCad/9.0/
      baseDir = `${homeDir}/Documents/KiCad/${version}`;
      break;
    case 'win32':
      // Windows: %USERPROFILE%/Documents/KiCad/9.0/
      baseDir = `${homeDir}/Documents/KiCad/${version}`;
      break;
    case 'linux':
      // Linux: ~/.local/share/kicad/9.0/ or ~/Documents/KiCad/9.0/
      baseDir = `${homeDir}/Documents/KiCad/${version}`;
      break;
    default:
      return null;
  }

  return {
    base: baseDir,
    symbols: `${baseDir}/symbols`,
    footprints: `${baseDir}/footprints`,
    models3d: `${baseDir}/3dmodels`,
  };
}
