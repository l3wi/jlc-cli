import assert from 'node:assert/strict';
import { setTimeout as delay } from 'node:timers/promises';
import { mock } from 'bun:test';
import React from 'react';
import { createTerminal } from './terminal.js';
import * as core from '@jlcpcb/core';
import type { SearchOptions } from '@jlcpcb/core';

const scenario = process.argv[2];
const part = {
  id: 'C123', idType: 'lcsc' as const, lcscId: 'C123', name: 'Original Part',
  manufacturer: 'Maker', description: 'A component', package: 'SOT-23',
  stock: 10, libraryType: 'extended' as const,
};
const basic = { ...part, id: 'C124', lcscId: 'C124', name: 'Filtered Part', libraryType: 'basic' as const };
let librariesReady = !scenario.startsWith('setup-');
let finishSetup: () => void;
const pendingSetup = new Promise<void>((resolve) => { finishSetup = resolve; });
mock.module('@jlcpcb/core', () => ({
  ...core,
  createComponentService: () => ({
    search: async (query: string, options: SearchOptions) => {
      if (query.startsWith('C')) return [query === 'C124' ? basic : part];
      // Changing source, stock or page size changes visible backend results.
      if (options.source !== 'lcsc' || !options.inStock || options.limit !== 7) return [part];
      return options.basicOnly ? [basic] : [part, basic];
    },
    getDetails: async () => part,
  }),
  createLibraryService: () => ({
    getStatus: async () => ({ installed: librariesReady, linked: librariesReady }),
    listInstalled: async () => [],
    ensureGlobalTables: async () => {
      if (scenario === 'setup-pending-back') await pendingSetup;
      librariesReady = true;
    },
    install: async () => ({ symbolRef: 'JLC:Original_Part', footprintRef: 'JLC:SOT-23' }),
  }),
}));

// Load the application only after installing this subprocess's service mocks.
const { App } = await import('../App.js');
const terminal = createTerminal();
const { see, key, output } = terminal;
terminal.render(
  <App initialScreen="search" initialParams={{
    query: 'parts', results: [part, basic],
    searchOptions: { source: 'lcsc', inStock: true, limit: 7 },
  }} />,
);
try {
  await see('Search:');
  if (scenario === 'filter-back') {
    key('\t');
    await see('1 results - Basic/Preferred only');
    assert.ok(output().includes('Filtered Part'));
    key('\r');
    await see('Component:');
    await see('Enter Install');
    key('\u001b');
    await see('1 results - Basic/Preferred only');
    assert.ok(output().includes('Filtered Part'));
    assert.ok(!output().includes('Original Part'));
    key('\t');
    await see('2 results');
    assert.ok(output().includes('Original Part'));
  } else {
    key('\r');
    await see('Component:');
    await see('Enter Install');
    key('\r');
    if (scenario.startsWith('setup-')) {
      await see('Library Setup Required');
      if (scenario === 'setup-escape') {
        key('\u001b');
      } else {
        key('\r');
        if (scenario === 'setup-pending-back') {
          await see('Setting Up Libraries');
          key('\u001b');
          await see('Component:');
          // Settle the abandoned promise while details are active.
          finishSetup!();
          await delay(100);
          assert.ok(!output().includes('Installing') && !output().includes('Installed'));
        } else {
          await see('Installed C123');
          key(scenario === 'setup-complete-key' ? 'x' : '\u001b');
        }
      }
    } else {
      await see('Installed C123');
      key(scenario === 'installed-key' ? 'x' : '\u001b');
    }
    await see('Component:');
    await see('Enter Install');
    assert.ok(!output().includes('Search:'));
    key('\u001b');
    await see('Search:');
  }
} finally {
  terminal.cleanup();
}
