
import { NamedVersion } from "../../../clients/iModelsClient";
import { VersionProcessedState } from "../VersionProcessedState";
import { jobStatus } from "./JobStatus";

export type VersionState = {
  version: NamedVersion;
  state: VersionProcessedState;
  jobStatus?: jobStatus;
};
