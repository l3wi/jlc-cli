/**
 * Search command
 * Interactive search for components from LCSC or EasyEDA community
 */

import { createComponentService, type SearchOptions } from '@jlcpcb/core';
import { renderApp } from '../app/App.js';
import { printJson, printJsonError, getErrorMessage } from '../utils/agent-output.js';
import { formatSearchResultForJson } from '../utils/search-result-output.js';

const componentService = createComponentService();

interface SearchCommandOptions extends SearchOptions {
  json?: boolean;
}

export async function searchCommand(query: string, options: SearchCommandOptions): Promise<void> {
  if (!options.json) {
    console.log(`Searching for "${query}"...`);
  }

  try {
    let results = await componentService.search(query, options);

    // Sort results: basic parts first, then extended
    if (!options.basicOnly) {
      results = results.sort((a, b) => {
        if (a.libraryType === 'basic' && b.libraryType !== 'basic') return -1;
        if (a.libraryType !== 'basic' && b.libraryType === 'basic') return 1;
        return 0;
      });
    }

    if (results.length === 0) {
      if (options.json) {
        printJson({
          success: true,
          query,
          count: 0,
          results: [],
        });
        return;
      }

      console.log('No components found. Try a different search term.');
      return;
    }

    if (options.json) {
      printJson({
        success: true,
        query,
        count: results.length,
        results: results.map(formatSearchResultForJson),
      });
      return;
    }

    // Clear the "Searching..." line and launch interactive UI
    process.stdout.write('\x1b[1A\x1b[2K');
    await renderApp('search', { query, results });
  } catch (error) {
    if (options.json) {
      printJsonError('search_failed', getErrorMessage(error), { retryable: true });
    } else {
      console.error(`Search failed: ${getErrorMessage(error)}`);
    }
    process.exit(1);
  }
}
