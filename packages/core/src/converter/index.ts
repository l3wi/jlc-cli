/**
 * EasyEDA to KiCad converters
 */

export { SymbolConverter, symbolConverter, type SymbolConversionOptions } from './symbol.js';
export { FootprintConverter, footprintConverter, type FootprintConversionOptions, type FootprintResult } from './footprint.js';
export {
  ensureSymLibTable,
  ensureFpLibTable,
  getSymbolReference,
  getFootprintReference,
  libraryExistsInTable,
} from './lib-table.js';
export {
  mapToKicadFootprint,
  getKicadFootprintRef,
  isStandardPassive,
  type FootprintMapping,
} from './footprint-mapper.js';
export {
  normalizeValue,
  detectComponentType,
  extractDisplayValue,
  type ComponentType,
  type NormalizedValue,
} from './value-normalizer.js';
export {
  getLibraryCategory,
  getLibraryFilename,
  getFootprintDirName,
  get3DModelsDirName,
  getSymbolReference as getCategorySymbolReference,
  getFootprintReference as getCategoryFootprintReference,
  getAllCategories,
  parseLibraryName,
  type LibraryCategory,
} from './category-router.js';
export {
  getSymbolTemplate,
  hasFixedTemplate,
  type SymbolTemplate,
} from './symbol-templates.js';
export {
  ensureGlobalLibraryTables,
  type GlobalRegistrationResult,
} from './global-lib-table.js';
