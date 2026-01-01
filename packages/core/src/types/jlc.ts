/**
 * JLC/LCSC API response types
 * Note: Interface names keep "LCSC" prefix as they represent LCSC part number formats
 */

export interface LCSCSearchResponse {
  code: number;
  result: {
    productList: LCSCProduct[];
    totalCount: number;
    pageNumber: number;
    pageSize: number;
  };
}

export interface LCSCProduct {
  productCode: string;           // LCSC part number (e.g., "C2040")
  productModel: string;          // Manufacturer part number
  brandNameEn: string;           // Manufacturer name
  encapStandard: string;         // Package type
  productPriceList: LCSCPriceItem[];
  stockNumber: number;
  productIntroEn: string;        // Description
  productImages: string[];
  productUrl: string;
  datasheet?: string;
}

export interface LCSCPriceItem {
  ladder: number;
  productPrice: number;
  currencySymbol: string;
}

export interface LCSCComponentResponse {
  code: number;
  result: {
    dataStr: {
      head: {
        x: string;
        y: string;
        c_para: Record<string, string>;
      };
      shape: string[];
    };
    packageDetail: {
      dataStr: {
        head: {
          x: string;
          y: string;
          c_para: Record<string, string>;
        };
        shape: string[];
      };
      title: string;
    };
    lcsc: {
      number: string;
      url: string;
    };
    SMT: boolean;
  };
}

export interface LCSCSearchOptions {
  category?: string;
  inStock?: boolean;
  basicOnly?: boolean;
  limit?: number;
  page?: number;
}

export interface LCSCStockInfo {
  lcscPartNumber: string;
  stock: number;
  priceBreaks: PriceBreak[];
  minimumOrder: number;
}

export interface PriceBreak {
  quantity: number;
  unitPrice: number;
  currency: string;
}
