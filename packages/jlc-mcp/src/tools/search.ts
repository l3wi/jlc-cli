/**
 * Component search tools for MCP
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { jlcClient } from '@jlcpcb/core';

export const searchComponentsTool: Tool = {
  name: 'component_search',
  description: 'Search the JLC/JLCPCB component database by keyword. Returns components with LCSC part numbers (JLC\'s preferred supplier for assembly). Includes prices, stock levels, and whether parts are in the Basic Parts Library (lower assembly cost).',
  inputSchema: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'Search query (e.g., "ESP32", "STM32F103", "0805 100nF")',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of results (default: 10, max: 50)',
      },
      in_stock: {
        type: 'boolean',
        description: 'Only show in-stock items (default: false)',
      },
      basic_only: {
        type: 'boolean',
        description: 'Only show JLCPCB Basic Parts Library components (lower assembly cost, default: false)',
      },
    },
    required: ['query'],
  },
};

export const SearchParamsSchema = z.object({
  query: z.string().min(1),
  limit: z.number().min(1).max(50).default(10),
  in_stock: z.boolean().optional(),
  basic_only: z.boolean().optional(),
});

export async function handleSearchComponents(args: unknown) {
  const params = SearchParamsSchema.parse(args);

  const results = await jlcClient.search(params.query, {
    limit: params.limit,
    inStock: params.in_stock,
    basicOnly: params.basic_only,
  });

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(results, null, 2),
    }],
  };
}
