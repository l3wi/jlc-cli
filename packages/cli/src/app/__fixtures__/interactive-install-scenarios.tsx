import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { mock, spyOn } from 'bun:test';
import React from 'react';
import {
  createLibraryService, getLibraryPaths, easyedaClient, easyedaCommunityClient, jlcClient,
  type EasyEDAComponentData, type EasyEDACommunityComponent,
} from '@jlcpcb/core';
import type { ScreenName, ScreenParams } from '../navigation/types.js';
import { createTerminal } from './terminal.js';

const scenario = process.argv[2];
const root = process.argv[3];
const projectPath = join(root, 'selected-project');
await mkdir(projectPath, { recursive: true });
// Any forgotten upstream dependency must fail rather than reaching the network.
spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Unexpected network request in interactive install fixture'));
const component: EasyEDAComponentData = {
  info: { name: 'Interactive Part', prefix: 'U', lcscId: 'C400', package: 'Custom_Interactive_Package' },
  symbol: {
    pins: [], rectangles: [], circles: [], ellipses: [], arcs: [], polylines: [],
    polygons: [], paths: [], texts: [], origin: { x: 0, y: 0 },
  },
  footprint: {
    name: 'Custom_Interactive_Package', type: 'smd', pads: [], tracks: [], holes: [],
    circles: [], arcs: [], rects: [], texts: [], vias: [], solidRegions: [],
    origin: { x: 0, y: 0 },
  },
  model3d: {
    name: 'Interactive Part', uuid: 'interactive-model',
    translation: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 },
  },
  rawData: {},
};
const community: EasyEDACommunityComponent = {
  uuid: '8007c710c0b9406db963b55df6990340', title: 'Community Part',
  description: 'Interactive community component', tags: [],
  owner: { uuid: 'owner', username: 'owner', nickname: 'Community' },
  updateTime: 0, docType: 2, verify: true,
  symbol: { ...component.symbol, head: {} },
  footprint: { ...component.footprint, uuid: 'footprint', head: {} },
  model3d: component.model3d, rawData: {},
};
const model = Buffer.from('ISO-10303-21;\nEND-ISO-10303-21;');
spyOn(easyedaClient, 'getComponentData').mockImplementation(async () => structuredClone(component));
spyOn(easyedaClient, 'get3DModel').mockResolvedValue(model);
spyOn(jlcClient, 'getComponentDetails').mockResolvedValue(null);
spyOn(jlcClient, 'search').mockResolvedValue([{
  id: 'C400', idType: 'lcsc', lcscId: 'C400', name: 'Interactive Part',
  manufacturer: 'Maker', description: 'Interactive component', package: component.footprint.name,
  stock: 10, libraryType: 'basic',
}]);
spyOn(easyedaCommunityClient, 'getComponent').mockImplementation(async () => structuredClone(community));
spyOn(easyedaCommunityClient, 'get3DModel').mockResolvedValue(model);
spyOn(easyedaCommunityClient, 'search').mockResolvedValue([{
  uuid: community.uuid, title: community.title, description: community.description,
  owner: community.owner, thumb: '', tags: [], package: community.footprint.name,
  has3DModel: true, docType: 2,
}]);
mock.module('@clack/prompts', () => ({ text: async () => 'interactive', isCancel: () => false }));

const terminal = createTerminal();
const { see, key, output } = terminal;
// Dynamic imports keep application/command initialization behind this subprocess's mock boundaries.
const app = await import('../App.js');
// Preserve the real App, screens, navigation and core services; only supply isolated terminal streams.
mock.module('../App.js', () => ({
  ...app,
  renderApp: async (screen: ScreenName, params: ScreenParams[ScreenName]) => {
    const instance = terminal.render(<app.App initialScreen={screen} initialParams={params} />);
    await instance.waitUntilExit();
  },
}));
const service = createLibraryService();
try {
  if (scenario === 'lcsc') {
    // A pre-existing symbol exercises force (without it the customized footprint stays untouched).
    const global = await service.install('C400', { include3d: false });
    const local = await service.install('C400', { projectPath, include3d: false });
    const globalSymbol = await readFile(global.files.symbolLibrary, 'utf8');
    const globalFootprint = await readFile(global.files.footprint!, 'utf8');
    await writeFile(local.files.footprint!, '(footprint "User customization")');
    const { installCommand } = await import('../../commands/install.js');
    const command = installCommand(undefined, { projectPath, force: true, include3d: true });
    await see('Search:');
    key('\r');
    await see('Enter Install');
    key('\r');
    await see('Installed C400');

    const footprint = await readFile(local.files.footprint!, 'utf8');
    assert.ok(!footprint.includes('User customization'));
    const modelReference = footprint.match(/\(model\s+"([^"]+)"/)?.[1];
    assert.ok(modelReference?.startsWith('${KIPRJMOD}/libraries/3dmodels/'));
    assert.deepEqual(await readFile(modelReference!.replace('${KIPRJMOD}', projectPath)), model);
    assert.equal(await readFile(global.files.symbolLibrary, 'utf8'), globalSymbol);
    assert.equal(await readFile(global.files.footprint!, 'utf8'), globalFootprint);
    assert.equal(existsSync(getLibraryPaths().models3dFullDir), false);
    const installed = await service.listInstalled({ projectPath });
    assert.equal(installed.find(part => part.lcscId === 'C400')?.symbolRef, local.symbolRef);

    key('\u001b');
    await see('Enter Install');
    key('\u001b');
    await see('Search:');
    key('q');
    await command;
  } else {
    const global = await service.install(community.uuid, { include3d: true });
    const globalSymbol = await readFile(global.files.symbolLibrary, 'utf8');
    const globalFootprint = await readFile(global.files.footprint!, 'utf8');
    assert.equal(await service.isEasyEDAInstalled(community.title), true);
    assert.equal(await service.isEasyEDAInstalled(community.title, projectPath), false);
    const { easyedaInstallCommand } = await import('../../commands/easyeda.js');
    const command = easyedaInstallCommand(undefined, { projectPath, force: true, include3d: false });
    await see('Search:');
    key('\r');
    // The global installation must not hide the selected project's install affordance.
    await see('Enter Install');
    assert.ok(!output().includes('R Regenerate'));
    key('\r');
    await see('Installed: EasyEDA-local:Community_Part');
    const paths = getLibraryPaths(projectPath);
    const symbolPath = join(paths.symbolsDir, 'EasyEDA-local.kicad_sym');
    const footprintPath = join(paths.footprintsDir, 'EasyEDA-local.pretty', 'Community_Part.kicad_mod');
    assert.ok((await readFile(symbolPath, 'utf8')).includes('(symbol "Community_Part"'));
    const initialFootprint = await readFile(footprintPath, 'utf8');
    assert.ok(!initialFootprint.includes('(model '));
    assert.equal(existsSync(paths.models3dDir), false);

    await writeFile(footprintPath, '(footprint "User customization")');
    key('\r');
    await see('Installed: EasyEDA-local:Community_Part');
    assert.equal(await readFile(footprintPath, 'utf8'), initialFootprint);
    assert.equal(existsSync(paths.models3dDir), false);
    assert.equal(await readFile(global.files.symbolLibrary, 'utf8'), globalSymbol);
    assert.equal(await readFile(global.files.footprint!, 'utf8'), globalFootprint);
    assert.deepEqual(await readFile(global.files.model3d!), model);
    assert.ok((await readFile(join(projectPath, 'sym-lib-table'), 'utf8')).includes('EasyEDA-local'));
    key('\u001b');
    await see('Search:');
    key('q');
    await command;
  }
} finally {
  terminal.cleanup();
}
