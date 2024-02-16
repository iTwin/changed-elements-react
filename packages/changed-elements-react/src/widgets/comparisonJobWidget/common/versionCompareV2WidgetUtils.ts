import { IModelConnection } from "@itwin/core-frontend";
import { ComparisonJobCompleted, ComparisonJobStarted, IComparisonJobClient } from "../../../clients/IComparisonJobClient";
import { NamedVersion } from "../../../clients/iModelsClient";
import { VersionCompare } from "../../../api/VersionCompare";
import { toastComparisonVisualizationStarting } from "./versionComapreToasts";
import { Logger } from "@itwin/core-bentley";
import { JobStatusAndJobProgress } from "../models/ComparisonJobModels";
import { VersionState } from "../models/VersionState";

export type ManagerStartComparisonV2Args = {
  comparisonJob: ComparisonJobCompleted;
  comparisonJobClient: IComparisonJobClient;
  iModelConnection: IModelConnection;
  targetVersion: NamedVersion;
  currentVersion: NamedVersion;
};

export const runManagerStartComparisonV2 = async (args: ManagerStartComparisonV2Args) => {
  if (VersionCompare.manager?.isComparing) {
    return;
  }
  toastComparisonVisualizationStarting();
  const changedElements = await args.comparisonJobClient.getComparisonJobResult(args.comparisonJob);
  VersionCompare.manager?.startComparisonV2(args.iModelConnection, args.currentVersion, args.targetVersion, [changedElements.changedElements]).catch((e) => {
    Logger.logError(VersionCompare.logCategory, "Could not start version comparison: " + e);
  });
};


export const getJobStatusAndJobProgress = async (comparisonJobClient: IComparisonJobClient, entry: VersionState, iTwinId: string, iModelId: string, currentChangesetId: string): Promise<JobStatusAndJobProgress> => {
  try {
    const res = await comparisonJobClient.getComparisonJob({
      iTwinId: iTwinId,
      iModelId: iModelId,
      jobId: `${entry.version.changesetId}-${currentChangesetId}`,
    });
    if (res) {
      switch (res.comparisonJob.status) {
        case "Completed": {
          return {
            jobStatus: "Available",
            jobProgress: {
              currentProgress: 0,
              maxProgress: 0,
            },
          };
        }
        case "Queued": {
          return {
            jobStatus: "Queued",
            jobProgress: {
              currentProgress: 0,
              maxProgress: 0,
            },
          };
        }
        case "Started": {
          const progressingJob = res as ComparisonJobStarted;
          return {
            jobStatus: "Processing",
            jobProgress: {
              // todo job is still processing but may be max out on progress so should show still progressing for current job progress. This is most likely an API error and will need to be fixed
              currentProgress: progressingJob.comparisonJob.currentProgress === progressingJob.comparisonJob.maxProgress
                ? progressingJob.comparisonJob.maxProgress - 1 : progressingJob.comparisonJob.currentProgress,
              maxProgress: progressingJob.comparisonJob.maxProgress,
            },
          };
        }
        case "Error":
          return {
            jobStatus: "Error",
            jobProgress: {
              currentProgress: 0,
              maxProgress: 0,
            },
          };
      }
    }
    return {
      jobStatus: "Unknown",
      jobProgress: {
        currentProgress: 0,
        maxProgress: 0,
      },
    };
  } catch (_) {
    return {
      jobStatus: "Not Processed",
      jobProgress: {
        currentProgress: 0,
        maxProgress: 0,
      },
    };
  }
};
