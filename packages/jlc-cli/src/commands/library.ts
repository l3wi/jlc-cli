/**
 * Library command
 * View JLC-MCP library status and installed components
 */

import * as p from '@clack/prompts';
import { createLibraryService } from '@jlcpcb/core';
import { renderApp } from '../app/App.js';

const libraryService = createLibraryService();

interface LibraryOptions {
  json?: boolean;
}

export async function libraryCommand(options: LibraryOptions): Promise<void> {
  // JSON mode - non-interactive output for scripting
  if (options.json) {
    const spinner = p.spinner();
    spinner.start('Loading library status...');

    try {
      const [status, components] = await Promise.all([
        libraryService.getStatus(),
        libraryService.listInstalled({}),
      ]);

      spinner.stop(`Found ${components.length} installed components`);

      console.log(
        JSON.stringify(
          {
            status: {
              installed: status.installed,
              linked: status.linked,
              version: status.version,
              componentCount: status.componentCount,
              paths: status.paths,
            },
            components,
          },
          null,
          2
        )
      );
    } catch (error) {
      spinner.stop('Failed to get library status');
      p.log.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
    return;
  }

  // Interactive mode - launch TUI
  renderApp('library', {});
}
