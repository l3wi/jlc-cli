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
  /** Only return parts supported by the Economic PCBA service (excludes "Standard Only" parts) */
  economicOnly?: boolean;
  /** Restrict to JLCPCB component types (grade-2 ids from JlcComponentType; [] = whole catalogue) */
  typeIds?: number[];
  /**
   * Attribute filters. Each group is an object of `{ attributeName: [values] }`:
   * values inside one attribute are OR'd, attributes inside one group are OR'd,
   * and separate groups are AND'd. Values must match ComponentFilterValue.value exactly.
   */
  attributeFilters?: AttributeFilterGroup[];
  /** Exact manufacturer names from ComponentFilterAttributes.brands */
  brands?: string[];
  /** Exact package names from ComponentFilterAttributes.packages */
  packages?: string[];
  limit?: number;
  page?: number;
}

/** One AND group of attribute filters: `{ "Output Current": ["1A","1.5A"] }` */
export type AttributeFilterGroup = Record<string, string[]>;

/**
 * A component type from JLCPCB's catalogue (`data.sortAndCountVoList`) — the node `componentTypeIdList`
 * refers to. Named with the JLC prefix because `ComponentType` is taken by the value normalizer.
 * Two levels: grade 1 = category (e.g. "Power Management (PMIC)"), grade 2 = leaf
 * (e.g. "Voltage Regulators - Linear, Low Drop Out (LDO) Regulators").
 */
export interface JlcComponentType {
  /** componentSortKeyId — the id every JLCPCB API consumes, and the numeric suffix of the parts URL */
  id: number;
  name: string;
  parentId: number;
  parentName?: string;
  grade: number;
  /** Catalogue count at fetch time; drifts, so use ids for filtering */
  componentCount: number;
}

/** One selectable value of a filter attribute, exactly as the search API expects it */
export interface ComponentFilterValue {
  /** Exact string accepted by `attributeFilters`, e.g. "1A", "1A、2A", "1.25V~12V", "-" */
  value: string;
  docCount: number;
  /**
   * Numeric parts in the attribute's base unit, in source order: one entry for a scalar ("1A" -> [1]),
   * two for a range ("1.25V~12V" -> [1.25, 12]), several for a multi-value cell ("1A、2A" -> [1, 2]).
   * Only populated for attributes that carry unit metadata (`kind: 'range'`), and undefined when the
   * value carries no parseable number.
   */
  numbers?: number[];
}

/** A filterable attribute of a component type (the vocabulary of one facet) */
export interface ComponentFilterAttribute {
  name: string;
  docCount: number;
  /** "range" attributes carry unit metadata; "enum" attributes are plain string values */
  kind: 'enum' | 'range';
  /** Base unit of `ComponentFilterValue.numbers` (the unitConversionMap entry with factor 1) */
  unit?: string;
  unitConversionMap?: Record<string, number>;
  unitList?: string[];
  values: ComponentFilterValue[];
}

/** Result of filtering the component catalogue by type, brand, package or attribute */
export interface ComponentFilterAttributes {
  /** types the facets were computed for; [] = whole catalogue */
  typeIds: number[];
  total: number;
  /** Parts per assembly class; standard - economic = parts needing the pricier Standard PCBA service */
  counts: {
    base: number;
    preferred: number;
    economic: number;
    standard: number;
    extended: number;
    datasheet: number;
  };
  attributes: ComponentFilterAttribute[];
  brands: ComponentFilterValue[];
  packages: ComponentFilterValue[];
  /** buy / post / stock */
  presaleTypes: ComponentFilterValue[];
}

/**
 * A value constraint on one attribute. `values` matches the vocabulary exactly;
 * `min`/`max` are numeric bounds in `unit` (default: the attribute's base unit) and select every
 * value the part can reach, so `{ attribute: "Output Current", min: 1, unit: "A" }` means "can do >= 1A".
 */
export interface AttributeQuery {
  attribute: string;
  values?: string[];
  min?: number;
  max?: number;
  unit?: string;
}

/** Attribute values resolved to what the search API accepts, plus the facet counts behind them */
export interface AttributeResolution {
  attribute: string;
  /** Exact values to pass to `attributeFilters` for this attribute */
  values: string[];
  matched: ComponentFilterValue[];
  /** Sum of the matched docCounts; buckets are disjoint, so this is the exact row count the filter yields */
  predictedTotal: number;
  /** Requested `values` that are absent from the vocabulary (sent values are case/unit sensitive) */
  unmatchedValues: string[];
  /** Bounds as applied, in the attribute's base unit */
  appliedBounds?: { min?: number; max?: number; unit?: string };
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
