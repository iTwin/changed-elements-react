import { IModelConnection, IModelApp } from "@itwin/core-frontend";
import { useState, useEffect } from "react";
import { Changeset, VersionCompare, NamedVersion, ChangedElementsApiClient, ChangesetStatus } from "../..";
import { useVersionCompare } from "../../VersionCompareContext";
import { splitBeforeEach, flatten, map, skip } from "../../utils/utils";
import { VersionState } from "../VersionCompareSelectWidget";
import { jobStatus } from "./JobStatus";
import { VersionProcessedState } from "./VersionProcessedState";
import { NamedVersions } from "./NamedVersions";
import { ChangedElementsClient } from "../../clients/ChangedElementsClient";
import "./VersionCompareSelectWidget.scss";

export interface UsePagedNamedVersionLoaderResult {
  /** Named versions to display in the list. */
  namedVersions: NamedVersions;

  /** Changesets in descending index order. */
  changesets: Changeset[];
}

type pagedState = {
  result: {
    namedVersions: {
      entries: {
        version: NamedVersion;
        state: VersionProcessedState;
        hasComparisonJob: jobStatus;
      }[];
      currentVersion: VersionState;
    };
    changesets: Changeset[];
  };
};

export function usePagedNamedVersionLoader(
  iModelConnection: IModelConnection | undefined,
): UsePagedNamedVersionLoaderResult | undefined {
  const [result, setResult] = useState<UsePagedNamedVersionLoaderResult>();
  const { iModelsClient, comparisonJobClient } = useVersionCompare();

  const setResultNoNamedVersions = () => {
    setResult({
      namedVersions: { entries: [], currentVersion: undefined },
      changesets: [],
    });
  };
  useEffect(
    () => {
      const iTwinId = iModelConnection?.iTwinId;
      const iModelId = iModelConnection?.iModelId;
      const currentChangeSetId = iModelConnection?.changeset.id;
      const manager = VersionCompare.manager;
      if (!iTwinId || !iModelId || !currentChangeSetId || !manager) {
        setResultNoNamedVersions();
        return;
      }

      let disposed = false;
      void (async () => {
        const [namedVersions, changesets] = await Promise.all([
          iModelsClient.getNamedVersions({ iModelId }),
          // Changesets need to be in descending index order
          iModelsClient.getChangesets({ iModelId }).then((changesets) => changesets.slice().reverse()),
        ]);
        const currentChangesetIndex = changesets.findIndex(({ id }) => id === currentChangeSetId);
        const sortedNamedVersions = sortNamedVersionsFromChangesets(changesets, namedVersions, setResultNoNamedVersions, currentChangesetIndex);
        if (!sortedNamedVersions || sortedNamedVersions.length === 0) {
          setResultNoNamedVersions();
          return;
        }
        if (disposed) {
          return;
        }
        const currentVersion = getOrManufactureCurrentNamedVersion(sortedNamedVersions, currentChangeSetId, currentChangesetIndex);

        const currentComparisonJobStatus: jobStatus = "Unknown";
        const currentVersionState: VersionState = {
          version: currentVersion,
          state: VersionProcessedState.Processed,
          numberNeededChangesets: 0,
          numberProcessedChangesets: 0,
          hasComparisonJob: currentComparisonJobStatus,
        };
        const currentState: pagedState = {
          result: {
            namedVersions: {
              entries: sortedNamedVersions.map(({ namedVersion }) => ({
                version: namedVersion,
                state: VersionProcessedState.Verifying,
                hasComparisonJob: (currentComparisonJobStatus) as jobStatus,
              })),
              currentVersion: currentVersionState,
            },
            changesets,
          },
        };

        setResult(currentState.result);
        if (sortedNamedVersions.length === 0) {
          return;
        }
        await processChangesetsAndUpdateResultState({
          iTwinId: iTwinId,
          iModelId: iModelId,
          changesets: changesets,
          currentVersion: currentVersion,
          namedVersions: sortedNamedVersions,
          currentState: currentState,
          disposed: disposed,
          comparisonJobClient: comparisonJobClient,
          currentChangeSetId: currentChangeSetId,
          currentVersionState: currentVersionState,
          setResult: (result: UsePagedNamedVersionLoaderResult) => {
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
}

const sortNamedVersionsFromChangesets = (changesets: Changeset[], namedVersions: NamedVersion[], onError: () => void, currentChangesetIndex: number) => {
  const reverseChangeSetMap = changesetIdToReverseIndexMap(changesets, onError, currentChangesetIndex);
  if (!reverseChangeSetMap || reverseChangeSetMap.size === 0) {
    return;
  }
  const sortedNamedVersions = sortNamedVersionsBasedOnReverseChangeSetMap(reverseChangeSetMap, namedVersions);
  if (sortedNamedVersions.length === 0) {
    onError();
    return;
  }
  return sortedNamedVersions;
};

const changesetIdToReverseIndexMap = (changesets: Changeset[], onError: () => void, currentChangesetIndex: number) => {
  // Each changeset has an index property, but here we retrieve a changeset index in backwards-sorted array
  const changeSetCopy = changesets.slice();
  if (currentChangesetIndex === -1) {
    // Early exit due to bad data
    onError();
    return;
  }

  // Changesets that are applied after the current changeset are irrelevant
  changeSetCopy.splice(0, currentChangesetIndex);
  return new Map(changeSetCopy.map((changeset, index) => [changeset.id, index]));
};

const sortNamedVersionsBasedOnReverseChangeSetMap = (reverseChangeSetMap: Map<string, number>, namedVersions: NamedVersion[]) => {
  // Reorder and filter named versions based on changeset order
  const sortedNamedVersions: Array<{ namedVersion: NamedVersion; changesetReverseIndex: number; }> = [];
  for (const namedVersion of namedVersions) {
    const reverseIndex = namedVersion.changesetId
      ? reverseChangeSetMap.get(namedVersion.changesetId)
      : undefined;
    if (reverseIndex !== undefined) {
      sortedNamedVersions.push({ namedVersion, changesetReverseIndex: reverseIndex });
    }
  }

  return sortedNamedVersions.sort((a, b) => a.changesetReverseIndex - b.changesetReverseIndex);
};

type namedVersionAndIndex = {
  namedVersion: NamedVersion;
  changesetReverseIndex: number;
};
const getOrManufactureCurrentNamedVersion = (namedVersions: namedVersionAndIndex[], currentChangesetId: string, currentChangesetIndex: number) => {
  if (namedVersions[0].namedVersion.changesetId === currentChangesetId) {
    return namedVersions.shift()!.namedVersion;
  } else {
    return {
      id: "",
      displayName: IModelApp.localization.getLocalizedString(
        currentChangesetIndex === 0
          ? "VersionCompare:versionCompare.latestChangeset"
          : "VersionCompare:versionCompare.currentChangeset",
      ),
      changesetId: currentChangesetId,
      changesetIndex: -1,
      description: null,
      createdDateTime: "",
    };
  }
};

type processChangesetsArgs = {
  iTwinId: string;
  iModelId: string;
  changesets: Changeset[];
  currentVersion: NamedVersion;
  namedVersions: namedVersionAndIndex[];
  currentState: pagedState;
  disposed: boolean;
  comparisonJobClient?: ChangedElementsClient;
  currentChangeSetId: string;
  currentVersionState: VersionState;
  setResult: (result: UsePagedNamedVersionLoaderResult) => void;
};

const processChangesetsAndUpdateResultState = async (args: processChangesetsArgs) => {
    const newEntries = await Promise.all(args.currentState.result.namedVersions.entries.map(async (entry) => {
      const hasComparisonJob: jobStatus = args.comparisonJobClient ? await getJobStatus(args.comparisonJobClient, entry, args.iTwinId, args.iModelId, args.currentChangeSetId) : entry.hasComparisonJob;
        return {
          version: entry.version,
          state: VersionProcessedState.Processed,
          hasComparisonJob: hasComparisonJob,
        };
    }));

    args.currentState.result = {
      namedVersions: { currentVersion: args.currentVersionState, entries: newEntries },
      changesets: args.currentState.result.changesets,
    };
    args.setResult(args.currentState.result);
};

type entry = {
  version: NamedVersion;
  state: VersionProcessedState;
  hasComparisonJob: jobStatus;
};
const getJobStatus = async (comparisonJobClient: ChangedElementsClient, entry: entry, iTwinId: string, iModelId: string, currentChangesetId:string): Promise<jobStatus> => {
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
