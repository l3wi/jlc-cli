import type { ComponentSearchResult, ComponentDetails, InstallResult, InstalledComponent, LibraryStatus, EasyEDACommunityComponent } from '@jlcpcb/core';

export type ScreenName = 'search' | 'info' | 'install' | 'library' | 'library-setup' | 'installed' | 'easyeda-info';

// Common component type that works across screens
export type ComponentInfo = ComponentSearchResult | ComponentDetails;

export interface SearchParams {
  query: string;
  results: ComponentSearchResult[];
}

export interface InfoParams {
  componentId: string;
  component?: ComponentInfo;
}

export interface InstallParams {
  componentId: string;
  component: ComponentInfo;
}

export interface LibraryParams {
  status?: LibraryStatus;
  installed?: InstalledComponent[];
}

export interface LibrarySetupParams {
  componentId: string;
  component: ComponentInfo;
}

export interface InstalledParams {
  componentId: string;
  component: ComponentInfo;
  result?: InstallResult;
  error?: string;
}

export interface EasyEDAInfoParams {
  uuid: string;
  component?: EasyEDACommunityComponent;
}

export interface ScreenParams {
  search: SearchParams;
  info: InfoParams;
  install: InstallParams;
  library: LibraryParams;
  'library-setup': LibrarySetupParams;
  installed: InstalledParams;
  'easyeda-info': EasyEDAInfoParams;
}

export interface HistoryEntry<T extends ScreenName = ScreenName> {
  screen: T;
  params: ScreenParams[T];
}

export interface NavigationState {
  history: HistoryEntry[];
  currentIndex: number;
}

export interface NavigationActions {
  push: <T extends ScreenName>(screen: T, params: ScreenParams[T]) => void;
  pop: () => boolean;
  replace: <T extends ScreenName>(screen: T, params: ScreenParams[T]) => void;
  reset: <T extends ScreenName>(screen: T, params: ScreenParams[T]) => void;
}

export type NavigationContextValue = NavigationState & NavigationActions;
