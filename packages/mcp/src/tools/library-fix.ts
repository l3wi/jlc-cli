/**
 * Library Fix Tool
 * Regenerates a symbol with corrections applied (pin renames, swaps, type changes, additions)
 * Follows CDFER approach: regenerate, don't patch
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { readFile } from 'fs/promises';
import {
  easyedaClient,
  symbolConverter,
  footprintConverter,
  getLibraryCategory,
  getLibraryFilename,
  parseLibraryName,
  getLibraryPaths,
  getCategoryFootprintReference,
  ensureDir,
  writeText,
  type EasyEDAPin,
} from '@jlcpcb/core';
import { basename, join } from 'path';
import { toolError } from '../tool-response.js';
import { findJlcLibraries, readLibrarySymbols, regenerateInstalledSymbol, type LibrarySymbol } from './library-symbols.js';


// Pin electrical types enum for validation
const PinElectricalType = z.enum([
  'input',
  'output',
  'bidirectional',
  'power_in',
  'power_out',
  'passive',
  'open_collector',
  'open_emitter',
  'unconnected',
  'unspecified',
]);

// Correction types for pins
const PinCorrectionSchema = z.discriminatedUnion('action', [
  // Modify existing pin
  z.object({
    action: z.literal('modify'),
    number: z.string(),
    rename: z.string().optional(),
    set_type: PinElectricalType.optional(),
  }),
  // Swap two pins
  z.object({
    action: z.literal('swap'),
    pins: z.tuple([z.string(), z.string()]),
  }),
  // Add new pin
  z.object({
    action: z.literal('add'),
    number: z.string(),
    name: z.string(),
    type: PinElectricalType,
  }),
  // Remove pin
  z.object({
    action: z.literal('remove'),
    number: z.string(),
  }),
]);

export const LibraryFixParamsSchema = z.object({
  lcsc_id: z.string().regex(/^C\d+$/, 'Invalid LCSC part number'),
  corrections: z.object({
    pins: z.array(PinCorrectionSchema).optional(),
  }),
  force: z.boolean().default(false),
  project_path: z.string().min(1).optional(),
});

export const fixLibraryTool: Tool = {
  name: 'library_fix',
  description: `Regenerate a symbol with corrections applied.

Corrections are applied to fresh data fetched from EasyEDA, then the symbol is regenerated.
Use this tool when Claude detects issues with a symbol (pin names, types, missing pins, etc.).

IMPORTANT: The symbol must already exist in the library. Use library_install first to add new components.

Correction types:
- modify: Rename pin or change electrical type
- swap: Swap positions of two pins
- add: Add a new pin (useful for exposed pads not in symbol)
- remove: Remove a pin from symbol

Example: Add an exposed pad to ground
{
  "lcsc_id": "C2913199",
  "corrections": {
    "pins": [
      { "action": "add", "number": "EP", "name": "GND", "type": "passive" }
    ]
  }
}

Example: Fix pin types
{
  "lcsc_id": "C123456",
  "corrections": {
    "pins": [
      { "action": "modify", "number": "1", "set_type": "power_in" },
      { "action": "modify", "number": "2", "rename": "VDD", "set_type": "power_in" }
    ]
  }
}`,
  inputSchema: {
    type: 'object',
    properties: {
      lcsc_id: {
        type: 'string',
        description: 'LCSC part number (e.g., C2040)',
      },
      corrections: {
        type: 'object',
        description: 'Corrections to apply to the symbol',
        properties: {
          pins: {
            type: 'array',
            description: 'Pin corrections to apply',
            items: {
              oneOf: [
                {
                  type: 'object',
                  properties: {
                    action: { type: 'string', const: 'modify' },
                    number: { type: 'string' },
                    rename: { type: 'string' },
                    set_type: { type: 'string', enum: ['input', 'output', 'bidirectional', 'power_in', 'power_out', 'passive', 'open_collector', 'open_emitter', 'unconnected', 'unspecified'] },
                  },
                  required: ['action', 'number'],
                },
                {
                  type: 'object',
                  properties: {
                    action: { type: 'string', const: 'swap' },
                    pins: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
                  },
                  required: ['action', 'pins'],
                },
                {
                  type: 'object',
                  properties: {
                    action: { type: 'string', const: 'add' },
                    number: { type: 'string' },
                    name: { type: 'string' },
                    type: { type: 'string', enum: ['input', 'output', 'bidirectional', 'power_in', 'power_out', 'passive', 'open_collector', 'open_emitter', 'unconnected', 'unspecified'] },
                  },
                  required: ['action', 'number', 'name', 'type'],
                },
                {
                  type: 'object',
                  properties: {
                    action: { type: 'string', const: 'remove' },
                    number: { type: 'string' },
                  },
                  required: ['action', 'number'],
                },
              ],
            },
          },
        },
      },
      force: {
        type: 'boolean',
        description: 'Force regeneration even if symbol does not exist (default: false)',
      },
      project_path: {
        type: 'string',
        description: 'Optional: Project path. If omitted, uses global KiCad library.',
      },
    },
    required: ['lcsc_id', 'corrections'],
  },
};

export async function handleFixLibrary(args: unknown) {
  const params = LibraryFixParamsSchema.parse(args);
  const paths = getLibraryPaths(params.project_path);

  // 1. Re-fetch component from EasyEDA
  const component = await easyedaClient.getComponentData(params.lcsc_id);

  if (!component) {
    return toolError('component_not_found', `Component ${params.lcsc_id} not found`, {
      details: { lcsc_id: params.lcsc_id },
    });
  }

  // Installed identity, not mutable upstream naming/category, determines the target.
  const libraries = new Map<string, { content: string; symbols: LibrarySymbol[] }>();
  let installed: { file: string; symbol: LibrarySymbol } | undefined;
  for (const file of findJlcLibraries(paths.symbolsDir)) {
    const content = await readFile(file, 'utf-8');
    const symbols = readLibrarySymbols(content);
    libraries.set(file, { content, symbols });
    if (!installed) {
      const symbol = symbols.find(entry => entry.lcscId === params.lcsc_id);
      if (symbol) installed = { file, symbol };
    }
  }
  const upstreamCategory = getLibraryCategory(
    component.info.prefix,
    component.info.category,
    component.info.description
  );
  const category = installed
    ? parseLibraryName(basename(installed.file, '.kicad_sym')) ?? upstreamCategory
    : upstreamCategory;
  const symbolFile = installed?.file ?? join(paths.symbolsDir, getLibraryFilename(category));
  if (!installed && !params.force) {
    return toolError(libraries.has(symbolFile) ? 'symbol_missing' : 'symbol_library_missing',
      `Component ${params.lcsc_id} is not installed in the selected libraries. Use library_install first, or set force=true.`, {
        details: { lcsc_id: params.lcsc_id, expected_library: symbolFile },
      });
  }
  const targetLibrary = libraries.get(symbolFile);
  if (!installed && targetLibrary?.symbols.some(symbol => symbol.name === symbolConverter.getSymbolName(component))) {
    return toolError('symbol_name_conflict', 'Another installed component already uses the upstream symbol name.', {
      details: { lcsc_id: params.lcsc_id, symbol_name: symbolConverter.getSymbolName(component), symbol_library: symbolFile },
    });
  }

  // 2. Apply corrections to component.symbol.pins
  const appliedCorrections: string[] = [];

  if (params.corrections.pins) {
    for (const correction of params.corrections.pins) {
      switch (correction.action) {
        case 'modify': {
          const pin = component.symbol.pins.find(p => p.number === correction.number);
          if (pin) {
            if (correction.rename) {
              appliedCorrections.push(`Renamed pin ${correction.number}: "${pin.name}" → "${correction.rename}"`);
              pin.name = correction.rename;
            }
            if (correction.set_type) {
              appliedCorrections.push(`Changed pin ${correction.number} type: "${pin.electricalType}" → "${correction.set_type}"`);
              pin.electricalType = correction.set_type;
            }
          } else {
            appliedCorrections.push(`Warning: Pin ${correction.number} not found for modify`);
          }
          break;
        }
        case 'swap': {
          const [a, b] = correction.pins;
          const pinA = component.symbol.pins.find(p => p.number === a);
          const pinB = component.symbol.pins.find(p => p.number === b);
          if (pinA && pinB) {
            // Swap positions
            [pinA.x, pinA.y, pinB.x, pinB.y] = [pinB.x, pinB.y, pinA.x, pinA.y];
            appliedCorrections.push(`Swapped pin positions: ${a} ↔ ${b}`);
          } else {
            appliedCorrections.push(`Warning: Could not swap pins ${a} and ${b} - one or both not found`);
          }
          break;
        }
        case 'add': {
          // Find a position for the new pin (at the bottom of the symbol)
          const maxY = Math.max(...component.symbol.pins.map(p => p.y), 0);
          const newPin: EasyEDAPin = {
            number: correction.number,
            name: correction.name,
            electricalType: correction.type,
            x: 0,
            y: maxY + 254, // 1 grid unit below lowest pin (254 = 100mil in EasyEDA units)
            rotation: 0,
            hasDot: false,
            hasClock: false,
            pinLength: 100, // default EasyEDA units
          };
          component.symbol.pins.push(newPin);
          appliedCorrections.push(`Added pin ${correction.number}: "${correction.name}" (${correction.type})`);
          break;
        }
        case 'remove': {
          const pinIndex = component.symbol.pins.findIndex(p => p.number === correction.number);
          if (pinIndex >= 0) {
            const removed = component.symbol.pins.splice(pinIndex, 1)[0];
            appliedCorrections.push(`Removed pin ${correction.number}: "${removed.name}"`);
          } else {
            appliedCorrections.push(`Warning: Pin ${correction.number} not found for remove`);
          }
          break;
        }
      }
    }
  }

  // Update footprint reference
  const footprintResult = footprintConverter.getFootprint(component);
  let footprintRef: string;

  if (footprintResult.type === 'reference') {
    footprintRef = footprintResult.reference!;
  } else {
    const footprintName = footprintResult.name;
    footprintRef = getCategoryFootprintReference(footprintName);

    // Write custom footprint if needed
    await ensureDir(paths.footprintDir);
    const footprintPath = join(paths.footprintDir, `${footprintName}.kicad_mod`);
    await writeText(footprintPath, footprintResult.content!);
  }

  component.info.package = footprintRef;

  // 3. Regenerate symbol with corrections
  await ensureDir(paths.symbolsDir);

  const symbolAction = installed ? 'replaced' : 'created';
  const symbolName = installed?.symbol.name ?? symbolConverter.getSymbolName(component);
  if (installed) {
    // Refresh every existing copy by ID, retaining each file and exact top-level name.
    for (const [file, library] of libraries) {
      const matches = library.symbols.filter(symbol => symbol.lcscId === params.lcsc_id);
      if (matches.length === 0) continue;
      const parts: string[] = [];
      let offset = 0;
      for (const symbol of matches) {
        parts.push(library.content.slice(offset, symbol.start), regenerateInstalledSymbol(component, symbol));
        offset = symbol.end;
      }
      parts.push(library.content.slice(offset));
      await writeText(file, parts.join(''));
    }
  } else {
    const symbolContent = targetLibrary
      ? symbolConverter.appendToLibrary(targetLibrary.content, component)
      : symbolConverter.convert(component);
    await writeText(symbolFile, symbolContent);
  }

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify({
        success: true,
        lcsc_id: params.lcsc_id,
        symbol_name: symbolName,
        category,
        symbol_action: symbolAction,
        corrections_applied: appliedCorrections.length,
        corrections: appliedCorrections,
        files: {
          symbol_library: symbolFile,
        },
      }, null, 2),
    }],
  };
}
