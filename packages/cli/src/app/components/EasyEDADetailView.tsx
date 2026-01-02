import React from 'react';
import { Box, Text } from 'ink';
import type { EasyEDACommunityComponent } from '@jlcpcb/core';
import { Divider } from './Divider.js';

interface EasyEDADetailViewProps {
  component: EasyEDACommunityComponent;
  terminalWidth: number;
  isInstalled?: boolean;
  statusMessage?: string | null;
}

function truncate(str: string, len: number): string {
  if (!str) return '';
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

function formatDate(timestamp: number): string {
  if (!timestamp) return 'N/A';
  const date = new Date(timestamp * 1000);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

export function EasyEDADetailView({ component, terminalWidth, isInstalled, statusMessage }: EasyEDADetailViewProps) {
  const isWide = terminalWidth >= 80;
  const labelWidth = 16;
  const colWidth = isWide ? Math.floor((terminalWidth - 4) / 2) : terminalWidth - 2;
  const valueWidth = colWidth - labelWidth - 1;

  const description = (
    <Box flexDirection="column" marginBottom={1} width={terminalWidth - 2}>
      <Text dimColor>Description</Text>
      <Text wrap="wrap">{component.description || 'No description'}</Text>
    </Box>
  );

  const partInfo = (
    <Box flexDirection="column" width={colWidth}>
      <Text bold underline color="cyan">Component Info</Text>
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text dimColor>{'Title'.padEnd(labelWidth)}</Text>
          <Text bold>{truncate(component.title || 'N/A', valueWidth)}</Text>
        </Box>
        <Box>
          <Text dimColor>{'UUID'.padEnd(labelWidth)}</Text>
          <Text color="cyan">{truncate(component.uuid, valueWidth)}</Text>
        </Box>
        <Box>
          <Text dimColor>{'Package'.padEnd(labelWidth)}</Text>
          <Text>{truncate(component.footprint?.name || 'N/A', valueWidth)}</Text>
        </Box>
        <Box>
          <Text dimColor>{'Pins'.padEnd(labelWidth)}</Text>
          <Text>{component.symbol?.pins?.length || 0}</Text>
        </Box>
        <Box>
          <Text dimColor>{'Pads'.padEnd(labelWidth)}</Text>
          <Text>{component.footprint?.pads?.length || 0}</Text>
        </Box>
        <Box>
          <Text dimColor>{'3D Model'.padEnd(labelWidth)}</Text>
          <Text color={component.model3d ? 'green' : 'yellow'}>
            {component.model3d ? 'Yes' : 'No'}
          </Text>
        </Box>
        <Box>
          <Text dimColor>{'Verified'.padEnd(labelWidth)}</Text>
          <Text color={component.verify ? 'green' : 'yellow'}>
            {component.verify ? 'Yes' : 'No'}
          </Text>
        </Box>
      </Box>
    </Box>
  );

  const communityInfo = (
    <Box flexDirection="column" marginLeft={isWide ? 2 : 0} marginTop={isWide ? 0 : 1} width={colWidth}>
      <Text bold underline color="cyan">Community</Text>
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text dimColor>{'Owner'.padEnd(labelWidth)}</Text>
          <Text>{truncate(component.owner?.nickname || component.owner?.username || 'N/A', valueWidth)}</Text>
        </Box>
        {component.creator && component.creator.uuid !== component.owner?.uuid && (
          <Box>
            <Text dimColor>{'Creator'.padEnd(labelWidth)}</Text>
            <Text>{truncate(component.creator.nickname || component.creator.username || 'N/A', valueWidth)}</Text>
          </Box>
        )}
        <Box>
          <Text dimColor>{'Updated'.padEnd(labelWidth)}</Text>
          <Text>{formatDate(component.updateTime)}</Text>
        </Box>
        {component.tags && component.tags.length > 0 && (
          <Box>
            <Text dimColor>{'Tags'.padEnd(labelWidth)}</Text>
            <Text>{truncate(component.tags.slice(0, 3).join(', '), valueWidth)}</Text>
          </Box>
        )}
      </Box>
    </Box>
  );

  const footerText = isInstalled
    ? 'R Regenerate • Esc Back'
    : 'Enter Install • Esc Back';

  return (
    <Box flexDirection="column" width="100%">
      {description}
      <Box flexDirection={isWide ? 'row' : 'column'} width="100%">
        {partInfo}
        {communityInfo}
      </Box>
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
