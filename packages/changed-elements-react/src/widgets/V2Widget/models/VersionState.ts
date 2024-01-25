
import { NamedVersion } from "../../../clients/iModelsClient";
import { VersionProcessedState } from "../VersionProcessedState";
import { JobProgress, JobStatus } from "./JobStatus";



export type VersionState = {
  version: NamedVersion;
  state: VersionProcessedState;
  jobStatus?: JobStatus;
  jobProgress?: JobProgress;
  //todo add job id so we can only update one entry
};
