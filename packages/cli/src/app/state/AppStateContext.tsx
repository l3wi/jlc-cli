import React, { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface AppState {
  selectedIndex: number;
}

export interface AppStateActions {
  setSelectedIndex: (index: number) => void;
}

export type AppStateContextValue = AppState & AppStateActions;

const AppStateContext = createContext<AppStateContextValue | null>(null);

interface AppStateProviderProps {
  children: ReactNode;
}

export function AppStateProvider({ children }: AppStateProviderProps) {
  const [selectedIndex, setSelectedIndexState] = useState(0);

  const setSelectedIndex = useCallback((index: number) => {
    setSelectedIndexState(index);
  }, []);


  const value: AppStateContextValue = {
    selectedIndex,
    setSelectedIndex,
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
