/**
 * Info command
 * Display component details
 */

import * as p from '@clack/prompts';
import chalk from 'chalk';
import { createComponentService } from '@jlcpcb/core';
import { renderApp } from '../app/App.js';

const componentService = createComponentService();

interface InfoOptions {
  json?: boolean;
}

export async function infoCommand(id: string, options: InfoOptions): Promise<void> {
  // JSON mode - non-interactive output for scripting
  if (options.json) {
    const spinner = p.spinner();
    spinner.start(`Fetching component ${id}...`);

    try {
      const details = await componentService.getDetails(id);
      spinner.stop('Component found');
      console.log(JSON.stringify(details, null, 2));
    } catch (error) {
      spinner.stop('Failed to fetch component');
      p.log.error(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      process.exit(1);
    }
    return;
  }

  // Interactive mode - launch TUI
  await renderApp('info', { componentId: id });
}
