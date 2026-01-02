/**
 * High-level services for jlc-core
 * Provides a clean API for common operations
 */

// Services will be implemented after core files are validated
export { createComponentService, type ComponentService, type SearchOptions, type ComponentDetails } from './component-service.js';
export { createLibraryService, type LibraryService, type InstallOptions, type InstallResult, type InstalledComponent, type ListOptions, type LibraryStatus, type RegenerateOptions, type RegenerateResult } from './library-service.js';
export { createFixService, type FixService, type FixOptions, type FixResult } from './fix-service.js';
