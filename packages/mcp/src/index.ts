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

import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';

import { tools, toolHandlers } from './tools/index.js';
import { createLogger, ensureGlobalLibraryTables, startHttpServer } from '@jlcpcb/core';

const logger = createLogger('jlc-mcp');

// Create MCP server
const server = new Server(
  {
    name: 'jlc-mcp',
    version: '0.1.0',
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

  const handler = toolHandlers[name];

  if (!handler) {
    return {
      content: [{ type: 'text', text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    return await handler(args);
  } catch (error) {
    logger.error(`Tool error: ${name}`, error);
    return {
      content: [{
        type: 'text',
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      }],
      isError: true,
    };
  }
});

// Run the server
async function main() {
  // Register JLC libraries in KiCad global tables
  const registration = await ensureGlobalLibraryTables();

  if (!registration.success) {
    logger.error('Failed to register JLC libraries in KiCad global tables', {
      errors: registration.errors,
    });
    process.exit(1);
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

  // Start HTTP server for the component browser UI
  const httpPort = startHttpServer();
  logger.info(`Component browser available at http://localhost:${httpPort}`);

  const transport = new StdioServerTransport();
  await server.connect(transport);
  logger.info('JLC MCP server running on stdio');
}

main().catch((error) => {
  logger.error('Server error', error);
  process.exit(1);
});
