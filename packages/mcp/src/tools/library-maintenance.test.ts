import { describe, it } from 'bun:test';
import { spawnSync } from 'child_process';
import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join, resolve } from 'path';

// Isolate HOME and client spies from other packages in the workspace test process.
function runScenario(scenario: string) {
  const home = mkdtempSync(join(tmpdir(), 'jlc-mcp-maintenance-'));
  try {
    const result = spawnSync(process.execPath, ['--eval', `
      import { expect, spyOn } from 'bun:test';
      import { mkdir, readFile, writeFile } from 'fs/promises';
      import fs from 'fs';
      import { join } from 'path';
      import { easyedaClient, footprintConverter, symbolConverter, getLibraryPaths, getLibraryFilename } from '@jlcpcb/core';
      import { handleUpdateLibrary } from './src/tools/library-update.ts';
      import { handleFixLibrary } from './src/tools/library-fix.ts';
      import { dispatchToolCall } from './src/tools/index.ts';
      import { parseSExpr, findChildren } from '../core/src/browser/sexpr-parser.ts';
      const component = {
        info: { name: 'FreshName', prefix: 'U', lcscId: 'C100', package: 'UnmappedPackage' },
        symbol: { pins: [], rectangles: [], circles: [], ellipses: [], arcs: [], polylines: [], polygons: [], paths: [], texts: [], origin: { x: 0, y: 0 } },
        footprint: { name: 'UnmappedPackage', type: 'smd', pads: [], tracks: [], holes: [], circles: [], arcs: [], rects: [], texts: [], vias: [], solidRegions: [], origin: { x: 0, y: 0 } },
        rawData: {},
      };
      ${scenario}
    `], {
      cwd: resolve(import.meta.dir, '../..'),
      env: { ...process.env, HOME: home, USERPROFILE: home, XDG_DATA_HOME: join(home, 'data'), XDG_CONFIG_HOME: join(home, 'config'), APPDATA: join(home, 'appdata') },
      encoding: 'utf-8',
      timeout: 10000,
    });
    if (result.status !== 0 || result.error) {
      throw new Error(`Maintenance scenario failed: ${result.error?.message ?? result.status}\n${result.stderr}`);
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

describe('library maintenance', () => {
  it('preserves failed and unrelated symbols and qualifies generated footprint artifacts', () => {
    runScenario(`
      const project = join(process.env.HOME, 'project');
      const paths = getLibraryPaths(project);
      await mkdir(paths.symbolsDir, { recursive: true });
      const file = join(paths.symbolsDir, getLibraryFilename('Misc'));
      const failed = '(symbol "KeepFailed" (property "LCSC" "C200") (property "Description" "untouched (entry)"))';
      const community = '(symbol "Community" (property "Source" "EasyEDA") (symbol "Community_0_1"))';
      const unidentified = '(symbol "HandMade" (property "Description" "leave me alone"))';
      await writeFile(file, '(kicad_symbol_lib (version 20241209) (symbol "InstalledName" (property "LCSC" "C100")) ' + failed + ' ' + community + ' ' + unidentified + ')');
      spyOn(easyedaClient, 'getComponentData').mockImplementation(async (id) => {
        if (id === 'C200') throw new Error('upstream unavailable');
        return structuredClone(component);
      });
      const footprint = footprintConverter.getFootprint(component);
      expect(footprint.type).toBe('generated');
      const response = await handleUpdateLibrary({ project_path: project });
      expect(JSON.parse(response.content[0].text)).toMatchObject({ success: false, partial_success: true, summary: { updated: 1, failed: 1 } });
      const content = await readFile(file, 'utf-8');
      expect(content).toContain(failed);
      expect(content).toContain(community);
      expect(content).toContain(unidentified);
      expect(content).toContain('(symbol "InstalledName"');
      expect(content).not.toContain('(symbol "FreshName"');
      expect(content).toContain('(property "Footprint" "JLC-MCP:' + footprint.name + '"');
      const footprintContent = await readFile(join(paths.footprintDir, footprint.name + '.kicad_mod'), 'utf-8');
      expect(footprintContent).toContain('(footprint "' + footprint.name + '"');
    `);
  });

  it('retains original symbols when a generated footprint cannot be committed', () => {
    runScenario(`
      const project = join(process.env.HOME, 'project');
      const paths = getLibraryPaths(project);
      await mkdir(paths.symbolsDir, { recursive: true });
      const file = join(paths.symbolsDir, getLibraryFilename('ICs'));
      const original = '(kicad_symbol_lib (version 20241209) (symbol "InstalledName" (property "LCSC" "C100")))';
      await writeFile(file, original);
      const footprint = footprintConverter.getFootprint(component);
      await mkdir(join(paths.footprintDir, footprint.name + '.kicad_mod'), { recursive: true });
      spyOn(easyedaClient, 'getComponentData').mockResolvedValue(component);
      const response = await handleUpdateLibrary({ project_path: project });
      expect(response.isError).toBe(true);
      expect(JSON.parse(response.content[0].text)).toMatchObject({ success: false, summary: { updated: 0, failed: 1 } });
      expect(await readFile(file, 'utf-8')).toBe(original);
    `);
  });

  it('fixes symbols in the shared global library location', () => {
    runScenario(`
      const paths = getLibraryPaths();
      await mkdir(paths.symbolsDir, { recursive: true });
      const file = join(paths.symbolsDir, getLibraryFilename('ICs'));
      await writeFile(file, symbolConverter.convert(component));
      spyOn(easyedaClient, 'getComponentData').mockResolvedValue(component);
      const response = await handleFixLibrary({ lcsc_id: 'C100', corrections: { pins: [{ action: 'add', number: '1', name: 'VCC', type: 'power_in' }] } });
      expect(JSON.parse(response.content[0].text)).toMatchObject({ success: true, files: { symbol_library: file } });
      expect(await readFile(file, 'utf-8')).toContain('(name "VCC"');
      const footprint = footprintConverter.getFootprint(component);
      expect(await readFile(file, 'utf-8')).toContain('(property "Footprint" "JLC-MCP:' + footprint.name + '"');
      expect(await readFile(join(paths.footprintDir, footprint.name + '.kicad_mod'), 'utf-8')).toContain('(footprint "' + footprint.name + '"');
    `);
  });

  it('propagates enumeration failures instead of initializing or truncating installed libraries', () => {
    runScenario(`
      const project = join(process.env.HOME, 'project');
      const paths = getLibraryPaths(project);
      await mkdir(paths.symbolsDir, { recursive: true });
      const file = join(paths.symbolsDir, getLibraryFilename('ICs'));
      const original = symbolConverter.convert(component);
      await writeFile(file, original);
      const filenames = fs.readdirSync(paths.symbolsDir);
      const readdir = fs.readdirSync;
      let scanCode = 'EACCES';
      const scan = spyOn(fs, 'readdirSync').mockImplementation((path, ...options) => {
        if (String(path) === paths.symbolsDir) throw Object.assign(new Error('scan blocked'), { code: scanCode });
        return readdir(path, ...options);
      });
      await expect(handleUpdateLibrary({ project_path: project })).rejects.toThrow('scan blocked');
      scanCode = 'EIO';
      await expect(handleUpdateLibrary({ project_path: project, dry_run: true })).rejects.toThrow('scan blocked');
      scan.mockRestore();
      expect(await readFile(file, 'utf-8')).toBe(original);
      expect(fs.readdirSync(paths.symbolsDir)).toEqual(filenames);
      expect(fs.existsSync(paths.footprintDir)).toBe(false);
      expect(fs.existsSync(paths.models3dFullDir)).toBe(false);
    `);
  });

  it('updates then fixes by installed ID while preserving escaped names, unit identities, and library', () => {
    runScenario(String.raw`
      const project = join(process.env.HOME, 'project');
      const paths = getLibraryPaths(project);
      await mkdir(paths.symbolsDir, { recursive: true });
      const file = join(paths.symbolsDir, getLibraryFilename('Misc'));
      const name = 'Installed.Name ("rev")\\path';
      const quote = value => '"' + value.replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"';
      const unrelated = '(symbol "FreshName" (property "Description" ' + quote('example (property "LCSC" "C100")') + ') (symbol "FreshName_0_1" (property "LCSC" "C100")))';
      await writeFile(file, '(kicad_symbol_lib (version 20241209) (symbol ' + quote(name) + ' (property "LCSC" "C100")) ' + unrelated + ')');
      component.info.prefix = 'R';
      component.info.category = 'Resistors';
      spyOn(easyedaClient, 'getComponentData').mockImplementation(async () => structuredClone(component));
      const assertIdentity = async () => {
        const content = await readFile(file, 'utf-8');
        const entries = findChildren(parseSExpr(content), 'symbol');
        const installed = entries.filter(entry => findChildren(entry, 'property').some(property => property[1] === 'LCSC' && property[2] === 'C100'));
        expect(installed.map(entry => entry[1])).toEqual([name]);
        expect(content).toContain('(symbol ' + quote(name));
        const units = findChildren(installed[0], 'symbol');
        expect(units.map(unit => unit[1])).toEqual([name + '_0_1']);
        expect(content).toContain(unrelated);
        expect(fs.existsSync(join(paths.symbolsDir, getLibraryFilename('Resistors')))).toBe(false);
        return installed[0];
      };
      const update = await handleUpdateLibrary({ project_path: project });
      expect(JSON.parse(update.content[0].text)).toMatchObject({ success: true, summary: { updated: 1, failed: 0 } });
      await assertIdentity();
      const fix = await handleFixLibrary({ project_path: project, lcsc_id: 'C100', corrections: { pins: [{ action: 'add', number: '1', name: 'VCC', type: 'power_in' }] } });
      expect(JSON.parse(fix.content[0].text)).toMatchObject({ success: true, symbol_name: name, category: 'Misc', symbol_action: 'replaced', files: { symbol_library: file } });
      const fixed = await assertIdentity();
      const pins = findChildren(findChildren(fixed, 'symbol')[0], 'pin');
      expect(pins.map(pin => findChildren(pin, 'name')[0][1])).toEqual(['VCC']);
      const forced = await handleFixLibrary({ project_path: project, lcsc_id: 'C100', force: true, corrections: { pins: [{ action: 'add', number: '2', name: 'GND', type: 'power_in' }] } });
      expect(JSON.parse(forced.content[0].text)).toMatchObject({ success: true, symbol_name: name, symbol_action: 'replaced' });
      await assertIdentity();
    `);
  });

  it('dispatches an omitted optional arguments object without weakening required schemas', () => {
    runScenario(`
      const response = await dispatchToolCall('library_update');
      expect(response.isError).not.toBe(true);
      expect(JSON.parse(response.content[0].text)).toMatchObject({ success: true, action: 'initialized' });
      const required = await dispatchToolCall('library_fix');
      expect(required.isError).toBe(true);
      expect(JSON.parse(required.content[0].text)).toMatchObject({ error: { code: 'invalid_arguments' } });
    `);
  });
});
