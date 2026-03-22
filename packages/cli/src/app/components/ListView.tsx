import React from 'react';
import { Box, Text } from 'ink';
import type { ComponentSearchResult } from '@jlcpcb/core';
import { Divider } from './Divider.js';
import {
  formatListHeader,
  formatListRow,
  getListViewColumnWidths,
} from './list-view-format.js';

interface ListViewProps {
  results: ComponentSearchResult[];
  selectedIndex: number;
  isFiltered: boolean;
  terminalWidth: number;
}

export function ListView({
  results,
  selectedIndex,
  isFiltered,
  terminalWidth,
}: ListViewProps) {
  const widths = getListViewColumnWidths(terminalWidth);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold dimColor>{formatListHeader(widths)}</Text>
      </Box>
      {results.map((r, i) => {
        const isSelected = i === selectedIndex;
        const row = formatListRow(r, widths);

        return (
          <Box key={r.lcscId}>
            <Text color="cyan">{isSelected ? '▶' : '  '}</Text>
            {isSelected ? (
              <Text inverse>
                {row.mfrPart}
                {row.desc}
                {row.pkg}
                {row.stock}
                {row.price}
                {'  '}
                {row.library}
              </Text>
            ) : (
              <Text>
                <Text color="cyan">{row.mfrPart}</Text>
                <Text dimColor>{row.desc}</Text>
                {row.pkg}
                {row.stock}
                {row.price}
                {'  '}
                <Text color={row.libraryColor}>{row.library}</Text>
              </Text>
            )}
          </Box>
        );
      })}
      <Box marginTop={1} flexDirection="column">
        <Divider width={terminalWidth} />
        <Box paddingY={0}>
          <Text dimColor>
            ↑/↓ Navigate • Enter View • Tab {isFiltered ? 'All Parts' : 'Basic Only'} • Esc Back
          </Text>
        </Box>
        <Divider width={terminalWidth} />
      </Box>
    </Box>
  );
}
