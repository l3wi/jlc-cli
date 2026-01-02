/**
 * MCP tool definitions and handlers for JLC-MCP server
 * Streamlined version with 6 consolidated tools
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';

// Import tools
import { componentSearchTool, handleComponentSearch } from './search.js';
import {
  libraryInstallTool,
  libraryGetComponentTool,
  handleLibraryInstall,
  handleLibraryGetComponent,
} from './library.js';
import {
  libraryBatchInstallTool,
  handleLibraryBatchInstall,
} from './batch.js';
import {
  updateLibraryTool,
  handleUpdateLibrary,
} from './library-update.js';
import {
  fixLibraryTool,
  handleFixLibrary,
} from './library-fix.js';

// Export all tool definitions (6 tools total)
export const tools: Tool[] = [
  componentSearchTool,       // Search LCSC or EasyEDA community
  libraryInstallTool,        // Install single component
  libraryBatchInstallTool,   // Install up to 10 components
  libraryGetComponentTool,   // Get installed component metadata
  updateLibraryTool,         // Regenerate all components
  fixLibraryTool,            // Apply pin corrections
];

// Tool handler map - derived from tool definitions to prevent name mismatches
export const toolHandlers: Record<string, (args: unknown) => Promise<{
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
}>> = {
  [componentSearchTool.name]: handleComponentSearch,
  [libraryInstallTool.name]: handleLibraryInstall,
  [libraryBatchInstallTool.name]: handleLibraryBatchInstall,
  [libraryGetComponentTool.name]: handleLibraryGetComponent,
  [updateLibraryTool.name]: handleUpdateLibrary,
  [fixLibraryTool.name]: handleFixLibrary,
};

// Re-export for direct imports
export { componentSearchTool, handleComponentSearch } from './search.js';
export {
  libraryInstallTool,
  libraryGetComponentTool,
  handleLibraryInstall,
  handleLibraryGetComponent,
} from './library.js';
export {
  libraryBatchInstallTool,
  handleLibraryBatchInstall,
} from './batch.js';
export {
  updateLibraryTool,
  handleUpdateLibrary,
} from './library-update.js';
export {
  fixLibraryTool,
  handleFixLibrary,
} from './library-fix.js';
