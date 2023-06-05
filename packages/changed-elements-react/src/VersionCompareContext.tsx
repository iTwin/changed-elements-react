/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { createContext, useContext, useMemo, type PropsWithChildren, type ReactElement } from "react";

import type { ChangedElementsClient } from "./client/ChangedElementsClient.js";
import type { SavedFiltersManager } from "./SavedFiltersManager.js";

export interface VersionCompareContextProps {
  changedElementsClient: ChangedElementsClient;
  savedFilters?: SavedFiltersManager | undefined;
}

/**
 * Main entry point for setting version comparison configuration. This component will eventually completely replace the
 * global `VersionCompare` object.
 */
export function VersionCompareContext(props: PropsWithChildren<VersionCompareContextProps>): ReactElement {
  const value = useMemo(
    () => {
      return {
        savedFilters: props.savedFilters,
        changedElementsClient: props.changedElementsClient,
      };
    },
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
  changedElementsClient: ChangedElementsClient;
}

const versionCompareContext = createContext<VersionCompareContextValue | undefined>(undefined);
