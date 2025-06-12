/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { createContext } from "react";

import type { NamedVersionEntry } from "./useNamedVersionsList.js";
import { NamedVersionSelectorContentProps } from "./NamedVersionSelector.js";

export interface NamedVersionSelectorContextValue {
  /** Invoked when users request Named Version processinig. */
  processResults: (entry: NamedVersionEntry) => void;

  /**
   * Invoked with a processed Named Version with the intention to transition to
   * active comparison state.
   */
  viewResults: (entry: NamedVersionEntry) => void;

  /**
   * Callback which signals to trigger initial load of comparison job status.
   * @returns A callback that signals to cancel the operation.
   */
  initialLoad: (entry: NamedVersionEntry) => { cancel: () => void; };

  /**
   * Callback which signals to trigger job status polling in the background.
   * @returns A callback that unregisters the entry from being updated.
   */
  checkStatus: (entry: NamedVersionEntry) => { cancel: () => void; };

  /**
   * Hacky way to notify old components that they are mounted within
   * `<NamedVersionSelectorWidget />`.
   */
  contextExists?: boolean | undefined;
}

export const namedVersionSelectorContext = createContext<NamedVersionSelectorContextValue>({
  processResults: () => { },
  viewResults: () => { },
  initialLoad: () => ({ cancel: () => { } }),
  checkStatus: () => ({ cancel: () => { } }),
  contextExists: false,
});

export const NamedVersionSelectorContentContext = createContext<NamedVersionSelectorContentProps>(
  {} as NamedVersionSelectorContentProps
)
