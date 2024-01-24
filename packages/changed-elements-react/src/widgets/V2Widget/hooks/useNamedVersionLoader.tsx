import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { useState, useEffect } from "react";
import { jobStatus } from "../models/JobStatus";
import { VersionProcessedState } from "../VersionProcessedState";
import { NamedVersions } from "../models/NamedVersions";
import { ComparisonJobClient } from "../../../clients/ChangedElementsClient";
import { VersionState } from "../models/VersionState";
import { IModelsClient, NamedVersion } from "../../../clients/iModelsClient";

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
        jobStatus: jobStatus;
      }[];
      currentVersion: VersionState;
    };
  };
};

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
      let disposed = false;
      if (!iTwinId || !iModelId || !currentChangeSetId) {
        setResultNoNamedVersions();
        return;
      }

      void (async () => {
        const namedVersions = await iModelsClient.getNamedVersions({ iModelId });
        const currentNamedVersion = getOrCreateCurrentNamedVersion(namedVersions, currentChangeSetId);
        const sortedNamedVersions = sortNamedVersions(namedVersions, currentNamedVersion, setResultNoNamedVersions);
        if (!sortedNamedVersions || sortedNamedVersions.length === 0) {
          setResultNoNamedVersions();
          return;
        }
        if (disposed) {
          return;
        }
        const currentComparisonJobStatus: jobStatus = "Unknown";
        const currentState: namedVersionLoaderState = {
          result: {
            namedVersions: {
              entries: sortedNamedVersions.map((namedVersion) => ({
                version: namedVersion,
                state: VersionProcessedState.Verifying,
                jobStatus: currentComparisonJobStatus,
              })),
              currentVersion: {
                version: currentNamedVersion,
                state: VersionProcessedState.Processed,
                jobStatus: currentComparisonJobStatus,
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

const getOrCreateCurrentNamedVersion = (namedVersions: NamedVersion[], currentChangeSetId: string): NamedVersion => {
  const currentNamedVersion = namedVersions.find(version => version.changesetId === currentChangeSetId);
  if (currentNamedVersion) {
    return currentNamedVersion;
  }
  return {
    id: currentChangeSetId,
    displayName: IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.currentChangeset"),
    changesetId: currentChangeSetId,
    changesetIndex: 0,
    description: "",
    createdDateTime: "",
  };
};

const sortNamedVersions = (namedVersions: NamedVersion[], currentNamedVersion: NamedVersion, onError: () => void) => {
  const currentChangeSetDate = !currentNamedVersion.createdDateTime ? new Date() : new Date(currentNamedVersion.createdDateTime);
  const namedVersionsOlderThanCurrentVersion = namedVersions.filter(version => new Date(version.createdDateTime) <= currentChangeSetDate);
  if (namedVersionsOlderThanCurrentVersion.length === 0) {
    onError();
    return;
  }
  const sortedNamedVersionsByDate = namedVersionsOlderThanCurrentVersion.sort((a, b) => {
    const dateA = new Date(a.createdDateTime);
    const dateB = new Date(b.createdDateTime);

    // Sort in descending order (newest first)
    return dateB.getTime() - dateA.getTime();
  });
  return sortedNamedVersionsByDate;
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
    const hasComparisonJob: jobStatus = await getJobStatus(args.comparisonJobClient, entry, args.iTwinId, args.iModelId, currentVersionId);
    return {
      version: entry.version,
      state: VersionProcessedState.Processed,
      hasComparisonJob: hasComparisonJob,
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
  hasComparisonJob: jobStatus;
};

const getJobStatus = async (comparisonJobClient: ComparisonJobClient, entry: entry, iTwinId: string, iModelId: string, currentChangesetId: string): Promise<jobStatus> => {
  try {
    const res = await comparisonJobClient.getComparisonJob({
      iTwinId: iTwinId,
      iModelId: iModelId,
      jobId: `${entry.version.changesetId}-${currentChangesetId}`,
    });
    if (res) {
      switch (res.comparisonJob.status) {
        case "Completed":
          return "Ready";
        case "Queued":
          return "In Progress";
        case "Started":
          return "In Progress";
        case "Error":
          return "Not Started";
      }
    }
    return "Unknown";
  } catch (_) {
    return "Not Started";
  }
};
