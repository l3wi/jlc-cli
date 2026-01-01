import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { createComponentService, type ComponentSearchResult } from '@jlcpcb/core';
import { useNavigation, useCurrentScreen } from '../navigation/NavigationContext.js';
import type { SearchParams } from '../navigation/types.js';
import { useAppState } from '../state/AppStateContext.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { ListView } from '../components/ListView.js';

const componentService = createComponentService();

export function SearchScreen() {
  const { push } = useNavigation();
  const { params } = useCurrentScreen() as { screen: 'search'; params: SearchParams };
  const { selectedIndex, setSelectedIndex, isFiltered, setIsFiltered, resetSelection } = useAppState();
  const { columns: terminalWidth } = useTerminalSize();

  const [results, setResults] = useState<ComponentSearchResult[]>(params.results);
  const [isSearching, setIsSearching] = useState(false);

  useInput(async (input, key) => {
    if (isSearching) return;

    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      setSelectedIndex(Math.min(results.length - 1, selectedIndex + 1));
    } else if (key.return && results[selectedIndex]) {
      push('info', {
        componentId: results[selectedIndex].lcscId,
        component: results[selectedIndex],
      });
    } else if (key.tab) {
      setIsSearching(true);
      const newFiltered = !isFiltered;
      try {
        let newResults = await componentService.search(params.query, {
          limit: 20,
          basicOnly: newFiltered,
        });
        newResults = newResults.sort((a, b) => {
          if (a.libraryType === 'basic' && b.libraryType !== 'basic') return -1;
          if (a.libraryType !== 'basic' && b.libraryType === 'basic') return 1;
          return 0;
        });
        setResults(newResults);
        resetSelection();
        setIsFiltered(newFiltered);
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
