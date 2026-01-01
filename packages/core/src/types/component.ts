/**
 * Component and part types for the AI-EDA toolkit
 */

export interface Component {
  lcscPartNumber: string;        // e.g., "C2040"
  manufacturerPart: string;      // e.g., "STM32F103C8T6"
  manufacturer: string;
  description: string;
  category: string;
  subcategory: string;
  package: string;
  stock: number;
  price: PriceTier[];
  datasheet?: string;
  footprint?: FootprintRef;
  symbol?: SymbolRef;
}

export interface PriceTier {
  quantity: number;
  price: number;
  currency: string;
}

export interface FootprintRef {
  source: 'easyeda' | 'kicad' | 'local';
  id: string;
  localPath?: string;
}

export interface SymbolRef {
  source: 'easyeda' | 'kicad' | 'local';
  id: string;
  localPath?: string;
}

export interface ComponentSelection {
  role: string;                  // e.g., "Main MCU", "Power Regulator"
  selected?: Component;
  alternatives?: Component[];
  requirements: string[];
  status: 'pending' | 'selected' | 'placed' | 'routed';
}

export interface ComponentSearchResult {
  lcscId: string;
  name: string;
  manufacturer: string;
  package: string;
  price?: number;
  stock: number;
  description: string;
  productUrl?: string;         // LCSC product page URL
  datasheetPdf?: string;       // Actual PDF datasheet URL
  category?: string;
  /** JLCPCB assembly type: "basic" = no setup fee, "extended" = setup fee required */
  libraryType?: 'basic' | 'extended';
  /** Component specifications (e.g., "Output Voltage": "3.3V", "Output Current": "100mA") */
  attributes?: Record<string, string>;
}
