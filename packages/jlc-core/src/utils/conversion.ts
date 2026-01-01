/**
 * Unit conversion utilities for EDA operations
 */

// EasyEDA uses 10mil units (0.254mm per unit)
export const EASYEDA_TO_MM = 0.254;
export const MM_TO_EASYEDA = 1 / EASYEDA_TO_MM;

// KiCad uses mm as default
export const MM_TO_MIL = 39.3701;
export const MIL_TO_MM = 0.0254;
export const MM_TO_INCH = 0.0393701;
export const INCH_TO_MM = 25.4;

/**
 * Convert EasyEDA units to millimeters
 */
export function easyedaToMm(value: number): number {
  return value * EASYEDA_TO_MM;
}

/**
 * Convert millimeters to EasyEDA units
 */
export function mmToEasyeda(value: number): number {
  return value * MM_TO_EASYEDA;
}

/**
 * Convert mils to millimeters
 */
export function milToMm(value: number): number {
  return value * MIL_TO_MM;
}

/**
 * Convert millimeters to mils
 */
export function mmToMil(value: number): number {
  return value * MM_TO_MIL;
}

/**
 * Convert inches to millimeters
 */
export function inchToMm(value: number): number {
  return value * INCH_TO_MM;
}

/**
 * Convert millimeters to inches
 */
export function mmToInch(value: number): number {
  return value * MM_TO_INCH;
}

/**
 * Round to a specific number of decimal places
 */
export function roundTo(value: number, decimals: number = 4): number {
  const multiplier = Math.pow(10, decimals);
  return Math.round(value * multiplier) / multiplier;
}

/**
 * Convert angle from degrees to radians
 */
export function degToRad(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Convert angle from radians to degrees
 */
export function radToDeg(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Normalize angle to 0-360 range
 */
export function normalizeAngle(angle: number): number {
  return ((angle % 360) + 360) % 360;
}

/**
 * Calculate trace width for given current and temperature rise
 * Using IPC-2221 standard for external layers
 * @param currentAmps - Current in amperes
 * @param tempRiseC - Temperature rise in Celsius (default 10)
 * @param copperOz - Copper weight in oz/ft² (default 1)
 * @returns Trace width in mm
 */
export function calculateTraceWidth(
  currentAmps: number,
  tempRiseC: number = 10,
  copperOz: number = 1
): number {
  // IPC-2221 formula for external layers
  const area = Math.pow(currentAmps / (0.048 * Math.pow(tempRiseC, 0.44)), 1 / 0.725);
  const thickness = copperOz * 0.035; // mm
  const width = area / (thickness * 1000); // convert from mils² to mm
  return roundTo(width, 3);
}
