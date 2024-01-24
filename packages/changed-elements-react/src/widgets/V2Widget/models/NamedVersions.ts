import { VersionState } from "./VersionState";


export interface NamedVersions {
  entries: VersionState[];
  currentVersion: VersionState | undefined;
}
