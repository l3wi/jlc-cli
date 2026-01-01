/**
 * Standard footprint patterns and dimensions
 */

// Common SMD resistor/capacitor sizes (metric)
export const SMD_PACKAGE_SIZES: Record<string, { length: number; width: number }> = {
  '0201': { length: 0.6, width: 0.3 },
  '0402': { length: 1.0, width: 0.5 },
  '0603': { length: 1.6, width: 0.8 },
  '0805': { length: 2.0, width: 1.25 },
  '1206': { length: 3.2, width: 1.6 },
  '1210': { length: 3.2, width: 2.5 },
  '1812': { length: 4.5, width: 3.2 },
  '2010': { length: 5.0, width: 2.5 },
  '2512': { length: 6.3, width: 3.2 },
};

// Common IC package patterns
export const IC_PACKAGE_PATTERNS = {
  // SOIC packages
  SOIC8: { pins: 8, pitch: 1.27, width: 3.9 },
  SOIC14: { pins: 14, pitch: 1.27, width: 3.9 },
  SOIC16: { pins: 16, pitch: 1.27, width: 3.9 },

  // TSSOP packages
  TSSOP8: { pins: 8, pitch: 0.65, width: 3.0 },
  TSSOP14: { pins: 14, pitch: 0.65, width: 4.4 },
  TSSOP16: { pins: 16, pitch: 0.65, width: 4.4 },
  TSSOP20: { pins: 20, pitch: 0.65, width: 4.4 },

  // QFP packages
  LQFP32: { pins: 32, pitch: 0.8, size: 7.0 },
  LQFP48: { pins: 48, pitch: 0.5, size: 7.0 },
  LQFP64: { pins: 64, pitch: 0.5, size: 10.0 },
  LQFP100: { pins: 100, pitch: 0.5, size: 14.0 },
  LQFP144: { pins: 144, pitch: 0.5, size: 20.0 },

  // QFN packages
  QFN16: { pins: 16, pitch: 0.5, size: 3.0 },
  QFN20: { pins: 20, pitch: 0.5, size: 4.0 },
  QFN24: { pins: 24, pitch: 0.5, size: 4.0 },
  QFN32: { pins: 32, pitch: 0.5, size: 5.0 },
  QFN48: { pins: 48, pitch: 0.5, size: 7.0 },

  // BGA packages
  BGA100: { pins: 100, pitch: 0.8 },
  BGA144: { pins: 144, pitch: 0.8 },
  BGA256: { pins: 256, pitch: 0.8 },
} as const;

// Standard connector pitches
export const CONNECTOR_PITCHES = {
  STANDARD_2_54MM: 2.54,  // 100 mil
  STANDARD_2MM: 2.0,
  FINE_1_27MM: 1.27,      // 50 mil
  FINE_1MM: 1.0,
  USB_C: 0.5,
  FPC_0_5MM: 0.5,
  FPC_1MM: 1.0,
} as const;

// Mounting hole sizes (M2, M2.5, M3, M4)
export const MOUNTING_HOLES = {
  M2: { drill: 2.2, pad: 4.0 },
  M2_5: { drill: 2.7, pad: 5.0 },
  M3: { drill: 3.2, pad: 6.0 },
  M4: { drill: 4.3, pad: 8.0 },
} as const;
