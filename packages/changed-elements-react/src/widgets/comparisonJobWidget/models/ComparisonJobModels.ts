/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/**
 * Job status used for identification of job progress
 * Unknown Job Status is reserved for when a job has not yet been queried.
 * Only use unknown when no job status is available.
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
