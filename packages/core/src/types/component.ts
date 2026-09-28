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

/** JLCPCB PCBA service compatibility (money: Standard PCBA setup costs more than Economic) */
export type PcbaType = 'economic-and-standard' | 'standard-only';

/** One page of catalogue search results, with the API's row count for the query */
export interface ComponentSearchPage {
  /**
   * Rows the API reports for this query. An upper bound when `economicOnly` filters the page locally,
   * and the count to paginate by otherwise.
   */
  total: number;
  results: ComponentSearchResult[];
  page: number;
  pageSize: number;
}

export interface ComponentSearchResult {
  id: string;
  idType: 'lcsc' | 'easyeda_uuid';
  lcscId?: string;
  easyedaUuid?: string;
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
  /**
   * JLCPCB PCBA service compatibility.
   * "standard-only" parts cannot be assembled with the cheaper Economic PCBA service
   * (JLCPCB source: PCBA Type "Standard Only"); "economic-and-standard" works with both.
   * undefined = not reported by the API.
   */
  pcbaType?: PcbaType;
  /** Component specifications (e.g., "Output Voltage": "3.3V", "Output Current": "100mA") */
  attributes?: Record<string, string>;
}
