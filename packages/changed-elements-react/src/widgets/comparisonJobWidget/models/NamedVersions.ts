/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { VersionState } from "./VersionState.js";

/**
 * Holds the version state of named versions and the current version.
*/
export interface CurrentNamedVersionAndNamedVersions {
  entries: VersionState[];
  currentVersion: VersionState | undefined;
}
