/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { createContext, PropsWithChildren, ReactElement, useContext, useMemo } from "react";

import type { IModelsClient } from "./clients/iModelsClient.js";
import type { SavedFiltersManager } from "./SavedFiltersManager.js";
import { ChangedElementsClient } from "./clients/ChangedElementsClient.js";

export interface VersionCompareContextProps {
  iModelsClient: IModelsClient;
  savedFilters?: SavedFiltersManager | undefined;
  comparisonJobClient?: ChangedElementsClient;
}

/**
 * Main entry point for setting version comparison configuration. This component will eventually completely replace the
 * global `VersionCompare` object.
 */
export function VersionCompareContext(props: PropsWithChildren<VersionCompareContextProps>): ReactElement {
  const value = useMemo(
    () => ({
      iModelsClient: props.iModelsClient,
      comparisonJobClient:props.comparisonJobClient,
      savedFilters: props.savedFilters,
    }),
    [props.iModelsClient, props.savedFilters],
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
  iModelsClient: IModelsClient;
  comparisonJobClient?: ChangedElementsClient;
  savedFilters: SavedFiltersManager | undefined;
}

const versionCompareContext = createContext<VersionCompareContextValue | undefined>(undefined);
