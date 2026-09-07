import { afterEach, beforeEach, describe, expect, it, spyOn } from 'bun:test';
import { existsSync } from 'fs';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { easyedaClient } from '../api/easyeda.js';
import { jlcClient } from '../api/jlc.js';
import { getLibraryFilename } from '../converter/category-router.js';
import type { EasyEDAComponentData } from '../types/index.js';
import { createLibraryService, getLibraryPaths } from './library-service.js';

describe('LibraryService installed artifacts', () => {
  let projectPath: string;

  beforeEach(async () => {
    projectPath = await mkdtemp(join(tmpdir(), 'jlc-library-service-'));
  });

  afterEach(async () => {
    await rm(projectPath, { recursive: true, force: true });
  });

  it('removes only the exact top-level symbol despite prefix names and quoted parentheses', async () => {
    const paths = getLibraryPaths(projectPath);
    await mkdir(paths.symbolsDir, { recursive: true });
    const libraryPath = join(paths.symbolsDir, getLibraryFilename('ICs'));
    const target = String.raw`(symbol "Foo"
      (property "LCSC" "C100")
      (property "Description" "unbalanced ) and escaped \"(symbol\" text")
      (symbol "Foo_0_1" (rectangle (start 0 0) (end 1 1)))
      (symbol "Foo_1_1" (pin passive line (name "quoted \\\" )"))))`;
    const survivor = `(symbol "Foo_Bar"
      (property "LCSC" "C101")
      (symbol "Foo_Bar_0_1" (rectangle (start 0 0) (end 2 2))))`;
    const suffixName = '(symbol "Real_1_1" (property "LCSC" "C102"))';
    const content = `(kicad_symbol_lib (version 20241209)\n${target}\n${survivor}\n${suffixName}\n)`;
    await writeFile(libraryPath, content);

    const service = createLibraryService();
    const removed = await service.remove('C100', { projectPath });

    expect(removed.symbolRemoved).toBe(true);
    expect(await readFile(libraryPath, 'utf-8')).toBe(content.replace(target, ''));
    expect((await service.listInstalled({ projectPath })).map(component => component.symbolRef)).toEqual([
      'JLC-MCP-ICs:Foo_Bar',
      'JLC-MCP-ICs:Real_1_1',
    ]);
  });

  it('retains a shared footprint until the last referring installed symbol is removed', async () => {
    const paths = getLibraryPaths(projectPath);
    await mkdir(paths.symbolsDir, { recursive: true });
    await mkdir(paths.footprintDir, { recursive: true });
    const footprintPath = join(paths.footprintDir, 'Shared.kicad_mod');
    const footprint = '(footprint "Shared" (layer "F.Cu"))';
    await writeFile(footprintPath, footprint);
    await writeFile(join(paths.symbolsDir, getLibraryFilename('ICs')), `(kicad_symbol_lib
      (symbol "First" (property "LCSC" "C200") (property "Footprint" "JLC-MCP:Shared")))`);
    await writeFile(join(paths.symbolsDir, getLibraryFilename('Sensors')), `(kicad_symbol_lib
      (symbol "Second" (property "LCSC" "C201") (property "Footprint" "JLC-MCP:Shared")))`);

    const service = createLibraryService();
    const first = await service.remove('C200', { projectPath });
    expect(first.symbolRemoved).toBe(true);
    expect(first.footprintRemoved).toBe(false);
    expect(await readFile(footprintPath, 'utf-8')).toBe(footprint);
    expect((await service.listInstalled({ projectPath })).map(component => component.lcscId)).toEqual(['C201']);

    const second = await service.remove('C201', { projectPath });
    expect(second.footprintRemoved).toBe(true);
    expect(existsSync(footprintPath)).toBe(false);
  });

  it('preserves footprints referenced by symbols outside the LCSC installed list', async () => {
    const paths = getLibraryPaths(projectPath);
    await mkdir(paths.symbolsDir, { recursive: true });
    await mkdir(paths.footprintDir, { recursive: true });
    const footprintPath = join(paths.footprintDir, 'Shared.kicad_mod');
    await writeFile(footprintPath, '(footprint "Shared")');
    await writeFile(join(paths.symbolsDir, getLibraryFilename('ICs')), `(kicad_symbol_lib
      (symbol "First" (property "LCSC" "C300") (property "Footprint" "JLC-MCP:Shared")))`);
    await writeFile(join(paths.symbolsDir, 'EasyEDA-local.kicad_sym'), `(kicad_symbol_lib
      (symbol "Community" (property "Footprint" "JLC-MCP:Shared")))`);

    const result = await createLibraryService().remove('C300', { projectPath });
    expect(result.symbolRemoved).toBe(true);
    expect(result.footprintRemoved).toBe(false);
    expect(await readFile(footprintPath, 'utf-8')).toBe('(footprint "Shared")');
  });

  it('lists install references and resolves project-local model references to downloaded bytes', async () => {
    const component: EasyEDAComponentData = {
      info: { name: 'Local Model', prefix: 'U', lcscId: 'C400', package: 'Custom_Local_Package' },
      symbol: {
        pins: [], rectangles: [], circles: [], ellipses: [], arcs: [], polylines: [],
        polygons: [], paths: [], texts: [], origin: { x: 0, y: 0 },
      },
      footprint: {
        name: 'Custom_Local_Package', type: 'smd', pads: [], tracks: [], holes: [],
        circles: [], arcs: [], rects: [], texts: [], vias: [], solidRegions: [],
        origin: { x: 0, y: 0 },
      },
      model3d: {
        name: 'Local Model', uuid: 'test-model',
        translation: { x: 0, y: 0, z: 0 },
        rotation: { x: 0, y: 0, z: 0 },
      },
      rawData: {},
    };
    const model = Buffer.from('ISO-10303-21;\nEND-ISO-10303-21;');
    const componentSpy = spyOn(easyedaClient, 'getComponentData').mockImplementation(async () => structuredClone(component));
    const detailsSpy = spyOn(jlcClient, 'getComponentDetails').mockResolvedValue(null);
    const modelSpy = spyOn(easyedaClient, 'get3DModel').mockResolvedValue(model);
    try {
      const service = createLibraryService();
      const installed = await service.install('C400', { projectPath, include3d: true });
      expect(installed.footprintType).toBe('generated');
      const footprint = await readFile(installed.files.footprint!, 'utf-8');
      const modelReference = footprint.match(/\(model\s+"([^"]+)"/)?.[1];
      expect(modelReference).toStartWith('${KIPRJMOD}/libraries/3dmodels/');
      const resolvedModel = modelReference!.replace('${KIPRJMOD}', projectPath);
      expect(installed.files.model3d).toBe(resolvedModel);
      expect(await readFile(resolvedModel)).toEqual(model);
      const listed = await service.listInstalled({ projectPath });
      expect(listed.map(entry => entry.symbolRef)).toEqual([installed.symbolRef]);
      expect(listed[0].footprintRef).toBe(installed.footprintRef);
      expect(listed[0].has3dModel).toBe(true);

      // A non-forced repeat must not overwrite artifacts already customized by the user.
      await writeFile(installed.files.footprint!, '(footprint "User customization")');
      await writeFile(resolvedModel, 'custom model');
      const repeated = await service.install('C400', { projectPath, include3d: true });
      expect(repeated.symbolAction).toBe('exists');
      expect(repeated.symbolRef).toBe(installed.symbolRef);
      expect(await readFile(installed.files.footprint!, 'utf-8')).toBe('(footprint "User customization")');
      expect(await readFile(resolvedModel, 'utf-8')).toBe('custom model');

      component.info = { name: 'Local Resistor', prefix: 'R', lcscId: 'C401', package: 'Custom_Resistor' };
      component.footprint.name = 'Custom_Resistor';
      const resistor = await service.install('C401', { projectPath, include3d: false });
      const table = await readFile(join(projectPath, 'sym-lib-table'), 'utf-8');
      const libraries = new Map(
        [...table.matchAll(/\(lib\s+\(name\s+"([^"]+)"\)\s*\(type\s+"KiCad"\)\s*\(uri\s+"([^"]+)"/g)]
          .map((entry) => [entry[1], entry[2]])
      );
      for (const result of [installed, resistor]) {
        const libraryName = result.symbolRef.slice(0, result.symbolRef.indexOf(':'));
        const libraryPath = libraries.get(libraryName)?.replace('${KIPRJMOD}', projectPath);
        expect(libraryPath).toBe(result.files.symbolLibrary);
      }
    } finally {
      componentSpy.mockRestore();
      detailsSpy.mockRestore();
      modelSpy.mockRestore();
    }
  });

  it('checks the selected project-local community library using top-level names', async () => {
    const paths = getLibraryPaths(projectPath);
    await mkdir(paths.symbolsDir, { recursive: true });
    await writeFile(join(paths.symbolsDir, 'EasyEDA-local.kicad_sym'), `(kicad_symbol_lib
      (symbol "Custom_Name" (symbol "Nested_1_1")))`);
    const service = createLibraryService();
    expect(await service.isEasyEDAInstalled('Custom Name', projectPath)).toBe(true);
    expect(await service.isEasyEDAInstalled('Nested_1_1', projectPath)).toBe(false);
    expect(await service.isEasyEDAInstalled('Custom Name', join(projectPath, 'other-project'))).toBe(false);
  });
});
