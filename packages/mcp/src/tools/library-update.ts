/**
 * Library Update Tool
 * Parses existing JLC-MCP-* libraries and regenerates all components
 * with latest data, normalization, and hybrid footprint logic
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { existsSync, readdirSync } from 'fs';
import { readFile } from 'fs/promises';
import { homedir, platform } from 'os';
import {
  easyedaClient,
  symbolConverter,
  footprintConverter,
  getLibraryCategory,
  getLibraryFilename,
  getFootprintDirName,
  get3DModelsDirName,
  getAllCategories,
  type LibraryCategory,
  ensureDir,
  writeText,
  detectKicadVersion,
} from '@jlcpcb/core';
import { join } from 'path';

// 3rd party library namespace
const LIBRARY_NAMESPACE = 'jlc_mcp';

/**
 * Get library paths for update operation
 * Platform-specific paths matching where ${KICAD9_3RD_PARTY} resolves:
 * - macOS/Windows: ~/Documents/KiCad/{version}/3rdparty/jlc_mcp/
 * - Linux: ~/.local/share/kicad/{version}/3rdparty/jlc_mcp/
 */
function getLibraryPaths(projectPath?: string): {
  symbolsDir: string;
  footprintDir: string;
  models3dDir: string;
} {
  if (projectPath) {
    const librariesDir = join(projectPath, 'libraries');
    return {
      symbolsDir: join(librariesDir, 'symbols'),
      footprintDir: join(librariesDir, 'footprints', getFootprintDirName()),
      models3dDir: join(librariesDir, '3dmodels', get3DModelsDirName()),
    };
  }

  const home = homedir();
  const version = detectKicadVersion();
  const plat = platform();

  let base: string;
  if (plat === 'linux') {
    base = join(home, '.local', 'share', 'kicad', version, '3rdparty', LIBRARY_NAMESPACE);
  } else {
    base = join(home, 'Documents', 'KiCad', version, '3rdparty', LIBRARY_NAMESPACE);
  }

  return {
    symbolsDir: join(base, 'symbols'),
    footprintDir: join(base, 'footprints', getFootprintDirName()),
    models3dDir: join(base, '3dmodels', get3DModelsDirName()),
  };
}

/**
 * Extract LCSC IDs from a symbol library file
 */
function extractLcscIdsFromLibrary(content: string): string[] {
  const pattern = /\(property\s+"LCSC"\s+"(C\d+)"/g;
  const ids: string[] = [];
  let match;
  while ((match = pattern.exec(content)) !== null) {
    ids.push(match[1]);
  }
  return ids;
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

/**
 * Find all JLC-MCP-*.kicad_sym files in a directory
 */
function findJlcLibraries(symbolsDir: string): string[] {
  if (!existsSync(symbolsDir)) {
    return [];
  }

  try {
    const files = readdirSync(symbolsDir);
    return files
      .filter((f) => f.startsWith('JLC-MCP-') && f.endsWith('.kicad_sym'))
      .map((f) => join(symbolsDir, f));
  } catch {
    return [];
  }
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
6. Rebuilds category-based libraries

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
                paths.models3dDir,
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
    await ensureDir(paths.models3dDir);

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
              paths.models3dDir,
            ],
          },
          libraries_created: createdLibraries,
          next_steps: [
            'Use library_fetch to add components to your libraries',
            'Run library_update again after adding components to regenerate with latest data',
          ],
        }, null, 2),
      }],
    };
  }

  // Extract all LCSC IDs from existing libraries
  const allLcscIds: Set<string> = new Set();
  const libraryInfo: { file: string; ids: string[] }[] = [];

  for (const file of libraryFiles) {
    const content = await readFile(file, 'utf-8');
    const ids = extractLcscIdsFromLibrary(content);
    libraryInfo.push({ file, ids });
    ids.forEach((id) => allLcscIds.add(id));
  }

  if (allLcscIds.size === 0) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: false,
          error: 'No LCSC IDs found in existing libraries',
          libraries_scanned: libraryFiles.length,
        }),
      }],
      isError: true,
    };
  }

  // Process each component
  const results: UpdateResult[] = [];
  const categorySymbols: Map<LibraryCategory, string[]> = new Map();

  for (const lcscId of allLcscIds) {
    try {
      // Fetch fresh component data
      const component = await easyedaClient.getComponentData(lcscId);

      if (!component) {
        results.push({
          lcscId,
          category: 'Misc',
          symbolName: '',
          footprintType: 'generated',
          footprintRef: '',
          status: 'failed',
          error: 'Component not found',
        });
        continue;
      }

      // Determine category
      const category = getLibraryCategory(
        component.info.prefix,
        component.info.category,
        component.info.description
      );

      // Generate symbol entry (without library wrapper)
      const symbolEntry = symbolConverter.convertToSymbolEntry(component);
      const symbolName = symbolConverter.getSymbolName(component);

      // Collect symbols by category
      if (!categorySymbols.has(category)) {
        categorySymbols.set(category, []);
      }
      categorySymbols.get(category)!.push(symbolEntry);

      // Handle footprint
      const footprintResult = footprintConverter.getFootprint(component);

      // Generate custom footprint if needed (not in dry run)
      if (!params.dry_run && footprintResult.type === 'generated') {
        await ensureDir(paths.footprintDir);
        const footprintName = footprintResult.name + '_' + lcscId;
        const footprintPath = join(paths.footprintDir, `${footprintName}.kicad_mod`);
        await writeText(footprintPath, footprintResult.content!);
      }

      results.push({
        lcscId,
        category,
        symbolName,
        footprintType: footprintResult.type,
        footprintRef: footprintResult.type === 'reference'
          ? footprintResult.reference!
          : `JLC:${footprintResult.name}_${lcscId}`,
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

  // Write category-based libraries (not in dry run)
  if (!params.dry_run) {
    await ensureDir(paths.symbolsDir);

    for (const [category, entries] of categorySymbols) {
      const filename = getLibraryFilename(category);
      const filepath = join(paths.symbolsDir, filename);

      // Create library file with all symbols
      const header = `(kicad_symbol_lib
\t(version 20241209)
\t(generator "jlc-mcp")
\t(generator_version "9.0")
`;
      const content = header + entries.join('') + ')\n';
      await writeText(filepath, content);
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

  // Compact response - summary only, no detailed failures
  // (failures can be retrieved separately if needed)
  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        success: true,
        dry_run: params.dry_run,
        summary: {
          total: allLcscIds.size,
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
    }],
  };
}
