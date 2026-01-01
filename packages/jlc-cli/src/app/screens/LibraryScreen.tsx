import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { createLibraryService, createComponentService, type InstalledComponent, type LibraryStatus } from '@jlcpcb/core';
import { useNavigation, useCurrentScreen } from '../navigation/NavigationContext.js';
import type { LibraryParams } from '../navigation/types.js';
import { useAppState } from '../state/AppStateContext.js';
import { useTerminalSize } from '../hooks/useTerminalSize.js';
import { Divider } from '../components/Divider.js';

const libraryService = createLibraryService();
const componentService = createComponentService();

function truncate(str: string, len: number): string {
  if (!str) return '';
  return str.length > len ? str.slice(0, len - 1) + '…' : str;
}

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
  const nameWidth = 20;
  const categoryWidth = 12;
  const statusWidth = 15; // Sym(5) + FP(5) + 3D(5)
  const descWidth = Math.max(terminalWidth - 2 - nameWidth - categoryWidth - statusWidth, 15);

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
        <Text bold dimColor>
          {'  '}
          {'Name'.padEnd(nameWidth)}
          {'Category'.padEnd(categoryWidth)}
          {'Description'.padEnd(descWidth)}
          {'Sym'.padEnd(5)}
          {'FP'.padEnd(5)}
          {'3D'}
        </Text>
      </Box>
      {installed.map((item, i) => {
        const isSelected = i === selectedIndex;
        const desc = descriptions[item.lcscId] || '';
        // Check if footprint is standard KiCad (not JLC-MCP custom)
        const isStandardFp = item.footprintRef && !item.footprintRef.startsWith('JLC-MCP:');
        const fpLabel = !item.footprintRef ? 'N' : isStandardFp ? 'S' : 'Y';
        const fpColor = !item.footprintRef ? 'red' : isStandardFp ? 'cyan' : 'green';
        return (
          <Box key={`${item.lcscId}-${i}`}>
            <Text color={isSelected ? 'cyan' : undefined}>
              {isSelected ? '> ' : '  '}
            </Text>
            <Text inverse={isSelected}>
              <Text color="cyan">{truncate(item.name, nameWidth - 1).padEnd(nameWidth)}</Text>
              {truncate(item.category, categoryWidth - 1).padEnd(categoryWidth)}
              <Text dimColor>{truncate(desc, descWidth - 1).padEnd(descWidth)}</Text>
              <Text color="green">{'Y'.padEnd(5)}</Text>
              <Text color={fpColor}>{fpLabel.padEnd(5)}</Text>
              <Text color={item.has3dModel ? 'green' : 'red'}>{item.has3dModel ? 'Y' : 'N'}</Text>
            </Text>
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
