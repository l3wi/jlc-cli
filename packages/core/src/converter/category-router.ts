/**
 * Category Router
 * Routes components to category-based symbol libraries with robust keyword matching
 * JLC-MCP-Resistors.kicad_sym, JLC-MCP-MCUs.kicad_sym, etc.
 */

export type LibraryCategory =
  | 'Resistors'
  | 'Capacitors'
  | 'Inductors'
  | 'Diodes'
  | 'Transistors'
  | 'Crystals'
  | 'Power'
  | 'MCUs'
  | 'Memory'
  | 'Sensors'
  | 'Interface'
  | 'Optocouplers'
  | 'Connectors'
  | 'ICs'
  | 'Misc';

// Library naming prefix - used for KiCad library names and references
const LIBRARY_PREFIX = 'JLC-MCP';

// Prefix to category mapping (for passives and common components)
// Note: U is intentionally NOT mapped - use keyword detection for ICs/MCUs/Power/etc.
const PREFIX_CATEGORY_MAP: Record<string, LibraryCategory> = {
  R: 'Resistors',
  C: 'Capacitors',
  L: 'Inductors',
  FB: 'Inductors',
  D: 'Diodes',
  Q: 'Transistors',
  Y: 'Crystals',
  X: 'Crystals',
  J: 'Connectors',
  P: 'Connectors',
  RJ: 'Connectors', // RJ45, RJ11, etc.
  K: 'Misc', // Relays
  F: 'Misc', // Fuses
};

// Ordered by specificity - check most specific categories first
const CATEGORY_KEYWORD_RULES: Array<{ category: LibraryCategory; keywords: string[] }> = [
  // Most specific first - these override more general categories
  {
    category: 'MCUs',
    keywords: [
      'mcu',
      'microcontroller',
      'microprocessor',
      'stm32',
      'stm8',
      'esp32',
      'esp8266',
      'atmega',
      'attiny',
      'pic16',
      'pic18',
      'pic32',
      'nrf52',
      'nrf51',
      'rp2040',
      'arm cortex',
      'risc-v',
      'riscv',
      'arduino',
      'samd',
      'sam3',
      'sam4',
      'lpc',
      'gd32',
      'ch32',
      'n76e',
      'nuvoton',
      'renesas',
      'cy8c',
      'psoc',
    ],
  },
  {
    category: 'Memory',
    keywords: [
      'memory',
      'flash memory',
      'eeprom',
      'sram',
      'dram',
      'sdram',
      'fram',
      'nvram',
      'nand',
      'nor flash',
      'w25q',
      'w25n',
      'at24c',
      'at25',
      'is62',
      'is61',
      'as4c',
      'm24c',
      'mx25',
      'gd25',
      's25fl',
      'mt48',
      'cy62',
    ],
  },
  {
    category: 'Power',
    keywords: [
      'voltage regulator',
      'regulator',
      'ldo',
      'dcdc',
      'dc-dc',
      'dc/dc',
      'buck converter',
      'boost converter',
      'buck-boost',
      'pmic',
      'voltage reference',
      'power management',
      'battery charger',
      'charge controller',
      'power switch',
      'load switch',
      'hot swap',
      'ams1117',
      'lm7805',
      'lm317',
      'ap2112',
      'mp1584',
      'mp2359',
      'tps6',
      'tps7',
      'rt8059',
      'xl4015',
      'lm2596',
      'ap3216',
      'sy8088',
      'me6211',
      'ht7333',
      'ht7533',
      'xc6206',
    ],
  },
  {
    category: 'Sensors',
    keywords: [
      'sensor',
      'accelerometer',
      'gyroscope',
      'magnetometer',
      'imu',
      'temperature sensor',
      'humidity sensor',
      'pressure sensor',
      'proximity sensor',
      'hall effect',
      'hall sensor',
      'current sense',
      'current sensor',
      'light sensor',
      'ambient light',
      'color sensor',
      'gas sensor',
      'bme280',
      'bmp280',
      'bme680',
      'mpu6050',
      'mpu9250',
      'lis3dh',
      'adxl345',
      'hmc5883',
      'qmc5883',
      'dht11',
      'dht22',
      'ds18b20',
      'sht30',
      'sht40',
      'ina219',
      'ina226',
      'apds9960',
      'tsl2561',
      'veml6070',
      'max30102',
      'mlx90614',
    ],
  },
  {
    category: 'Interface',
    keywords: [
      'interface ic',
      'transceiver',
      'level shifter',
      'level translator',
      'uart',
      'usart',
      'usb controller',
      'usb hub',
      'usb switch',
      'usb protection',
      'i2c expander',
      'io expander',
      'spi',
      'can transceiver',
      'can controller',
      'rs485',
      'rs-485',
      'rs232',
      'rs-232',
      'ethernet phy',
      'phy',
      'hdmi',
      'lvds',
      'ch340',
      'ch341',
      'cp2102',
      'cp2104',
      'ft232',
      'ft2232',
      'max485',
      'max3485',
      'max232',
      'sp3485',
      'sn65hvd',
      'tja1050',
      'mcp2515',
      'mcp2551',
      'pca9685',
      'tca9548',
      'pcf8574',
      'mcp23017',
      'enc28j60',
      'w5500',
      'lan8720',
      'dp83848',
      'usb3300',
      'tusb',
    ],
  },
  {
    category: 'Optocouplers',
    keywords: [
      'optocoupler',
      'optoisolator',
      'photocoupler',
      'opto-isolator',
      'opto isolator',
      'optical isolator',
      'pc817',
      'pc357',
      'el817',
      'tlp181',
      'tlp281',
      'tlp291',
      '6n137',
      '6n136',
      'hcpl',
      'acpl',
      'vo617',
      'ps2801',
      'ps2501',
      'moc3021',
      'moc3041',
      '4n25',
      '4n35',
    ],
  },
  {
    category: 'Crystals',
    keywords: [
      'crystal',
      'oscillator',
      'resonator',
      'xtal',
      'tcxo',
      'vcxo',
      'ocxo',
      'mems oscillator',
      'clock generator',
      'rtc crystal',
      'ceramic resonator',
    ],
  },
  // Connectors - check before Diodes to avoid "With LED" triggering Diodes category
  {
    category: 'Connectors',
    keywords: [
      'connector',
      'header',
      'socket',
      'terminal',
      'terminal block',
      'jack',
      'plug',
      'receptacle',
      'usb-c',
      'usb type-c',
      'micro usb',
      'mini usb',
      'usb-a',
      'usb-b',
      'hdmi connector',
      'rj45',
      'rj11',
      'barrel jack',
      'dc jack',
      'audio jack',
      'jst',
      'jst-xh',
      'jst-ph',
      'molex',
      'dupont',
      'pin header',
      'female header',
      'fpc',
      'ffc',
      'sim card',
      'sd card',
      'microsd',
      'pogo pin',
      'spring contact',
      'test point',
      'ethernet connector',
      'modular connector',
    ],
  },
  // Less specific categories - checked after more specific ones
  {
    category: 'Transistors',
    keywords: [
      'transistor',
      'mosfet',
      'bjt',
      'jfet',
      'igbt',
      'darlington',
      'n-channel',
      'p-channel',
      'n channel',
      'p channel',
      'npn',
      'pnp',
      '2n2222',
      '2n3904',
      '2n3906',
      '2n7002',
      'irf',
      'irfz',
      'ao3400',
      'ao3401',
      'si2301',
      'si2302',
      'bss138',
      'bc847',
      'bc857',
      's8050',
      's8550',
      'tip120',
      'tip122',
    ],
  },
  {
    category: 'Diodes',
    keywords: [
      'diode',
      'led',
      'zener',
      'schottky',
      'tvs',
      'esd protection',
      'esd diode',
      'rectifier',
      'bridge rectifier',
      'photodiode',
      'laser diode',
      'varactor',
      '1n4148',
      '1n4007',
      '1n5819',
      'ss14',
      'ss34',
      'ss54',
      'bat54',
      'b5819',
      'ws2812',
      'sk6812',
      'apa102',
      'smaj',
      'smbj',
      'pesd',
      'usblc6',
      'prtr5v0',
    ],
  },
  {
    category: 'Inductors',
    keywords: ['inductor', 'ferrite bead', 'ferrite', 'choke', 'coil', 'transformer', 'common mode'],
  },
  {
    category: 'Capacitors',
    keywords: [
      'capacitor',
      'supercap',
      'ultracap',
      'mlcc',
      'electrolytic',
      'tantalum',
      'ceramic cap',
      'film cap',
      'polymer cap',
    ],
  },
  {
    category: 'Resistors',
    keywords: [
      'resistor',
      'thermistor',
      'ntc',
      'ptc',
      'potentiometer',
      'varistor',
      'rheostat',
      'shunt resistor',
      'current sense resistor',
      'chip resistor',
    ],
  },
  // Catch-all for remaining ICs - must be last
  {
    category: 'ICs',
    keywords: [
      'ic',
      'integrated circuit',
      'op amp',
      'opamp',
      'operational amplifier',
      'comparator',
      'amplifier',
      'audio amplifier',
      'adc',
      'dac',
      'analog to digital',
      'digital to analog',
      'timer',
      '555 timer',
      'ne555',
      'logic gate',
      'flip-flop',
      'shift register',
      'multiplexer',
      'demux',
      'demultiplexer',
      'buffer',
      'driver',
      'gate driver',
      'motor driver',
      'led driver',
      'display driver',
      'codec',
      'mixer',
      'pll',
      'phase lock',
      'dds',
      'fpga',
      'cpld',
      'asic',
      'logic ic',
      '74hc',
      '74ls',
      '74ahc',
      'cd4',
      'lm358',
      'lm324',
      'ne5532',
      'tl072',
      'tl084',
      'opa2134',
      'ad8',
      'max9',
      'uln2003',
      'l293',
      'drv8',
      'a4988',
      'tmc2',
    ],
  },
];

/**
 * Normalize text for fuzzy matching
 * - lowercase
 * - convert separators to spaces
 * - remove special characters
 * - normalize whitespace
 */
function normalizeForMatching(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-_/\\]/g, ' ') // Convert separators to spaces
    .replace(/[^a-z0-9\s]/g, '') // Remove special chars
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Check if text contains keyword with fuzzy matching
 */
function containsKeyword(text: string, keyword: string): boolean {
  const normalizedText = normalizeForMatching(text);
  const normalizedKeyword = normalizeForMatching(keyword);

  // Direct substring match
  if (normalizedText.includes(normalizedKeyword)) {
    return true;
  }

  // Word boundary match (for short keywords like "led", "adc")
  const words = normalizedText.split(' ');
  if (words.includes(normalizedKeyword)) {
    return true;
  }

  return false;
}

/**
 * Determine library category from component prefix, LCSC category, and description
 * Uses priority-ordered keyword matching with fuzzy detection
 */
export function getLibraryCategory(
  prefix: string,
  category?: string,
  description?: string
): LibraryCategory {
  // 1. Check prefix first (most reliable for passives)
  // Clean prefix: remove trailing ? and other non-alphanumeric chars, uppercase
  const cleanedPrefix = prefix.replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

  // Check multi-character prefixes first (RJ, FB), then single char
  // This ensures "RJ?" matches "RJ" → Connectors, not falling through
  if (cleanedPrefix.length >= 2) {
    const twoCharPrefix = cleanedPrefix.slice(0, 2);
    if (PREFIX_CATEGORY_MAP[twoCharPrefix]) {
      return PREFIX_CATEGORY_MAP[twoCharPrefix];
    }
  }
  // Check single character prefix
  const singleCharPrefix = cleanedPrefix.slice(0, 1);
  if (PREFIX_CATEGORY_MAP[singleCharPrefix]) {
    return PREFIX_CATEGORY_MAP[singleCharPrefix];
  }

  // 2. Combine category and description for keyword search
  const searchText = [category || '', description || ''].join(' ');

  if (searchText.trim()) {
    // Check rules in order (most specific first)
    for (const rule of CATEGORY_KEYWORD_RULES) {
      for (const keyword of rule.keywords) {
        if (containsKeyword(searchText, keyword)) {
          return rule.category;
        }
      }
    }
  }

  // 3. Default to Misc
  return 'Misc';
}

/**
 * Get symbol library filename for a category
 * Returns: "JLC-MCP-Resistors.kicad_sym"
 */
export function getLibraryFilename(category: LibraryCategory): string {
  return `${LIBRARY_PREFIX}-${category}.kicad_sym`;
}

/**
 * Get footprint library directory name
 * All footprints go in a single directory
 * Returns: "JLC-MCP.pretty"
 */
export function getFootprintDirName(): string {
  return `${LIBRARY_PREFIX}.pretty`;
}

/**
 * Get 3D models directory name
 * Returns: "JLC-MCP.3dshapes"
 */
export function get3DModelsDirName(): string {
  return `${LIBRARY_PREFIX}.3dshapes`;
}

/**
 * Get full symbol reference for use in schematics
 * Format: "JLC-MCP-Resistors:SymbolName"
 */
export function getSymbolReference(category: LibraryCategory, symbolName: string): string {
  const libraryName = `${LIBRARY_PREFIX}-${category}`;
  return `${libraryName}:${symbolName}`;
}

/**
 * Get full footprint reference for use in schematics/boards
 * Format: "JLC-MCP:FootprintName"
 */
export function getFootprintReference(footprintName: string): string {
  return `${LIBRARY_PREFIX}:${footprintName}`;
}

/**
 * Get all possible library categories
 */
export function getAllCategories(): LibraryCategory[] {
  return [
    'Resistors',
    'Capacitors',
    'Inductors',
    'Diodes',
    'Transistors',
    'Crystals',
    'Power',
    'MCUs',
    'Memory',
    'Sensors',
    'Interface',
    'Optocouplers',
    'Connectors',
    'ICs',
    'Misc',
  ];
}

/**
 * Parse library name to extract category
 * "JLC-MCP-Resistors" -> "Resistors"
 */
export function parseLibraryName(libraryName: string): LibraryCategory | null {
  const match = libraryName.match(/^JLC-MCP-(\w+)$/);
  if (match) {
    const category = match[1] as LibraryCategory;
    if (getAllCategories().includes(category)) {
      return category;
    }
  }
  return null;
}
