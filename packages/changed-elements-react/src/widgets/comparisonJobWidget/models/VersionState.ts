/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { NamedVersion } from "../../../clients/iModelsClient.js";
import type { JobProgress, JobStatus } from "./ComparisonJobModels.js";
import type { VersionProcessedState } from "./VersionProcessedState.js";

/**
 * Holds the state of of the version and its subsequent meta data.
*/
export type VersionState = {
  version: NamedVersion;
  state: VersionProcessedState;
  // nullable because we don't run jobs in V1. For v2 use only.
  jobStatus?: JobStatus;
  // nullable because we don't run jobs in V1. For v2 use only.
  jobProgress?: JobProgress;
};
