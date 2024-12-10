/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { createContext } from "react";

import type { NamedVersionEntry } from "./useNamedVersionsList.js";

export interface NamedVersionSelectorContextValue {
  processResults: (entry: NamedVersionEntry) => void;
  viewResults: (entry: NamedVersionEntry) => void;
  initialLoad: (entry: NamedVersionEntry) => { cancel: () => void; };
  checkStatus: (entry: NamedVersionEntry) => { cancel: () => void; };
  contextExists?: boolean | undefined;
}

export const namedVersionSelectorContext = createContext<NamedVersionSelectorContextValue>({
  processResults: () => { },
  viewResults: () => { },
  initialLoad: () => ({ cancel: () => { } }),
  checkStatus: () => ({ cancel: () => { } }),
  contextExists: false,
});
