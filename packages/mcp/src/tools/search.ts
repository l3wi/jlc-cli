/**
 * Unified component search tool for MCP
 * Searches both LCSC (via JLCPCB API) and EasyEDA community library
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import type { ComponentSearchResult } from '@jlcpcb/core';
import { getComponentService } from '../services.js';

export const componentSearchTool: Tool = {
  name: 'component_search',
  description: `Search for electronic components by keyword.

Sources:
- "lcsc" (default): Search JLCPCB/LCSC official parts library. Returns components with LCSC IDs available for JLC assembly.
- "community": Search EasyEDA community library for user-contributed parts (Arduino modules, XIAO, custom breakouts).

Returns full component details for selection including:
- LCSC ID, manufacturer part number, manufacturer name
- Description, package, datasheet URL
- Price, stock, library type (basic/extended)
- Key attributes (resistance, voltage, etc.)`,
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (e.g., "ESP32", "STM32F103", "0805 100nF", "XIAO RP2040")',
      },
      source: {
        type: 'string',
        enum: ['lcsc', 'community'],
        description: 'Search source: "lcsc" for official parts (default), "community" for EasyEDA user-contributed',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 10, max: 50)',
      },
      in_stock: {
        type: 'boolean',
        description: 'Only show in-stock items (default: false, LCSC only)',
      },
      basic_only: {
        type: 'boolean',
        description: 'Only show JLCPCB Basic Parts Library components (lower assembly cost, LCSC only)',
      },
    },
    required: ['query'],
  },
};

export const SearchParamsSchema = z.object({
  query: z.string().min(1),
  source: z.enum(['lcsc', 'community']).default('lcsc'),
  limit: z.number().min(1).max(50).default(10),
  in_stock: z.boolean().optional(),
  basic_only: z.boolean().optional(),
});

export async function handleComponentSearch(args: unknown) {
  const params = SearchParamsSchema.parse(args);

  const results = await getComponentService().search(params.query, {
    source: params.source,
    limit: params.limit,
    inStock: params.in_stock,
    basicOnly: params.basic_only,
  });

  if (results.length === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          query: params.query,
          source: params.source,
          count: 0,
          results: [],
          hint: params.source === 'lcsc'
            ? 'Try searching with source: "community" for user-contributed parts'
            : 'Try searching with source: "lcsc" for official JLCPCB parts',
        }),
      }],
    };
  }

  // Return compact results with all selection-relevant fields
  const compactResults = results.map((r: ComponentSearchResult) => ({
    lcsc_id: r.lcscId,
    name: r.name,               // Manufacturer part number
    manufacturer: r.manufacturer,
    description: r.description,
    package: r.package,
    datasheet: r.datasheetPdf,
    stock: r.stock,
    price: r.price,
    library_type: r.libraryType,
    category: r.category,
    attributes: r.attributes,
  }));

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        success: true,
        query: params.query,
        source: params.source,
        count: results.length,
        results: compactResults,
      }),
    }],
  };
}
