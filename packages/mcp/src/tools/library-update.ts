/**
 * Library Update Tool
 * Parses existing JLC-MCP-* libraries and regenerates all components
 * with latest data, normalization, and hybrid footprint logic
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { readFile, rename, rm } from 'fs/promises';
import { randomUUID } from 'crypto';
import {
  easyedaClient,
  footprintConverter,
  getLibraryCategory,
  getLibraryFilename,
  getLibraryPaths,
  getCategoryFootprintReference,
  getAllCategories,
  type LibraryCategory,
  ensureDir,
  writeText,
} from '@jlcpcb/core';
import { join } from 'path';
import { jsonContent, toolError } from '../tool-response.js';
import { findJlcLibraries, readLibrarySymbols, regenerateInstalledSymbol, type LibrarySymbol } from './library-symbols.js';



/** Never truncate the installed library if writing the refreshed content fails. */
async function writeAtomic(path: string, content: string): Promise<void> {
  const temporaryPath = `${path}.${randomUUID()}.tmp`;
  try {
    await writeText(temporaryPath, content);
    await rename(temporaryPath, path);
  } finally {
    await rm(temporaryPath, { force: true });
  }
}

/**
 * Generate standard KiCad symbol library header
 */
function generateEmptyLibrary(): string {
  return `(kicad_symbol_lib
\t(version 20241209)
\t(generator "jlc-mcp")
\t(generator_version "9.0")
)\n`;
}


export const updateLibraryTool: Tool = {
  name: 'library_update',
  description: `Parse existing JLC-MCP-* libraries and regenerate all components with latest data.

If no JLC-MCP-* libraries exist, initializes empty library files for all categories:
- JLC-MCP-Resistors, JLC-MCP-Capacitors, JLC-MCP-Inductors, JLC-MCP-Diodes
- JLC-MCP-Transistors, JLC-MCP-ICs, JLC-MCP-Connectors, JLC-MCP-Misc

Also creates footprint directory (JLC-MCP.pretty) and 3D models directory (JLC-MCP.3dshapes).

When libraries exist, this tool:
1. Finds all JLC-MCP-*.kicad_sym files in the symbols directory
2. Extracts LCSC IDs from each symbol's properties
3. Fetches fresh data from EasyEDA for each component
4. Regenerates symbols with value normalization
5. Applies hybrid footprint logic (KiCad standard vs generated)
6. Replaces refreshed symbols in place, preserving failed and unrelated entries

Use dry_run=true to preview changes without writing files.`,
  inputSchema: {
    type: 'object',
    properties: {
      project_path: {
        type: 'string',
        description: 'Optional: Project path. If omitted, uses global KiCad library.',
      },
      dry_run: {
        type: 'boolean',
        description: 'Preview changes without writing files (default: false)',
      },
    },
  },
};

export const UpdateLibraryParamsSchema = z.object({
  project_path: z.string().min(1).optional(),
  dry_run: z.boolean().default(false),
});

interface UpdateResult {
  lcscId: string;
  category: LibraryCategory;
  symbolName: string;
  footprintType: 'reference' | 'generated';
  footprintRef: string;
  status: 'updated' | 'failed';
  error?: string;
}

export async function handleUpdateLibrary(args: unknown) {
  const params = UpdateLibraryParamsSchema.parse(args);
  const paths = getLibraryPaths(params.project_path);

  // Find all existing JLC libraries
  const libraryFiles = findJlcLibraries(paths.symbolsDir);

  if (libraryFiles.length === 0) {
    // No existing libraries - initialize empty libraries for all categories
    const allCategories = getAllCategories();

    if (params.dry_run) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            action: 'would_initialize',
            dry_run: true,
            summary: {
              categories_to_create: allCategories.length,
              directories_to_create: [
                paths.symbolsDir,
                paths.footprintDir,
                paths.models3dFullDir,
              ],
            },
            libraries_to_create: allCategories.map((cat) => ({
              category: cat,
              filename: getLibraryFilename(cat),
              path: join(paths.symbolsDir, getLibraryFilename(cat)),
            })),
          }, null, 2),
        }],
      };
    }

    // Create directories
    await ensureDir(paths.symbolsDir);
    await ensureDir(paths.footprintDir);
    await ensureDir(paths.models3dFullDir);

    // Create empty library files for all categories
    const emptyContent = generateEmptyLibrary();
    const createdLibraries: string[] = [];

    for (const category of allCategories) {
      const filename = getLibraryFilename(category);
      const filepath = join(paths.symbolsDir, filename);
      await writeText(filepath, emptyContent);
      createdLibraries.push(filepath);
    }

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          action: 'initialized',
          dry_run: false,
          summary: {
            categories_initialized: allCategories.length,
            directories_created: [
              paths.symbolsDir,
              paths.footprintDir,
              paths.models3dFullDir,
            ],
          },
          libraries_created: createdLibraries,
          next_steps: [
            'Use library_install to add components to your libraries',
            'Run library_update again after adding components to regenerate with latest data',
          ],
        }, null, 2),
      }],
    };
  }

  const symbolsById = new Map<string, LibrarySymbol[]>();
  const libraryInfo: { file: string; content: string; symbols: LibrarySymbol[] }[] = [];

  for (const file of libraryFiles) {
    const content = await readFile(file, 'utf-8');
    const symbols = readLibrarySymbols(content);
    libraryInfo.push({ file, content, symbols });
    for (const symbol of symbols) {
      if (!symbol.lcscId) continue;
      const entries = symbolsById.get(symbol.lcscId);
      if (entries) entries.push(symbol);
      else symbolsById.set(symbol.lcscId, [symbol]);
    }
  }

  if (symbolsById.size === 0) {
    return toolError('no_lcsc_ids_found', 'No LCSC IDs found in existing libraries', {
      details: { libraries_scanned: libraryFiles.length },
    });
  }

  const results: UpdateResult[] = [];
  const refreshed = new Map<LibrarySymbol, string>();

  for (const [lcscId, symbols] of symbolsById) {
    try {
      const component = await easyedaClient.getComponentData(lcscId);
      if (!component) throw new Error('Component not found');

      const category = getLibraryCategory(
        component.info.prefix,
        component.info.category,
        component.info.description
      );
      // Resolve the exact registered reference before generating any symbol.
      const footprint = footprintConverter.getFootprint(component);
      const footprintRef = footprint.type === 'reference'
        ? footprint.reference!
        : getCategoryFootprintReference(footprint.name);
      component.info.package = footprintRef;

      const replacements = new Map<LibrarySymbol, string>();
      for (const symbol of symbols) {
        replacements.set(symbol, regenerateInstalledSymbol(component, symbol));
      }
      if (!params.dry_run && footprint.type === 'generated') {
        await ensureDir(paths.footprintDir);
        await writeAtomic(join(paths.footprintDir, `${footprint.name}.kicad_mod`), footprint.content!);
      }
      for (const [symbol, entry] of replacements) refreshed.set(symbol, entry);
      results.push({
        lcscId,
        category,
        symbolName: symbols[0].name,
        footprintType: footprint.type,
        footprintRef,
        status: 'updated',
      });
    } catch (error) {
      results.push({
        lcscId,
        category: 'Misc',
        symbolName: '',
        footprintType: 'generated',
        footprintRef: '',
        status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  for (const library of libraryInfo) {
    const changedIds = new Set<string>();
    const parts: string[] = [];
    let offset = 0;
    for (const symbol of library.symbols) {
      const entry = refreshed.get(symbol);
      if (entry === undefined) continue;
      parts.push(library.content.slice(offset, symbol.start));
      parts.push(entry);
      offset = symbol.end;
      changedIds.add(symbol.lcscId!);
    }
    if (changedIds.size === 0 || params.dry_run) continue;
    parts.push(library.content.slice(offset));
    try {
      await writeAtomic(library.file, parts.join(''));
    } catch (error) {
      for (const result of results) {
        if (changedIds.has(result.lcscId)) {
          result.status = 'failed';
          result.error = `Could not write ${library.file}: ${error instanceof Error ? error.message : String(error)}`;
        }
      }
    }
  }

  // Summarize results
  const successful = results.filter((r) => r.status === 'updated');
  const failed = results.filter((r) => r.status === 'failed');
  const byCategory = new Map<LibraryCategory, number>();

  for (const r of successful) {
    byCategory.set(r.category, (byCategory.get(r.category) || 0) + 1);
  }

  const footprintStats = {
    kicad_standard: successful.filter((r) => r.footprintType === 'reference').length,
    custom_generated: successful.filter((r) => r.footprintType === 'generated').length,
  };

  return {
    content: jsonContent({
        success: failed.length === 0,
        partial_success: failed.length > 0 && successful.length > 0,
        status: failed.length === 0 ? 'success' : successful.length === 0 ? 'failed' : 'partial_success',
        dry_run: params.dry_run,
        summary: {
          total: symbolsById.size,
          updated: successful.length,
          failed: failed.length,
        },
        by_category: Object.fromEntries(byCategory),
        footprint_stats: footprintStats,
        // Only include first 5 failures to avoid massive responses
        failed_sample: failed.slice(0, 5).map((f) => ({
          lcsc_id: f.lcscId,
          error: f.error,
        })),
        has_more_failures: failed.length > 5,
    }),
    isError: successful.length === 0 && failed.length > 0 ? true : undefined,
  };
}
