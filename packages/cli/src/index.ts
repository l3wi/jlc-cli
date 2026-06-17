#!/usr/bin/env node

/**
 * jlc-cli
 * CLI for JLC/EasyEDA component sourcing and KiCad library management
 */

import { Command } from 'commander';
import { createRequire } from 'module';
import { searchCommand } from './commands/search.js';
import { infoCommand } from './commands/info.js';
import { installCommand } from './commands/install.js';
import { libraryCommand, regenerateCommand } from './commands/library.js';
import { easyedaSearchCommand, easyedaInstallCommand } from './commands/easyeda.js';
import { validateCommand } from './commands/validate.js';
import { getErrorMessage } from './utils/agent-output.js';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const program = new Command();

function parsePositiveInt(value: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer, got "${value}"`);
  }
  return parsed;
}

program
  .name('jlc')
  .description('JLC/EasyEDA component sourcing and KiCad library management')
  .version(version);

program
  .command('search <query...>')
  .description('Search for components (basic parts sorted first)')
  .option('-l, --limit <number>', 'Maximum results', parsePositiveInt, 20)
  .option('--in-stock', 'Only show in-stock components')
  .option('--basic-only', 'Only show basic parts (no extended)')
  .option('--community', 'Search EasyEDA community library')
  .option('--json', 'Output clean JSON and do not launch the TUI')
  .action(async (queryParts: string[], options) => {
    const query = queryParts.join(' ');
    await searchCommand(query, {
      limit: options.limit,
      inStock: options.inStock,
      basicOnly: options.basicOnly || false,
      source: options.community ? 'easyeda-community' : 'lcsc',
      json: options.json,
    });
  });

program
  .command('info <id>')
  .description('Get component details')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    await infoCommand(id, { json: options.json });
  });

program
  .command('install [id]')
  .description('Install component to KiCad libraries')
  .option('-p, --project <path>', 'Install to project-local library')
  .option('--with-3d', 'Include 3D model')
  .option('-y, --yes', 'Install directly without launching the TUI')
  .option('--json', 'Output clean JSON and install directly')
  .option('-f, --force', 'Force reinstall (regenerate symbol and footprint)')
  .action(async (id, options) => {
    await installCommand(id, {
      projectPath: options.project,
      include3d: options.with3d,
      yes: options.yes,
      json: options.json,
      force: options.force,
    });
  });

// Library subcommand group
const library = program
  .command('library')
  .description('JLC-MCP library management');

library
  .command('status', { isDefault: true })
  .description('View library status and installed components')
  .option('--json', 'Output as JSON')
  .action(async (options) => {
    await libraryCommand({
      json: options.json,
    });
  });

library
  .command('regenerate')
  .description('Regenerate all installed components (refetch and reconvert symbols, footprints, 3D models)')
  .option('-p, --project <path>', 'Regenerate project-local library')
  .option('--no-3d', 'Skip 3D model download')
  .action(async (options) => {
    await regenerateCommand({
      projectPath: options.project,
      include3d: options['3d'],
    });
  });

program
  .command('validate [id]')
  .description('Validate footprint/symbol generation against JLCPCB reference')
  .option('--footprint-only', 'Only validate footprint')
  .option('--symbol-only', 'Only validate symbol')
  .option('-c, --category <name>', 'Validate all components in category')
  .option('-a, --all', 'Validate all test fixtures')
  .option('--html <path>', 'Output HTML report to file')
  .option('--json', 'Output as JSON')
  .action(async (id, options) => {
    await validateCommand(id, {
      footprintOnly: options.footprintOnly,
      symbolOnly: options.symbolOnly,
      category: options.category,
      all: options.all,
      html: options.html,
      json: options.json,
    });
  });

// EasyEDA subcommand group
const easyeda = program
  .command('easyeda')
  .description('EasyEDA community component browser');

easyeda
  .command('search <query...>')
  .description('Open browser-based component search')
  .option('-p, --port <number>', 'HTTP server port', parsePositiveInt, 3847)
  .option('--json', 'Output clean JSON search results and do not open a browser')
  .option('--no-open', 'Start the browser server without opening a browser')
  .option('--once', 'Print the browser URL and exit after the server is ready')
  .action(async (queryParts: string[], options) => {
    const query = queryParts.join(' ');
    await easyedaSearchCommand(query, {
      port: options.port,
      json: options.json,
      open: options.open,
      once: options.once,
    });
  });

easyeda
  .command('install [uuid]')
  .description('Install EasyEDA community component to KiCad libraries')
  .option('-p, --project <path>', 'Install to project-local library')
  .option('--with-3d', 'Include 3D model')
  .option('-y, --yes', 'Install directly without launching the TUI')
  .option('--json', 'Output clean JSON and install directly')
  .option('-f, --force', 'Force reinstall (regenerate symbol and footprint)')
  .action(async (uuid, options) => {
    await easyedaInstallCommand(uuid, {
      projectPath: options.project,
      include3d: options.with3d,
      yes: options.yes,
      json: options.json,
      force: options.force,
    });
  });

program.parseAsync().catch((error) => {
  console.error(`Error: ${getErrorMessage(error)}`);
  process.exit(1);
});
