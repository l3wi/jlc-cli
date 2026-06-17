import { describe, expect, it, mock, spyOn } from 'bun:test';
import { readFileSync } from 'fs';
import { join } from 'path';

const mockDetails = {
  lcscId: 'C123',
  name: 'Part',
  manufacturer: 'Maker',
  description: 'A part',
  category: 'ICs',
  package: 'SOT-23',
  pinCount: 3,
  padCount: 3,
  has3DModel: false,
};

const mockSearchResults = [{
  id: 'C123',
  idType: 'lcsc' as const,
  lcscId: 'C123',
  name: 'Part',
  manufacturer: 'Maker',
  description: 'A part',
  package: 'SOT-23',
  stock: 10,
}];

const mockInstallResult = {
  success: true,
  id: 'C123',
  source: 'lcsc' as const,
  storageMode: 'global' as const,
  category: 'ICs',
  symbolName: 'Part',
  symbolRef: 'JLC-MCP-ICs:Part',
  footprintRef: 'Package:SOT-23',
  footprintType: 'reference' as const,
  files: {
    symbolLibrary: '/tmp/symbols/JLC-MCP-ICs.kicad_sym',
  },
  symbolAction: 'exists' as const,
  validationData: {
    component: { name: 'Part' },
    symbol: { pin_count: 3, pins: [] },
    footprint: {
      type: 'smd',
      pad_count: 3,
      pads: null,
      is_kicad_standard: true,
      kicad_ref: 'Package:SOT-23',
    },
    checks: {
      pin_pad_count_match: true,
      has_power_pins: false,
      has_ground_pins: false,
    },
  },
};

mock.module('@jlcpcb/core', () => ({
  createComponentService: () => ({
    getDetails: async () => mockDetails,
    search: async () => mockSearchResults,
  }),
  createLibraryService: () => ({
    ensureGlobalTables: async () => undefined,
    install: async () => mockInstallResult,
    getStatus: async () => ({
      installed: true,
      linked: true,
      version: '9.0',
      componentCount: 1,
      paths: {
        symbolsDir: '/tmp/symbols',
        footprintsDir: '/tmp/footprints',
        models3dDir: '/tmp/models',
        symLibTable: '/tmp/sym-lib-table',
        fpLibTable: '/tmp/fp-lib-table',
      },
    }),
    listInstalled: async () => [{
      lcscId: 'C123',
      name: 'Part',
      category: 'ICs',
      symbolRef: 'JLC-MCP-ICs:Part',
      footprintRef: 'Package:SOT-23',
      library: 'JLC-MCP-ICs',
      has3dModel: false,
    }],
  }),
  startHttpServer: () => 3847,
  stopHttpServer: () => undefined,
}));

describe('agent JSON CLI output', () => {
  it('info --json writes only a JSON object', async () => {
    const write = spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { infoCommand } = await import('./info.js');

    await infoCommand('C123', { json: true });

    expect(write).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(write.mock.calls[0][0]))).toEqual({
      success: true,
      component: mockDetails,
    });
    write.mockRestore();
  });

  it('search --json writes only a JSON object and does not require the TUI', async () => {
    const write = spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { searchCommand } = await import('./search.js');

    await searchCommand('part', { json: true, limit: 1, source: 'lcsc' });

    const payload = JSON.parse(String(write.mock.calls[0][0]));
    expect(payload).toMatchObject({
      success: true,
      query: 'part',
      count: 1,
      results: [{
        id: 'C123',
        id_type: 'lcsc',
        lcsc_id: 'C123',
        name: 'Part',
      }],
    });
    expect(write).toHaveBeenCalledTimes(1);
    write.mockRestore();
  });

  it('library status --json writes only a JSON object', async () => {
    const write = spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { libraryCommand } = await import('./library.js');

    await libraryCommand({ json: true });

    const payload = JSON.parse(String(write.mock.calls[0][0]));
    expect(payload.success).toBe(true);
    expect(payload.status.installed).toBe(true);
    expect(payload.components).toHaveLength(1);
    expect(write).toHaveBeenCalledTimes(1);
    write.mockRestore();
  });

  it('install --json writes only a JSON object and does not require --force', async () => {
    const write = spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { installCommand } = await import('./install.js');

    await installCommand('C123', { json: true });

    const payload = JSON.parse(String(write.mock.calls[0][0]));
    expect(payload).toMatchObject({
      success: true,
      result: {
        id: 'C123',
        symbolAction: 'exists',
      },
    });
    expect(write).toHaveBeenCalledTimes(1);
    write.mockRestore();
  });

  it('easyeda search --json writes normalized search results', async () => {
    const write = spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { easyedaSearchCommand } = await import('./easyeda.js');

    await easyedaSearchCommand('part', { json: true });

    const payload = JSON.parse(String(write.mock.calls[0][0]));
    expect(payload.results[0]).toMatchObject({
      id: 'C123',
      id_type: 'lcsc',
    });
    expect(write).toHaveBeenCalledTimes(1);
    write.mockRestore();
  });

  it('easyeda install --json writes only a JSON object and does not require --force', async () => {
    const write = spyOn(process.stdout, 'write').mockImplementation(() => true);
    const { easyedaInstallCommand } = await import('./easyeda.js');

    await easyedaInstallCommand('8007c710c0b9406db963b55df6990340', { json: true });

    const payload = JSON.parse(String(write.mock.calls[0][0]));
    expect(payload).toMatchObject({
      success: true,
      result: {
        symbolRef: 'JLC-MCP-ICs:Part',
      },
    });
    expect(write).toHaveBeenCalledTimes(1);
    write.mockRestore();
  });

  it('validate --json has a quiet JSON path before human output', () => {
    const source = readFileSync(join(import.meta.dir, 'validate.ts'), 'utf-8');

    expect(source).toContain('const spinner = options.json ? null : p.spinner()');
    expect(source).toContain('printJson({');
    expect(source.indexOf('if (options.json)')).toBeLessThan(source.indexOf('console.log(chalk.bold'));
  });
});
