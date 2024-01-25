export type JobStatus = "Unknown" | "Available" | "Not Processed" | "Processing" | "Error";

export type JobProgress = {
  numberCompleted: number;
  totalToComplete: number;
};
