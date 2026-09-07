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

const resistorSymbolErrors: NonNullable<TestComponent['expectedSymbolErrors']> = [
  { pinNumber: '1', field: 'position' }, { pinNumber: '1', field: 'rotation' },
  { pinNumber: '1', field: 'electrical', expected: 'input', actual: 'passive' },
  { pinNumber: '2', field: 'position' }, { pinNumber: '2', field: 'rotation' },
  { pinNumber: '2', field: 'electrical', expected: 'input', actual: 'passive' },
];

export const PASSIVES: TestComponent[] = [
  {
    lcsc: 'C25076',
    name: '0402WGF1000TCE 0402 Resistor',
    expectedMpn: '0402WGF1000TCE',
    expectedPackage: 'R0402',
    features: ['smd'],
    expectedPadCount: 2,
    expectedSymbolErrors: resistorSymbolErrors,
    notes: 'Standard 0402 - should use KiCad built-in',
  },
  {
    lcsc: 'C25111',
    name: '0402WGF402JTCE 0402 Resistor',
    expectedMpn: '0402WGF402JTCE',
    expectedPackage: 'R0402',
    features: ['smd'],
    expectedPadCount: 2,
    expectedSymbolErrors: resistorSymbolErrors,
    notes: 'Standard R0402 chip package',
  },
  {
    lcsc: 'C1525',
    name: 'CL05B104KO5NNNC 100nF 0402 Capacitor',
    expectedMpn: 'CL05B104KO5NNNC',
    expectedPackage: 'C0402',
    features: ['smd'],
    expectedPadCount: 2,
    expectedSymbolErrors: [
      { pinNumber: '1', field: 'position' }, { pinNumber: '1', field: 'rotation' },
      { pinNumber: '1', field: 'electrical', expected: 'unspecified', actual: 'passive' },
      { pinNumber: '2', field: 'position' }, { pinNumber: '2', field: 'rotation' },
      { pinNumber: '2', field: 'electrical', expected: 'unspecified', actual: 'passive' },
    ],
    notes: 'Standard C0402 chip package',
  },
];

// =============================================================================
// Thermal Pads & Vias
// =============================================================================

export const THERMAL_PADS: TestComponent[] = [
  {
    lcsc: 'C22467599',
    name: 'MicroSD Socket A-MicroTF-1.85A',
    expectedMpn: 'A-MICROTF-1.85A',
    expectedPackage: 'TF-SMD_A-MICROTF-1.85A',
    features: ['smd', 'shield'],
    notes: 'SD card socket with shield tabs',
  },
  {
    lcsc: 'C2040',
    name: 'RP2040 QFN-56',
    expectedMpn: 'RP2040',
    expectedPackage: 'LQFN-56_L7.0-W7.0-P0.4-EP',
    features: ['qfn', 'thermal'],
    expectedPadCount: 57,
    expectedSymbolErrors: [
      { pinNumber: '19', field: 'coverage' }, { pinNumber: '21', field: 'coverage' },
      { pinNumber: '19', field: 'electrical', expected: 'unknown', actual: 'unspecified' },
      { pinNumber: '21', field: 'electrical', expected: 'unknown', actual: 'unspecified' },
    ],
    notes: '56 perimeter pads plus exposed pad; source symbol omits electrical types for pins 19 and 21',
  },
];

// =============================================================================
// Castellated Modules
// =============================================================================

export const CASTELLATED: TestComponent[] = [
  {
    lcsc: 'C3029878',
    name: 'C3029878 (identity unverified)',
    features: ['castellated', 'antenna'],
    skip: true, // Component data unavailable; identity remains unverified
    notes: 'Unverified historical identity: ESP32-C3-MINI-1',
  },
  {
    lcsc: 'C82891',
    name: 'ESP-12F',
    expectedMpn: 'ESP-12F(ESP8266MOD)',
    expectedPackage: 'WIFIM-SMD_ESP-12F-ESP8266MOD',
    features: ['castellated', 'antenna'],
    notes: 'Classic ESP8266 module',
  },
  {
    lcsc: 'C2838283',
    name: 'C2838283 (identity unverified)',
    features: [],
    skip: true,
    notes: 'Historical RP2040 assignment was not verified; verified RP2040 fixture is C2040',
  },
];

// =============================================================================
// Complex Connectors
// =============================================================================

export const CONNECTORS: TestComponent[] = [
  {
    lcsc: 'C165948',
    name: 'USB-C Receptacle TYPE-C-31-M-12',
    expectedMpn: 'TYPE-C-31-M-12',
    expectedPackage: 'USB-C_SMD-TYPE-C-31-M-12_1',
    features: ['smd', 'shield', 'complex_pads'],
    notes: 'USB Type-C with shield tabs and SMD pads',
  },
  {
    lcsc: 'C94919',
    name: 'DS1020-09-15VBT1B 15-way FPC Connector',
    expectedMpn: 'DS1020-09-15VBT1B',
    expectedPackage: 'FPC-SMD_P0.50-15P_LSSJ-H2.0-15P',
    features: ['smd', 'fine_pitch', 'shield'],
    expectedPadCount: 17,
    notes: '0.5mm pitch FPC connector with two mounting pads',
  },
  {
    lcsc: 'C46398',
    name: 'Mini USB-B 5P-Female-TH_C46398',
    expectedMpn: 'Mini USB-B 5P-Female-TH_C46398',
    expectedPackage: 'MINI-USB-TH_USB-MINI-2',
    features: ['tht', 'shield'],
    expectedPadCount: 9,
    expectedSymbolErrors: [{ pinNumber: '0', field: 'identity' }, { pinNumber: '0', field: 'identity' }],
    notes: 'Mini USB-B with through-hole mounting; source and generated symbols both contain duplicate pin 0',
  },
  {
    lcsc: 'C2939982',
    name: 'C2939982 (identity unverified)',
    features: ['tht', 'leds', 'shield'],
    skip: true, // Component data unavailable; identity remains unverified
    notes: 'Unverified historical identity: HR911105A',
  },
  {
    lcsc: 'C91754',
    name: 'HY931147C RJ45 Connector',
    expectedMpn: 'HY931147C',
    expectedPackage: 'RJ45-TH_HY931147C',
    features: ['tht', 'shield'],
    expectedPadCount: 16,
    notes: 'RJ45 connector with plated and mounting holes',
  },
];

// =============================================================================
// Through-Hole Components
// =============================================================================

export const THROUGH_HOLE: TestComponent[] = [
  {
    lcsc: 'C2062',
    name: 'C2062 (identity unverified)',
    features: ['tht', 'tab'],
    skip: true, // Component data unavailable; identity remains unverified
    notes: 'Unverified historical identity: LM7805',
  },
  {
    lcsc: 'C88305',
    name: 'C88305 (identity unverified)',
    features: ['tht', 'high_pin_count'],
    skip: true, // Component data unavailable; identity remains unverified
    notes: 'Unverified historical identity: 1x10 pin header',
  },
  {
    lcsc: 'C2337',
    name: 'Header-Male-2.54_1x40',
    expectedMpn: 'Header-Male-2.54_1x40',
    expectedPackage: 'HDR-TH_40P-P2.54-V-M-1',
    features: ['tht', 'high_pin_count'],
    expectedPadCount: 40,
    notes: 'Single-row 40-way header at 2.54mm pitch',
  },
];

// =============================================================================
// QFN/QFP ICs
// =============================================================================

export const QFN_QFP: TestComponent[] = [
  {
    lcsc: 'C14902',
    name: 'C14902 (identity unverified)',
    features: [],
    skip: true,
    notes: 'Historical STM32 assignment was not verified; verified STM32F103C8T6 fixture is C8734',
  },
  {
    lcsc: 'C8734',
    name: 'STM32F103C8T6 LQFP-48',
    expectedMpn: 'STM32F103C8T6',
    expectedPackage: 'LQFP-48_L7.0-W7.0-P0.50-LS9.0-BL',
    features: ['qfp', 'fine_pitch', 'high_pin_count'],
    expectedPadCount: 48,
    notes: '7x7mm LQFP with 0.5mm pitch',
  },
  {
    lcsc: 'C2843335',
    name: 'W25Q16JVUXIQ USON-8',
    expectedMpn: 'W25Q16JVUXIQ',
    expectedPackage: 'USON-8_L3.0-W2.0-P0.50-BL-EP',
    features: ['smd', 'thermal', 'fine_pitch'],
    expectedPadCount: 9,
    notes: '3x2mm USON flash memory with exposed pad',
  },
];

// =============================================================================
// Power Components
// =============================================================================

export const POWER: TestComponent[] = [
  {
    lcsc: 'C78244',
    name: 'C78244 (identity unverified)',
    features: ['smd', 'thermal'],
    skip: true, // Component data unavailable; identity remains unverified
    notes: 'Unverified historical identity: MP1584',
  },
  {
    lcsc: 'C32767',
    name: 'C32767 (identity unverified)',
    features: ['smd', 'tab'],
    skip: true, // Component data unavailable; identity remains unverified
    notes: 'Unverified historical identity: AMS1117-3.3',
  },
  {
    lcsc: 'C155580',
    name: 'VN5160STR-E SOIC-8',
    expectedMpn: 'VN5160STR-E',
    expectedPackage: 'SOIC-8_L4.9-W3.9-P1.27-LS6.0-BL',
    features: ['smd'],
    expectedPadCount: 8,
    notes: 'SOIC-8 high-side driver',
  },
];

// =============================================================================
// Specialty Components
// =============================================================================

export const SPECIALTY: TestComponent[] = [
  {
    lcsc: 'C88093',
    name: 'C88093 (identity unverified)',
    features: ['smd'],
    skip: true, // Component data unavailable; identity remains unverified
    notes: 'Unverified historical identity: WS2812B-V5',
  },
  {
    lcsc: 'C82942',
    name: 'ME6211C33M5G-N SOT-23-5',
    expectedMpn: 'ME6211C33M5G-N',
    expectedPackage: 'SOT-23-5_L3.0-W1.7-P0.95-LS2.8-BL',
    features: ['smd'],
    expectedPadCount: 5,
    notes: '3.3V LDO in SOT-23-5',
  },
  {
    lcsc: 'C14879',
    name: 'MCP73831T-2ATI/OT SOT-23-5',
    expectedMpn: 'MCP73831T-2ATI/OT',
    expectedPackage: 'SOT-23-5_L3.0-W1.7-P0.95-LS2.8-BR',
    features: ['smd'],
    expectedPadCount: 5,
    notes: 'Li-ion charge controller in SOT-23-5',
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
    description: 'Power drivers and regulators',
    components: POWER,
  },
  {
    name: 'specialty',
    description: 'Small-outline mixed-function ICs',
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
