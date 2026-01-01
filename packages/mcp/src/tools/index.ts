/**
 * MCP tool definitions and handlers for LCSC MCP server
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// Import LCSC tools
import { searchComponentsTool, handleSearchComponents } from './search.js';
import { getComponentTool, handleGetComponent } from './details.js';
import {
  getSymbolKicadTool,
  getFootprintKicadTool,
  fetchLibraryTool,
  get3DModelTool,
  handleGetSymbolKicad,
  handleGetFootprintKicad,
  handleFetchLibrary,
  handleGet3DModel,
} from './library.js';
import {
  updateLibraryTool,
  handleUpdateLibrary,
} from './library-update.js';
import {
  fixLibraryTool,
  handleFixLibrary,
} from './library-fix.js';

// Import EasyEDA community tools
import {
  easyedaSearchTool,
  easyedaGet3DModelTool,
  handleEasyedaSearch,
  handleEasyedaGet3DModel,
} from './easyeda.js';

// Export all tool definitions
export const tools: Tool[] = [
  // LCSC/JLCPCB official library
  searchComponentsTool,
  getComponentTool,
  getSymbolKicadTool,
  getFootprintKicadTool,
  fetchLibraryTool,
  updateLibraryTool,
  fixLibraryTool,
  get3DModelTool,
  // EasyEDA community library
  easyedaSearchTool,
  easyedaGet3DModelTool,
];

// Tool handler map
export const toolHandlers: Record<string, (args: unknown) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}>> = {
  // LCSC/JLCPCB official library
  component_search: handleSearchComponents,
  component_get: handleGetComponent,
  library_get_symbol: handleGetSymbolKicad,
  library_get_footprint: handleGetFootprintKicad,
  library_fetch: handleFetchLibrary,
  library_update: handleUpdateLibrary,
  library_fix: handleFixLibrary,
  library_get_3d_model: handleGet3DModel,
  // EasyEDA community library
  easyeda_search: handleEasyedaSearch,
  easyeda_get_3d_model: handleEasyedaGet3DModel,
};

// Re-export individual tools
export { searchComponentsTool, handleSearchComponents } from './search.js';
export { getComponentTool, handleGetComponent } from './details.js';
export {
  getSymbolKicadTool,
  getFootprintKicadTool,
  fetchLibraryTool,
  get3DModelTool,
  handleGetSymbolKicad,
  handleGetFootprintKicad,
  handleFetchLibrary,
  handleGet3DModel,
} from './library.js';
export {
  updateLibraryTool,
  handleUpdateLibrary,
} from './library-update.js';
export {
  fixLibraryTool,
  handleFixLibrary,
} from './library-fix.js';
export {
  easyedaSearchTool,
  easyedaGet3DModelTool,
  handleEasyedaSearch,
  handleEasyedaGet3DModel,
} from './easyeda.js';
