/**
 * KiCad Standard Footprint Mapper
 * Maps common package names to KiCad built-in footprints for hybrid approach
 *
 * CONSERVATIVE APPROACH: Only uses KiCad built-ins for 2-pad unpolarized passives (R/C/L).
 * All other components (ICs, transistors, diodes, etc.) generate custom footprints
 * to avoid pin-flip issues from pad numbering mismatches.
 */

export interface FootprintMapping {
  library: string;    // KiCad library name (e.g., "Resistor_SMD")
  footprint: string;  // Footprint name (e.g., "R_0603_1608Metric")
}

// SMD passive size mappings (Imperial to KiCad naming)
const SMD_SIZES: Record<string, { metric: string; imperialMm: string }> = {
  '0201': { metric: '0603', imperialMm: '0.6x0.3' },
  '0402': { metric: '1005', imperialMm: '1.0x0.5' },
  '0603': { metric: '1608', imperialMm: '1.6x0.8' },
  '0805': { metric: '2012', imperialMm: '2.0x1.2' },
  '1206': { metric: '3216', imperialMm: '3.2x1.6' },
  '1210': { metric: '3225', imperialMm: '3.2x2.5' },
  '1812': { metric: '4532', imperialMm: '4.5x3.2' },
  '2010': { metric: '5025', imperialMm: '5.0x2.5' },
  '2512': { metric: '6332', imperialMm: '6.3x3.2' },
};

// Prefix to library mapping for 2-pad passives only
const PASSIVE_LIBRARIES: Record<string, string> = {
  R: 'Resistor_SMD',
  C: 'Capacitor_SMD',
  L: 'Inductor_SMD',
};

// Expected pad count for each footprint (for validation)
// All SMD passives have 2 pads
const PASSIVE_PAD_COUNT = 2;

/**
 * Normalize package name for matching
 * - Uppercase
 * - Remove common variations in naming
 */
function normalizePackageName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[_\s-]+/g, '-')
    .replace(/\(.*?\)/g, '') // Remove parenthetical info like "(1608)"
    .trim();
}

/**
 * Extract imperial size code from package name
 * Handles variations like "0603", "SMD0603", "LED0603-RD", "0603(1608)"
 */
function extractSmdSize(packageName: string): string | null {
  const normalized = normalizePackageName(packageName);

  // Direct match
  for (const size of Object.keys(SMD_SIZES)) {
    if (normalized === size || normalized === `SMD${size}`) {
      return size;
    }
  }

  // Pattern match for sizes anywhere in name
  // Allows prefixes like LED, SMD, etc. and suffixes like -RD, -BL
  const sizePattern = /(0201|0402|0603|0805|1206|1210|1812|2010|2512)(?![0-9])/;
  const match = normalized.match(sizePattern);
  return match ? match[1] : null;
}

/**
 * Map package name to KiCad standard footprint
 *
 * CONSERVATIVE APPROACH: Only returns built-in mappings for 2-pad unpolarized passives.
 * This avoids pin-flip issues that can occur when pad numbering differs between
 * EasyEDA data and KiCad built-in footprints (e.g., SOT-23 transistors have
 * different BCE/CBE/EBC pinouts across manufacturers).
 *
 * Returns null if no standard mapping exists (will fall back to generated footprint)
 */
export function mapToKicadFootprint(
  packageName: string,
  componentPrefix: string,
  _category?: string,
  _description?: string
): FootprintMapping | null {
  const prefix = componentPrefix.toUpperCase();

  // ONLY allow built-in footprints for 2-pad passives (R, C, L)
  // These are safe because the pads are functionally interchangeable
  if (!PASSIVE_LIBRARIES[prefix]) {
    return null;
  }

  // Check for standard SMD passive sizes
  const smdSize = extractSmdSize(packageName);
  if (smdSize) {
    const sizeInfo = SMD_SIZES[smdSize];
    const library = PASSIVE_LIBRARIES[prefix];
    // KiCad naming: R_0603_1608Metric, C_0603_1608Metric, L_0603_1608Metric
    const footprint = `${prefix}_${smdSize}_${sizeInfo.metric}Metric`;
    return { library, footprint };
  }

  // No standard mapping found - will use generated footprint
  return null;
}

/**
 * Get expected pad count for a KiCad footprint mapping
 * Used to validate that EasyEDA footprint matches before using built-in
 *
 * Returns null if pad count is unknown (caller should allow the mapping)
 */
export function getExpectedPadCount(mapping: FootprintMapping): number | null {
  // All our passive footprints have 2 pads
  if (
    mapping.library === 'Resistor_SMD' ||
    mapping.library === 'Capacitor_SMD' ||
    mapping.library === 'Inductor_SMD'
  ) {
    return PASSIVE_PAD_COUNT;
  }

  return null;
}

/**
 * Get full KiCad footprint reference string
 * Format: "Library:Footprint"
 */
export function getKicadFootprintRef(mapping: FootprintMapping): string {
  return `${mapping.library}:${mapping.footprint}`;
}

/**
 * Check if a package is likely a standard passive that can use KiCad footprints
 */
export function isStandardPassive(packageName: string, prefix: string): boolean {
  const smdSize = extractSmdSize(packageName);
  return smdSize !== null && PASSIVE_LIBRARIES[prefix.toUpperCase()] !== undefined;
}
