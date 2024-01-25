export type JobStatus = "Unknown" | "Available" | "Not Processed" | "Processing" | "Error" |"Queued"; //todo add queued status

export type JobProgress = {
  numberCompleted: number;
  totalToComplete: number;
};

export type JobStatusAndJobProgress = {
  jobStatus: JobStatus;
  jobProgress: JobProgress;
};
