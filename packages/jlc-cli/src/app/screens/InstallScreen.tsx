import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { createLibraryService, type InstallResult } from 'jlc-core';
import { useNavigation, useCurrentScreen } from '../navigation/NavigationContext.js';
import type { InstallParams } from '../navigation/types.js';

const libraryService = createLibraryService();

export function InstallScreen() {
  const { replace } = useNavigation();
  const { params } = useCurrentScreen() as { screen: 'install'; params: InstallParams };

  const [status, setStatus] = useState<'installing' | 'done'>('installing');

  useEffect(() => {
    let mounted = true;

    async function install() {
      try {
        const result: InstallResult = await libraryService.install(params.componentId, {});
        if (mounted) {
          replace('installed', {
            componentId: params.componentId,
            component: params.component,
            result,
          });
        }
      } catch (err) {
        if (mounted) {
          replace('installed', {
            componentId: params.componentId,
            component: params.component,
            error: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    }

    install();

    return () => {
      mounted = false;
    };
  }, [params.componentId, params.component, replace]);

  return (
    <Box flexDirection="column">
      <Text color="yellow">⏳ Installing {params.componentId}...</Text>
      <Box marginTop={1}>
        <Text dimColor>Fetching from EasyEDA and converting to KiCad format...</Text>
      </Box>
    </Box>
  );
}
