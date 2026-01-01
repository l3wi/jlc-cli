/**
 * Default design rules for common PCB manufacturers
 */

export interface DesignRules {
  name: string;
  minTraceWidth: number;      // mm
  minTraceClearance: number;  // mm
  minViaDrill: number;        // mm
  minViaPad: number;          // mm
  minHoleDrill: number;       // mm
  minAnnularRing: number;     // mm
  minSilkscreenWidth: number; // mm
  minSilkscreenClearance: number; // mm
}

// JLCPCB standard capabilities
export const JLCPCB_STANDARD: DesignRules = {
  name: 'JLCPCB Standard',
  minTraceWidth: 0.127,       // 5 mil
  minTraceClearance: 0.127,   // 5 mil
  minViaDrill: 0.3,
  minViaPad: 0.6,
  minHoleDrill: 0.3,
  minAnnularRing: 0.13,
  minSilkscreenWidth: 0.15,
  minSilkscreenClearance: 0.15,
};

// JLCPCB advanced capabilities (extra cost)
export const JLCPCB_ADVANCED: DesignRules = {
  name: 'JLCPCB Advanced',
  minTraceWidth: 0.09,        // 3.5 mil
  minTraceClearance: 0.09,    // 3.5 mil
  minViaDrill: 0.15,
  minViaPad: 0.4,
  minHoleDrill: 0.15,
  minAnnularRing: 0.075,
  minSilkscreenWidth: 0.1,
  minSilkscreenClearance: 0.1,
};

// PCBWay standard capabilities
export const PCBWAY_STANDARD: DesignRules = {
  name: 'PCBWay Standard',
  minTraceWidth: 0.127,       // 5 mil
  minTraceClearance: 0.127,   // 5 mil
  minViaDrill: 0.3,
  minViaPad: 0.6,
  minHoleDrill: 0.3,
  minAnnularRing: 0.15,
  minSilkscreenWidth: 0.15,
  minSilkscreenClearance: 0.15,
};

// OSH Park standard capabilities
export const OSHPARK_STANDARD: DesignRules = {
  name: 'OSH Park',
  minTraceWidth: 0.152,       // 6 mil
  minTraceClearance: 0.152,   // 6 mil
  minViaDrill: 0.254,         // 10 mil
  minViaPad: 0.508,
  minHoleDrill: 0.254,
  minAnnularRing: 0.127,
  minSilkscreenWidth: 0.15,
  minSilkscreenClearance: 0.15,
};

// Conservative rules for hobby/hand soldering
export const HOBBY_RULES: DesignRules = {
  name: 'Hobby/Hand Solder',
  minTraceWidth: 0.3,         // 12 mil
  minTraceClearance: 0.3,     // 12 mil
  minViaDrill: 0.4,
  minViaPad: 0.8,
  minHoleDrill: 0.4,
  minAnnularRing: 0.2,
  minSilkscreenWidth: 0.2,
  minSilkscreenClearance: 0.2,
};

// Standard trace widths for different current levels (1oz copper, 10C rise)
export const TRACE_WIDTH_CURRENT: Record<string, number> = {
  '0.5A': 0.2,
  '1A': 0.5,
  '2A': 1.0,
  '3A': 1.5,
  '5A': 2.5,
  '10A': 5.0,
};

// Default layer stackups
export const LAYER_STACKUPS = {
  '2-layer': {
    layers: ['F.Cu', 'B.Cu'],
    copperThickness: 0.035,  // 1oz = 35um
    boardThickness: 1.6,     // mm
  },
  '4-layer': {
    layers: ['F.Cu', 'In1.Cu', 'In2.Cu', 'B.Cu'],
    copperThickness: 0.035,
    boardThickness: 1.6,
  },
} as const;

export function getDesignRulesForManufacturer(manufacturer: string): DesignRules {
  switch (manufacturer.toLowerCase()) {
    case 'jlcpcb':
      return JLCPCB_STANDARD;
    case 'jlcpcb-advanced':
      return JLCPCB_ADVANCED;
    case 'pcbway':
      return PCBWAY_STANDARD;
    case 'oshpark':
      return OSHPARK_STANDARD;
    default:
      return HOBBY_RULES;
  }
}
