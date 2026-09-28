/**
 * JLC API client for component search and details
 * Uses JLCPCB's parts library API which provides LCSC component data
 */

import type {
  AttributeFilterGroup,
  ComponentFilterAttribute,
  ComponentFilterAttributes,
  ComponentFilterValue,
  ComponentSearchPage,
  ComponentSearchResult,
  JlcComponentType,
  LCSCSearchOptions,
  PcbaType,
} from '../types/index.js';
import { createLogger } from '../utils/index.js';
import { parseFilterValueNumbers } from '../utils/facet-values.js';

const logger = createLogger('jlc-api');

/** JLCPCB API caps pageSize at 50 */
const MAX_PAGE_SIZE = 50;

/**
 * Map JLCPCB's `componentProductType` to PCBA service compatibility.
 * Verified against JLCPCB part pages: 0 = "Economic and Standard", 2 = "Standard Only".
 * Unseen values stay undefined rather than guessing a service capability.
 */
export function mapPcbaType(componentProductType?: number): PcbaType | undefined {
  if (componentProductType === 0) return 'economic-and-standard';
  if (componentProductType === 2) return 'standard-only';
  return undefined;
}

/**
 * Strip temperature range prefix from descriptions
 * Matches patterns like "-40℃~+70℃ " at the start only
 */
function stripTemperaturePrefix(description: string): string {
  return description.replace(/^-?\d+℃~[+-]?\d+℃\s*/, '');
}

// JLCPCB parts API - provides LCSC component data with better reliability
const JLCPCB_SEARCH_API =
  'https://jlcpcb.com/api/overseas-pcb-order/v1/shoppingCart/smtGood/selectSmtComponentList/v2';
const JLCPCB_FILTER_API =
  'https://jlcpcb.com/api/overseas-pcb-order/v1/componentSearch/filterComponentAttribute';

/**
 * searchType gates the search payload: 1 = type catalogue only, 2 = rows only, 3 = both, 4 = rows only.
 * `searchType: 1` is what returns `data.sortAndCountVoList`; `2` and `4` return rows.
 */
const SEARCH_TYPE_ROWS = 2;
const SEARCH_TYPE_TAXONOMY = 1;

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
  componentProductType?: number; // 0 = Economic and Standard PCBA, 2 = Standard Only (no Economic PCBA)
  attributes?: Array<{
    attribute_name_en: string;
    attribute_value_name: string;
  }>;
}

/** Every JLCPCB parts endpoint answers with this envelope; `code !== 200` carries a business error */
interface JLCPCBEnvelope<T> {
  code: number;
  data: T | null;
  message: string | null;
}

interface JLCPCBSearchData {
  componentPageInfo: {
    total: number;
    list: JLCPCBComponent[] | null;
  };
}

/** Type catalogue node (`data.sortAndCountVoList`), two levels deep via childSortList */
interface JLCPCBTypeNode {
  sortUuid?: string;
  sortName: string;
  parentId?: number;
  componentSortKeyId: number;
  grade?: number;
  componentCount: number;
  childSortList?: JLCPCBTypeNode[] | null;
}

interface JLCPCBTaxonomyData {
  sortAndCountVoList: JLCPCBTypeNode[] | null;
}

/** One value bucket of a facet ("1A", "1A、2A", "1.25V~12V") */
interface JLCPCBFacetBucket {
  key: string;
  docCount: number;
  subAggs?: JLCPCBFacetBucket[] | null;
}

/**
 * One facet. Enum facets (`paramList`) carry only buckets; range facets (`paramRangeList`) add
 * `rangeFlag` and the unit metadata. Both lists carry the same names and the same buckets.
 */
interface JLCPCBFacetParam extends JLCPCBFacetBucket {
  name: string;
  displayFlag?: boolean;
  rangeFlag?: boolean;
  unitConversionMap?: Record<string, number>;
  unitList?: string[];
}

interface JLCPCBFacetData {
  total: number;
  basePart?: number;
  preferredPart?: number;
  economicPart?: number;
  standardPart?: number;
  extendPart?: number;
  dataSheetPart?: number;
  paramList?: JLCPCBFacetParam[] | null;
  paramRangeList?: JLCPCBFacetParam[] | null;
  componentBrandList?: JLCPCBFacetBucket[] | null;
  componentSpecificationList?: JLCPCBFacetBucket[] | null;
  presaleTypeAggs?: JLCPCBFacetBucket[] | null;
}

function toFilterValues(
  buckets: JLCPCBFacetBucket[] | null | undefined,
  unitConversionMap?: Record<string, number>
): ComponentFilterValue[] {
  return (buckets ?? []).map((bucket) => ({
    value: bucket.key,
    docCount: bucket.docCount,
    // Only unit-bearing attributes have comparable numbers; brand/package keys must not be parsed
    // ("3PEAK" would read as 3 with an unknown unit suffix).
    numbers: unitConversionMap ? parseFilterValueNumbers(bucket.key, unitConversionMap) : undefined,
  }));
}

/**
 * Merge `paramList` (enum) with `paramRangeList` (numeric) — identical names and buckets, the range list
 * adding units — into the single vocabulary consumers filter with.
 */
function toFilterAttributes(data: JLCPCBFacetData): ComponentFilterAttribute[] {
  const byName = new Map<string, ComponentFilterAttribute>();
  for (const param of data.paramList ?? []) {
    byName.set(param.name, {
      name: param.name,
      docCount: param.docCount,
      kind: 'enum',
      values: toFilterValues(param.subAggs),
    });
  }
  for (const param of data.paramRangeList ?? []) {
    byName.set(param.name, {
      name: param.name,
      docCount: param.docCount,
      kind: param.rangeFlag ? 'range' : 'enum',
      unit: Object.entries(param.unitConversionMap ?? {}).find(([, factor]) => factor === 1)?.[0],
      unitConversionMap: param.unitConversionMap,
      unitList: param.unitList,
      values: toFilterValues(param.subAggs, param.unitConversionMap),
    });
  }
  return [...byName.values()];
}

/**
 * Build the verified search request body. Exported because the wire shape is the contract with JLCPCB:
 * `searchType: 2` selects rows, `componentAttributeList` elements are AND groups whose values OR,
 * and `economicOnly` is filtered locally (JLCPCB ignores a PCBA-type request filter).
 */
export function buildSearchRequestBody(
  query: string,
  options: LCSCSearchOptions = {}
): Record<string, unknown> {
  const {
    limit = 10,
    page = 1,
    inStock = false,
    basicOnly = false,
    economicOnly = false,
    typeIds,
    attributeFilters,
    brands,
    packages,
  } = options;

  const requestBody: Record<string, unknown> = {
    currentPage: page,
    // JLCPCB ignores a PCBA-type filter, so over-fetch the page and filter locally
    pageSize: economicOnly ? MAX_PAGE_SIZE : Math.min(limit, MAX_PAGE_SIZE),
    keyword: query,
    searchType: SEARCH_TYPE_ROWS,
  };

  if (inStock) {
    requestBody.presaleType = 'stock';
  }

  // JLCPCB basic parts (lower assembly cost)
  if (basicOnly) {
    requestBody.componentLibTypes = ['base'];
    requestBody.preferredComponentFlag = true;
  }

  if (typeIds?.length) {
    requestBody.componentTypeIdList = typeIds;
  }
  if (brands?.length) {
    requestBody.componentBrandList = brands;
  }
  if (packages?.length) {
    requestBody.componentSpecificationList = packages;
  }
  if (attributeFilters?.length) {
    requestBody.componentAttributeList = attributeFilters satisfies AttributeFilterGroup[];
  }

  return requestBody;
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
   * POST a JSON body to a JLCPCB parts endpoint and unwrap the envelope
   * (`{ code: 200, data, message }`; other codes carry a business error such as code 101).
   */
  private async post<T>(url: string, body: unknown): Promise<T | null> {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`JLCPCB API returned ${response.status}`);
    }

    const envelope = (await response.json()) as JLCPCBEnvelope<T>;

    if (envelope.code !== 200) {
      throw new Error(`JLCPCB API error: ${envelope.message || 'Unknown error'} (code ${envelope.code})`);
    }

    return envelope.data;
  }

  /**
   * Fetch the component-type catalogue (`data.sortAndCountVoList`), flattened to two levels.
   *
   * Ids are `componentSortKeyId`, the only id JLCPCB accepts for filtering (the uuids and the per-row
   * `*SortAccessId` values are rejected). Payload is ~320 KB, and `componentCount` drifts, so ids are the
   * stable thing to cache.
   */
  async getComponentTypes(): Promise<JlcComponentType[]> {
    logger.debug('Fetching JLCPCB component type catalogue');

    const data = await this.post<JLCPCBTaxonomyData>(JLCPCB_SEARCH_API, {
      currentPage: 1,
      pageSize: 1,
      searchType: SEARCH_TYPE_TAXONOMY,
    });

    const types: JlcComponentType[] = [];
    const walk = (nodes: JLCPCBTypeNode[] | null | undefined, parent?: JlcComponentType) => {
      for (const node of nodes ?? []) {
        const type: JlcComponentType = {
          id: node.componentSortKeyId,
          name: node.sortName,
          parentId: node.parentId ?? 0,
          parentName: parent?.name,
          grade: node.grade ?? (parent ? 2 : 1),
          componentCount: node.componentCount,
        };
        types.push(type);
        walk(node.childSortList, type);
      }
    };
    walk(data?.sortAndCountVoList);

    logger.debug(`Found ${types.length} component types`);
    return types;
  }

  /**
   * Fetch the filter vocabulary and counts for one or more component types.
   *
   * Pass `[]` for the whole catalogue (7.2M parts, 3600+ brands). Response is multi-megabyte for a big
   * type, so callers should fetch per type and keep it (the vocabulary is stable within a type).
   */
  async getFilterAttributes(
    typeIds: number[],
    options: Pick<LCSCSearchOptions, 'brands' | 'packages'> = {}
  ): Promise<ComponentFilterAttributes> {
    logger.debug(`Fetching JLCPCB filter attributes for types ${typeIds.join(',') || '(all)'}`);

    const baseQueryDto: Record<string, unknown> = { componentTypeIdList: typeIds };
    if (options.brands?.length) baseQueryDto.componentBrandList = options.brands;
    if (options.packages?.length) baseQueryDto.componentSpecificationList = options.packages;

    const data = await this.post<JLCPCBFacetData>(JLCPCB_FILTER_API, { baseQueryDto });
    if (!data) {
      throw new Error('JLCPCB filter API returned no data');
    }

    const attributes = toFilterAttributes(data);

    logger.debug(`Found ${attributes.length} filterable attributes`);

    return {
      typeIds,
      total: data.total,
      counts: {
        base: data.basePart ?? 0,
        preferred: data.preferredPart ?? 0,
        economic: data.economicPart ?? 0,
        standard: data.standardPart ?? 0,
        extended: data.extendPart ?? 0,
        datasheet: data.dataSheetPart ?? 0,
      },
      attributes,
      brands: toFilterValues(data.componentBrandList),
      packages: toFilterValues(data.componentSpecificationList),
      presaleTypes: toFilterValues(data.presaleTypeAggs),
    };
  }

  /**
   * Search for components via JLCPCB API
   */
  async search(query: string, options: LCSCSearchOptions = {}): Promise<ComponentSearchResult[]> {
    return (await this.searchPage(query, options)).results;
  }

  /**
   * Search one page of components, keeping the API's row count so callers can paginate and show totals.
   * `query` may be empty when `typeIds`/`attributeFilters` already scope the result set.
   */
  async searchPage(
    query: string,
    options: LCSCSearchOptions = {}
  ): Promise<ComponentSearchPage> {
    const { limit = 10, page = 1, inStock = false, basicOnly = false, economicOnly = false } = options;

    logger.debug(
      `Searching LCSC (via JLCPCB) for: "${query}" (inStock=${inStock}, basicOnly=${basicOnly}, economicOnly=${economicOnly}, types=${options.typeIds?.join(',') ?? '-'}, attributes=${options.attributeFilters?.length ?? 0})`
    );

    try {
      const data = await this.post<JLCPCBSearchData>(
        JLCPCB_SEARCH_API,
        buildSearchRequestBody(query, options)
      );

      const components = data?.componentPageInfo?.list || [];

      logger.debug(`Found ${components.length} components`);

      const results: ComponentSearchResult[] = components.map((c) => ({
        id: c.componentCode,
        idType: 'lcsc' as const,
        lcscId: c.componentCode,
        name: c.componentModelEn,
        manufacturer: c.componentBrandEn,
        package: c.componentSpecificationEn || '',
        price: c.componentPrices?.[0]?.productPrice,
        stock: c.stockCount,
        description: stripTemperaturePrefix(c.describe),
        productUrl: c.lcscGoodsUrl,      // LCSC product page
        datasheetPdf: c.dataManualUrl,   // Actual PDF datasheet
        category: c.componentTypeEn,
        // JLCPCB assembly part type: "basic" = no setup fee, "extended" = setup fee required
        libraryType: c.componentLibraryType === 'base' ? 'basic' : 'extended',
        // JLCPCB PCBA service: "standard-only" parts force the pricier Standard PCBA service
        pcbaType: mapPcbaType(c.componentProductType),
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

      // Unknown pcbaType is kept: only parts the API explicitly marks Standard Only are dropped
      const filtered = economicOnly
        ? results.filter((r) => r.pcbaType !== 'standard-only')
        : results;

      return {
        total: data?.componentPageInfo?.total ?? 0,
        results: filtered.slice(0, limit),
        page,
        pageSize: Math.min(limit, MAX_PAGE_SIZE),
      };
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
