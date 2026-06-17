/**
 * Library command
 * View JLC-MCP library status and installed components
 */

import * as p from '@clack/prompts';
import chalk from 'chalk';
import { createLibraryService, type InstalledComponent } from '@jlcpcb/core';
import { renderApp } from '../app/App.js';
import { printJson, printJsonError, getErrorMessage } from '../utils/agent-output.js';

const libraryService = createLibraryService();

interface LibraryOptions {
  json?: boolean;
}

export async function libraryCommand(options: LibraryOptions): Promise<void> {
  // JSON mode - non-interactive output for scripting
  if (options.json) {
    try {
      const [status, components] = await Promise.all([
        libraryService.getStatus(),
        libraryService.listInstalled({}),
      ]);

      printJson({
        success: true,
        status: {
          installed: status.installed,
          linked: status.linked,
          version: status.version,
          componentCount: status.componentCount,
          paths: status.paths,
        },
        components,
      });
    } catch (error) {
      printJsonError('library_status_failed', getErrorMessage(error), { retryable: false });
      process.exit(1);
    }
    return;
  }

  // Interactive mode - launch TUI
  await renderApp('library', {});
}

interface RegenerateOptions {
  projectPath?: string;
  include3d?: boolean;
}

export async function regenerateCommand(options: RegenerateOptions): Promise<void> {
  const include3d = options.include3d ?? true;

  // First get the count
  const components = await libraryService.listInstalled({ projectPath: options.projectPath });

  if (components.length === 0) {
    p.log.warn('No installed components found to regenerate.');
    return;
  }

  p.log.info(`Found ${chalk.cyan(components.length)} installed components to regenerate.`);
  console.log();

  let currentSpinner: ReturnType<typeof p.spinner> | null = null;

  const result = await libraryService.regenerate({
    projectPath: options.projectPath,
    include3d,
    onProgress: (current: number, total: number, component: InstalledComponent, status: 'start' | 'success' | 'error', error?: string) => {
      if (status === 'start') {
        currentSpinner = p.spinner();
        currentSpinner.start(`[${current}/${total}] Regenerating ${chalk.cyan(component.name)} (${component.lcscId})...`);
      } else if (status === 'success') {
        currentSpinner?.stop(chalk.green(`✓ [${current}/${total}] ${component.name} (${component.lcscId})`));
      } else if (status === 'error') {
        currentSpinner?.stop(chalk.red(`✗ [${current}/${total}] ${component.name} (${component.lcscId}): ${error}`));
      }
    },
  });

  console.log();
  p.log.success(`Regeneration complete: ${chalk.green(result.success)} succeeded, ${chalk.red(result.failed)} failed`);

  if (result.failed > 0) {
    console.log();
    p.log.warn('Failed components:');
    for (const comp of result.components.filter(c => c.status === 'failed')) {
      console.log(chalk.red(`  • ${comp.name} (${comp.id}): ${comp.error}`));
    }
  }
}
