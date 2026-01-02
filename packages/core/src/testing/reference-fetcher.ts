/**
 * Fetch reference SVGs from JLCPCB/EasyEDA API
 *
 * API Endpoint: https://easyeda.com/api/products/{LCSC_CODE}/svgs
 *
 * Returns pre-rendered SVGs for both symbol (docType: 2) and footprint (docType: 4)
 */

import type { ReferenceSVG } from './types.js';

// EasyEDA uses 10mil units (0.254mm per unit)
const EE_TO_MM = 10 * 0.0254; // = 0.254

interface EasyEDASvgResponse {
  success: boolean;
  code: number;
  result: Array<{
    component_uuid: string;
    updateTime: number;
    svg: string;
    docType: number; // 2 = symbol, 4 = footprint
    bbox?: {
      x: number;
      y: number;
      width: number;
      height: number;
    };
  }>;
}

/**
 * Fetch reference SVG from JLCPCB/EasyEDA API
 *
 * @param lcscCode - LCSC part number (e.g., 'C22467599')
 * @returns Reference SVG data including symbol and footprint
 */
export async function fetchReferenceSVG(lcscCode: string): Promise<ReferenceSVG> {
  // Normalize LCSC code (remove 'C' prefix if present, then add it back)
  const normalizedCode = lcscCode.replace(/^C/i, '');
  const fullCode = `C${normalizedCode}`;

  const url = `https://easyeda.com/api/products/${fullCode}/svgs`;

  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'jlc-cli/1.0',
    },
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch SVG for ${fullCode}: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as EasyEDASvgResponse;

  if (!data.success || !data.result) {
    throw new Error(`API error for ${fullCode}: ${JSON.stringify(data)}`);
  }

  // Find symbol (docType: 2) and footprint (docType: 4)
  const symbol = data.result.find((r) => r.docType === 2);
  const footprint = data.result.find((r) => r.docType === 4);

  return {
    lcscCode: fullCode,
    symbolSvg: symbol?.svg || null,
    footprintSvg: footprint?.svg || null,
    componentUuid: footprint?.component_uuid || symbol?.component_uuid || null,
    bbox: footprint?.bbox || symbol?.bbox,
  };
}

/**
 * Fetch multiple reference SVGs in parallel
 *
 * @param lcscCodes - Array of LCSC part numbers
 * @param concurrency - Max parallel requests (default: 5)
 * @returns Map of LCSC code to reference SVG
 */
export async function fetchReferenceSVGs(
  lcscCodes: string[],
  concurrency = 5
): Promise<Map<string, ReferenceSVG | Error>> {
  const results = new Map<string, ReferenceSVG | Error>();

  // Process in batches
  for (let i = 0; i < lcscCodes.length; i += concurrency) {
    const batch = lcscCodes.slice(i, i + concurrency);
    const batchResults = await Promise.allSettled(batch.map((code) => fetchReferenceSVG(code)));

    for (let j = 0; j < batch.length; j++) {
      const code = batch[j];
      const result = batchResults[j];
      if (result.status === 'fulfilled') {
        results.set(code, result.value);
      } else {
        results.set(code, new Error(result.reason?.message || 'Unknown error'));
      }
    }
  }

  return results;
}

/**
 * Convert EasyEDA coordinates to mm
 * EasyEDA uses 10mil units (0.254mm per unit)
 */
export function eeToMm(value: number): number {
  return value * EE_TO_MM;
}

/**
 * Extract viewBox dimensions from SVG string
 */
export function extractViewBox(svg: string): { x: number; y: number; width: number; height: number } | null {
  const match = svg.match(/viewBox="([^"]+)"/);
  if (!match) return null;

  const parts = match[1].split(/\s+/).map(parseFloat);
  if (parts.length !== 4) return null;

  return {
    x: parts[0],
    y: parts[1],
    width: parts[2],
    height: parts[3],
  };
}

/**
 * Check if a component has a footprint available
 */
export async function hasFootprint(lcscCode: string): Promise<boolean> {
  try {
    const ref = await fetchReferenceSVG(lcscCode);
    return ref.footprintSvg !== null;
  } catch {
    return false;
  }
}

/**
 * Check if a component has a symbol available
 */
export async function hasSymbol(lcscCode: string): Promise<boolean> {
  try {
    const ref = await fetchReferenceSVG(lcscCode);
    return ref.symbolSvg !== null;
  } catch {
    return false;
  }
}
