/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { ComparisonJob } from "../../clients/IComparisonJobClient.js";
import type { NamedVersion } from "../../clients/iModelsClient.js";

/**
 * Holds the version state of named versions and the current version.
*/
export interface CurrentNamedVersionAndNamedVersions {
  entries: VersionState[];
  currentVersion: VersionState | undefined;
}

export type VersionState = {
  version: NamedVersion;
  state: VersionProcessedState;
  // nullable because we don't run jobs in V1. For v2 use only.
  jobStatus?: JobStatus;
  // nullable because we don't run jobs in V1. For v2 use only.
  jobProgress?: JobProgress;
};

export enum VersionProcessedState {
  Verifying,
  Processed,
  Processing,
  Unavailable,
}

/**
 * Job status used for identification of job progress
 * This is used for mapping job status to user facing strings.
 * Unknown = "have not queried for job status"
 * Available = "complete"
 * Not Processed = "API returned 404; therefore, no job has been processed."
 * Queued = "queued" waiting for agents
 * Processing = "started"
 * Error = "error"
*/
export type JobStatus = "Unknown" | "Available" | "Not Processed" | "Processing" | "Error" | "Queued";

export type JobProgress = {
  currentProgress: number;
  maxProgress: number;
};

export type JobStatusAndJobProgress = {
  jobStatus: JobStatus;
  jobProgress: JobProgress;
};

export type JobAndNamedVersions = {
  comparisonJob?: ComparisonJob;
  targetNamedVersion: NamedVersion;
  currentNamedVersion: NamedVersion;
};
