import { createContext } from "react";
import { VersionCompareContextValue } from "../VersionCompareContext.js";
import { NamedVersionEntry } from "../NamedVersionSelector/useNamedVersionsList.js";

export const NamedVersionContext = createContext<VersionCompareContextValue & {
  onNamedVersionOpened: (target?: NamedVersionEntry) => void;
}>(null!);
//@naron: do i need this?
