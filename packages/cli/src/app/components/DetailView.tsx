import React from 'react';
import { Box, Text } from 'ink';
import type { InstalledComponent } from '@jlcpcb/core';
import { Divider } from './Divider.js';

// Flexible component type that accepts both ComponentSearchResult and ComponentDetails
export interface DetailViewComponent {
  lcscId: string;
  name?: string;
  manufacturer?: string;
  package?: string;
  stock?: number;
  price?: number;
  libraryType?: 'basic' | 'extended';
  description?: string;
  datasheetPdf?: string;
  datasheet?: string; // ComponentDetails uses this instead of datasheetPdf
  attributes?: Record<string, unknown>;
}

interface DetailViewProps {
  component: DetailViewComponent;
  terminalWidth: number;
  isInstalled?: boolean;
  installedInfo?: InstalledComponent | null;
  statusMessage?: string | null;
}

function formatStock(stock: number): string {
  if (stock < 1000) return String(stock);
  return '>1k';
}

function truncate(str: string, len: number): string {
  if (!str) return '';
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

export function DetailView({ component, terminalWidth, isInstalled, installedInfo, statusMessage }: DetailViewProps) {
  const isWide = terminalWidth >= 80;
  const labelWidth = 16;
  // In wide mode, split into two columns with gap; otherwise full width
  const colWidth = isWide ? Math.floor((terminalWidth - 4) / 2) : terminalWidth - 2;
  const valueWidth = colWidth - labelWidth - 1;
  const attrLabelWidth = 20;
  const attrValueWidth = colWidth - attrLabelWidth - 1;

  const description = (
    <Box flexDirection="column" marginBottom={1} width={terminalWidth - 2}>
      <Text dimColor>Description</Text>
      <Text wrap="wrap">{component.description || 'No description'}</Text>
    </Box>
  );

  const partInfo = (
    <Box flexDirection="column" width={colWidth}>
      <Text bold underline color="cyan">Part Info</Text>
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text dimColor>{'Manufacturer'.padEnd(labelWidth)}</Text>
          <Text>{truncate(component.manufacturer || 'N/A', valueWidth)}</Text>
        </Box>
        <Box>
          <Text dimColor>{'MFR.Part #'.padEnd(labelWidth)}</Text>
          <Text bold>{truncate(component.name || 'N/A', valueWidth)}</Text>
        </Box>
        <Box>
          <Text dimColor>{'JLCPCB Part #'.padEnd(labelWidth)}</Text>
          <Text color="cyan" bold>{component.lcscId}</Text>
        </Box>
        <Box>
          <Text dimColor>{'Package'.padEnd(labelWidth)}</Text>
          <Text>{truncate(component.package || 'N/A', valueWidth)}</Text>
        </Box>
        <Box>
          <Text dimColor>{'Stock'.padEnd(labelWidth)}</Text>
          <Text>{component.stock !== undefined ? formatStock(component.stock) : 'N/A'}</Text>
        </Box>
        <Box>
          <Text dimColor>{'Price'.padEnd(labelWidth)}</Text>
          <Text color="green">{component.price ? `$${component.price.toFixed(4)}` : 'N/A'}</Text>
        </Box>
        <Box>
          <Text dimColor>{'Library Type'.padEnd(labelWidth)}</Text>
          <Text color={component.libraryType === 'basic' ? 'green' : 'yellow'}>
            {component.libraryType === 'basic' ? 'Basic' : 'Extended'}
          </Text>
        </Box>
      </Box>
    </Box>
  );

  const hasAttributes = component.attributes && Object.keys(component.attributes).length > 0;
  const attributes = hasAttributes ? (
    <Box flexDirection="column" marginLeft={isWide ? 2 : 0} marginTop={isWide ? 0 : 1} width={colWidth}>
      <Text bold underline color="cyan">Attributes</Text>
      <Box marginTop={1} flexDirection="column">
        {Object.entries(component.attributes!).slice(0, 10).map(([key, value]) => {
          const keyWidth = Math.max(key.length + 1, attrLabelWidth);
          const remainingWidth = colWidth - keyWidth - 1;
          return (
            <Box key={key}>
              <Text dimColor>{key.padEnd(keyWidth)}</Text>
              <Text>{truncate(String(value), remainingWidth)}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  ) : null;

  const datasheetUrl = component.datasheetPdf || component.datasheet;
  const datasheet = datasheetUrl ? (
    <Box flexDirection="column" marginTop={1} width={terminalWidth - 2}>
      <Text dimColor>Datasheet</Text>
      <Text color="blue" wrap="wrap">{truncate(datasheetUrl, terminalWidth - 4)}</Text>
    </Box>
  ) : null;

  // Show installation info if installed
  const installInfo = isInstalled && installedInfo ? (
    <Box flexDirection="column" marginTop={1} width={terminalWidth - 2}>
      <Text bold underline color="green">Installation</Text>
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text dimColor>{'Symbol'.padEnd(labelWidth)}</Text>
          <Text color="cyan">{truncate(installedInfo.symbolRef, terminalWidth - labelWidth - 4)}</Text>
        </Box>
        <Box>
          <Text dimColor>{'Footprint'.padEnd(labelWidth)}</Text>
          <Text color="cyan">{truncate(installedInfo.footprintRef || 'N/A', terminalWidth - labelWidth - 4)}</Text>
        </Box>
        <Box>
          <Text dimColor>{'3D Model'.padEnd(labelWidth)}</Text>
          <Text color={installedInfo.has3dModel ? 'green' : 'yellow'}>
            {installedInfo.has3dModel ? 'Yes' : 'No'}
          </Text>
        </Box>
      </Box>
    </Box>
  ) : null;

  // Footer text based on installation status
  const footerText = isInstalled
    ? 'R Regenerate • D Delete • O Datasheet • Esc Back'
    : 'Enter Install • O Datasheet • Esc Back';

  return (
    <Box flexDirection="column" width="100%">
      {description}
      <Box flexDirection={isWide ? 'row' : 'column'} width="100%">
        {partInfo}
        {attributes}
      </Box>
      {installInfo}
      {datasheet}
      <Box marginTop={1} flexDirection="column" width="100%">
        <Divider width={terminalWidth} />
        {statusMessage && (
          <Box paddingY={0}>
            <Text color={statusMessage.startsWith('✓') ? 'green' : statusMessage.startsWith('✗') ? 'red' : 'yellow'}>
              {statusMessage}
            </Text>
          </Box>
        )}
        <Box paddingY={0}>
          <Text dimColor>{footerText}</Text>
        </Box>
        <Divider width={terminalWidth} />
      </Box>
    </Box>
  );
}
