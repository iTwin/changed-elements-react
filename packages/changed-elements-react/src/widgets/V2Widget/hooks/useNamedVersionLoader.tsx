import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { useState, useEffect } from "react";
import { JobStatus, JobProgress, JobStatusAndJobProgress } from '../models/JobStatus';
import { VersionProcessedState } from "../VersionProcessedState";
import { NamedVersions } from "../models/NamedVersions";
import { ComparisonJobClient, ComparisonJobStarted } from "../../../clients/ChangedElementsClient";
import { VersionState } from "../models/VersionState";
import { Changeset, IModelsClient, NamedVersion } from "../../../clients/iModelsClient";

/**
 * Result type for versionLoader.
 */
export type namedVersionLoaderResult = {
  /** Named versions to display in the list. */
  namedVersions: NamedVersions;
};

type namedVersionLoaderState = {
  result: {
    namedVersions: {
      entries: {
        version: NamedVersion;
        state: VersionProcessedState;
        jobStatus: JobStatus;
        jobProgress:JobProgress,
      }[];
      currentVersion: VersionState;
    };
  };
};

/**
 * Loads name versions and their job status compared to current version iModel is targeting.
 */
export const useNamedVersionLoader = (
  iModelConnection: IModelConnection,
  iModelsClient: IModelsClient,
  comparisonJobClient: ComparisonJobClient,
) => {
  const [result, setResult] = useState<namedVersionLoaderResult>();
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
          numberCompleted: 0,
          totalToComplete: 0,
        };
        const currentState: namedVersionLoaderState = {
          result: {
            namedVersions: {
              entries: sortedNamedVersions.map((namedVersion) => ({
                version: namedVersion,
                state: VersionProcessedState.Verifying,
                jobStatus: initialComparisonJobStatus,
                jobProgress: initialJobProgress,
                jobId:"",
              })),
              currentVersion: {
                version: currentNamedVersion,
                state: VersionProcessedState.Processed,
                jobStatus: initialComparisonJobStatus,
                jobProgress: initialJobProgress,
                jobId:"",
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
          setResult: (result: namedVersionLoaderResult) => {
            setResult(result);
          },
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

type processChangesetsArgs = {
  iTwinId: string;
  iModelId: string;
  namedVersionLoaderState: namedVersionLoaderState;
  comparisonJobClient: ComparisonJobClient;
  setResult: (result: namedVersionLoaderResult) => void;
};

const processChangesetsAndUpdateResultState = async (args: processChangesetsArgs) => {
  const currentVersionId = args.namedVersionLoaderState.result.namedVersions.currentVersion.version.id;
  const newEntries = await Promise.all(args.namedVersionLoaderState.result.namedVersions.entries.map(async (entry) => {
    const jobStatusAndJobProgress: JobStatusAndJobProgress = await getJobStatusAndJobProgress(args.comparisonJobClient, entry, args.iTwinId, args.iModelId, currentVersionId);
    return {
      version: entry.version,
      state: VersionProcessedState.Processed,
      jobStatus: jobStatusAndJobProgress.jobStatus,
      jobProgress: jobStatusAndJobProgress.jobProgress,
      jobId: `${entry.version.changesetId}-${currentVersionId}`,
      updateJobProgress: () => {
       return getJobStatusAndJobProgress(args.comparisonJobClient, entry, args.iTwinId, args.iModelId, currentVersionId)
      },
    };
  }));
  args.namedVersionLoaderState.result = {
    namedVersions: { currentVersion: args.namedVersionLoaderState.result.namedVersions.currentVersion, entries: newEntries },
  };
  args.setResult(args.namedVersionLoaderState.result);
};

type entry = {
  version: NamedVersion;
  state: VersionProcessedState;
  jobStatus: JobStatus;
  jobProgress: JobProgress;
};

const getJobStatusAndJobProgress = async (comparisonJobClient: ComparisonJobClient, entry: entry, iTwinId: string, iModelId: string, currentChangesetId: string): Promise<JobStatusAndJobProgress> => {
  try {
    const res = await comparisonJobClient.getComparisonJob({
      iTwinId: iTwinId,
      iModelId: iModelId,
      jobId: `${entry.version.changesetId}-${currentChangesetId}`,
    });
    if (res) {
      switch (res.comparisonJob.status) {
        case "Completed":
          return {
            jobStatus: "Available",
            jobProgress: {
              numberCompleted: 0,
              totalToComplete: 0,
            },
          };
        case "Queued": {
          return {
            jobStatus: "Queued",
            jobProgress: {
              numberCompleted: 0,
              totalToComplete:0,
            },
          };
        }
        case "Started": {
          const progressingJob = res as ComparisonJobStarted
          return {
            jobStatus: "Processing",
            jobProgress: {
              numberCompleted: progressingJob.comparisonJob.comparisonProgress,
              totalToComplete: progressingJob.comparisonJob.comparisonProgressTotal,
            },
          };
        }
        case "Error":
          return {
            jobStatus: "Error",
            jobProgress: {
              numberCompleted: 0,
              totalToComplete: 0,
            },
          };
      }
    }
    return {
      jobStatus: "Unknown",
      jobProgress: {
        numberCompleted: 0,
        totalToComplete: 0,
      },
    };
  } catch (_) {
    return {
      jobStatus: "Not Processed",
      jobProgress: {
        numberCompleted: 0,
        totalToComplete: 0,
      },
    };
  }
};
