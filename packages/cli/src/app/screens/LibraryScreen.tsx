import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { createLibraryService, createComponentService, type InstalledComponent, type LibraryStatus } from '@jlcpcb/core';
import { useNavigation, useCurrentScreen } from '../navigation/NavigationContext.js';
import type { LibraryParams } from '../navigation/types.js';
import { useAppState } from '../state/AppStateContext.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { Divider } from '../components/Divider.js';
import {
  formatLibraryHeader,
  formatLibraryRow,
  getLibraryTableWidths,
} from '../components/library-table-format.js';

const libraryService = createLibraryService();
const componentService = createComponentService();

function StatusBadge({ installed, linked }: { installed: boolean; linked: boolean }) {
  if (installed && linked) {
    return <Text color="green">Installed & Linked</Text>;
  } else if (installed && !linked) {
    return <Text color="yellow">Installed (not linked)</Text>;
  } else {
    return <Text color="red">Not Installed</Text>;
  }
}

export function LibraryScreen() {
  const { push } = useNavigation();
  const { params } = useCurrentScreen() as { screen: 'library'; params: LibraryParams };
  const { selectedIndex, setSelectedIndex } = useAppState();
  const { columns: terminalWidth } = useTerminalSize();

  const [status, setStatus] = useState<LibraryStatus | null>(params.status || null);
  const [installed, setInstalled] = useState<InstalledComponent[]>(params.installed || []);
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  const [isLoading, setIsLoading] = useState(!params.status);
  const [isSettingUp, setIsSettingUp] = useState(false);

  useEffect(() => {
    if (!params.status) {
      setIsLoading(true);
      Promise.all([libraryService.getStatus(), libraryService.listInstalled({})])
        .then(([statusResult, installedResult]) => {
          setStatus(statusResult);
          setInstalled(installedResult);
        })
        .catch(() => {
          setStatus(null);
          setInstalled([]);
        })
        .finally(() => setIsLoading(false));
    }
  }, [params.status, params.installed]);

  // Fetch descriptions for installed components
  useEffect(() => {
    if (installed.length === 0) return;

    const fetchDescriptions = async () => {
      const newDescriptions: Record<string, string> = {};

      // Fetch in batches of 5 to avoid overwhelming the API
      for (let i = 0; i < installed.length; i += 5) {
        const batch = installed.slice(i, i + 5);
        const results = await Promise.allSettled(
          batch.map(async (item) => {
            const details = await componentService.search(item.lcscId, { limit: 1 });
            return { id: item.lcscId, description: details[0]?.description || '' };
          })
        );

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value.description) {
            newDescriptions[result.value.id] = result.value.description;
          }
        }

        // Update state incrementally
        setDescriptions(prev => ({ ...prev, ...newDescriptions }));
      }
    };

    fetchDescriptions();
  }, [installed]);

  useInput((input, key) => {
    if (isLoading || isSettingUp) return;

    // If not installed, Enter triggers setup
    if (status && (!status.installed || !status.linked)) {
      if (key.return) {
        setIsSettingUp(true);
        libraryService
          .ensureGlobalTables()
          .then(() => libraryService.getStatus())
          .then((newStatus) => {
            setStatus(newStatus);
            setIsSettingUp(false);
          })
          .catch(() => setIsSettingUp(false));
      }
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(Math.max(0, selectedIndex - 1));
    } else if (key.downArrow) {
      setSelectedIndex(Math.min(installed.length - 1, selectedIndex + 1));
    } else if (key.return && installed[selectedIndex]) {
      push('info', {
        componentId: installed[selectedIndex].lcscId,
      });
    }
  });

  if (isLoading) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">Loading library status...</Text>
      </Box>
    );
  }

  if (isSettingUp) {
    return (
      <Box flexDirection="column">
        <Text color="yellow">Setting up JLC-MCP libraries...</Text>
        <Box marginTop={1}>
          <Text dimColor>Creating directories and registering with KiCad...</Text>
        </Box>
      </Box>
    );
  }

  // Not installed state
  if (!status || !status.installed || !status.linked) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>JLC-MCP Libraries</Text>
        </Box>
        <Box marginBottom={1}>
          <Text>Status: </Text>
          <StatusBadge installed={status?.installed ?? false} linked={status?.linked ?? false} />
          {status && <Text dimColor> (KiCad {status.version})</Text>}
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Text dimColor>The JLC-MCP libraries have not been set up yet.</Text>
          <Text dimColor>This is required to install components.</Text>
        </Box>
        <Box marginTop={1} flexDirection="column">
          <Divider width={terminalWidth} />
          <Text>Press <Text color="cyan">Enter</Text> to set up libraries now</Text>
          <Text dimColor>Esc Exit</Text>
          <Divider width={terminalWidth} />
        </Box>
      </Box>
    );
  }

  // Installed but empty state
  if (installed.length === 0) {
    return (
      <Box flexDirection="column">
        <Box marginBottom={1}>
          <Text bold>JLC-MCP Libraries</Text>
        </Box>
        <Box>
          <Text>Status: </Text>
          <StatusBadge installed={status.installed} linked={status.linked} />
          <Text dimColor> (KiCad {status.version})</Text>
        </Box>
        <Box>
          <Text dimColor>Installed: 0 Components</Text>
        </Box>
        <Box marginBottom={1}>
          <Text dimColor>Location: {status.paths.symbolsDir.replace(process.env.HOME || '', '~')}</Text>
        </Box>
        <Divider width={terminalWidth} />
        <Box marginTop={1}>
          <Text dimColor>No components installed yet. Use 'jlc search' to find and install components.</Text>
        </Box>
        <Box marginTop={1}>
          <Divider width={terminalWidth} />
          <Text dimColor>Esc Exit</Text>
          <Divider width={terminalWidth} />
        </Box>
      </Box>
    );
  }

  // Components table - full width responsive layout
  // Fixed columns: selector(2) + name + category + status columns(15)
  // Description takes remaining space
  const widths = getLibraryTableWidths(terminalWidth);

  return (
    <Box flexDirection="column" width="100%">
      <Box marginBottom={1}>
        <Text bold>JLC-MCP Libraries</Text>
      </Box>
      <Box>
        <Text>Status: </Text>
        <StatusBadge installed={status.installed} linked={status.linked} />
        <Text dimColor> (KiCad {status.version})</Text>
      </Box>
      <Box>
        <Text dimColor>Installed: {installed.length} Component{installed.length !== 1 ? 's' : ''}</Text>
      </Box>
      <Box marginBottom={1}>
        <Text dimColor>Location: {status.paths.symbolsDir.replace(process.env.HOME || '', '~')}</Text>
      </Box>
      <Divider width={terminalWidth} />
      <Box marginBottom={1} marginTop={1}>
        <Text bold dimColor>{formatLibraryHeader(widths)}</Text>
      </Box>
      {installed.map((item, i) => {
        const isSelected = i === selectedIndex;
        const desc = descriptions[item.lcscId] || '';
        const row = formatLibraryRow(item, desc, widths);
        return (
          <Box key={`${item.lcscId}-${i}`}>
            <Text color={isSelected ? 'cyan' : undefined}>
              {isSelected ? '> ' : '  '}
            </Text>
            {isSelected ? (
              <Text inverse>
                {row.name}
                {row.category}
                {row.description}
                {row.sym}
                {row.fp}
                {row.model}
              </Text>
            ) : (
              <Text>
                <Text color="cyan">{row.name}</Text>
                {row.category}
                <Text dimColor>{row.description}</Text>
                <Text color="green">{row.sym}</Text>
                <Text color={row.fpColor}>{row.fp}</Text>
                <Text color={row.modelColor}>{row.model}</Text>
              </Text>
            )}
          </Box>
        );
      })}
      <Box marginTop={1} flexDirection="column">
        <Divider width={terminalWidth} />
        <Text dimColor>↑/↓ Navigate • Enter View Details • Esc Exit</Text>
        <Divider width={terminalWidth} />
      </Box>
    </Box>
  );
}
