/**
 * Attribute filter resolution.
 *
 * JLCPCB's search API filters attributes only by exact vocabulary values (`ComponentFilterValue.value`),
 * and its facet response is the only place that vocabulary (plus unit metadata) exists. This turns a value
 * constraint such as "Output Current >= 1A" into that exact value list, so consumers never have to guess at
 * bucket strings or normalise units themselves.
 */

import type {
  AttributeQuery,
  AttributeResolution,
  ComponentFilterAttribute,
  ComponentFilterValue,
} from '../types/index.js';
import { baseUnitOf } from '../utils/facet-values.js';

/** Tolerate float noise from unit conversion (e.g. 800 * 0.001) without hiding real differences */
const EPSILON = 1e-9;

function factorOf(facet: ComponentFilterAttribute, unit: string | undefined): number {
  if (!facet.unitConversionMap) return 1;
  if (!unit) return 1;
  const factor = facet.unitConversionMap[unit];
  if (factor === undefined) {
    throw new Error(
      `Unknown unit "${unit}" for attribute "${facet.name}"; available: ${Object.keys(facet.unitConversionMap).join(', ')}`
    );
  }
  return factor;
}

/**
 * Resolve a value constraint against an attribute's vocabulary.
 *
 * - `values` are matched exactly against the vocabulary (unmatched ones are reported, not sent).
 * - `min` keeps values the part can reach at least (highest parsed number >= min): `min: 1, unit: "A"`
 *   on "Output Current" means "can deliver 1A or more".
 * - `max` keeps values the part can reach at most (lowest parsed number <= max) — the direction to use for
 *   negative requirements, e.g. "operates down to -40℃" is `max: -40, unit: "℃"` on "Operating Temperature".
 * - Values without parseable numbers (e.g. "-") are dropped as soon as a bound is given, and kept
 *   when only exact `values` are requested.
 * - Range containment ("its interval covers 3.3V") is not expressible; combine `min` and `max` instead.
 */
export function resolveAttributeQuery(
  facet: ComponentFilterAttribute,
  query: AttributeQuery
): AttributeResolution {
  const unit = query.unit ?? baseUnitOf(facet);
  const min = query.min === undefined ? undefined : query.min * factorOf(facet, query.unit);
  const max = query.max === undefined ? undefined : query.max * factorOf(facet, query.unit);
  const hasBounds = min !== undefined || max !== undefined;

  const requested = query.values ?? [];
  const requestedSet = new Set(requested);
  const unmatchedValues = requested.filter(
    (value) => !facet.values.some((candidate) => candidate.value === value)
  );

  const matched: ComponentFilterValue[] = [];
  const matchedValues = new Set<string>();

  for (const candidate of facet.values) {
    if (requestedSet.has(candidate.value)) {
      matched.push(candidate);
      matchedValues.add(candidate.value);
      continue;
    }
    if (!hasBounds) continue;

    const numbers = candidate.numbers;
    if (!numbers || numbers.length === 0) continue;
    const canReachMin = min === undefined || Math.max(...numbers) >= min - EPSILON;
    const canReachMax = max === undefined || Math.min(...numbers) <= max + EPSILON;
    if (canReachMin && canReachMax) {
      matched.push(candidate);
      matchedValues.add(candidate.value);
    }
  }

  return {
    attribute: facet.name,
    values: [...matchedValues],
    matched,
    predictedTotal: matched.reduce((sum, value) => sum + value.docCount, 0),
    unmatchedValues,
    appliedBounds: hasBounds ? { min, max, unit: baseUnitOf(facet) } : undefined,
  };
}
