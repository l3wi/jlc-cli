/**
 * Library Service
 * High-level API for installing components to KiCad libraries
 */

import { existsSync } from 'fs';
import { readFile, readdir } from 'fs/promises';
import { homedir, platform } from 'os';
import { join, basename } from 'path';

import type { EasyEDAComponentData, EasyEDACommunityComponent } from '../types/index.js';
import type { LibraryCategory } from '../converter/category-router.js';
import { ensureDir, writeText, writeBinary, detectKicadVersion } from '../utils/index.js';
import { easyedaClient } from '../api/easyeda.js';
import { easyedaCommunityClient } from '../api/easyeda-community.js';
import { jlcClient } from '../api/jlc.js';
import { symbolConverter } from '../converter/symbol.js';
import { footprintConverter } from '../converter/footprint.js';
import {
  ensureSymLibTable,
  ensureFpLibTable,
} from '../converter/lib-table.js';
import {
  getLibraryCategory,
  getLibraryFilename,
  getFootprintDirName,
  get3DModelsDirName,
  getSymbolReference,
  getFootprintReference,
  getAllCategories,
} from '../converter/category-router.js';

// Library naming
const FOOTPRINT_LIBRARY_NAME = getFootprintDirName();
const MODELS_3D_NAME = get3DModelsDirName();
const LIBRARY_NAMESPACE = 'jlc_mcp';

// EasyEDA community library naming (global)
const EASYEDA_LIBRARY_NAME = 'EasyEDA';
const EASYEDA_SYMBOL_LIBRARY_NAME = 'EasyEDA.kicad_sym';
const EASYEDA_FOOTPRINT_LIBRARY_NAME = 'EasyEDA.pretty';
const EASYEDA_LIBRARY_DESCRIPTION = 'EasyEDA Community Component Library';

// EasyEDA community library naming (project-local) - different name to avoid collision
const EASYEDA_LOCAL_LIBRARY_NAME = 'EasyEDA-local';
const EASYEDA_LOCAL_SYMBOL_LIBRARY_NAME = 'EasyEDA-local.kicad_sym';
const EASYEDA_LOCAL_FOOTPRINT_LIBRARY_NAME = 'EasyEDA-local.pretty';
const EASYEDA_LOCAL_LIBRARY_DESCRIPTION = 'EasyEDA Community Component Library (Project-local)';

export interface InstallOptions {
  projectPath?: string;
  include3d?: boolean;
  force?: boolean;
}

export interface InstallResult {
  success: boolean;
  id: string;
  source: 'lcsc' | 'easyeda_community';
  storageMode: 'global' | 'project-local';
  category?: string;
  symbolName: string;
  symbolRef: string;
  footprintRef: string;
  footprintType: 'reference' | 'generated';
  datasheet?: string;
  files: {
    symbolLibrary: string;
    footprint?: string;
    model3d?: string;
  };
  symbolAction: 'created' | 'appended' | 'exists' | 'replaced';
  validationData: ValidationData;
}

export interface ValidationData {
  component: {
    name: string;
    description?: string;
    package?: string;
    manufacturer?: string;
    datasheet_url?: string;
  };
  symbol: {
    pin_count: number;
    pins: Array<{ number: string; name: string; electrical_type?: string }>;
  };
  footprint: {
    type: string;
    pad_count: number;
    pads?: Array<{ number: string; shape: string }> | null;
    is_kicad_standard: boolean;
    kicad_ref: string;
  };
  checks: {
    pin_pad_count_match: boolean;
    has_power_pins: boolean;
    has_ground_pins: boolean;
  };
}

export interface InstalledComponent {
  lcscId: string;
  name: string;
  category: LibraryCategory;
  symbolRef: string;
  footprintRef: string;
  library: string;
  has3dModel: boolean;
}

export interface LibraryStatus {
  installed: boolean;
  linked: boolean;
  version: string;
  componentCount: number;
  paths: {
    symbolsDir: string;
    footprintsDir: string;
    models3dDir: string;
    symLibTable: string;
    fpLibTable: string;
  };
}

export interface ListOptions {
  category?: LibraryCategory;
  projectPath?: string;
}

export interface UpdateOptions {
  category?: LibraryCategory;
  projectPath?: string;
  dryRun?: boolean;
}

export interface UpdateResult {
  updated: number;
  failed: number;
  skipped: number;
  components: Array<{ id: string; status: 'updated' | 'failed' | 'skipped'; error?: string }>;
}

export interface RegenerateOptions {
  projectPath?: string;
  include3d?: boolean;
  onProgress?: (current: number, total: number, component: InstalledComponent, status: 'start' | 'success' | 'error', error?: string) => void;
}

export interface RegenerateResult {
  total: number;
  success: number;
  failed: number;
  components: Array<{ id: string; name: string; status: 'success' | 'failed'; error?: string }>;
}

export interface LibraryService {
  install(id: string, options?: InstallOptions): Promise<InstallResult>;
  listInstalled(options?: ListOptions): Promise<InstalledComponent[]>;
  update(options?: UpdateOptions): Promise<UpdateResult>;
  regenerate(options?: RegenerateOptions): Promise<RegenerateResult>;
  ensureGlobalTables(): Promise<void>;
  getStatus(): Promise<LibraryStatus>;
  isEasyEDAInstalled(componentName: string): Promise<boolean>;
}

interface LibraryPaths {
  base: string;
  symbolsDir: string;
  footprintsDir: string;
  models3dDir: string;
  footprintDir: string;
  models3dFullDir: string;
}

function getGlobalLibraryPaths(): LibraryPaths {
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
    base,
    symbolsDir: join(base, 'symbols'),
    footprintsDir: join(base, 'footprints'),
    models3dDir: join(base, '3dmodels'),
    footprintDir: join(base, 'footprints', FOOTPRINT_LIBRARY_NAME),
    models3dFullDir: join(base, '3dmodels', MODELS_3D_NAME),
  };
}

function getProjectLibraryPaths(projectPath: string): LibraryPaths {
  const librariesDir = join(projectPath, 'libraries');

  return {
    base: librariesDir,
    symbolsDir: join(librariesDir, 'symbols'),
    footprintsDir: join(librariesDir, 'footprints'),
    models3dDir: join(librariesDir, '3dmodels'),
    footprintDir: join(librariesDir, 'footprints', FOOTPRINT_LIBRARY_NAME),
    models3dFullDir: join(librariesDir, '3dmodels', MODELS_3D_NAME),
  };
}

function isLcscId(id: string): boolean {
  return /^C\d+$/.test(id);
}

function getKicadConfigDir(version: string): string {
  const home = homedir();
  const plat = platform();

  if (plat === 'darwin') {
    return join(home, 'Library', 'Preferences', 'kicad', version);
  } else if (plat === 'win32') {
    return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'kicad', version);
  } else {
    return join(home, '.config', 'kicad', version);
  }
}

// Parse .kicad_sym file to extract installed components
async function parseSymbolLibrary(
  filePath: string,
  libraryName: string,
  category: LibraryCategory,
  models3dDir: string
): Promise<InstalledComponent[]> {
  const components: InstalledComponent[] = [];

  try {
    const content = await readFile(filePath, 'utf-8');

    // Match symbol definitions: (symbol "JLC-MCP-Resistors:R_100k" ...)
    const symbolPattern = /\(symbol\s+"([^"]+)"\s+/g;
    const lcscPattern = /\(property\s+"LCSC"\s+"(C\d+)"/g;
    const footprintPattern = /\(property\s+"Footprint"\s+"([^"]+)"/g;

    // Split by symbol definitions to process each
    const symbols = content.split(/(?=\(symbol\s+"[^"]+"\s+\()/);

    for (const symbolBlock of symbols) {
      // Skip header block
      if (!symbolBlock.includes('(symbol "')) continue;

      // Extract symbol name
      const symbolMatch = symbolBlock.match(/\(symbol\s+"([^"]+)"/);
      if (!symbolMatch) continue;

      const fullSymbolRef = symbolMatch[1];
      // Skip if this is a subsymbol (contains _1_1, _0_1, etc.)
      if (fullSymbolRef.includes('_') && /_(0|1)_(0|1)$/.test(fullSymbolRef)) continue;

      // Extract LCSC ID
      const lcscMatch = symbolBlock.match(/\(property\s+"LCSC"\s+"(C\d+)"/);
      const lcscId = lcscMatch ? lcscMatch[1] : '';

      // Extract name from symbol ref (after the colon)
      const nameParts = fullSymbolRef.split(':');
      const name = nameParts.length > 1 ? nameParts[1] : fullSymbolRef;

      // Extract footprint reference
      const fpMatch = symbolBlock.match(/\(property\s+"Footprint"\s+"([^"]+)"/);
      const footprintRef = fpMatch ? fpMatch[1] : '';

      // Check for 3D model
      const model3dPath = join(models3dDir, `${name}.step`);
      const has3dModel = existsSync(model3dPath);

      if (lcscId) {
        components.push({
          lcscId,
          name,
          category,
          symbolRef: fullSymbolRef,
          footprintRef,
          library: libraryName,
          has3dModel,
        });
      }
    }
  } catch {
    // File read error - return empty
  }

  return components;
}

function adaptCommunityComponent(component: EasyEDACommunityComponent): EasyEDAComponentData {
  const symbolHead = component.symbol.head as Record<string, unknown> | undefined;
  const cPara = (symbolHead?.c_para as Record<string, string>) || {};

  return {
    info: {
      name: component.title,
      prefix: cPara.pre || 'U',
      package: component.footprint.name,
      manufacturer: cPara.Manufacturer || cPara.BOM_Manufacturer,
      datasheet: cPara.link,
      lcscId: undefined,
      jlcId: undefined,
    },
    symbol: {
      pins: component.symbol.pins,
      rectangles: component.symbol.rectangles,
      circles: component.symbol.circles,
      ellipses: component.symbol.ellipses,
      arcs: component.symbol.arcs,
      polylines: component.symbol.polylines,
      polygons: component.symbol.polygons,
      paths: component.symbol.paths,
      texts: component.symbol.texts || [],
      origin: component.symbol.origin,
    },
    footprint: {
      name: component.footprint.name,
      type: component.footprint.type,
      pads: component.footprint.pads,
      tracks: component.footprint.tracks,
      holes: component.footprint.holes,
      circles: component.footprint.circles,
      arcs: component.footprint.arcs,
      rects: component.footprint.rects,
      texts: component.footprint.texts,
      vias: component.footprint.vias,
      solidRegions: component.footprint.solidRegions,
      origin: component.footprint.origin,
    },
    model3d: component.model3d,
    rawData: component.rawData,
  };
}

export function createLibraryService(): LibraryService {
  return {
    async install(id: string, options: InstallOptions = {}): Promise<InstallResult> {
      const isCommunityComponent = !isLcscId(id);

      // Determine storage location (global if no projectPath provided)
      const isGlobal = !options.projectPath;
      const paths = isGlobal
        ? getGlobalLibraryPaths()
        : getProjectLibraryPaths(options.projectPath!);

      // Fetch component data
      let component: EasyEDAComponentData | null = null;

      if (isLcscId(id)) {
        component = await easyedaClient.getComponentData(id);
      } else {
        const communityComponent = await easyedaCommunityClient.getComponent(id);
        if (communityComponent) {
          component = adaptCommunityComponent(communityComponent);
        }
      }

      if (!component) {
        throw new Error(`Component ${id} not found`);
      }

      // Enrich with JLC API data for LCSC components
      if (!isCommunityComponent) {
        try {
          const jlcDetails = await jlcClient.getComponentDetails(id);
          if (jlcDetails) {
            if (jlcDetails.datasheetPdf) {
              component.info.datasheetPdf = jlcDetails.datasheetPdf;
            }
            if (jlcDetails.description && jlcDetails.description !== jlcDetails.name) {
              component.info.description = jlcDetails.description;
            }
            if (jlcDetails.attributes) {
              component.info.attributes = {
                ...component.info.attributes,
                ...jlcDetails.attributes,
              };
            }
          }
        } catch {
          // JLC enrichment is optional
        }
      }

      // Variables for library paths and refs
      let symbolFile: string;
      let symbolName: string;
      let symbolRef: string;
      let footprintPath: string | undefined;
      let footprintRef: string;
      let footprintDir: string;
      let models3dDir: string;
      let category: string | undefined;
      let modelPath: string | undefined;

      if (isCommunityComponent) {
        // EasyEDA community component → EasyEDA library (global or project-local)
        // Use different library names to avoid collision
        const libName = isGlobal ? EASYEDA_LIBRARY_NAME : EASYEDA_LOCAL_LIBRARY_NAME;
        const symLibFile = isGlobal ? EASYEDA_SYMBOL_LIBRARY_NAME : EASYEDA_LOCAL_SYMBOL_LIBRARY_NAME;
        const fpLibDir = isGlobal ? EASYEDA_FOOTPRINT_LIBRARY_NAME : EASYEDA_LOCAL_FOOTPRINT_LIBRARY_NAME;
        const libDesc = isGlobal ? EASYEDA_LIBRARY_DESCRIPTION : EASYEDA_LOCAL_LIBRARY_DESCRIPTION;
        const models3dDirName = isGlobal ? 'EasyEDA.3dshapes' : 'EasyEDA-local.3dshapes';

        let symbolsDir: string;
        let easyedaModelsDir: string;

        if (isGlobal) {
          // Global: use KiCad 3rd party directory
          symbolsDir = paths.symbolsDir;
          footprintDir = join(paths.footprintsDir, fpLibDir);
          easyedaModelsDir = join(paths.models3dDir, models3dDirName);
        } else {
          // Project-local
          const librariesDir = join(options.projectPath!, 'libraries');
          symbolsDir = join(librariesDir, 'symbols');
          footprintDir = join(librariesDir, 'footprints', fpLibDir);
          easyedaModelsDir = join(librariesDir, '3dmodels', models3dDirName);
        }
        models3dDir = easyedaModelsDir;

        await ensureDir(symbolsDir);
        await ensureDir(footprintDir);

        symbolFile = join(symbolsDir, symLibFile);
        symbolName = component.info.name.replace(/[^a-zA-Z0-9_-]/g, '_');

        // Download 3D model first if available (needed for footprint generation)
        // Community components include 3D by default
        const include3d = options.include3d ?? true;
        let modelRelativePath: string | undefined;

        if (include3d && component.model3d) {
          await ensureDir(models3dDir);
          const model = await easyedaCommunityClient.get3DModel(component.model3d.uuid, 'step');
          if (model) {
            const modelFilename = `${symbolName}.step`;
            modelPath = join(models3dDir, modelFilename);
            await writeBinary(modelPath, model);
            // Use appropriate path variable
            if (isGlobal) {
              modelRelativePath = `\${KICAD9_3RD_PARTY}/${LIBRARY_NAMESPACE}/3dmodels/${models3dDirName}/${modelFilename}`;
            } else {
              modelRelativePath = `\${KIPRJMOD}/libraries/3dmodels/${models3dDirName}/${modelFilename}`;
            }
          }
        }

        // Generate custom footprint with 3D model
        const footprint = footprintConverter.convert(component, {
          libraryName: libName,
          include3DModel: !!modelRelativePath,
          modelPath: modelRelativePath,
        });
        footprintPath = join(footprintDir, `${symbolName}.kicad_mod`);
        footprintRef = `${libName}:${symbolName}`;
        await writeText(footprintPath, footprint);

        component.info.package = footprintRef;

        // Update lib tables (global or project-local)
        if (isGlobal) {
          // For global, use the global lib table registration
          const { ensureGlobalEasyEDALibrary } = await import('../converter/global-lib-table.js');
          await ensureGlobalEasyEDALibrary();
        } else {
          await ensureSymLibTable(options.projectPath!, symbolFile, libName, libDesc);
          await ensureFpLibTable(options.projectPath!, footprintDir, libName, libDesc);
        }

        symbolRef = `${libName}:${symbolName}`;
      } else {
        // LCSC component → JLC-MCP category-based library
        category = getLibraryCategory(
          component.info.prefix,
          component.info.category,
          component.info.description
        );

        const symbolLibraryFilename = getLibraryFilename(category as LibraryCategory);
        symbolFile = join(paths.symbolsDir, symbolLibraryFilename);
        footprintDir = paths.footprintDir;
        models3dDir = paths.models3dFullDir;

        await ensureDir(paths.symbolsDir);
        await ensureDir(paths.footprintDir);

        // Pre-compute symbol name for 3D model path
        symbolName = symbolConverter.getSymbolName(component);

        // Download 3D model first if available (needed for footprint generation)
        const include3d = options.include3d ?? true;
        let modelRelativePath: string | undefined;

        if (include3d && component.model3d) {
          await ensureDir(models3dDir);
          const model = await easyedaClient.get3DModel(component.model3d.uuid, 'step');
          if (model) {
            const modelFilename = `${symbolName}.step`;
            modelPath = join(models3dDir, modelFilename);
            await writeBinary(modelPath, model);
            // Use KiCad variable for portable path
            modelRelativePath = `\${KICAD9_3RD_PARTY}/${LIBRARY_NAMESPACE}/3dmodels/${MODELS_3D_NAME}/${modelFilename}`;
          }
        }

        // Determine footprint (may use KiCad standard)
        const footprintResult = footprintConverter.getFootprint(component, {
          include3DModel: !!modelRelativePath,
          modelPath: modelRelativePath,
        });

        if (footprintResult.type === 'reference') {
          footprintRef = footprintResult.reference!;
        } else {
          footprintPath = join(footprintDir, `${footprintResult.name}.kicad_mod`);
          footprintRef = getFootprintReference(footprintResult.name);
          await writeText(footprintPath, footprintResult.content!);
        }

        component.info.package = footprintRef;
        symbolRef = getSymbolReference(category as LibraryCategory, symbolName);

        // Update lib tables (project-local only)
        if (!isGlobal && options.projectPath) {
          await ensureSymLibTable(options.projectPath, symbolFile);
          await ensureFpLibTable(options.projectPath, footprintDir);
        }
      }

      // Handle symbol library (append, replace, or create)
      let symbolContent: string;
      let symbolAction: 'created' | 'appended' | 'exists' | 'replaced';

      if (existsSync(symbolFile)) {
        const existingContent = await readFile(symbolFile, 'utf-8');

        if (symbolConverter.symbolExistsInLibrary(existingContent, component.info.name)) {
          if (options.force) {
            // Force reinstall - replace existing symbol
            symbolContent = symbolConverter.replaceInLibrary(existingContent, component, {
              libraryName: isCommunityComponent ? EASYEDA_LIBRARY_NAME : undefined,
              symbolName: isCommunityComponent ? symbolName : undefined,
            });
            symbolAction = 'replaced';
          } else {
            symbolAction = 'exists';
            symbolContent = existingContent;
          }
        } else {
          symbolContent = symbolConverter.appendToLibrary(existingContent, component, {
            libraryName: isCommunityComponent ? EASYEDA_LIBRARY_NAME : undefined,
            symbolName: isCommunityComponent ? symbolName : undefined,
          });
          symbolAction = 'appended';
        }
      } else {
        symbolContent = symbolConverter.convert(component, {
          libraryName: isCommunityComponent ? EASYEDA_LIBRARY_NAME : undefined,
          symbolName: isCommunityComponent ? symbolName : undefined,
        });
        symbolAction = 'created';
      }

      if (symbolAction !== 'exists') {
        await writeText(symbolFile, symbolContent);
      }

      // Build validation data
      const isKicadStandardFootprint = !isCommunityComponent && !footprintPath;
      const footprintType = isKicadStandardFootprint ? 'reference' : 'generated';

      const validationData: ValidationData = {
        component: {
          name: component.info.name,
          description: component.info.description,
          package: component.info.package,
          manufacturer: component.info.manufacturer,
          datasheet_url: component.info.datasheetPdf || component.info.datasheet,
        },
        symbol: {
          pin_count: component.symbol.pins.length,
          pins: component.symbol.pins.map(p => ({
            number: p.number,
            name: p.name,
            electrical_type: p.electricalType,
          })),
        },
        footprint: {
          type: component.footprint.type,
          pad_count: component.footprint.pads.length,
          pads: footprintType === 'generated'
            ? component.footprint.pads.map(p => ({
                number: p.number,
                shape: p.shape,
              }))
            : null,
          is_kicad_standard: isKicadStandardFootprint,
          kicad_ref: footprintRef,
        },
        checks: {
          pin_pad_count_match: component.symbol.pins.length === component.footprint.pads.length,
          has_power_pins: component.symbol.pins.some(p =>
            p.electricalType === 'power_in' || p.electricalType === 'power_out'
          ),
          has_ground_pins: component.symbol.pins.some(p =>
            p.name.toLowerCase().includes('gnd') || p.name.toLowerCase().includes('vss')
          ),
        },
      };

      return {
        success: true,
        id,
        source: isCommunityComponent ? 'easyeda_community' : 'lcsc',
        storageMode: isGlobal ? 'global' : 'project-local',
        category,
        symbolName,
        symbolRef,
        footprintRef,
        footprintType,
        datasheet: component.info.datasheet || (!isCommunityComponent ? `https://www.lcsc.com/datasheet/lcsc_datasheet_${id}.pdf` : undefined),
        files: {
          symbolLibrary: symbolFile,
          footprint: footprintPath,
          model3d: modelPath,
        },
        symbolAction,
        validationData,
      };
    },

    async listInstalled(options: ListOptions = {}): Promise<InstalledComponent[]> {
      const paths = options.projectPath
        ? getProjectLibraryPaths(options.projectPath)
        : getGlobalLibraryPaths();

      const allComponents: InstalledComponent[] = [];
      const categories = getAllCategories();

      for (const category of categories) {
        // Filter by category if specified
        if (options.category && options.category !== category) continue;

        const libraryFilename = getLibraryFilename(category);
        const libraryPath = join(paths.symbolsDir, libraryFilename);
        const libraryName = `JLC-MCP-${category}`;

        if (existsSync(libraryPath)) {
          const components = await parseSymbolLibrary(
            libraryPath,
            libraryName,
            category,
            paths.models3dFullDir
          );
          allComponents.push(...components);
        }
      }

      return allComponents;
    },

    async update(_options: UpdateOptions = {}): Promise<UpdateResult> {
      // TODO: Implement by re-fetching all components in a library
      return { updated: 0, failed: 0, skipped: 0, components: [] };
    },

    async ensureGlobalTables(): Promise<void> {
      const { ensureGlobalLibraryTables } = await import('../converter/global-lib-table.js');
      await ensureGlobalLibraryTables();
    },

    async getStatus(): Promise<LibraryStatus> {
      const version = detectKicadVersion();
      const paths = getGlobalLibraryPaths();
      const configDir = getKicadConfigDir(version);

      const symLibTablePath = join(configDir, 'sym-lib-table');
      const fpLibTablePath = join(configDir, 'fp-lib-table');

      // Check if library directories exist with actual content
      let installed = false;
      if (existsSync(paths.symbolsDir)) {
        try {
          const files = await readdir(paths.symbolsDir);
          installed = files.some(f => f.endsWith('.kicad_sym'));
        } catch {
          installed = false;
        }
      }

      // Check if libraries are linked in KiCad tables
      let linked = false;
      if (existsSync(symLibTablePath)) {
        try {
          const content = await readFile(symLibTablePath, 'utf-8');
          linked = content.includes('JLC-MCP');
        } catch {
          linked = false;
        }
      }

      // Count installed components
      const components = await this.listInstalled({});
      const componentCount = components.length;

      return {
        installed,
        linked,
        version,
        componentCount,
        paths: {
          symbolsDir: paths.symbolsDir,
          footprintsDir: paths.footprintsDir,
          models3dDir: paths.models3dFullDir,
          symLibTable: symLibTablePath,
          fpLibTable: fpLibTablePath,
        },
      };
    },

    async isEasyEDAInstalled(componentName: string): Promise<boolean> {
      const paths = getGlobalLibraryPaths();
      const easyedaLibPath = join(paths.symbolsDir, EASYEDA_SYMBOL_LIBRARY_NAME);

      if (!existsSync(easyedaLibPath)) {
        return false;
      }

      try {
        const content = await readFile(easyedaLibPath, 'utf-8');
        // Sanitize the name the same way we do when installing
        const sanitizedName = componentName.replace(/[^a-zA-Z0-9_-]/g, '_');
        // Check if symbol exists in library
        const pattern = new RegExp(`\\(symbol\\s+"${sanitizedName}"`, 'm');
        return pattern.test(content);
      } catch {
        return false;
      }
    },

    async regenerate(options: RegenerateOptions = {}): Promise<RegenerateResult> {
      const include3d = options.include3d ?? true;

      // Get all installed JLCPCB components (not EasyEDA community)
      const installed = await this.listInstalled({ projectPath: options.projectPath });

      const results: RegenerateResult = {
        total: installed.length,
        success: 0,
        failed: 0,
        components: [],
      };

      for (let i = 0; i < installed.length; i++) {
        const component = installed[i];

        // Notify progress - starting
        options.onProgress?.(i + 1, installed.length, component, 'start');

        try {
          // Re-install the component with force to regenerate everything
          await this.install(component.lcscId, {
            projectPath: options.projectPath,
            include3d,
            force: true,
          });

          results.success++;
          results.components.push({
            id: component.lcscId,
            name: component.name,
            status: 'success',
          });

          // Notify progress - success
          options.onProgress?.(i + 1, installed.length, component, 'success');
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          results.failed++;
          results.components.push({
            id: component.lcscId,
            name: component.name,
            status: 'failed',
            error: errorMessage,
          });

          // Notify progress - error
          options.onProgress?.(i + 1, installed.length, component, 'error', errorMessage);
        }
      }

      return results;
    },
  };
}
