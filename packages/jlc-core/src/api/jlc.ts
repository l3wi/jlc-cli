/**
 * JLC API client for component search and details
 * Uses JLCPCB's parts library API which provides LCSC component data
 */

import type { LCSCSearchOptions, ComponentSearchResult } from '../types/index.js';
import { createLogger } from '../utils/index.js';

const logger = createLogger('jlc-api');

// JLCPCB parts API - provides LCSC component data with better reliability
const JLCPCB_SEARCH_API =
  'https://jlcpcb.com/api/overseas-pcb-order/v1/shoppingCart/smtGood/selectSmtComponentList/v2';

/**
 * JLCPCB component structure from API response
 */
interface JLCPCBComponent {
  componentCode: string; // LCSC part number (e.g., "C82899")
  componentModelEn: string; // Part model (e.g., "ESP32-WROOM-32-N4")
  componentBrandEn: string; // Manufacturer
  componentSpecificationEn: string; // Package type
  stockCount: number;
  componentPrices: Array<{
    startNumber: number;
    endNumber: number;
    productPrice: number;
  }>;
  describe: string;
  dataManualUrl?: string;
  lcscGoodsUrl?: string;
  componentTypeEn?: string;
  componentLibraryType?: string; // "base" = basic part (no setup fee), "expand" = extended (setup fee required)
  attributes?: Array<{
    attribute_name_en: string;
    attribute_value_name: string;
  }>;
}

interface JLCPCBSearchResponse {
  code: number;
  data: {
    componentPageInfo: {
      total: number;
      list: JLCPCBComponent[] | null;
    };
  };
  message: string | null;
}

export interface LCSCProduct {
  productCode: string;
  productModel: string;
  brandNameEn: string;
  encapStandard: string;
  productPriceList: Array<{
    ladder: number;
    productPrice: number;
    currencySymbol: string;
  }>;
  stockNumber: number;
  productIntroEn: string;
}

export class JLCClient {
  /**
   * Search for components via JLCPCB API
   */
  async search(
    query: string,
    options: LCSCSearchOptions = {}
  ): Promise<ComponentSearchResult[]> {
    const { limit = 10, page = 1, inStock = false, basicOnly = false } = options;

    logger.debug(`Searching LCSC (via JLCPCB) for: ${query} (inStock=${inStock}, basicOnly=${basicOnly})`);

    const requestBody: Record<string, unknown> = {
      currentPage: page,
      pageSize: Math.min(limit, 50),
      keyword: query,
      searchType: 2, // Better search relevance matching
    };

    // Add in-stock filter
    if (inStock) {
      requestBody.presaleType = 'stock';
    }

    // Add basic/preferred library filter (JLCPCB basic parts = lower assembly cost)
    if (basicOnly) {
      requestBody.componentLibTypes = ['base'];
      requestBody.preferredComponentFlag = true;
    }

    const body = JSON.stringify(requestBody);

    try {
      const response = await fetch(JLCPCB_SEARCH_API, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body,
      });

      if (!response.ok) {
        throw new Error(`JLCPCB API returned ${response.status}`);
      }

      const data: JLCPCBSearchResponse = await response.json();

      if (data.code !== 200) {
        throw new Error(`JLCPCB API error: ${data.message || 'Unknown error'}`);
      }

      const components = data.data?.componentPageInfo?.list || [];

      logger.debug(`Found ${components.length} components`);

      return components.map((c) => ({
        lcscId: c.componentCode,
        name: c.componentModelEn,
        manufacturer: c.componentBrandEn,
        package: c.componentSpecificationEn || '',
        price: c.componentPrices?.[0]?.productPrice,
        stock: c.stockCount,
        description: c.describe,
        productUrl: c.lcscGoodsUrl,      // LCSC product page
        datasheetPdf: c.dataManualUrl,   // Actual PDF datasheet
        category: c.componentTypeEn,
        // JLCPCB assembly part type: "basic" = no setup fee, "extended" = setup fee required
        libraryType: c.componentLibraryType === 'base' ? 'basic' : 'extended',
        // Component specifications as key-value pairs
        attributes: c.attributes?.reduce(
          (acc, attr) => {
            if (attr.attribute_value_name && attr.attribute_value_name !== '-') {
              acc[attr.attribute_name_en] = attr.attribute_value_name;
            }
            return acc;
          },
          {} as Record<string, string>
        ),
      }));
    } catch (error) {
      logger.error(`Search failed: ${error}`);
      throw error;
    }
  }

  /**
   * Get stock and pricing information for a component
   */
  async getStock(lcscPartNumber: string): Promise<{
    stock: number;
    priceBreaks: Array<{ quantity: number; price: number }>;
  }> {
    // Re-search to get current stock info
    const results = await this.search(lcscPartNumber, { limit: 1 });

    if (results.length === 0) {
      throw new Error(`Component ${lcscPartNumber} not found`);
    }

    const product = results[0];
    return {
      stock: product.stock,
      priceBreaks: [{ quantity: 1, price: product.price || 0 }],
    };
  }

  /**
   * Get detailed component information including attributes
   * Used to enrich EasyEDA data with JLC-specific attributes
   */
  async getComponentDetails(lcscPartNumber: string): Promise<ComponentSearchResult | null> {
    const results = await this.search(lcscPartNumber, { limit: 1 });
    if (results.length === 0) {
      return null;
    }
    return results[0];
  }
}

export const jlcClient = new JLCClient();
