/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

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

/**
 * Used to display progress of a job.
 * current progress / maximum progress.
*/
export type JobProgress = {
  currentProgress: number;
  maxProgress: number;
};

/**
 * Holds both the job progress and job status.
*/
export type JobStatusAndJobProgress = {
  jobStatus: JobStatus;
  jobProgress: JobProgress;
};
