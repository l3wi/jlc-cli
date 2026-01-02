/**
 * Shared service instances for MCP tools
 * Provides singleton access to core services to avoid multiple instantiations
 */

import {
  createComponentService,
  createLibraryService,
  type ComponentService,
  type LibraryService,
} from '@jlcpcb/core';

let componentService: ComponentService | null = null;
let libraryService: LibraryService | null = null;

/**
 * Get the shared ComponentService instance
 */
export function getComponentService(): ComponentService {
  if (!componentService) {
    componentService = createComponentService();
  }
  return componentService;
}

/**
 * Get the shared LibraryService instance
 */
export function getLibraryService(): LibraryService {
  if (!libraryService) {
    libraryService = createLibraryService();
  }
  return libraryService;
}
