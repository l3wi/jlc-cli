import React from 'react';
import { Box, Text } from 'ink';
import { Divider } from './Divider.js';

// Minimal component type for installed view
export interface InstalledViewComponent {
  lcscId: string;
  name?: string;
}

interface InstalledViewProps {
  component: InstalledViewComponent;
  result: { symbolRef: string; footprintRef: string } | null;
  error: string | null;
  terminalWidth: number;
}

export function InstalledView({
  component,
  result,
  error,
  terminalWidth,
}: InstalledViewProps) {
  if (error) {
    return (
      <Box flexDirection="column">
        <Text color="red">✗ Installation failed: {error}</Text>
        <Box marginTop={1} flexDirection="column">
          <Divider width={terminalWidth} />
          <Text dimColor>Press any key to go back</Text>
          <Divider width={terminalWidth} />
        </Box>
      </Box>
    );
  }

  if (!result) {
    return (
      <Box flexDirection="column">
        <Text color="red">✗ Installation failed</Text>
        <Box marginTop={1} flexDirection="column">
          <Divider width={terminalWidth} />
          <Text dimColor>Press any key to go back</Text>
          <Divider width={terminalWidth} />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Text color="green" bold>✓ Installed {component.lcscId}</Text>
      <Box marginTop={1} flexDirection="column">
        <Box>
          <Text dimColor>{'Symbol     '}</Text>
          <Text color="cyan">{result.symbolRef}</Text>
        </Box>
        <Box>
          <Text dimColor>{'Footprint  '}</Text>
          <Text color="cyan">{result.footprintRef}</Text>
        </Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Divider width={terminalWidth} />
        <Text dimColor>Press any key to continue</Text>
        <Divider width={terminalWidth} />
      </Box>
    </Box>
  );
}
