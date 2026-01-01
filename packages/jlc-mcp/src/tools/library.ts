/**
 * Library fetching and conversion tools for MCP
 * Uses jlc-core for all business logic
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  createLibraryService,
  createComponentService,
  easyedaClient,
  symbolConverter,
  footprintConverter,
} from 'jlc-core';

const libraryService = createLibraryService();
const componentService = createComponentService();

export const getSymbolKicadTool: Tool = {
  name: 'library_get_symbol',
  description: 'Get a KiCad-compatible symbol definition by LCSC part number. Returns the symbol in .kicad_sym format. LCSC is JLC PCB\'s preferred supplier for assembly.',
  inputSchema: {
    type: 'object',
    properties: {
      lcsc_id: {
        type: 'string',
        description: 'LCSC part number (e.g., C2040)',
      },
    },
    required: ['lcsc_id'],
  },
};

export const getFootprintKicadTool: Tool = {
  name: 'library_get_footprint',
  description: 'Get a KiCad-compatible footprint definition by LCSC part number. Returns the footprint in .kicad_mod format. LCSC is JLC PCB\'s preferred supplier for assembly.',
  inputSchema: {
    type: 'object',
    properties: {
      lcsc_id: {
        type: 'string',
        description: 'LCSC part number (e.g., C2040)',
      },
    },
    required: ['lcsc_id'],
  },
};

export const fetchLibraryTool: Tool = {
  name: 'library_fetch',
  description: `Fetch a component and add it to KiCad libraries.

Accepts:
- LCSC part numbers (e.g., C2040) → global JLC-MCP libraries
- EasyEDA UUIDs (e.g., 8007c710c0b9406db963b55df6990340) → project-local EasyEDA library (requires project_path)

LCSC components are routed to category-based global libraries:
- JLC-MCP-Resistors.kicad_sym, JLC-MCP-Capacitors.kicad_sym, JLC-MCP-ICs.kicad_sym, etc.
- Stored at ~/Documents/KiCad/{version}/3rdparty/jlc_mcp/

EasyEDA community components are stored project-locally:
- <project>/libraries/symbols/EasyEDA.kicad_sym
- <project>/libraries/footprints/EasyEDA.pretty/

Returns symbol_ref and footprint_ref for immediate use with add_schematic_component.`,
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'LCSC part number (e.g., C2040) or EasyEDA community UUID',
      },
      project_path: {
        type: 'string',
        description: 'Project path (required for EasyEDA UUIDs, optional for LCSC IDs)',
      },
      include_3d: {
        type: 'boolean',
        description: 'Include 3D model if available (default: false for LCSC, true for EasyEDA)',
      },
    },
    required: ['id'],
  },
};

export const get3DModelTool: Tool = {
  name: 'library_get_3d_model',
  description: 'Download a 3D model for a component. Requires the model UUID from component_get. Returns the model as base64-encoded STEP data.',
  inputSchema: {
    type: 'object',
    properties: {
      uuid: {
        type: 'string',
        description: '3D model UUID from component_get result',
      },
      format: {
        type: 'string',
        enum: ['step', 'obj'],
        description: 'Model format: "step" or "obj" (default: step)',
      },
    },
    required: ['uuid'],
  },
};

export const LibraryParamsSchema = z.object({
  lcsc_id: z.string().regex(/^C\d+$/, 'Invalid LCSC part number'),
});

export const FetchLibraryParamsSchema = z.object({
  id: z.string().min(1),
  project_path: z.string().min(1).optional(),
  include_3d: z.boolean().optional(),
});

export const Model3DParamsSchema = z.object({
  uuid: z.string().min(1),
  format: z.enum(['step', 'obj']).default('step'),
});

export async function handleGetSymbolKicad(args: unknown) {
  const params = LibraryParamsSchema.parse(args);

  const component = await easyedaClient.getComponentData(params.lcsc_id);

  if (!component) {
    return {
      content: [{
        type: 'text' as const,
        text: `Component ${params.lcsc_id} not found`,
      }],
      isError: true,
    };
  }

  const symbol = symbolConverter.convert(component);
  return {
    content: [{
      type: 'text' as const,
      text: symbol,
    }],
  };
}

export async function handleGetFootprintKicad(args: unknown) {
  const params = LibraryParamsSchema.parse(args);

  const component = await easyedaClient.getComponentData(params.lcsc_id);

  if (!component) {
    return {
      content: [{
        type: 'text' as const,
        text: `Component ${params.lcsc_id} not found`,
      }],
      isError: true,
    };
  }

  const footprint = footprintConverter.convert(component);
  return {
    content: [{
      type: 'text' as const,
      text: footprint,
    }],
  };
}

/**
 * Check if ID is an LCSC part number (C followed by digits)
 */
function isLcscId(id: string): boolean {
  return /^C\d+$/.test(id);
}

export async function handleFetchLibrary(args: unknown) {
  const params = FetchLibraryParamsSchema.parse(args);
  const isCommunityComponent = !isLcscId(params.id);

  // Community components require project_path
  if (isCommunityComponent && !params.project_path) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: false,
          error: 'EasyEDA community components require project_path for local storage',
          id: params.id,
          hint: 'Provide project_path to store in <project>/libraries/EasyEDA.*',
        }),
      }],
      isError: true,
    };
  }

  try {
    const result = await libraryService.install(params.id, {
      projectPath: params.project_path,
      include3d: params.include_3d,
    });

    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          id: params.id,
          source: result.source,
          storage_mode: result.storageMode,
          category: result.category,
          symbol_name: result.symbolName,
          symbol_ref: result.symbolRef,
          footprint_ref: result.footprintRef,
          footprint_type: result.footprintType,
          datasheet: result.datasheet,
          files: {
            symbol_library: result.files.symbolLibrary,
            footprint: result.files.footprint,
            model_3d: result.files.model3d,
          },
          symbol_action: result.symbolAction,
          validation_data: result.validationData,
        }, null, 2),
      }],
    };
  } catch (error) {
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
          id: params.id,
          source: isCommunityComponent ? 'easyeda_community' : 'lcsc',
        }),
      }],
      isError: true,
    };
  }
}

export async function handleGet3DModel(args: unknown) {
  const params = Model3DParamsSchema.parse(args);

  const model = await easyedaClient.get3DModel(params.uuid, params.format);

  if (!model) {
    return {
      content: [{
        type: 'text' as const,
        text: `3D model ${params.uuid} not found`,
      }],
      isError: true,
    };
  }

  return {
    content: [{
      type: 'text' as const,
      text: `3D model downloaded (${model.length} bytes, ${params.format.toUpperCase()} format)\n\nBase64 data:\n${model.toString('base64').slice(0, 500)}...`,
    }],
  };
}
