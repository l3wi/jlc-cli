import React, { useEffect, useState, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { createComponentService, createLibraryService, type EasyEDACommunityComponent } from '@jlcpcb/core';
import { useNavigation, useCurrentScreen } from '../navigation/NavigationContext.js';
import type { EasyEDAInfoParams } from '../navigation/types.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { EasyEDADetailView } from '../components/EasyEDADetailView.js';

const componentService = createComponentService();
const libraryService = createLibraryService();

export function EasyEDAInfoScreen() {
  const { replace } = useNavigation();
  const { params } = useCurrentScreen() as { screen: 'easyeda-info'; params: EasyEDAInfoParams };
  const { columns: terminalWidth } = useTerminalSize();

  const [component, setComponent] = useState<EasyEDACommunityComponent | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInstalling, setIsInstalling] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const installingRef = useRef(false);

  // Always fetch component to keep the process alive
  useEffect(() => {
    const init = async () => {
      if (!params.uuid) {
        setError('No UUID provided');
        setIsLoading(false);
        return;
      }

      try {
        // Ensure global tables are set up
        await libraryService.ensureGlobalTables();

        // Fetch component
        const fetched = await componentService.fetchCommunity(params.uuid);
        if (fetched) {
          setComponent(fetched);
          // Check if already installed
          const installed = await libraryService.isEasyEDAInstalled(fetched.title);
          setIsInstalled(installed);
        } else {
          setError('Component not found');
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to fetch component');
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, [params.uuid]);

  useInput((input, key) => {
    if (isLoading || !component || isInstalling) return;

    const lowerInput = input.toLowerCase();

    // R - Regenerate (force reinstall)
    if (lowerInput === 'r') {
      if (installingRef.current) return;
      installingRef.current = true;
      setIsInstalling(true);
      setStatusMessage('Regenerating symbol and footprint...');

      libraryService.install(params.uuid, { force: true })
        .then((result) => {
          setStatusMessage(`✓ Reinstalled: ${result.symbolRef}`);
          setIsInstalled(true);
          setTimeout(() => setStatusMessage(null), 3000);
        })
        .catch((err) => {
          setStatusMessage(`✗ Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
          setTimeout(() => setStatusMessage(null), 3000);
        })
        .finally(() => {
          setIsInstalling(false);
          installingRef.current = false;
        });
      return;
    }

    // Enter - Install
    if (key.return) {
      if (installingRef.current) return;
      installingRef.current = true;
      setIsInstalling(true);
      setStatusMessage('Installing component...');

      // Ensure libraries are set up
      libraryService.ensureGlobalTables()
        .then(() => libraryService.install(params.uuid, {}))
        .then((result) => {
          if (result.symbolAction === 'exists') {
            setStatusMessage(`⚡ Already installed (use R to reinstall)`);
          } else {
            setStatusMessage(`✓ Installed: ${result.symbolRef}`);
            setIsInstalled(true);
          }
          setTimeout(() => setStatusMessage(null), 3000);
        })
        .catch((err) => {
          setStatusMessage(`✗ Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
          setTimeout(() => setStatusMessage(null), 3000);
        })
        .finally(() => {
          setIsInstalling(false);
          installingRef.current = false;
        });
    }
  });

  if (isLoading) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">⏳ Loading component {params.uuid}...</Text>
      </Box>
    );
  }

  if (error || !component) {
    return (
      <Box flexDirection="column">
        <Text color="red">✗ {error || 'Component not found'}</Text>
        <Text dimColor>Press Esc to go back</Text>
      </Box>
    );
  }

  return (
    <Box flexDirection="column">
      <Box marginBottom={1}>
        <Text bold>
          Component: <Text color="cyan">{component.title}</Text>
          {isInstalled && <Text color="green"> ✓ Installed</Text>}
        </Text>
      </Box>
      <EasyEDADetailView
        component={component}
        terminalWidth={terminalWidth}
        isInstalled={isInstalled}
        statusMessage={statusMessage}
      />
    </Box>
  );
}
