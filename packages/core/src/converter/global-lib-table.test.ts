import { describe, expect, it } from 'bun:test';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { pathToFileURL } from 'url';

const registrationModule = pathToFileURL(join(import.meta.dir, 'global-lib-table.ts')).href;
const utilitiesModule = pathToFileURL(join(import.meta.dir, '../utils/kicad.ts')).href;

function registerInSandbox(
  platform: 'linux' | 'darwin' | 'win32',
  version: '8.0' | '9.0',
  setup: 'data' | 'existing-tables' | 'config-only',
): void {
  const home = mkdtempSync(join(tmpdir(), 'jlc-kicad-registration-'));
  const appData = join(home, 'custom-appdata');
  const dataRoot = platform === 'linux'
    ? join(home, '.local', 'share', 'kicad')
    : join(home, 'Documents', 'KiCad');
  const configDir = platform === 'darwin'
    ? join(home, 'Library', 'Preferences', 'kicad', version)
    : platform === 'win32'
      ? join(appData, 'kicad', version)
      : join(home, '.config', 'kicad', version);

  try {
    mkdirSync(setup === 'config-only' ? configDir : join(dataRoot, version), { recursive: true });
    if (version === '9.0') mkdirSync(join(dataRoot, '8.0'), { recursive: true });
    if (setup === 'existing-tables') {
      mkdirSync(configDir, { recursive: true });
      writeFileSync(join(configDir, 'sym-lib-table'), '(sym_lib_table\n  (lib (name "UserSymbols")(type "KiCad")(uri "/user/symbols.kicad_sym")(options "")(descr ""))\n)\n');
      writeFileSync(join(configDir, 'fp-lib-table'), '(fp_lib_table\n  (lib (name "UserFootprints")(type "KiCad")(uri "/user/footprints.pretty")(options "")(descr ""))\n)\n');
    }

    // Keep platform mocks and environment overrides out of the shared test process.
    const child = Bun.spawnSync([process.execPath, '--eval', `
      import { mock } from 'bun:test';
      import * as os from 'os';
      mock.module('os', () => ({ ...os, homedir: () => process.env.HOME, platform: () => ${JSON.stringify(platform)} }));
      // Load consumers after the platform mock is installed.
      const { ensureGlobalLibraryTables, ensureGlobalEasyEDALibrary } = await import(${JSON.stringify(registrationModule)});
      const { getKicadThirdPartyVariable, getSymLibTablePath, getFpLibTablePath } = await import(${JSON.stringify(utilitiesModule)});
      if (${setup === 'config-only'}) await ensureGlobalEasyEDALibrary();
      const result = await ensureGlobalLibraryTables();
      await ensureGlobalEasyEDALibrary();
      console.log(JSON.stringify({ result, variable: getKicadThirdPartyVariable(), symPath: getSymLibTablePath(), fpPath: getFpLibTablePath() }));
    `], { env: { ...process.env, HOME: home, USERPROFILE: home, APPDATA: appData }, stdout: 'pipe', stderr: 'pipe' });
    if (child.exitCode !== 0) throw new Error(child.stderr.toString());
    const { result, variable, symPath, fpPath } = JSON.parse(child.stdout.toString());
    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.version).toBe(version);
    expect(symPath).toBe(join(configDir, 'sym-lib-table'));
    expect(fpPath).toBe(join(configDir, 'fp-lib-table'));
    expect(result.symLibTable.path).toBe(symPath);
    expect(result.fpLibTable.path).toBe(fpPath);

    const expectedVariable = `\${KICAD${version.split('.')[0]}_3RD_PARTY}`;
    expect(variable).toBe(expectedVariable);
    const symbolTable = readFileSync(symPath, 'utf-8');
    const footprintTable = readFileSync(fpPath, 'utf-8');
    expect(symbolTable).toContain(`(uri "${expectedVariable}/jlc_mcp/symbols/EasyEDA.kicad_sym")`);
    expect(footprintTable).toContain(`(uri "${expectedVariable}/jlc_mcp/footprints/EasyEDA.pretty")`);
    expect(symbolTable).toContain('(name "JLC-MCP-');
    expect(footprintTable).toContain('(name "JLC-MCP")');
    for (const table of [symbolTable, footprintTable]) {
      for (const match of table.matchAll(/\(uri "(\$\{KICAD[^"]+)"\)/g)) {
        expect(match[1]).toStartWith(`${expectedVariable}/jlc_mcp/`);
      }
    }
    if (setup === 'existing-tables') {
      expect(symbolTable).toContain('(name "UserSymbols")');
      expect(footprintTable).toContain('(name "UserFootprints")');
    }
  } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

describe('global library registration paths', () => {
  it('detects Linux KiCad 8 data and adds version-matched entries without replacing user libraries', () => {
    registerInSandbox('linux', '8.0', 'existing-tables');
  });

  it('selects KiCad 9 over 8 and writes macOS tables outside the library data directory', () => {
    registerInSandbox('darwin', '9.0', 'data');
  });

  it('detects a Windows config-only installation and respects APPDATA for tables', () => {
    registerInSandbox('win32', '8.0', 'config-only');
  });
});
