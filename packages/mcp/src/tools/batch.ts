/**
 * Batch operations for MCP
 * Install multiple components in a single call
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getLibraryService } from '../services.js';
import { LcscIdSchema } from '../schemas.js';

export const libraryBatchInstallTool: Tool = {
  name: 'library_batch_install',
  description: `Install multiple components to KiCad libraries in a single call.

Accepts up to 10 LCSC part numbers. Components are installed in parallel.
Returns a summary of installed, skipped (already installed), and failed components.

Use this when you need to install a bill of materials or multiple components at once.`,
  inputSchema: {
    type: 'object',
    properties: {
      ids: {
        type: 'array',
        items: { type: 'string' },
        maxItems: 10,
        description: 'Array of LCSC part numbers (e.g., ["C2040", "C5446", "C14663"])',
      },
      force: {
        type: 'boolean',
        description: 'Reinstall even if already exists (default: false)',
      },
      include_3d: {
        type: 'boolean',
        description: 'Include 3D models if available (default: false)',
      },
    },
    required: ['ids'],
  },
};

export const BatchInstallParamsSchema = z.object({
  ids: z.array(LcscIdSchema).min(1).max(10),
  force: z.boolean().optional(),
  include_3d: z.boolean().optional(),
});

interface BatchResult {
  id: string;
  status: 'installed' | 'skipped' | 'failed';
  symbol_ref?: string;
  footprint_ref?: string;
  reason?: string;
  error?: string;
}

export async function handleLibraryBatchInstall(args: unknown) {
  const params = BatchInstallParamsSchema.parse(args);

  const results: BatchResult[] = [];
  let installed = 0;
  let skipped = 0;
  let failed = 0;

  // Install components in parallel (max 10)
  const installPromises = params.ids.map(async (id): Promise<BatchResult> => {
    try {
      const result = await getLibraryService().install(id, {
        include3d: params.include_3d,
        force: params.force,
      });

      // Check if it was actually installed or already existed
      if (result.symbolAction === 'exists') {
        return {
          id,
          status: 'skipped',
          symbol_ref: result.symbolRef,
          footprint_ref: result.footprintRef,
          reason: 'already installed',
        };
      }

      return {
        id,
        status: 'installed',
        symbol_ref: result.symbolRef,
        footprint_ref: result.footprintRef,
      };
    } catch (error) {
      return {
        id,
        status: 'failed',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  });

  const installResults = await Promise.all(installPromises);

  // Aggregate results
  for (const result of installResults) {
    results.push(result);
    if (result.status === 'installed') installed++;
    else if (result.status === 'skipped') skipped++;
    else failed++;
  }

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        success: failed < params.ids.length, // At least one succeeded
        summary: {
          total: params.ids.length,
          installed,
          skipped,
          failed,
        },
        results,
      }),
    }],
  };
}
