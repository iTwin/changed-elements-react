import { IModelConnection } from "@itwin/core-frontend";
import { useEffect } from "react";
import { JobStatusAndJobProgress } from "../models/ComparisonJobModels";
import { VersionProcessedState } from "../models/VersionProcessedState";
import { IComparisonJobClient, ComparisonJobStarted, ComparisonJob, ComparisonJobCompleted } from "../../../clients/IComparisonJobClient";
import { VersionState } from "../models/VersionState";
import { IModelsClient, NamedVersion } from "../../../clients/iModelsClient";
import { NamedVersionLoaderResult } from "./useNamedVersionLoader";

/**
 * Loads name versions and their job status compared to current version iModel is targeting.
 * Returns a result object with current version and namedVersion with there job status sorted from newest to oldest.
 */
export const usePollForNamedVersionUpdates = (
  iModelConnection: IModelConnection,
  iModelsClient: IModelsClient,
  comparisonJobClient: IComparisonJobClient,
  setNamedVersionResult: (state: NamedVersionLoaderResult) => void,
  namedVersions: NamedVersionLoaderResult | undefined,
  getRunningJobs: () => ComparisonJob[],
) => {

  useEffect(() => {
    const iTwinId = iModelConnection?.iTwinId as string;
    const iModelId = iModelConnection?.iModelId as string;
    if (namedVersions && namedVersions.namedVersions.entries.length > 0) {
      void pollForInProgressJobs({
        iTwinId: iTwinId,
        iModelId: iModelId,
        namedVersionLoaderState: namedVersions,
        comparisonJobClient: comparisonJobClient,
        iModelConnection: iModelConnection,
        setResult: setNamedVersionResult,
        getRunningJobs,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [iModelConnection, iModelsClient, comparisonJobClient, namedVersions]); // Only re-run the effect if count changes
};

type PollForInProgressJobsArgs = {
  iTwinId: string;
  iModelId: string;
  namedVersionLoaderState: NamedVersionLoaderResult;
  comparisonJobClient: IComparisonJobClient;
  iModelConnection: IModelConnection;
  setResult: (result: NamedVersionLoaderResult) => void;
  getRunningJobs: () => ComparisonJob[];
};

const pollForInProgressJobs = async (args: PollForInProgressJobsArgs) => {
  const currentVersionId = args.namedVersionLoaderState.namedVersions.currentVersion?.version.changesetId ??
    args.iModelConnection?.changeset.id;
  let entries = args.namedVersionLoaderState.namedVersions.entries.slice();
  const areJobsInProgress = () => {
    return args.getRunningJobs().length > 0;
  };
  if (areJobsInProgress()) {
    const idEntryMap = new Map<string, VersionState>();
    entries.forEach((entry) => idEntryMap.set(entry.version.id, entry));
    let updatingEntries = args.getRunningJobs().map((job) => {
      return idEntryMap.get(job.comparisonJob.startChangesetId);
    });
    const loopDelayInMilliseconds = 5000;
    let isConnectionClosed = false;
    args.iModelConnection.onClose.addListener(() => { isConnectionClosed = true; });
    while (updatingEntries.length > 0 && !isConnectionClosed) {
      for (let entry of updatingEntries) {
        await new Promise((resolve) => setTimeout(resolve, loopDelayInMilliseconds));
        const jobStatusAndJobProgress: JobStatusAndJobProgress = await getJobStatusAndJobProgress(args.comparisonJobClient, entry, args.iTwinId, args.iModelId, currentVersionId);
        entry = {
          version: entry?.version as NamedVersion,
          state: VersionProcessedState.Processed,
          jobStatus: jobStatusAndJobProgress.jobStatus,
          jobProgress: jobStatusAndJobProgress.jobProgress,
        };
        idEntryMap.set(entry.version.id, entry);
      }
      entries = [...idEntryMap.values()];
      updatingEntries = entries.filter((entry) => entry.jobStatus === "Processing" || entry.jobStatus === "Queued");
      args.namedVersionLoaderState = {
        namedVersions: { currentVersion: args.namedVersionLoaderState.namedVersions.currentVersion, entries: entries },
      };
      args.setResult(args.namedVersionLoaderState);
    }
  }
};

const getJobStatusAndJobProgress = async (comparisonJobClient: IComparisonJobClient, entry: VersionState, iTwinId: string, iModelId: string, currentChangesetId: string): Promise<JobStatusAndJobProgress> => {
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
              currentProgress: progressingJob.comparisonJob.currentProgress,
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
