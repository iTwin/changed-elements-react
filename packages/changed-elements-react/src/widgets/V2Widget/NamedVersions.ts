import { VersionState } from "../VersionCompareSelectWidget";

export interface NamedVersions {
  entries: VersionState[];
  currentVersion: VersionState | undefined;
}
