/**
 * Component Value Normalizer
 * Extracts and normalizes component values from descriptions
 * "16k Ohm ±1% 0.1W" → "16k"
 * "100nF 50V X7R" → "100n/50V"
 */

export type ComponentType = 'resistor' | 'capacitor' | 'inductor' | 'diode' | 'transistor' | 'ic' | 'other';

export interface NormalizedValue {
  displayValue: string;    // For symbol Value property
  originalValue: string;   // Keep for Description
  params?: {
    value?: string;        // Core value (e.g., "16k", "100n")
    tolerance?: string;    // e.g., "1%"
    voltage?: string;      // e.g., "50V"
    power?: string;        // e.g., "0.25W"
    current?: string;      // e.g., "2A"
  };
}

// Regex patterns for value extraction
const PATTERNS = {
  // Resistors: Match value with optional multiplier and unit
  // "16k", "16kOhm", "16K OHM", "16000", "4.7k", "0R1" (0.1 ohm)
  resistor: /(\d+(?:\.\d+)?)\s*([kKmMgGrR]?)\s*(?:ohm|Ohm|OHM|Ω|R)?/i,

  // Capacitors: Match value with unit and optional voltage
  // "100nF 50V", "10uF", "100pF", "1000uF/16V"
  capacitor: /(\d+(?:\.\d+)?)\s*([pnuμmM]?)[Ff]?\s*(?:[\/\s]*(\d+)\s*[Vv])?/i,

  // Inductors: Match value with unit and optional current
  // "10uH 2A", "100nH", "4.7mH"
  inductor: /(\d+(?:\.\d+)?)\s*([nμumM]?)[Hh]\s*(?:[\/\s]*(\d+(?:\.\d+)?)\s*[Aa])?/i,

  // Voltage rating extraction
  voltage: /(\d+(?:\.\d+)?)\s*[Vv]/,

  // Tolerance extraction
  tolerance: /[±]?\s*(\d+(?:\.\d+)?)\s*%/,

  // Power rating extraction
  power: /(\d+(?:\.\d+)?)\s*[Ww]/,

  // Current rating extraction
  current: /(\d+(?:\.\d+)?)\s*[Aa]/,
};

// Multiplier normalization
const MULTIPLIER_MAP: Record<string, string> = {
  '': '',
  'r': '',    // 0R1 style (0.1 ohm)
  'R': '',
  'k': 'k',
  'K': 'k',
  'm': 'm',   // milli for caps/inductors, mega for resistors (context dependent)
  'M': 'M',
  'g': 'G',
  'G': 'G',
  'p': 'p',
  'n': 'n',
  'u': 'u',
  'μ': 'u',
};

/**
 * Detect component type from prefix and category
 */
export function detectComponentType(prefix: string, category?: string): ComponentType {
  const p = prefix.toUpperCase();

  switch (p) {
    case 'R':
      return 'resistor';
    case 'C':
      return 'capacitor';
    case 'L':
      return 'inductor';
    case 'D':
      return 'diode';
    case 'Q':
      return 'transistor';
    case 'U':
      return 'ic';
    default:
      // Fallback to category-based detection
      if (category) {
        const cat = category.toLowerCase();
        if (cat.includes('resistor')) return 'resistor';
        if (cat.includes('capacitor')) return 'capacitor';
        if (cat.includes('inductor')) return 'inductor';
        if (cat.includes('diode')) return 'diode';
        if (cat.includes('transistor')) return 'transistor';
        if (cat.includes('ic') || cat.includes('microcontroller')) return 'ic';
      }
      return 'other';
  }
}

/**
 * Normalize resistor value
 */
function normalizeResistor(description: string): NormalizedValue {
  const match = description.match(PATTERNS.resistor);

  if (!match) {
    return { displayValue: description, originalValue: description };
  }

  const [, value, multiplier] = match;
  const normalizedMultiplier = MULTIPLIER_MAP[multiplier] || '';

  // Handle "0R1" style notation (0.1 ohm)
  if (multiplier.toLowerCase() === 'r') {
    const numValue = parseFloat(value);
    if (numValue === 0) {
      // "0R1" = 0.1 ohm - extract the digit after R from original
      const zeroRMatch = description.match(/0[rR](\d)/);
      if (zeroRMatch) {
        return {
          displayValue: `0.${zeroRMatch[1]}`,
          originalValue: description,
          params: { value: `0.${zeroRMatch[1]}` },
        };
      }
    }
  }

  const displayValue = `${value}${normalizedMultiplier}`;

  // Extract additional params
  const toleranceMatch = description.match(PATTERNS.tolerance);
  const powerMatch = description.match(PATTERNS.power);

  return {
    displayValue,
    originalValue: description,
    params: {
      value: displayValue,
      tolerance: toleranceMatch ? `${toleranceMatch[1]}%` : undefined,
      power: powerMatch ? `${powerMatch[1]}W` : undefined,
    },
  };
}

/**
 * Normalize capacitor value
 */
function normalizeCapacitor(description: string): NormalizedValue {
  const match = description.match(PATTERNS.capacitor);

  if (!match) {
    return { displayValue: description, originalValue: description };
  }

  const [, value, unit, voltage] = match;
  const normalizedUnit = MULTIPLIER_MAP[unit] || unit;

  let displayValue = `${value}${normalizedUnit}`;

  // Add voltage if present
  if (voltage) {
    displayValue += `/${voltage}V`;
  }

  return {
    displayValue,
    originalValue: description,
    params: {
      value: `${value}${normalizedUnit}`,
      voltage: voltage ? `${voltage}V` : undefined,
    },
  };
}

/**
 * Normalize inductor value
 */
function normalizeInductor(description: string): NormalizedValue {
  const match = description.match(PATTERNS.inductor);

  if (!match) {
    return { displayValue: description, originalValue: description };
  }

  const [, value, unit, current] = match;
  const normalizedUnit = MULTIPLIER_MAP[unit] || unit;

  let displayValue = `${value}${normalizedUnit}H`;

  // Add current if present
  if (current) {
    displayValue += `/${current}A`;
  }

  return {
    displayValue,
    originalValue: description,
    params: {
      value: `${value}${normalizedUnit}H`,
      current: current ? `${current}A` : undefined,
    },
  };
}

/**
 * Main normalization function
 * Returns normalized value based on component type
 */
export function normalizeValue(
  description: string,
  type: ComponentType
): NormalizedValue {
  // Clean input
  const cleaned = description.trim();

  // Skip normalization for ICs and complex parts - keep original name
  if (type === 'ic' || type === 'other') {
    return { displayValue: cleaned, originalValue: cleaned };
  }

  switch (type) {
    case 'resistor':
      return normalizeResistor(cleaned);
    case 'capacitor':
      return normalizeCapacitor(cleaned);
    case 'inductor':
      return normalizeInductor(cleaned);
    case 'diode':
    case 'transistor':
      // For diodes and transistors, keep the part number but clean it up
      // Remove common prefixes/suffixes that aren't part of the name
      return { displayValue: cleaned, originalValue: cleaned };
    default:
      return { displayValue: cleaned, originalValue: cleaned };
  }
}

/**
 * Extract value from component name or description
 * Tries multiple strategies to find a meaningful value
 */
export function extractDisplayValue(
  name: string,
  description: string | undefined,
  prefix: string,
  category?: string
): string {
  const type = detectComponentType(prefix, category);

  // For passives, prefer to extract from description which has more detail
  if (description && (type === 'resistor' || type === 'capacitor' || type === 'inductor')) {
    const normalized = normalizeValue(description, type);
    if (normalized.displayValue !== description) {
      return normalized.displayValue;
    }
  }

  // Fallback to name
  const normalized = normalizeValue(name, type);
  return normalized.displayValue;
}
