import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface AppState {
  selectedIndex: number;
  isFiltered: boolean;
  isLoading: boolean;
}

export interface AppStateActions {
  setSelectedIndex: (index: number) => void;
  setIsFiltered: (filtered: boolean) => void;
  setIsLoading: (loading: boolean) => void;
  resetSelection: () => void;
}

export type AppStateContextValue = AppState & AppStateActions;

const AppStateContext = createContext<AppStateContextValue | null>(null);

interface AppStateProviderProps {
  children: ReactNode;
}

export function AppStateProvider({ children }: AppStateProviderProps) {
  const [selectedIndex, setSelectedIndexState] = useState(0);
  const [isFiltered, setIsFilteredState] = useState(false);
  const [isLoading, setIsLoadingState] = useState(false);

  const setSelectedIndex = useCallback((index: number) => {
    setSelectedIndexState(index);
  }, []);

  const setIsFiltered = useCallback((filtered: boolean) => {
    setIsFilteredState(filtered);
  }, []);

  const setIsLoading = useCallback((loading: boolean) => {
    setIsLoadingState(loading);
  }, []);

  const resetSelection = useCallback(() => {
    setSelectedIndexState(0);
  }, []);

  const value: AppStateContextValue = {
    selectedIndex,
    isFiltered,
    isLoading,
    setSelectedIndex,
    setIsFiltered,
    setIsLoading,
    resetSelection,
  };

  return <AppStateContext.Provider value={value}>{children}</AppStateContext.Provider>;
}

export function useAppState(): AppStateContextValue {
  const context = useContext(AppStateContext);
  if (!context) {
    throw new Error('useAppState must be used within AppStateProvider');
  }
  return context;
}
