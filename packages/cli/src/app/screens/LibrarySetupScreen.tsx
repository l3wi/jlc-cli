import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { createLibraryService } from '@jlcpcb/core';
import { useNavigation, useCurrentScreen } from '../navigation/NavigationContext.js';
import type { LibrarySetupParams } from '../navigation/types.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { Divider } from '../components/Divider.js';

const libraryService = createLibraryService();

export function LibrarySetupScreen() {
  const { push, pop } = useNavigation();
  const { params } = useCurrentScreen() as { screen: 'library-setup'; params: LibrarySetupParams };
  const { columns: terminalWidth } = useTerminalSize();

  const [selectedOption, setSelectedOption] = useState<'install' | 'cancel'>('install');
  const [isInstalling, setIsInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useInput((input, key) => {
    if (isInstalling) return;

    if (key.leftArrow || key.rightArrow || input === 'h' || input === 'l') {
      setSelectedOption(selectedOption === 'install' ? 'cancel' : 'install');
    } else if (key.return) {
      if (selectedOption === 'cancel') {
        pop();
      } else {
        setIsInstalling(true);
        setError(null);
        libraryService
          .ensureGlobalTables()
          .then(() => {
            // Success - continue to install the component
            push('install', {
              componentId: params.componentId,
              component: params.component,
            });
          })
          .catch((err) => {
            setError(err instanceof Error ? err.message : 'Unknown error');
            setIsInstalling(false);
          });
      }
    } else if (key.escape) {
      pop();
    }
  });

  if (isInstalling) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold color="yellow">Setting Up Libraries</Text>
        </Box>
        <Box marginTop={1}>
          <Text color="yellow">Creating library directories...</Text>
        </Box>
        <Box marginTop={1}>
          <Text dimColor>Registering with KiCad symbol and footprint tables...</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold color="yellow">Library Setup Required</Text>
      </Box>

      <Box marginBottom={1}>
        <Text>
          JLC-MCP libraries need to be installed and linked to KiCad before you can install components.
        </Text>
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Text dimColor>This will:</Text>
        <Text dimColor>  • Create library directories in ~/Documents/KiCad/*/3rdparty/</Text>
        <Text dimColor>  • Register libraries in KiCad's symbol and footprint tables</Text>
      </Box>

      {error && (
        <Box marginTop={1}>
          <Text color="red">Error: {error}</Text>
        </Box>
      )}

      <Box marginTop={2}>
        <Divider width={terminalWidth} />
      </Box>

      <Box marginTop={1} gap={2}>
        <Text
          inverse={selectedOption === 'install'}
          color={selectedOption === 'install' ? 'green' : undefined}
        >
          {' Install Libraries '}
        </Text>
        <Text
          inverse={selectedOption === 'cancel'}
          color={selectedOption === 'cancel' ? 'red' : undefined}
        >
          {' Cancel '}
        </Text>
      </Box>

      <Box marginTop={1}>
        <Divider width={terminalWidth} />
      </Box>
      <Box>
        <Text dimColor>←/→ Select • Enter Confirm • Esc Cancel</Text>
      </Box>
      <Box>
        <Divider width={terminalWidth} />
      </Box>
    </Box>
  );
}
