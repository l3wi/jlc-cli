/**
 * Search command
 * Interactive search for components from LCSC or EasyEDA community
 */

import { createComponentService, type SearchOptions } from '@jlcpcb/core';
import { renderApp } from '../app/App.js';

const componentService = createComponentService();

export async function searchCommand(query: string, options: SearchOptions): Promise<void> {
  console.log(`Searching for "${query}"...`);

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
      console.log('No components found. Try a different search term.');
      return;
    }

    // Clear the "Searching..." line and launch interactive UI
    process.stdout.write('\x1b[1A\x1b[2K');
    await renderApp('search', { query, results });
  } catch (error) {
    console.error(`Search failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}
