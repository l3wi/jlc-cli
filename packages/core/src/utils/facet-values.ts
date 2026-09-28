/**
 * Parsing helpers for JLCPCB filter vocabularies.
 *
 * The facet response (`ComponentFilterAttributes`) is the only source of attribute vocabulary, and its
 * values are display strings: scalars ("1A"), ranges ("1.25V~12V"), multi-value cells ("1A、2A") and
 * measurement-qualified values ("-10℃~+110℃@(Tj)"). These helpers turn them into comparable numbers in the
 * attribute's base unit.
 */

import type { ComponentFilterAttribute } from '../types/index.js';

/** Value separators seen in the vocabulary: CJK enumeration comma, then defensive ASCII variants */
const VALUE_SEPARATORS = /[、,;]/;

/** Range separator inside one value, e.g. "1.25V~12V" */
const RANGE_SEPARATOR = '~';

/** Measurement qualifier suffix such as "@(Tj)" / "@(Ta)" — a condition, not part of the value */
const MEASUREMENT_QUALIFIER = /@\([^)]*\)/g;

const NUMBER_WITH_UNIT = /^\s*([+-]?[0-9.]+(?:e[+-]?[0-9]+)?)\s*([a-zA-ZΩ℃%‰]*)\s*$/i;

/**
 * Parse one vocabulary value into the numbers it can reach, in the attribute's base unit.
 * Scalars yield one number, ranges two ("1.25V~12V" -> [1.25, 12]), multi-value cells one per part
 * ("1mA、200mA" -> [0.001, 0.2]).
 *
 * Numbers are parsed from the value string on purpose: the API's own `numericalNormValue` /
 * `intervalStartValue` / `intervalEndValue` fields are inconsistent (0 for plain scalars in most facets,
 * a meaningless sum for multi-value cells), so they cannot be trusted as bounds.
 */
export function parseFilterValueNumbers(
  value: string,
  unitConversionMap?: Record<string, number>
): number[] | undefined {
  const numbers: number[] = [];
  for (const part of value.replace(MEASUREMENT_QUALIFIER, '').split(VALUE_SEPARATORS)) {
    for (const bound of part.split(RANGE_SEPARATOR)) {
      const match = NUMBER_WITH_UNIT.exec(bound);
      if (!match) continue;
      const magnitude = Number(match[1]);
      if (!Number.isFinite(magnitude)) continue;
      const suffix = match[2];
      const factor = suffix && unitConversionMap ? unitConversionMap[suffix] : 1;
      numbers.push(magnitude * (factor ?? 1));
    }
  }
  return numbers.length > 0 ? numbers : undefined;
}

/** The unit whose conversion factor is 1 — the unit base units are expressed in */
export function baseUnitOf(facet: ComponentFilterAttribute): string | undefined {
  const map = facet.unitConversionMap;
  if (map) {
    const base = Object.entries(map).find(([, factor]) => factor === 1);
    if (base) return base[0];
  }
  return facet.unitList?.[0];
}
