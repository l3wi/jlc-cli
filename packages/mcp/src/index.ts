#!/usr/bin/env node

/**
 * jlc-mcp
 * MCP server for JLC/EasyEDA component sourcing and library conversion
 *
 * This server uses LCSC part numbers (e.g., C2040) because LCSC is JLC PCB's
 * preferred component supplier for PCB assembly (PCBA). Components sourced via
 * LCSC are guaranteed to be available for JLC's assembly service.
 *
 * EasyEDA (owned by JLC/LCSC) provides the symbol and footprint data.
 */

import { createRequire } from 'module';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { tools, dispatchToolCall } from './tools/index.js';
import { createLogger, ensureGlobalLibraryTables, startHttpServer, stopHttpServer } from '@jlcpcb/core';

const require = createRequire(import.meta.url);
const { version } = require('../package.json');

const logger = createLogger('jlc-mcp');

// Create MCP server
const server = new Server(
  {
    name: 'jlc-mcp',
    version,
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Handle list tools request
server.setRequestHandler(ListToolsRequestSchema, async () => {
  logger.debug('Listing tools');
  return { tools };
});

// Handle tool calls
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  logger.debug(`Tool call: ${name}`, args);

  return dispatchToolCall(name, args);
});

let shutdownPromise: Promise<void> | undefined;
function shutdown(): Promise<void> {
  if (!shutdownPromise) {
    shutdownPromise = Promise.resolve().then(async () => {
      stopHttpServer();
      await server.close();
    });
  }
  return shutdownPromise;
}

function handleShutdown() {
  void shutdown().catch((error) => {
    logger.error('Shutdown error', error);
    process.exitCode = 1;
  });
}

function handleTransportError(error: Error) {
  logger.error('Transport error', error);
  process.exitCode = 1;
  handleShutdown();
}

// The stdio transport does not observe EOF itself. Close the HTTP listener as well
// so a disconnected client cannot leave an orphaned MCP process behind.
process.stdin.once('end', handleShutdown);
process.stdin.once('close', handleShutdown);
process.stdin.once('error', handleTransportError);
process.stdout.once('error', handleTransportError);
process.once('SIGINT', handleShutdown);
process.once('SIGTERM', handleShutdown);
server.onclose = handleShutdown;

// Run the server
async function main() {
  // Register JLC libraries in KiCad global tables
  const registration = await ensureGlobalLibraryTables();

  if (!registration.success) {
    logger.error('Failed to register JLC libraries in KiCad global tables', {
      errors: registration.errors,
    });
    throw new Error('Failed to register JLC libraries');
  }

  // Log registration summary
  const { symLibTable, fpLibTable, libraryStubs, version } = registration;
  if (symLibTable.created || symLibTable.modified || fpLibTable.created || fpLibTable.modified) {
    logger.info(`JLC libraries registered in KiCad ${version}`, {
      symLibTable: symLibTable.created
        ? `created with ${symLibTable.entriesAdded} entries`
        : symLibTable.modified
          ? `added ${symLibTable.entriesAdded} entries`
          : 'already configured',
      fpLibTable: fpLibTable.created
        ? 'created'
        : fpLibTable.modified
          ? 'updated'
          : 'already configured',
      stubsCreated: libraryStubs.symbolsCreated.length + libraryStubs.directoriesCreated.length,
    });
  }

  if (shutdownPromise || process.stdin.readableEnded || process.stdin.destroyed) {
    await shutdown();
    return;
  }

  // Start HTTP server for the component browser UI
  const httpPort = startHttpServer();
  logger.info(`Component browser available at http://localhost:${httpPort}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('JLC MCP server running on stdio');
}

main().catch(async (error) => {
  logger.error('Server error', error);
  process.exitCode = 1;
  await shutdown().catch((shutdownError) => {
    logger.error('Shutdown error', shutdownError);
  });
});
