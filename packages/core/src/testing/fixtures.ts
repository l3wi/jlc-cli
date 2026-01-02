/**
 * Test fixture definitions for footprint/symbol validation
 *
 * These components are selected to test various edge cases:
 * - Thermal pads and vias
 * - Castellated modules
 * - Complex connectors
 * - Through-hole components
 * - Fine-pitch QFN/QFP
 * - Large pin count ICs
 */

import type { TestComponent, TestCategory } from './types.js';

// =============================================================================
// Standard Passives (baseline validation)
// =============================================================================

export const PASSIVES: TestComponent[] = [
  {
    lcsc: 'C25076',
    name: '100nF 0402 Capacitor',
    features: ['smd'],
    expectedPadCount: 2,
    notes: 'Standard 0402 - should use KiCad built-in',
  },
  {
    lcsc: 'C25111',
    name: '10K 0603 Resistor',
    features: ['smd'],
    expectedPadCount: 2,
    notes: 'Standard 0603 - should use KiCad built-in',
  },
  {
    lcsc: 'C1525',
    name: '10uF 0805 Capacitor',
    features: ['smd'],
    expectedPadCount: 2,
    notes: 'Standard 0805 - should use KiCad built-in',
  },
];

// =============================================================================
// Thermal Pads & Vias
// =============================================================================

export const THERMAL_PADS: TestComponent[] = [
  {
    lcsc: 'C22467599',
    name: 'MicroSD Socket A-MicroTF-1.85A',
    features: ['smd', 'shield'],
    notes: 'SD card socket with shield tabs',
  },
  {
    lcsc: 'C94919',
    name: 'ESP32-WROOM-32E',
    features: ['thermal', 'vias', 'castellated', 'antenna'],
    // Pad count varies based on how vias/thermal pads are counted
    notes: 'WiFi module with large ground pad and vias',
  },
  {
    lcsc: 'C2040',
    name: 'ATmega328P-MU QFN-32',
    features: ['qfn', 'thermal'],
    // Pad count includes thermal pad + vias
    notes: 'QFN with exposed thermal pad',
  },
];

// =============================================================================
// Castellated Modules
// =============================================================================

export const CASTELLATED: TestComponent[] = [
  {
    lcsc: 'C3029878',
    name: 'ESP32-C3-MINI-1',
    features: ['castellated', 'antenna'],
    skip: true, // No schematic drawn - API returns 422
    notes: 'Compact WiFi/BLE module with castellated edges',
  },
  {
    lcsc: 'C82891',
    name: 'ESP-12F',
    features: ['castellated', 'antenna'],
    notes: 'Classic ESP8266 module',
  },
  {
    lcsc: 'C2838283',
    name: 'RP2040',
    features: ['qfn', 'thermal'],
    skip: true, // No schematic drawn - API returns 422
    notes: 'Raspberry Pi microcontroller - QFN-56',
  },
];

// =============================================================================
// Complex Connectors
// =============================================================================

export const CONNECTORS: TestComponent[] = [
  {
    lcsc: 'C165948',
    name: 'USB-C Receptacle TYPE-C-31-M-12',
    features: ['smd', 'shield', 'complex_pads'],
    notes: 'USB Type-C with shield tabs and SMD pads',
  },
  {
    lcsc: 'C46398',
    name: 'Micro USB B TYPE-C-31-M-17',
    features: ['smd', 'shield'],
    notes: 'Micro USB with SMD mounting',
  },
  {
    lcsc: 'C2939982',
    name: 'RJ45 with Magnetics HR911105A',
    features: ['tht', 'leds', 'shield'],
    skip: true, // No reference SVG available
    notes: 'Ethernet jack with integrated magnetics',
  },
  {
    lcsc: 'C91754',
    name: 'RJ45 Socket',
    features: ['tht', 'shield'],
    notes: 'Standard RJ45 ethernet jack',
  },
];

// =============================================================================
// Through-Hole Components
// =============================================================================

export const THROUGH_HOLE: TestComponent[] = [
  {
    lcsc: 'C2062',
    name: 'LM7805 TO-220',
    features: ['tht', 'tab'],
    skip: true, // No reference SVG available
    notes: 'Classic TO-220 voltage regulator',
  },
  {
    lcsc: 'C88305',
    name: 'Pin Header 2.54mm 1x10',
    features: ['tht', 'high_pin_count'],
    skip: true, // No reference SVG available
    notes: 'Standard 0.1" pin header',
  },
  {
    lcsc: 'C2337',
    name: 'Electrolytic Cap 100uF 16V',
    features: ['tht'],
    notes: 'Radial electrolytic capacitor',
  },
];

// =============================================================================
// QFN/QFP ICs
// =============================================================================

export const QFN_QFP: TestComponent[] = [
  {
    lcsc: 'C14902',
    name: 'STM32F103C8T6 LQFP-48',
    features: ['qfp', 'fine_pitch', 'high_pin_count'],
    skip: true, // No reference SVG available
    notes: 'Popular STM32 - 0.5mm pitch LQFP',
  },
  {
    lcsc: 'C8734',
    name: 'CH340G SOP-16',
    features: ['smd'],
    notes: 'USB-UART bridge IC',
  },
  {
    lcsc: 'C2843335',
    name: 'STM32G071GBU6 UFQFPN-28',
    features: ['qfn', 'thermal', 'vias'],
    notes: 'STM32G0 with thermal vias - already tested',
  },
];

// =============================================================================
// Power Components
// =============================================================================

export const POWER: TestComponent[] = [
  {
    lcsc: 'C78244',
    name: 'MP1584 Buck Converter',
    features: ['smd', 'thermal'],
    skip: true, // No reference SVG available
    notes: 'DC-DC converter with thermal pad',
  },
  {
    lcsc: 'C32767',
    name: 'AMS1117-3.3 SOT-223',
    features: ['smd', 'tab'],
    skip: true, // No reference SVG available
    notes: 'LDO with tab pad',
  },
  {
    lcsc: 'C155580',
    name: 'IRF540N TO-220',
    features: ['tht', 'tab'],
    notes: 'Power MOSFET - TO-220',
  },
];

// =============================================================================
// Specialty Components
// =============================================================================

export const SPECIALTY: TestComponent[] = [
  {
    lcsc: 'C88093',
    name: 'WS2812B-V5 LED',
    features: ['smd'],
    skip: true, // No reference SVG available
    notes: 'RGB LED with integrated driver',
  },
  {
    lcsc: 'C82942',
    name: 'BME280 Sensor',
    features: ['smd', 'fine_pitch'],
    notes: 'Environmental sensor - tiny LGA',
  },
  {
    lcsc: 'C14879',
    name: 'Crystal 8MHz 3215',
    features: ['smd'],
    notes: 'SMD crystal oscillator',
  },
];

// =============================================================================
// Aggregated Test Categories
// =============================================================================

export const TEST_CATEGORIES: TestCategory[] = [
  {
    name: 'passives',
    description: 'Standard passive components (R, C, L)',
    components: PASSIVES,
  },
  {
    name: 'thermal',
    description: 'Components with thermal pads and/or vias',
    components: THERMAL_PADS,
  },
  {
    name: 'castellated',
    description: 'Modules with castellated edge pads',
    components: CASTELLATED,
  },
  {
    name: 'connectors',
    description: 'USB, SD card, and other connectors',
    components: CONNECTORS,
  },
  {
    name: 'throughHole',
    description: 'Through-hole components',
    components: THROUGH_HOLE,
  },
  {
    name: 'qfn',
    description: 'QFN, QFP, and fine-pitch ICs',
    components: QFN_QFP,
  },
  {
    name: 'power',
    description: 'Power components with thermal features',
    components: POWER,
  },
  {
    name: 'specialty',
    description: 'LEDs, sensors, and other specialty parts',
    components: SPECIALTY,
  },
];

/**
 * Get all test components as a flat array
 */
export function getAllTestComponents(): TestComponent[] {
  return TEST_CATEGORIES.flatMap((cat) => cat.components);
}

/**
 * Get test components by category name
 */
export function getTestComponentsByCategory(categoryName: string): TestComponent[] {
  const category = TEST_CATEGORIES.find((cat) => cat.name === categoryName);
  return category?.components || [];
}

/**
 * Get a specific test component by LCSC code
 */
export function getTestComponent(lcscCode: string): TestComponent | undefined {
  const normalized = lcscCode.replace(/^C/i, '');
  return getAllTestComponents().find((c) => c.lcsc.replace(/^C/i, '') === normalized);
}

/**
 * Get all category names
 */
export function getCategoryNames(): string[] {
  return TEST_CATEGORIES.map((cat) => cat.name);
}
