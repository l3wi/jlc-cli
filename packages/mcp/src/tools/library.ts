/**
 * Library management tools for MCP
 * Streamlined version using LibraryService from core
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { getLibraryService } from '../services.js';
import { LcscIdSchema, SafePathSchema, isLcscId } from '../schemas.js';

// Tool Definitions

export const libraryInstallTool: Tool = {
  name: 'library_install',
  description: `Install a component to KiCad libraries.

Accepts:
- LCSC part numbers (e.g., C2040) → global JLC-MCP libraries
- EasyEDA UUIDs (e.g., 8007c710c0b9406db963b55df6990340) → project-local EasyEDA library (requires project_path)

LCSC components are routed to category-based global libraries:
- JLC-MCP-Resistors.kicad_sym, JLC-MCP-Capacitors.kicad_sym, JLC-MCP-ICs.kicad_sym, etc.
- Stored at ~/Documents/KiCad/{version}/3rdparty/jlc_mcp/

Returns symbol_ref and footprint_ref for use with schematic placement.`,
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
        description: 'Include 3D model if available (default: false)',
      },
      force: {
        type: 'boolean',
        description: 'Reinstall even if already exists (default: false)',
      },
    },
    required: ['id'],
  },
};

export const libraryGetComponentTool: Tool = {
  name: 'library_get_component',
  description: `Get metadata for an installed component's symbol and footprint.

Returns symbol reference, footprint reference, file paths, and pin/pad counts.
Does NOT return full file contents to minimize token usage.

Use this to verify installation or get references for schematic placement.`,
  inputSchema: {
    type: 'object',
    properties: {
      id: {
        type: 'string',
        description: 'LCSC part number (e.g., C2040)',
      },
    },
    required: ['id'],
  },
};

// Zod Schemas

export const LibraryInstallParamsSchema = z.object({
  id: z.string().min(1),
  project_path: SafePathSchema.optional(),
  include_3d: z.boolean().optional(),
  force: z.boolean().optional(),
});

export const LibraryGetComponentParamsSchema = z.object({
  id: LcscIdSchema,
});

// Handlers

export async function handleLibraryInstall(args: unknown) {
  const params = LibraryInstallParamsSchema.parse(args);
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
    const result = await getLibraryService().install(params.id, {
      projectPath: params.project_path,
      include3d: params.include_3d,
      force: params.force,
    });

    // Compact response - essential data only
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          id: params.id,
          installed: true,
          symbol_ref: result.symbolRef,
          footprint_ref: result.footprintRef,
          category: result.category,
          files: {
            symbol_library: result.files.symbolLibrary,
            footprint: result.files.footprint,
            model_3d: result.files.model3d,
          },
          validation: result.validationData ? {
            pin_pad_match: result.validationData.pinCount === result.validationData.padCount,
            pin_count: result.validationData.pinCount,
            pad_count: result.validationData.padCount,
            has_power_pins: result.validationData.hasPowerPins,
            has_ground_pins: result.validationData.hasGroundPins,
          } : undefined,
        }),
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
        }),
      }],
      isError: true,
    };
  }
}

export async function handleLibraryGetComponent(args: unknown) {
  const params = LibraryGetComponentParamsSchema.parse(args);

  try {
    // Check if component is installed
    const status = await getLibraryService().getStatus();
    if (!status.installed) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: 'JLC-MCP libraries not installed. Run library_install first.',
            id: params.id,
          }),
        }],
        isError: true,
      };
    }

    // Get list of installed components
    const installed = await getLibraryService().listInstalled();
    const component = installed.find(c => c.lcscId === params.id);

    if (!component) {
      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: false,
            error: `Component ${params.id} is not installed`,
            id: params.id,
            hint: 'Use library_install to add this component first',
          }),
        }],
        isError: true,
      };
    }

    // Return metadata only (no file contents)
    return {
      content: [{
        type: 'text' as const,
        text: JSON.stringify({
          success: true,
          id: params.id,
          installed: true,
          symbol_ref: component.symbolRef,
          footprint_ref: component.footprintRef,
          category: component.category,
          symbol_library: component.symbolLibrary,
          name: component.name,
          description: component.description,
        }),
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
        }),
      }],
      isError: true,
    };
  }
}
