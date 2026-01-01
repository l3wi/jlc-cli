import React from 'react';
import { Box, Text, useInput } from 'ink';
import { useNavigation, useCurrentScreen } from '../navigation/NavigationContext.js';
import type { InstalledParams } from '../navigation/types.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { InstalledView } from '../components/InstalledView.js';

export function InstalledScreen() {
  const { pop } = useNavigation();
  const { params } = useCurrentScreen() as { screen: 'installed'; params: InstalledParams };
  const { columns: terminalWidth } = useTerminalSize();

  useInput(() => {
    pop();
  });

  const result = params.result
    ? {
        symbolRef: params.result.symbolRef || `JLC:${params.component.name}`,
        footprintRef: params.result.footprintRef || `JLC:${params.component.name}`,
      }
    : null;

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>
          Install: <Text color="cyan">{params.componentId}</Text>
        </Text>
      </Box>
      <InstalledView
        component={params.component}
        result={result}
        error={params.error || null}
        terminalWidth={terminalWidth}
      />
    </Box>
  );
}
