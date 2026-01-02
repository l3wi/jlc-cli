#!/usr/bin/env node

/**
 * jlc-cli
 * CLI for JLC/EasyEDA component sourcing and KiCad library management
 */

import { Command } from 'commander';
import { searchCommand } from './commands/search.js';
import { infoCommand } from './commands/info.js';
import { installCommand } from './commands/install.js';
import { libraryCommand, regenerateCommand } from './commands/library.js';
import { easyedaSearchCommand, easyedaInstallCommand } from './commands/easyeda.js';
import { validateCommand } from './commands/validate.js';

const program = new Command();

program
  .name('jlc')
  .description('JLC/EasyEDA component sourcing and KiCad library management')
  .version('0.1.0');

program
  .command('search <query...>')
  .description('Search for components (basic parts sorted first)')
  .option('-l, --limit <number>', 'Maximum results', '20')
  .option('--in-stock', 'Only show in-stock components')
  .option('--basic-only', 'Only show basic parts (no extended)')
  .option('--community', 'Search EasyEDA community library')
  .action(async (queryParts: string[], options) => {
    const query = queryParts.join(' ');
    await searchCommand(query, {
      limit: parseInt(options.limit, 10),
      inStock: options.inStock,
      basicOnly: options.basicOnly || false,
      source: options.community ? 'easyeda-community' : 'lcsc',
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
  .option('-f, --force', 'Force reinstall (regenerate symbol and footprint)')
  .action(async (id, options) => {
    await installCommand(id, {
      projectPath: options.project,
      include3d: options.with3d,
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
  .option('-p, --port <number>', 'HTTP server port', '3847')
  .action(async (queryParts: string[], options) => {
    const query = queryParts.join(' ');
    await easyedaSearchCommand(query, {
      port: options.port ? parseInt(options.port, 10) : undefined,
    });
  });

easyeda
  .command('install [uuid]')
  .description('Install EasyEDA community component to KiCad libraries')
  .option('-p, --project <path>', 'Install to project-local library')
  .option('--with-3d', 'Include 3D model')
  .option('-f, --force', 'Force reinstall (regenerate symbol and footprint)')
  .action(async (uuid, options) => {
    await easyedaInstallCommand(uuid, {
      projectPath: options.project,
      include3d: options.with3d,
      force: options.force,
    });
  });

program.parse();
