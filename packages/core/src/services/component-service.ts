/**
 * Component Service
 * High-level API for searching and fetching components
 */

import type {
  AttributeFilterGroup,
  ComponentFilterAttributes,
  ComponentSearchPage,
  ComponentSearchResult,
  JlcComponentType,
  EasyEDAComponentData,
  EasyEDACommunityComponent,
} from '../types/index.js';
import { jlcClient } from '../api/jlc.js';
import { easyedaClient } from '../api/easyeda.js';
import { easyedaCommunityClient } from '../api/easyeda-community.js';

export interface SearchOptions {
  limit?: number;
  inStock?: boolean;
  basicOnly?: boolean;
  /** Only return parts supported by the Economic PCBA service (excludes "Standard Only" parts) */
  economicOnly?: boolean;
  /** Restrict to JLCPCB component types (grade-2 ids from `getComponentTypes`; [] = whole catalogue) */
  typeIds?: number[];
  /**
   * Attribute filters, from `getFilterAttributes` vocabulary. Each group is `{ attribute: [values] }`:
   * values OR together, groups AND together.
   */
  attributeFilters?: AttributeFilterGroup[];
  /** Exact manufacturer names from ComponentFilterAttributes.brands */
  brands?: string[];
  /** Exact package names from ComponentFilterAttributes.packages */
  packages?: string[];
  source?: 'lcsc' | 'community' | 'easyeda-community' | 'all';
}

export interface ComponentDetails {
  lcscId: string;
  name: string;
  manufacturer: string;
  description: string;
  category: string;
  package: string;
  pinCount: number;
  padCount: number;
  has3DModel: boolean;
  datasheet?: string;
}

export interface ComponentService {
  search(query: string, options?: SearchOptions): Promise<ComponentSearchResult[]>;
  /** One page of results plus the API's row count, for faceted browsing and pagination */
  searchPage(query: string, options?: SearchOptions): Promise<ComponentSearchPage>;
  /** Component-type catalogue (two levels); ids feed `SearchOptions.typeIds` and `getFilterAttributes` */
  getComponentTypes(): Promise<JlcComponentType[]>;
  /** Filter vocabulary, counts, brands and packages for one or more types ([] = whole catalogue) */
  getFilterAttributes(
    typeIds: number[],
    options?: Pick<SearchOptions, 'brands' | 'packages'>
  ): Promise<ComponentFilterAttributes>;
  fetch(id: string): Promise<EasyEDAComponentData | null>;
  fetchCommunity(uuid: string): Promise<EasyEDACommunityComponent | null>;
  getDetails(lcscId: string): Promise<ComponentDetails>;
}

/**
 * Check if an ID is an LCSC part number (starts with C followed by digits)
 */
function isLcscId(id: string): boolean {
  return /^C\d+$/.test(id);
}

/**
 * Map service options onto the JLC client's options. Community results carry no JLCPCB catalogue fields,
 * so the catalogue filters are LCSC-only.
 */
function buildJlcOptions(options: SearchOptions) {
  const {
    limit = 20,
    inStock,
    basicOnly,
    economicOnly,
    typeIds,
    attributeFilters,
    brands,
    packages,
  } = options;

  return { limit, inStock, basicOnly, economicOnly, typeIds, attributeFilters, brands, packages };
}

export function createComponentService(): ComponentService {
  const searchCommunity = async (
    query: string,
    limit: number
  ): Promise<ComponentSearchResult[]> => {
    const results = await easyedaCommunityClient.search({ query, limit });
    return results.map(r => ({
      id: r.uuid,
      idType: 'easyeda_uuid' as const,
      easyedaUuid: r.uuid,
      name: r.title,
      manufacturer: r.owner?.nickname || 'Community',
      description: r.description || '',
      package: r.package || '',
      stock: 0,
    }));
  };

  const search = async (
    query: string,
    options: SearchOptions = {}
  ): Promise<ComponentSearchResult[]> => {
    const { source = 'lcsc', limit = 20 } = options;

    if (source === 'lcsc') {
      return jlcClient.search(query, buildJlcOptions(options));
    }

    if (source === 'all') {
      const [lcscResults, communityResults] = await Promise.all([
        jlcClient.search(query, buildJlcOptions(options)),
        searchCommunity(query, limit),
      ]);
      return [...lcscResults, ...communityResults].slice(0, limit);
    }

    return searchCommunity(query, limit);
  };

  return {
    search,

    async searchPage(query: string, options: SearchOptions = {}): Promise<ComponentSearchPage> {
      if ((options.source ?? 'lcsc') !== 'lcsc') {
        // Community results come from a different API with no row count of its own
        const results = await search(query, options);
        return { total: results.length, results, page: 1, pageSize: results.length };
      }
      return jlcClient.searchPage(query, buildJlcOptions(options));
    },

    async getComponentTypes(): Promise<JlcComponentType[]> {
      return jlcClient.getComponentTypes();
    },

    async getFilterAttributes(
      typeIds: number[],
      options: Pick<SearchOptions, 'brands' | 'packages'> = {}
    ): Promise<ComponentFilterAttributes> {
      return jlcClient.getFilterAttributes(typeIds, options);
    },

    async fetch(id: string): Promise<EasyEDAComponentData | null> {
      if (isLcscId(id)) {
        return easyedaClient.getComponentData(id);
      }
      // For community components, caller should use fetchCommunity and adapt
      return null;
    },

    async fetchCommunity(uuid: string): Promise<EasyEDACommunityComponent | null> {
      return easyedaCommunityClient.getComponent(uuid);
    },

    async getDetails(lcscId: string): Promise<ComponentDetails> {
      const component = await easyedaClient.getComponentData(lcscId);
      if (!component) {
        throw new Error(`Component ${lcscId} not found`);
      }

      return {
        lcscId,
        name: component.info.name,
        manufacturer: component.info.manufacturer || '',
        description: component.info.description || '',
        category: component.info.category || '',
        package: component.info.package || '',
        pinCount: component.symbol?.pins?.length || 0,
        padCount: component.footprint?.pads?.length || 0,
        has3DModel: !!component.model3d,
        datasheet: component.info.datasheet,
      };
    },
  };
}
