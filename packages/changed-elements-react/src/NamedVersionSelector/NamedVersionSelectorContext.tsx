/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { createContext, ReactNode } from "react";

import { NamedVersion } from "../clients/iModelsClient.js";
import type { useNamedVersionsList, VersionCompareEntry } from "./useNamedVersionsList.js";

export interface NamedVersionSelectorContextValue {
  /** Invoked when users request Named Version processing. */
  processResults: (entry: VersionCompareEntry) => void;

  /**
   * Invoked with a processed Named Version with the intention to transition to
   * active comparison state.
   */
  viewResults: (entry: VersionCompareEntry) => void;

  /**
   * Callback which signals to trigger initial load of comparison job status.
   * @returns A callback that signals to cancel the operation.
   */
  initialLoad: (entry: VersionCompareEntry) => { cancel: () => void; };

  /**
   * Callback which signals to trigger job status polling in the background.
   * @returns A callback that unregisters the entry from being updated.
   */
  checkStatus: (entry: VersionCompareEntry) => { cancel: () => void; };

  /**
   * Hacky way to notify old components that they are mounted within
   * `<NamedVersionSelectorWidget />`.
   */
  contextExists?: boolean | undefined;

  /**
   * Index of the currently running changeset comparison, if any.
   */
  selectedRunningChangesetIndex?: number | undefined;
}

export const namedVersionSelectorContext = createContext<NamedVersionSelectorContextValue>({
  processResults: () => { },
  viewResults: () => { },
  initialLoad: () => ({ cancel: () => { } }),
  checkStatus: () => ({ cancel: () => { } }),
  contextExists: false,
  selectedRunningChangesetIndex: undefined,
});

export type NamedVersionSelectorContentProps = {
  isLoading: boolean;
  entries: VersionCompareEntry[];
  currentNamedVersion: NamedVersion | undefined;
  iTwinId: string;
  iModelId: string;
  onNamedVersionOpened: (version: VersionCompareEntry) => void;
  updateJobStatus: ReturnType<typeof useNamedVersionsList>["updateJobStatus"];
  emptyState?: ReactNode;
  manageVersions?: ReactNode;
  hasNextPage: boolean;
  isNextPageLoading: boolean;
  loadNextPage: () => Promise<void>;
  disableStartComparison?: boolean;
  setSelectedRunningChangesetIndex: React.Dispatch<React.SetStateAction<number | undefined>>;
  selectedRunningChangesetIndex: number | undefined;
};

export const NamedVersionSelectorContentContext = createContext<NamedVersionSelectorContentProps>(
  {} as NamedVersionSelectorContentProps,
);
