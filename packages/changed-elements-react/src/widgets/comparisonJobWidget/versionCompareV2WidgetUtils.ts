/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Logger } from "@itwin/core-bentley";
import type { IModelConnection } from "@itwin/core-frontend";

import { VersionCompare } from "../../api/VersionCompare";
import type {
  ComparisonJob, ComparisonJobCompleted, ComparisonJobStarted, IComparisonJobClient,
} from "../../clients/IComparisonJobClient";
import type { IModelsClient, NamedVersion } from "../../clients/iModelsClient";
import type { ComparisonJobUpdateType } from "./components/VersionCompareDialogProvider";
import type { JobAndNamedVersions, JobStatusAndJobProgress } from "./NamedVersions.js";
import { toastComparisonVisualizationStarting } from "./versionCompareToasts";

export interface ManagerStartComparisonV2Args {
  comparisonJob: ComparisonJobCompleted;
  comparisonJobClient: IComparisonJobClient;
  iModelConnection: IModelConnection;
  targetVersion: NamedVersion;
  currentVersion: NamedVersion;
  getToastsEnabled?: () => boolean;
  runOnJobUpdate?: (
    comparisonEventType: ComparisonJobUpdateType,
    jobAndNamedVersions?: JobAndNamedVersions,
  ) => void;
  iModelsClient: IModelsClient;
}

export async function runManagerStartComparisonV2(
  args: ManagerStartComparisonV2Args,
): Promise<void> {
  if (VersionCompare.manager?.isComparing) {
    await VersionCompare.manager?.stopComparison();
  }

  if (args.getToastsEnabled?.()) {
    toastComparisonVisualizationStarting();
  }

  const jobAndNamedVersion: JobAndNamedVersions = {
    comparisonJob: args.comparisonJob,
    targetNamedVersion: args.targetVersion,
    currentNamedVersion: args.currentVersion,
  };
  args.runOnJobUpdate?.("ComparisonVisualizationStarting", jobAndNamedVersion);

  const changedElements = await args.comparisonJobClient.getComparisonJobResult(args.comparisonJob);
  VersionCompare.manager?.startComparisonV2(
    args.iModelConnection,
    args.currentVersion,
    await updateTargetVersion(args.iModelConnection, args.targetVersion, args.iModelsClient),
    [changedElements.changedElements],
  ).catch((e) => {
    Logger.logError(VersionCompare.logCategory, "Could not start version comparison: " + e);
  });
}

async function updateTargetVersion(
  iModelConnection: IModelConnection,
  targetVersion: NamedVersion,
  iModelsClient: IModelsClient,
): Promise<NamedVersion> {
  // We need to update the changesetId and index of the target version. Earlier
  // we updated all named versions to have an offset of 1, so we undo this offset
  // to get the proper results from any VersionCompare.manager?.startComparisonV2
  // calls on this target version. The change elements API requires an offset, but
  // the IModels API does not.
  const iModelId = iModelConnection?.iModelId as string;
  const updatedTargetVersion = { ...targetVersion };
  updatedTargetVersion.changesetIndex = targetVersion.changesetIndex - 1;
  const changesets = await iModelsClient.getChangesets({ iModelId });
  const actualChangeSet = changesets.slice().reverse().find(
    (changeset) => updatedTargetVersion.changesetIndex === changeset.index,
  );
  if (actualChangeSet) {
    updatedTargetVersion.changesetId = actualChangeSet.id;
  }

  return updatedTargetVersion;
}

export interface GetJobStatusAndJobProgress {
  comparisonJobClient: IComparisonJobClient;
  iTwinId: string;
  iModelId: string;
  jobId: string;
}

export async function getJobStatusAndJobProgress(
  args: GetJobStatusAndJobProgress,
): Promise<JobStatusAndJobProgress> {
  let res: ComparisonJob;
  try {
    res = await args.comparisonJobClient.getComparisonJob({
      iTwinId: args.iTwinId,
      iModelId: args.iModelId,
      jobId: args.jobId,
    });
  } catch {
    return {
      jobStatus: "Not Processed",
      jobProgress: {
        currentProgress: 0,
        maxProgress: 0,
      },
    };
  }

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
          currentProgress: progressingJob.comparisonJob.currentProgress,
          maxProgress: progressingJob.comparisonJob.maxProgress,
        },
      };
    }

    case "Failed":
      return {
        jobStatus: "Error",
        jobProgress: {
          currentProgress: 0,
          maxProgress: 0,
        },
      };

    default:
      return {
        jobStatus: "Not Processed",
        jobProgress: {
          currentProgress: 0,
          maxProgress: 0,
        },
      };
  }
}

export function createJobId(
  startNamedVersion: NamedVersion,
  endNamedVersion: NamedVersion,
): string {
  return `${startNamedVersion.changesetId}-${endNamedVersion.changesetId}`;
}
