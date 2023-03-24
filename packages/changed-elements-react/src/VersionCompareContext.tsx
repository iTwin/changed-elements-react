/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { createContext, PropsWithChildren, ReactElement, useContext, useMemo } from "react";

import { SavedFiltersManager } from "./SavedFiltersManager.js";

export interface VersionCompareContextProps {
  savedFilters?: SavedFiltersManager | undefined;
}

export function VersionCompareContext(props: PropsWithChildren<VersionCompareContextProps>): ReactElement {
  const value = useMemo(
    () => ({ savedFilters: props.savedFilters }),
    [props.savedFilters],
  );
  return <versionCompareContext.Provider value={value}>{props.children}</versionCompareContext.Provider>;
}

export interface VersionCompareContextValue {
  savedFilters: SavedFiltersManager | undefined;
}

const versionCompareContext = createContext<VersionCompareContextValue | undefined>(undefined);

export function useVersionCompare(): VersionCompareContextValue | undefined {
  return useContext(versionCompareContext);
}
