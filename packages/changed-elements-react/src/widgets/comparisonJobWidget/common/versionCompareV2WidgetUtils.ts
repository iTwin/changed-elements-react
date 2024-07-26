/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelConnection } from "@itwin/core-frontend";
import { ComparisonJobCompleted, ComparisonJobStarted, IComparisonJobClient } from "../../../clients/IComparisonJobClient";
import { IModelsClient, NamedVersion } from "../../../clients/iModelsClient";
import { VersionCompare } from "../../../api/VersionCompare";
import { toastComparisonVisualizationStarting } from "./versionCompareToasts";
import { Logger } from "@itwin/core-bentley";
import { JobAndNamedVersions, JobStatusAndJobProgress } from "../models/ComparisonJobModels";
import { VersionState } from "../models/VersionState";
import { ComparisonJobUpdateType } from "../components/VersionCompareDialogProvider";

export type ManagerStartComparisonV2Args = {
  comparisonJob: ComparisonJobCompleted;
  comparisonJobClient: IComparisonJobClient;
  iModelConnection: IModelConnection;
  targetVersion: NamedVersion;
  currentVersion: NamedVersion;
  getToastsEnabled?: () => boolean;
  runOnJobUpdate?: (comparisonEventType: ComparisonJobUpdateType, jobAndNamedVersions?: JobAndNamedVersions) => Promise<void>;
  iModelsClient: IModelsClient;
};

export const runManagerStartComparisonV2 = async (args: ManagerStartComparisonV2Args) => {
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
  if (args.runOnJobUpdate) {
    void args.runOnJobUpdate("ComparisonVisualizationStarting", jobAndNamedVersion);
  }
  const changedElements = await args.comparisonJobClient.getComparisonJobResult(args.comparisonJob);
  VersionCompare.manager?.startComparisonV2(
    args.iModelConnection,
    args.currentVersion,
    await updateTargetVersion(args.iModelConnection, args.targetVersion, args.iModelsClient),
    [changedElements.changedElements]).catch((e) => {
      Logger.logError(VersionCompare.logCategory, "Could not start version comparison: " + e);
    });
};

const updateTargetVersion = async (iModelConnection: IModelConnection, targetVersion: NamedVersion, iModelsClient: IModelsClient) => {
  // we need to update the changesetId and index of the target version.
  // earlier we updated all named versions to have an offset of 1, so we undo this offset to get the proper results from any VersionCompare.manager?.startComparisonV2 calls
  // on this target version
  // the change elements API requires an offset, but the IModels API does not.
  const iModelId = iModelConnection?.iModelId as string;
  const updatedTargetVersion = { ...targetVersion };
  updatedTargetVersion.changesetIndex = targetVersion.changesetIndex - 1;
  const changeSets = await iModelsClient.getChangesets({ iModelId }).then((changesets) => changesets.slice().reverse());
  const actualChangeSet = changeSets.find((changeset) => updatedTargetVersion.changesetIndex === changeset.index);
  if (actualChangeSet) {
    updatedTargetVersion.changesetId = actualChangeSet.id;
  }
  return updatedTargetVersion;
};

export type GetJobStatusAndJobProgress = {
  comparisonJobClient: IComparisonJobClient;
  entry: VersionState;
  iTwinId: string;
  iModelId: string;
  currentChangesetId: string;
};

export const getJobStatusAndJobProgress = async (args: GetJobStatusAndJobProgress): Promise<JobStatusAndJobProgress> => {
  try {
    const res = await args.comparisonJobClient.getComparisonJob({
      iTwinId: args.iTwinId,
      iModelId: args.iModelId,
      jobId: `${args.entry.version.changesetId}-${args.currentChangesetId}`,
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
      }
    }
    return {
      jobStatus: "Not Processed",
      jobProgress: {
        currentProgress: 0,
        maxProgress: 0,
      },
    };
  } catch {
    return {
      jobStatus: "Not Processed",
      jobProgress: {
        currentProgress: 0,
        maxProgress: 0,
      },
    };
  }
};

export const createJobId = (startNamedVersion: NamedVersion, endNamedVersion: NamedVersion) => {
  return `${startNamedVersion.changesetId}-${endNamedVersion.changesetId}`;
};
