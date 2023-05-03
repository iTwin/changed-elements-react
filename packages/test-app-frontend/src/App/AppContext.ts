/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ThemeType } from "@itwin/itwinui-react";
import { createContext, useContext } from "react";

export interface AppContext {
  theme: ThemeType;
  setTheme: (theme: ThemeType) => void;
}

export const appContext = createContext<AppContext>({
  theme: "os",
  setTheme: () => { },
});

export function useAppContext(): AppContext {
  return useContext(appContext);
}
