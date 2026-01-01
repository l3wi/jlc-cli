import React from 'react';
import { Box, Text } from 'ink';
import type { ComponentSearchResult } from 'jlc-core';
import { Divider } from './Divider.js';

interface ListViewProps {
  results: ComponentSearchResult[];
  selectedIndex: number;
  isFiltered: boolean;
  terminalWidth: number;
}

function formatStock(stock: number): string {
  if (stock < 1000) return String(stock);
  return '>1k';
}

function truncate(str: string, len: number): string {
  if (!str) return '';
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

export function ListView({
  results,
  selectedIndex,
  isFiltered,
  terminalWidth,
}: ListViewProps) {
  // Calculate column widths based on terminal width
  const minWidth = 80;
  const availableWidth = Math.max(terminalWidth - 4, minWidth);

  // Fixed columns: MFR.Part(18), Package(10), Stock(6), Price(8), Library(10) + spacing
  const mfrPartWidth = 18;
  const pkgWidth = 10;
  const stockWidth = 6;
  const priceWidth = 8;
  const libraryWidth = 10;
  const fixedWidth = mfrPartWidth + pkgWidth + stockWidth + priceWidth + libraryWidth + 4; // +4 for spacing

  // Description gets all remaining space
  const descWidth = Math.max(availableWidth - fixedWidth, 15);

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold dimColor>
          {'  '}
          {'MFR.Part'.padEnd(mfrPartWidth)}
          {'Description'.padEnd(descWidth)}
          {'Package'.padEnd(pkgWidth)}
          {'Stock'.padStart(stockWidth)}
          {'Price'.padStart(priceWidth)}
          {'  Library'}
        </Text>
      </Box>
      {results.map((r, i) => {
        const isSelected = i === selectedIndex;
        const mfrPart = truncate(r.name || '', mfrPartWidth - 1).padEnd(mfrPartWidth);
        const desc = truncate(r.description || '', descWidth - 1).padEnd(descWidth);
        const pkg = truncate(r.package || '', pkgWidth - 1).padEnd(pkgWidth);
        const stock = formatStock(r.stock || 0).padStart(stockWidth);
        const price = r.price ? `$${r.price.toFixed(2)}`.padStart(priceWidth) : '     N/A';
        const library = r.libraryType === 'basic' ? 'Basic' : 'Extended';
        const libraryColor = r.libraryType === 'basic' ? 'green' : 'yellow';

        return (
          <Box key={r.lcscId}>
            <Text color="cyan">{isSelected ? '▶' : '  '}</Text>
            <Text inverse={isSelected}>
              <Text color="cyan">{mfrPart}</Text>
              <Text dimColor>{desc}</Text>
              {pkg}
              {stock}
              {price}
              {'  '}
              <Text color={libraryColor}>{library}</Text>
            </Text>
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
