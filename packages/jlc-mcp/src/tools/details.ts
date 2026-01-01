/**
 * Component details tools for MCP
 */

import { z } from 'zod';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { easyedaClient } from '@jlcpcb/core';

export const getComponentTool: Tool = {
  name: 'component_get',
  description: 'Get detailed component information by LCSC part number (e.g., C2040). LCSC is JLC PCB\'s preferred supplier - components with LCSC IDs are available for JLC assembly. Returns symbol pins, footprint pads, manufacturer info, datasheet URL, and 3D model reference.',
  inputSchema: {
    type: 'object',
    properties: {
      lcsc_id: {
        type: 'string',
        description: 'LCSC part number (e.g., C2040, C14663)',
      },
    },
    required: ['lcsc_id'],
  },
};

export const GetComponentParamsSchema = z.object({
  lcsc_id: z.string().regex(/^C\d+$/, 'Invalid LCSC part number'),
});

export async function handleGetComponent(args: unknown) {
  const params = GetComponentParamsSchema.parse(args);

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

  // Return a clean summary
  const summary = {
    info: component.info,
    symbol: {
      pin_count: component.symbol.pins.length,
      pins: component.symbol.pins,
    },
    footprint: {
      name: component.footprint.name,
      type: component.footprint.type,
      pad_count: component.footprint.pads.length,
      pads: component.footprint.pads,
    },
    has_3d_model: !!component.model3d,
    model_3d_uuid: component.model3d?.uuid,
  };

  return {
    content: [{
      type: 'text' as const,
      text: JSON.stringify(summary, null, 2),
    }],
  };
}
