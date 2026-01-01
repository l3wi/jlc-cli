import React from 'react';
import { render, Box, useInput, useApp } from 'ink';
import { NavigationProvider, useNavigation, useCurrentScreen } from './navigation/NavigationContext.js';
import { AppStateProvider } from './state/AppStateContext.js';
import { SearchScreen } from './screens/SearchScreen.js';
import { InfoScreen } from './screens/InfoScreen.js';
import { InstallScreen } from './screens/InstallScreen.js';
import { InstalledScreen } from './screens/InstalledScreen.js';
import { LibraryScreen } from './screens/LibraryScreen.js';
import { LibrarySetupScreen } from './screens/LibrarySetupScreen.js';
import type { ScreenName, ScreenParams } from './navigation/types.js';

function ScreenRouter() {
  const { screen } = useCurrentScreen();

  switch (screen) {
    case 'search':
      return <SearchScreen />;
    case 'info':
      return <InfoScreen />;
    case 'install':
      return <InstallScreen />;
    case 'installed':
      return <InstalledScreen />;
    case 'library':
      return <LibraryScreen />;
    case 'library-setup':
      return <LibrarySetupScreen />;
    default:
      return null;
  }
}

function AppContent() {
  const { exit } = useApp();
  const { pop, currentIndex, history } = useNavigation();
  const { screen } = useCurrentScreen();

  useInput((input, key) => {
    // Global ESC handler - pops navigation or exits at root
    // Note: Individual screens handle their own keys, this is just for ESC
    if (key.escape) {
      // Don't allow ESC during install (it auto-navigates when done)
      if (screen === 'install') return;

      const didPop = pop();
      if (!didPop) {
        exit();
      }
    }

    // 'q' to quit from root screen
    if (input === 'q' && currentIndex === 0) {
      exit();
    }
  });

  return (
    <Box flexDirection="column" padding={1}>
      <ScreenRouter />
    </Box>
  );
}

interface AppProps<T extends ScreenName> {
  initialScreen: T;
  initialParams: ScreenParams[T];
}

export function App<T extends ScreenName>({ initialScreen, initialParams }: AppProps<T>) {
  return (
    <NavigationProvider initialScreen={initialScreen} initialParams={initialParams}>
      <AppStateProvider>
        <AppContent />
      </AppStateProvider>
    </NavigationProvider>
  );
}

export function renderApp<T extends ScreenName>(
  initialScreen: T,
  initialParams: ScreenParams[T]
): void {
  render(<App initialScreen={initialScreen} initialParams={initialParams} />);
}
