import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { createComponentService } from '@jlcpcb/core';
import { useNavigation, useCurrentScreen } from '../navigation/NavigationContext.js';
import type { SearchParams } from '../navigation/types.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { ListView } from '../components/ListView.js';

const componentService = createComponentService();

export function SearchScreen() {
  const { push, replace } = useNavigation();
  const { params } = useCurrentScreen() as { screen: 'search'; params: SearchParams };
  const { columns: terminalWidth } = useTerminalSize();

  const { results, selectedIndex = 0 } = params;
  const isFiltered = params.searchOptions?.basicOnly ?? false;
  const [isSearching, setIsSearching] = useState(false);

  useInput(async (input, key) => {
    if (isSearching) return;

    if (key.upArrow) {
      replace('search', { ...params, selectedIndex: Math.max(0, selectedIndex - 1) });
    } else if (key.downArrow) {
      replace('search', { ...params, selectedIndex: Math.max(0, Math.min(results.length - 1, selectedIndex + 1)) });
    } else if (key.return && results[selectedIndex]) {
      const selected = results[selectedIndex];
      if (selected.idType === 'easyeda_uuid') {
        push('easyeda-info', {
          uuid: selected.easyedaUuid ?? selected.id,
          installOptions: params.installOptions,
        });
      } else {
        push('info', {
          componentId: selected.lcscId ?? selected.id,
          component: selected,
          installOptions: params.installOptions,
        });
      }
    } else if (key.tab) {
      setIsSearching(true);
      const newFiltered = !isFiltered;
      try {
        const searchOptions = { ...params.searchOptions, basicOnly: newFiltered };
        let newResults = await componentService.search(params.query, searchOptions);
        newResults = newResults.sort((a, b) => {
          if (a.libraryType === 'basic' && b.libraryType !== 'basic') return -1;
          if (a.libraryType !== 'basic' && b.libraryType === 'basic') return 1;
          return 0;
        });
        replace('search', { ...params, results: newResults, searchOptions, selectedIndex: 0 });
      } catch {
        // Keep existing results on error
      }
      setIsSearching(false);
    }
  });

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>
          Search: <Text color="cyan">{params.query}</Text>
          {' '}
          <Text dimColor>({results.length} results{isFiltered ? ' - Basic/Preferred only' : ''})</Text>
          {isSearching && <Text color="yellow"> ⏳</Text>}
        </Text>
      </Box>
      <ListView
        results={results}
        selectedIndex={selectedIndex}
        isFiltered={isFiltered}
        terminalWidth={terminalWidth}
      />
    </Box>
  );
}
