export type JobStatus = "Unknown" | "Available" | "Not Processed" | "Processing" | "Error" | "Queued"; //todo add queued status

export type JobProgress = {
  currentProgress: number;
  maxProgress: number;
};

export type JobStatusAndJobProgress = {
  jobStatus: JobStatus;
  jobProgress: JobProgress;
};
