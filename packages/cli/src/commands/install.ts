/**
 * Install command
 * Fetch component and add to KiCad libraries
 */

import * as p from '@clack/prompts';
import chalk from 'chalk';
import { createComponentService, createLibraryService, type SearchOptions } from '@jlcpcb/core';
import { renderApp } from '../app/App.js';

const componentService = createComponentService();
const libraryService = createLibraryService();

// LCSC IDs match pattern: C followed by digits (e.g., C2040, C5446)
function isLcscId(id: string): boolean {
  return /^C\d+$/i.test(id);
}

interface InstallOptions {
  projectPath?: string;
  include3d?: boolean;
  force?: boolean;
}

export async function installCommand(id: string | undefined, options: InstallOptions): Promise<void> {
  // Check if ID looks like an EasyEDA UUID (not an LCSC ID)
  if (id && !isLcscId(id)) {
    p.log.error(`"${id}" is not an LCSC part number (e.g., C2040).`);
    p.log.info(`For EasyEDA community components, use: ${chalk.cyan(`jlc easyeda install ${id}`)}`);
    process.exit(1);
  }

  // If ID provided with --force, do direct install (non-interactive)
  if (id && options.force) {
    const spinner = p.spinner();
    spinner.start(`Installing component ${id}...`);

    try {
      // Ensure libraries are set up
      await libraryService.ensureGlobalTables();

      // Install the component
      const result = await libraryService.install(id, {
        projectPath: options.projectPath,
        include3d: options.include3d,
        force: true,
      });

      spinner.stop(chalk.green('✓ Component installed'));

      // Display result
      console.log();
      console.log(chalk.cyan('Symbol:    '), result.symbolRef);
      console.log(chalk.cyan('Footprint: '), result.footprintRef);
      console.log(chalk.cyan('Action:    '), result.symbolAction);
      if (result.files.model3d) {
        console.log(chalk.cyan('3D Model:  '), result.files.model3d);
      }
      console.log();
      console.log(chalk.dim(`Library: ${result.files.symbolLibrary}`));
    } catch (error) {
      spinner.stop(chalk.red('✗ Installation failed'));
      p.log.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
    return;
  }

  // If ID provided (without --force), fetch component and launch TUI for install
  if (id) {
    console.log(`Fetching component ${id}...`);

    try {
      const details = await componentService.getDetails(id);
      // Clear the "Fetching..." line and launch interactive UI
      process.stdout.write('\x1b[1A\x1b[2K');
      await renderApp('info', { componentId: id, component: details as any });
    } catch (error) {
      console.error(`Failed to fetch component: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
    return;
  }

  // No ID provided - interactive search mode using @clack/prompts
  const query = await p.text({
    message: 'Search for component:',
    placeholder: 'e.g., STM32F103, ESP32, 10k resistor',
    validate: (value) => {
      if (!value) return 'Please enter a search term';
      return undefined;
    },
  });

  if (p.isCancel(query)) {
    p.cancel('Installation cancelled');
    process.exit(0);
  }

  console.log(`Searching for "${query}"...`);

  const searchOptions: SearchOptions = { limit: 20 };
  let results = await componentService.search(query as string, searchOptions);

  // Sort results: basic parts first
  results = results.sort((a, b) => {
    if (a.libraryType === 'basic' && b.libraryType !== 'basic') return -1;
    if (a.libraryType !== 'basic' && b.libraryType === 'basic') return 1;
    return 0;
  });

  if (results.length === 0) {
    console.log('No components found. Try a different search term.');
    return;
  }

  // Clear the "Searching..." line and launch interactive UI
  process.stdout.write('\x1b[1A\x1b[2K');
  await renderApp('search', { query: query as string, results });
}
