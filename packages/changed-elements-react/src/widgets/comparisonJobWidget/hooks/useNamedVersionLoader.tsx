/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { useState, useEffect } from "react";
import { JobStatus, JobProgress, JobStatusAndJobProgress } from "../models/ComparisonJobModels";
import { VersionProcessedState } from "../models/VersionProcessedState";
import { CurrentNamedVersionAndNamedVersions } from "../models/NamedVersions";
import { IComparisonJobClient, ComparisonJobStarted } from "../../../clients/IComparisonJobClient";
import { VersionState } from "../models/VersionState";
import { Changeset, IModelsClient, NamedVersion } from "../../../clients/iModelsClient";

/**
 * Result type for versionLoader.
 */
export type NamedVersionLoaderResult = {
  /** Named versions to display in the list. */
  namedVersions: CurrentNamedVersionAndNamedVersions;
};

type NamedVersionLoaderState = {
  result: {
    namedVersions: {
      entries: {
        version: NamedVersion;
        state: VersionProcessedState;
        jobStatus: JobStatus;
        jobProgress: JobProgress;
      }[];
      currentVersion: VersionState;
    };
  };
};

/**
 * Loads name versions and their job status compared to current version iModel is targeting.
 * Returns a result object with current version and namedVersion with there job status sorted from newest to oldest.
 */
export const useNamedVersionLoader = (
  iModelConnection: IModelConnection,
  iModelsClient: IModelsClient,
  comparisonJobClient: IComparisonJobClient,
) => {
  const [result, setResult] = useState<NamedVersionLoaderResult>();
  const setResultNoNamedVersions = () => {
    setResult({
      namedVersions: { entries: [], currentVersion: undefined },
    });
  };

  useEffect(
    () => {
      const iTwinId = iModelConnection?.iTwinId;
      const iModelId = iModelConnection?.iModelId;
      const currentChangeSetId = iModelConnection?.changeset.id;
      const currentChangeSetIndex = iModelConnection?.changeset.index;
      let disposed = false;
      const isDisposed = () => {
        return disposed;
      };
      if (!iTwinId || !iModelId || !currentChangeSetId) {
        setResultNoNamedVersions();
        return;
      }

      void (async () => {
        const [namedVersions, changesets] = await Promise.all([
          iModelsClient.getNamedVersions({ iModelId }),
          // Changesets need to be in descending index order
          iModelsClient.getChangesets({ iModelId }).then((changesets) => changesets.slice().reverse()),
        ]);
        const currentNamedVersion = getOrCreateCurrentNamedVersion(namedVersions, currentChangeSetId, changesets, currentChangeSetIndex);
        const sortedNamedVersions = sortNamedVersions(namedVersions, currentNamedVersion, setResultNoNamedVersions);
        if (!sortedNamedVersions || sortedNamedVersions.length === 0) {
          setResultNoNamedVersions();
          return;
        }
        if (disposed) {
          return;
        }
        const initialComparisonJobStatus: JobStatus = "Unknown";
        const initialJobProgress: JobProgress = {
          currentProgress: 0,
          maxProgress: 0,
        };
        const currentState: NamedVersionLoaderState = {
          result: {
            namedVersions: {
              entries: sortedNamedVersions.map((namedVersion) => ({
                version: namedVersion,
                state: VersionProcessedState.Verifying,
                jobStatus: initialComparisonJobStatus,
                jobProgress: initialJobProgress,
              })),
              currentVersion: {
                version: currentNamedVersion,
                state: VersionProcessedState.Processed,
                jobStatus: initialComparisonJobStatus,
                jobProgress: initialJobProgress,
              },
            },
          },
        };
        setResult(currentState.result);
        void processChangesetsAndUpdateResultState({
          iTwinId: iTwinId,
          iModelId: iModelId,
          namedVersionLoaderState: currentState,
          comparisonJobClient: comparisonJobClient,
          setResult: (result: NamedVersionLoaderResult) => {
            setResult(result);
          },
          isDisposed: isDisposed,
        });
      })();

      return () => {
        disposed = true;
      };
    },
    [comparisonJobClient, iModelConnection, iModelsClient],
  );

  return result;
};

// create faked named version if current version is not a named version
const getOrCreateCurrentNamedVersion = (namedVersions: NamedVersion[], currentChangeSetId: string, changeSets: Changeset[], currentChangeSetIndex?: number): NamedVersion => {
  const currentFromNamedVersion = getCurrentFromNamedVersions(namedVersions, currentChangeSetId, currentChangeSetIndex);
  if (currentFromNamedVersion)
    return currentFromNamedVersion;
  const currentFromChangeSet = getCurrentFromChangeSet(changeSets, currentChangeSetId);
  if (currentFromChangeSet)
    return currentFromChangeSet;
  return {
    id: currentChangeSetId,
    displayName: IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.currentChangeset"),
    changesetId: currentChangeSetId,
    changesetIndex: 0,
    description: "",
    createdDateTime: "",
  };
};

const getCurrentFromNamedVersions = (namedVersions: NamedVersion[], currentChangeSetId: string, currentChangeSetIndex?: number) => {
  const currentNamedVersion = namedVersions.find(version => (version.changesetId === currentChangeSetId || version.changesetIndex === currentChangeSetIndex));
  if (currentNamedVersion) {
    return currentNamedVersion;
  }
  return;
};

const getCurrentFromChangeSet = (changeSets: Changeset[], currentChangeSetId: string, currentChangeSetIndex?: number): NamedVersion | undefined => {
  const currentChangeSet = changeSets.find(changeSet => (changeSet.id === currentChangeSetId || changeSet.index === currentChangeSetIndex));
  if (currentChangeSet) {
    return {
      id: currentChangeSet.id,
      displayName: currentChangeSet.displayName,
      changesetId: currentChangeSet.id,
      changesetIndex: currentChangeSet.index,
      description: currentChangeSet.description,
      createdDateTime: currentChangeSet.pushDateTime,
    };
  }
  return;
};

const sortNamedVersions = (namedVersions: NamedVersion[], currentNamedVersion: NamedVersion, onError: () => void) => {
  //if current index is 0 then no need to filter. All change sets are older than current.
  const namedVersionsOlderThanCurrentVersion = currentNamedVersion.changesetIndex !== 0 ? namedVersions.filter(version => version.changesetIndex <= currentNamedVersion.changesetIndex) :
    namedVersions;
  if (namedVersionsOlderThanCurrentVersion.length === 0) {
    onError();
    return;
  }
  return namedVersionsOlderThanCurrentVersion.reverse();
};

type ProcessChangesetsArgs = {
  iTwinId: string;
  iModelId: string;
  namedVersionLoaderState: NamedVersionLoaderState;
  comparisonJobClient: IComparisonJobClient;
  setResult: (result: NamedVersionLoaderResult) => void;
  isDisposed: () => boolean;
};

type Entry = {
  version: NamedVersion;
  state: VersionProcessedState;
  jobStatus: JobStatus;
  jobProgress: JobProgress;
};

const processChangesetsAndUpdateResultState = async (args: ProcessChangesetsArgs) => {
  const currentVersionId = args.namedVersionLoaderState.result.namedVersions.currentVersion.version.id;
  // deletes all comparison jobs only for debugging purposes
  //await Promise.all(args.namedVersionLoaderState.result.namedVersions.entries.map(async (entry) => {
  //await deleteJob(args.comparisonJobClient, entry, args.iTwinId, args.iModelId, currentVersionId);
  // })).catch(() => { return; });
  const newEntries = await Promise.all(args.namedVersionLoaderState.result.namedVersions.entries.map(async (entry) => {
    const jobStatusAndJobProgress: JobStatusAndJobProgress = await getJobStatusAndJobProgress(args.comparisonJobClient, entry, args.iTwinId, args.iModelId, currentVersionId);
    return {
      version: entry.version,
      state: VersionProcessedState.Processed,
      jobStatus: jobStatusAndJobProgress.jobStatus,
      jobProgress: jobStatusAndJobProgress.jobProgress,
    };
  }));
  args.namedVersionLoaderState.result = {
    namedVersions: { currentVersion: args.namedVersionLoaderState.result.namedVersions.currentVersion, entries: newEntries },
  };
  args.setResult(args.namedVersionLoaderState.result);
  void pollForInProgressJobs({
    iTwinId: args.iTwinId,
    iModelId: args.iModelId,
    namedVersionLoaderState: args.namedVersionLoaderState,
    comparisonJobClient: args.comparisonJobClient,
    setResult: args.setResult,
    isDisposed: args.isDisposed,
  });
};

type PollForInProgressJobsArgs = {
  iTwinId: string;
  iModelId: string;
  namedVersionLoaderState: NamedVersionLoaderState;
  comparisonJobClient: IComparisonJobClient;
  setResult: (result: NamedVersionLoaderResult) => void;
  isDisposed: () => boolean;
};

const pollForInProgressJobs = async (args: PollForInProgressJobsArgs) => {
  if (args.isDisposed())
    return;
  const currentVersionId = args.namedVersionLoaderState.result.namedVersions.currentVersion.version.id;
  let entries = args.namedVersionLoaderState.result.namedVersions.entries.slice();
  const areJobsInProgress = (entries: Entry[]) => {
    return entries.find(entry => entry.jobStatus === "Processing" || entry.jobStatus === "Queued") !== undefined;
  };
  if (areJobsInProgress(entries)) {
    const idEntryMap = new Map<string, Entry>();
    entries.forEach((entry) => idEntryMap.set(entry.version.id, entry));
    let updatingEntries = entries.filter((entry) => entry.jobStatus === "Processing" || entry.jobStatus === "Queued");
    while (updatingEntries.length > 0 && !args.isDisposed()) {
      for (let entry of updatingEntries) {
        await new Promise((resolve) => setTimeout(resolve, 5000)); // run loop every 5 seconds in to not poll too often
        const jobStatusAndJobProgress: JobStatusAndJobProgress = await getJobStatusAndJobProgress(args.comparisonJobClient, entry, args.iTwinId, args.iModelId, currentVersionId);
        entry = {
          version: entry.version,
          state: VersionProcessedState.Processed,
          jobStatus: jobStatusAndJobProgress.jobStatus,
          jobProgress: jobStatusAndJobProgress.jobProgress,
        };
        idEntryMap.set(entry.version.id, entry);
      }
      entries = [...idEntryMap.values()];
      updatingEntries = entries.filter((entry) => entry.jobStatus === "Processing" || entry.jobStatus === "Queued");
      args.namedVersionLoaderState.result = {
        namedVersions: { currentVersion: args.namedVersionLoaderState.result.namedVersions.currentVersion, entries: entries },
      };
      args.setResult(args.namedVersionLoaderState.result);
    }
  }
};

const getJobStatusAndJobProgress = async (comparisonJobClient: IComparisonJobClient, entry: Entry, iTwinId: string, iModelId: string, currentChangesetId: string): Promise<JobStatusAndJobProgress> => {
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

/**
 * Used for debugging.
 * Deletes comparison job.
 * @throws if delete is not successful
 */
//  const deleteJob = async (comparisonJobClient: IComparisonJobClient, entry: Entry, iTwinId: string, iModelId: string, currentChangesetId: string): Promise<void> => {
//      await comparisonJobClient.deleteComparisonJob({
//        iTwinId: iTwinId,
//        iModelId: iModelId,
//        jobId: `${entry.version.changesetId}-${currentChangesetId}`,
//      })
//  }
