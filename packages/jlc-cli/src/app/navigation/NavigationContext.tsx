import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import type {
  NavigationContextValue,
  ScreenName,
  ScreenParams,
  HistoryEntry,
} from './types.js';

const NavigationContext = createContext<NavigationContextValue | null>(null);

interface NavigationProviderProps<T extends ScreenName> {
  initialScreen: T;
  initialParams: ScreenParams[T];
  children: ReactNode;
}

export function NavigationProvider<T extends ScreenName>({
  initialScreen,
  initialParams,
  children,
}: NavigationProviderProps<T>) {
  const [history, setHistory] = useState<HistoryEntry[]>([
    { screen: initialScreen, params: initialParams },
  ]);
  const [currentIndex, setCurrentIndex] = useState(0);

  const push = useCallback(
    <S extends ScreenName>(screen: S, params: ScreenParams[S]) => {
      setHistory((prev) => [
        ...prev.slice(0, currentIndex + 1),
        { screen, params } as HistoryEntry,
      ]);
      setCurrentIndex((prev) => prev + 1);
    },
    [currentIndex]
  );

  const pop = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex((prev) => prev - 1);
      return true;
    }
    return false;
  }, [currentIndex]);

  const replace = useCallback(
    <S extends ScreenName>(screen: S, params: ScreenParams[S]) => {
      setHistory((prev) => {
        const newHistory = [...prev];
        newHistory[currentIndex] = { screen, params } as HistoryEntry;
        return newHistory;
      });
    },
    [currentIndex]
  );

  const reset = useCallback(<S extends ScreenName>(screen: S, params: ScreenParams[S]) => {
    setHistory([{ screen, params } as HistoryEntry]);
    setCurrentIndex(0);
  }, []);

  const value: NavigationContextValue = {
    history,
    currentIndex,
    push,
    pop,
    replace,
    reset,
  };

  return (
    <NavigationContext.Provider value={value}>{children}</NavigationContext.Provider>
  );
}

export function useNavigation(): NavigationContextValue {
  const context = useContext(NavigationContext);
  if (!context) {
    throw new Error('useNavigation must be used within NavigationProvider');
  }
  return context;
}

export function useCurrentScreen(): HistoryEntry {
  const { history, currentIndex } = useNavigation();
  return history[currentIndex];
}
