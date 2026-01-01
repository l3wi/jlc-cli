/**
 * KiCad Standard Footprint Mapper
 * Maps common package names to KiCad built-in footprints for hybrid approach
 */

import { getLibraryCategory, type LibraryCategory } from './category-router.js';

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

// Prefix to library mapping for passives
const PASSIVE_LIBRARIES: Record<string, string> = {
  R: 'Resistor_SMD',
  C: 'Capacitor_SMD',
  L: 'Inductor_SMD',
};

// LED/Diode libraries
const LED_LIBRARY = 'LED_SMD';
const DIODE_LIBRARY = 'Diode_SMD';

// Map library categories to footprint prefixes (for category-based fallback)
const CATEGORY_TO_PREFIX: Partial<Record<LibraryCategory, string>> = {
  Resistors: 'R',
  Capacitors: 'C',
  Inductors: 'L',
  Diodes: 'D',
};

// SOIC package mappings
const SOIC_MAPPINGS: Record<string, string> = {
  'SOIC-8': 'SOIC-8_3.9x4.9mm_P1.27mm',
  'SOP-8': 'SOIC-8_3.9x4.9mm_P1.27mm',
  'SOIC-14': 'SOIC-14_3.9x8.7mm_P1.27mm',
  'SOIC-16': 'SOIC-16_3.9x9.9mm_P1.27mm',
  'SOIC-16W': 'SOIC-16W_7.5x10.3mm_P1.27mm',
  'SOIC-20': 'SOIC-20W_7.5x12.8mm_P1.27mm',
  'SOIC-24': 'SOIC-24W_7.5x15.4mm_P1.27mm',
  'SOIC-28': 'SOIC-28W_7.5x17.9mm_P1.27mm',
};

// TSSOP package mappings
const TSSOP_MAPPINGS: Record<string, string> = {
  'TSSOP-8': 'TSSOP-8_3x3mm_P0.65mm',
  'TSSOP-14': 'TSSOP-14_4.4x5mm_P0.65mm',
  'TSSOP-16': 'TSSOP-16_4.4x5mm_P0.65mm',
  'TSSOP-20': 'TSSOP-20_4.4x6.5mm_P0.65mm',
  'TSSOP-24': 'TSSOP-24_4.4x7.8mm_P0.65mm',
  'TSSOP-28': 'TSSOP-28_4.4x9.7mm_P0.65mm',
};

// SOT package mappings
const SOT_MAPPINGS: Record<string, { library: string; footprint: string }> = {
  'SOT-23': { library: 'Package_TO_SOT_SMD', footprint: 'SOT-23' },
  'SOT-23-3': { library: 'Package_TO_SOT_SMD', footprint: 'SOT-23' },
  'SOT-23-5': { library: 'Package_TO_SOT_SMD', footprint: 'SOT-23-5' },
  'SOT-23-6': { library: 'Package_TO_SOT_SMD', footprint: 'SOT-23-6' },
  'SOT-89': { library: 'Package_TO_SOT_SMD', footprint: 'SOT-89-3' },
  'SOT-223': { library: 'Package_TO_SOT_SMD', footprint: 'SOT-223-3_TabPin2' },
};

// SOD diode package mappings
const SOD_MAPPINGS: Record<string, { library: string; footprint: string }> = {
  'SOD-123': { library: 'Diode_SMD', footprint: 'D_SOD-123' },
  'SOD-123F': { library: 'Diode_SMD', footprint: 'D_SOD-123F' },
  'SOD-323': { library: 'Diode_SMD', footprint: 'D_SOD-323' },
  'SOD-523': { library: 'Diode_SMD', footprint: 'D_SOD-523' },
  'SOD-923': { library: 'Diode_SMD', footprint: 'D_SOD-923' },
  'SOD-128': { library: 'Diode_SMD', footprint: 'D_SOD-128' },
  'SOD-80': { library: 'Diode_SMD', footprint: 'D_SOD-80' },
};

// SMA/SMB/SMC diode package mappings
const DIODE_PACKAGE_MAPPINGS: Record<string, { library: string; footprint: string }> = {
  'SMA': { library: 'Diode_SMD', footprint: 'D_SMA' },
  'SMB': { library: 'Diode_SMD', footprint: 'D_SMB' },
  'SMC': { library: 'Diode_SMD', footprint: 'D_SMC' },
  'MELF': { library: 'Diode_SMD', footprint: 'D_MELF' },
  'MINIMELF': { library: 'Diode_SMD', footprint: 'D_MiniMELF' },
  'MICROMELF': { library: 'Diode_SMD', footprint: 'D_MicroMELF' },
};

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
 * Returns null if no standard mapping exists (will fall back to generated)
 */
export function mapToKicadFootprint(
  packageName: string,
  componentPrefix: string,
  category?: string,
  description?: string
): FootprintMapping | null {
  const normalized = normalizePackageName(packageName);
  let prefix = componentPrefix.toUpperCase();

  // Category-based prefix fallback: if prefix doesn't match known mappings,
  // try to detect the correct prefix from category/description
  const isKnownPrefix = PASSIVE_LIBRARIES[prefix] || prefix === 'D' || prefix === 'LED';
  if (!isKnownPrefix && (category || description)) {
    const detectedCategory = getLibraryCategory(prefix, category, description);
    const categoryPrefix = CATEGORY_TO_PREFIX[detectedCategory];
    if (categoryPrefix) {
      prefix = categoryPrefix;
    }
  }

  // 1. Check SMD passive sizes (R, C, L)
  const smdSize = extractSmdSize(packageName);
  if (smdSize && PASSIVE_LIBRARIES[prefix]) {
    const sizeInfo = SMD_SIZES[smdSize];
    const library = PASSIVE_LIBRARIES[prefix];
    // KiCad naming: R_0603_1608Metric, C_0603_1608Metric, L_0603_1608Metric
    const footprint = `${prefix}_${smdSize}_${sizeInfo.metric}Metric`;
    return { library, footprint };
  }

  // 2. Check LED SMD sizes (for LED prefix or components detected as LEDs)
  if (smdSize && prefix === 'LED') {
    const sizeInfo = SMD_SIZES[smdSize];
    // KiCad naming: LED_0805_2012Metric
    const footprint = `LED_${smdSize}_${sizeInfo.metric}Metric`;
    return { library: LED_LIBRARY, footprint };
  }

  // 3. Check Diode SMD sizes (D prefix)
  if (smdSize && prefix === 'D') {
    const sizeInfo = SMD_SIZES[smdSize];
    // KiCad naming: D_0805_2012Metric
    const footprint = `D_${smdSize}_${sizeInfo.metric}Metric`;
    return { library: DIODE_LIBRARY, footprint };
  }

  // 4. Check SOD diode packages
  for (const [pattern, mapping] of Object.entries(SOD_MAPPINGS)) {
    if (normalized.includes(pattern) || normalized.startsWith(pattern.replace(/-/g, ''))) {
      return mapping;
    }
  }

  // 5. Check SMA/SMB/SMC diode packages
  for (const [pattern, mapping] of Object.entries(DIODE_PACKAGE_MAPPINGS)) {
    // Match exact package type or with suffix (e.g., "SMA" in "SMA_L4.3...")
    if (normalized === pattern || normalized.startsWith(pattern + '-') || normalized.startsWith(pattern + '_')) {
      return mapping;
    }
  }

  // 6. Check SOIC packages
  for (const [pattern, footprint] of Object.entries(SOIC_MAPPINGS)) {
    if (normalized.includes(pattern) || normalized.startsWith(pattern.replace(/-/g, ''))) {
      return { library: 'Package_SO', footprint };
    }
  }

  // 7. Check TSSOP packages
  for (const [pattern, footprint] of Object.entries(TSSOP_MAPPINGS)) {
    if (normalized.includes(pattern) || normalized.startsWith(pattern.replace(/-/g, ''))) {
      return { library: 'Package_SO', footprint };
    }
  }

  // 8. Check SOT packages
  for (const [pattern, mapping] of Object.entries(SOT_MAPPINGS)) {
    if (normalized.includes(pattern) || normalized === pattern.replace(/-/g, '')) {
      return mapping;
    }
  }

  // No standard mapping found - will use generated footprint
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
