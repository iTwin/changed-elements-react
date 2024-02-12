/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { NamedVersion } from "../../../clients/iModelsClient";
import { VersionProcessedState } from "./VersionProcessedState";
import { JobProgress, JobStatus } from "./ComparisonJobModels";

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
