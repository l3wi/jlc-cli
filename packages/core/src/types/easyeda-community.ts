/**
 * Types for EasyEDA community library API
 * These are for user-contributed components (not official LCSC parts)
 *
 * NOTE: Community components now use the same parsed structure as LCSC components.
 * The only differences are community-specific metadata (owner, creator, etc.)
 */

import type { EasyEDASymbolData, EasyEDAFootprintData } from './easyeda.js';

/**
 * Owner information for a community component
 */
export interface EasyEDACommunityOwner {
  uuid: string;
  username: string;
  nickname: string;
  avatar?: string;
  team?: boolean;
}

/**
 * Search result from EasyEDA community library
 */
export interface EasyEDACommunitySearchResult {
  uuid: string;
  title: string;
  thumb: string;
  description: string;
  tags: string[];
  package: string;
  packageUuid?: string; // UUID for the footprint/package (for image URL)
  manufacturer?: string;
  owner: EasyEDACommunityOwner;
  contributor?: string;
  has3DModel: boolean;
  docType: number;
  updateTime?: number;
}

/**
 * Search parameters for EasyEDA community library
 */
export interface EasyEDACommunitySearchParams {
  query: string;
  source?: 'user' | 'lcsc' | 'easyeda' | 'all';
  limit?: number;
  page?: number;
}

/**
 * Full component data from EasyEDA community library
 * Uses the same symbol/footprint structure as EasyEDAComponentData with
 * additional community-specific metadata.
 */
export interface EasyEDACommunityComponent {
  uuid: string;
  title: string;
  description: string;
  tags: string[];
  owner: EasyEDACommunityOwner;
  creator?: EasyEDACommunityOwner;
  updateTime: number;
  docType: number;
  verify: boolean;
  symbol: EasyEDASymbolData & {
    head: Record<string, unknown>;
  };
  footprint: EasyEDAFootprintData & {
    uuid: string;
    head: Record<string, unknown>;
  };
  model3d?: {
    name: string;
    uuid: string;
  };
  rawData: object;
}
