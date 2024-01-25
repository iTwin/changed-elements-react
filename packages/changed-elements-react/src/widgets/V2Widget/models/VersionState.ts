
import { NamedVersion } from "../../../clients/iModelsClient";
import { VersionProcessedState } from "../VersionProcessedState";
import { JobProgress, JobStatus, JobStatusAndJobProgress } from "./JobStatus";



export type VersionState = {
  version: NamedVersion;
  state: VersionProcessedState;
  jobStatus?: JobStatus;
  jobProgress?: JobProgress;
  jobId?: string;
  updateJobProgress?: () => Promise<JobStatusAndJobProgress>;
};
