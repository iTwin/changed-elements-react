/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { createContext, PropsWithChildren, ReactElement, useContext, useMemo } from "react";

import { SavedFiltersManager } from "./SavedFiltersManager.js";

export interface VersionCompareContextProps {
  savedFilters?: SavedFiltersManager | undefined;
}

/**
 * Main entry point for setting version comparison configuration. This component will eventually completely replace the
 * global `VersionCompare` object.
 */
export function VersionCompareContext(props: PropsWithChildren<VersionCompareContextProps>): ReactElement {
  const value = useMemo(
    () => ({ savedFilters: props.savedFilters }),
    [props.savedFilters],
  );
  return <versionCompareContext.Provider value={value}>{props.children}</versionCompareContext.Provider>;
}

export function useVersionCompare(): VersionCompareContextValue {
  const context = useContext(versionCompareContext);
  if (!context) {
    throw new Error(`VersionCompare module is not initialized. Did you forget to wrap your application with VersionCompareContext?

Example:
  <VersionCompareContext>
    <App/>
  </VersionCompareContext>
`);
  }

  return context;
}

export interface VersionCompareContextValue {
  savedFilters: SavedFiltersManager | undefined;
}

const versionCompareContext = createContext<VersionCompareContextValue | undefined>(undefined);
