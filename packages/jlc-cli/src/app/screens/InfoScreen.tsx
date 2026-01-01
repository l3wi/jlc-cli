import React, { useEffect, useState, useRef } from 'react';
import { Box, Text, useInput } from 'ink';
import { createComponentService, createLibraryService, type InstalledComponent } from '@jlcpcb/core';
import open from 'open';
import { useNavigation, useCurrentScreen } from '../navigation/NavigationContext.js';
import type { InfoParams, ComponentInfo } from '../navigation/types.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { DetailView, type DetailViewComponent } from '../components/DetailView.js';

const componentService = createComponentService();
const libraryService = createLibraryService();

export function InfoScreen() {
  const { push } = useNavigation();
  const { params } = useCurrentScreen() as { screen: 'info'; params: InfoParams };
  const { columns: terminalWidth } = useTerminalSize();

  const [component, setComponent] = useState<ComponentInfo | null>(
    params.component || null
  );
  const [installedInfo, setInstalledInfo] = useState<InstalledComponent | null>(null);
  const [libraryStatus, setLibraryStatus] = useState<Awaited<ReturnType<typeof libraryService.getStatus>> | null>(null);
  const [isLoading, setIsLoading] = useState(!params.component);
  const [error, setError] = useState<string | null>(null);
  const [isCheckingLibrary, setIsCheckingLibrary] = useState(false);
  const checkingRef = useRef(false);

  // Check if component is installed and fetch full details
  useEffect(() => {
    const componentId = params.componentId;
    if (!componentId) return;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        // Fetch library status (for paths)
        const status = await libraryService.getStatus();
        setLibraryStatus(status);

        // Check if already installed
        const installed = await libraryService.listInstalled({});
        const found = installed.find(c => c.lcscId === componentId);
        if (found) {
          setInstalledInfo(found);
        }

        // Fetch full details from API (always, to get price/stock/attributes)
        const searchResults = await componentService.search(componentId, { limit: 1 });
        if (searchResults.length > 0) {
          setComponent(searchResults[0]);
        } else if (!params.component) {
          // Fallback to getDetails if search didn't work
          const details = await componentService.getDetails(componentId);
          if (details) {
            setComponent(details);
          } else {
            setError('Component not found');
          }
        }
      } catch (err) {
        if (!params.component) {
          setError(err instanceof Error ? err.message : 'Failed to fetch component');
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [params.componentId, params.component]);

  // Get datasheet URL (different field names in different types)
  const datasheetUrl = component && ('datasheetPdf' in component ? component.datasheetPdf : 'datasheet' in component ? component.datasheet : undefined);

  const [isRegenerating, setIsRegenerating] = useState(false);
  const [regenerateMessage, setRegenerateMessage] = useState<string | null>(null);

  useInput((input, key) => {
    if (isLoading || !component || isCheckingLibrary || isRegenerating) return;

    const lowerInput = input.toLowerCase();

    // S - Open Symbol in KiCad
    if (lowerInput === 's' && installedInfo && libraryStatus) {
      const symbolPath = `${libraryStatus.paths.symbolsDir}/JLC-MCP-${installedInfo.category}.kicad_sym`;
      open(symbolPath);
      return;
    }

    // F - Open Footprint in KiCad
    if (lowerInput === 'f' && installedInfo && libraryStatus) {
      if (installedInfo.footprintRef?.startsWith('JLC-MCP:')) {
        const fpName = installedInfo.footprintRef.split(':')[1];
        const footprintPath = `${libraryStatus.paths.footprintsDir}/JLC-MCP.pretty/${fpName}.kicad_mod`;
        open(footprintPath);
      }
      // Standard KiCad footprints can't be opened directly
      return;
    }

    // M - Open 3D Model
    if (lowerInput === 'm' && installedInfo && libraryStatus && installedInfo.has3dModel) {
      const modelPath = `${libraryStatus.paths.models3dDir}/${installedInfo.name}.step`;
      open(modelPath);
      return;
    }

    // R - Regenerate symbol and footprint
    if (lowerInput === 'r' && installedInfo) {
      setIsRegenerating(true);
      setRegenerateMessage('Regenerating symbol and footprint...');

      libraryService.install(component.lcscId, { force: true })
        .then((result) => {
          setRegenerateMessage(`✓ Regenerated: ${result.symbolAction}`);
          // Clear message after 2 seconds
          setTimeout(() => setRegenerateMessage(null), 2000);
        })
        .catch((err) => {
          setRegenerateMessage(`✗ Failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
          setTimeout(() => setRegenerateMessage(null), 3000);
        })
        .finally(() => setIsRegenerating(false));
      return;
    }

    // D - Open Datasheet
    if (lowerInput === 'd' && datasheetUrl) {
      open(datasheetUrl);
      return;
    }

    // Enter - Install (only when not installed)
    if (key.return && !installedInfo) {
      if (checkingRef.current) return;
      checkingRef.current = true;
      setIsCheckingLibrary(true);

      if (libraryStatus && (!libraryStatus.installed || !libraryStatus.linked)) {
        // Libraries not set up - show setup screen
        push('library-setup', {
          componentId: component.lcscId,
          component,
        });
        setIsCheckingLibrary(false);
        checkingRef.current = false;
      } else {
        // Libraries ready - proceed to install
        push('install', {
          componentId: component.lcscId,
          component,
        });
        setIsCheckingLibrary(false);
        checkingRef.current = false;
      }
    }
  });

  if (isLoading) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">⏳ Loading component {params.componentId}...</Text>
      </Box>
    );
  }

  if (isCheckingLibrary) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">Checking library status...</Text>
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
          Component: <Text color="cyan">{component.lcscId}</Text>
          {' '}
          <Text dimColor>({component.name})</Text>
          {installedInfo && <Text color="green"> ✓ Installed</Text>}
        </Text>
      </Box>
      <DetailView
        component={component}
        terminalWidth={terminalWidth}
        isInstalled={!!installedInfo}
        installedInfo={installedInfo}
        statusMessage={regenerateMessage}
      />
    </Box>
  );
}
