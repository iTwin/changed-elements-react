/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { useEffect } from "react";
import { JobStatus, JobProgress, JobStatusAndJobProgress } from "../models/ComparisonJobModels";
import { VersionProcessedState } from "../models/VersionProcessedState";
import { CurrentNamedVersionAndNamedVersions } from "../models/NamedVersions";
import { IComparisonJobClient } from "../../../clients/IComparisonJobClient";
import { Changeset, IModelsClient, NamedVersion } from "../../../clients/iModelsClient";
import { getJobStatusAndJobProgress } from "../common/versionCompareV2WidgetUtils";
import { JobAndNamedVersions } from "../components/VersionCompareSelectModal";

/**
 * Result type for versionLoader.
 */
export type NamedVersionLoaderResult = {
  /** Named versions to display in the list. */
  namedVersions: CurrentNamedVersionAndNamedVersions;
};

/**
 * Loads name versions and their job status compared to current version iModel is targeting.
 * Returns a result object with current version and namedVersion with there job status sorted from newest to oldest.
 * This is run during the initial load of the widget.
 */
export const useNamedVersionLoader = (
  iModelConnection: IModelConnection,
  iModelsClient: IModelsClient,
  comparisonJobClient: IComparisonJobClient,
  setNamedVersionResult: (state: NamedVersionLoaderResult) => void,
  getPendingJobs: () => JobAndNamedVersions[],
) => {

  useEffect(
    () => {
      const setResultNoNamedVersions = () => {
        setNamedVersionResult({
          namedVersions: { entries: [], currentVersion: undefined },
        });
      };
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
        const sortedAndOffsetNamedVersions = sortAndSetIndexOfNamedVersions(namedVersions, currentNamedVersion, setResultNoNamedVersions, changesets);
        if (!sortedAndOffsetNamedVersions || sortedAndOffsetNamedVersions.length === 0) {
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
        const currentState: NamedVersionLoaderResult = {
          namedVersions: {
            entries: sortedAndOffsetNamedVersions.map((namedVersion) => ({
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
        };
        setNamedVersionResult(currentState);
        void processChangesetsAndUpdateResultState({
          iModelConnection: iModelConnection,
          iTwinId: iTwinId,
          iModelId: iModelId,
          namedVersionLoaderState: currentState,
          comparisonJobClient: comparisonJobClient,
          setResult: (result: NamedVersionLoaderResult) => {
            setNamedVersionResult(result);
          },
          getPendingJobs,
        });
      })();

      return () => {
        disposed = true;
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comparisonJobClient, iModelConnection, iModelsClient],
  );
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

const sortAndSetIndexOfNamedVersions = (namedVersions: NamedVersion[], currentNamedVersion: NamedVersion, onError: () => void, changesets: Changeset[]) => {
  //if current index is 0 then no need to filter. All change sets are older than current.
  const namedVersionsOlderThanCurrentVersion = currentNamedVersion.changesetIndex !== 0 ? namedVersions.filter(version => version.changesetIndex <= currentNamedVersion.changesetIndex) :
    namedVersions;
  if (namedVersionsOlderThanCurrentVersion.length === 0) {
    onError();
    return;
  }
  const reversedNamedVersions = namedVersionsOlderThanCurrentVersion.reverse();
  if (reversedNamedVersions[0].changesetIndex === currentNamedVersion.changesetIndex) {
    reversedNamedVersions.shift(); //remove current named version
  }
  const changeSetMap = new Map<number, Changeset>();
  changesets.forEach((changeset: Changeset) => {
    changeSetMap.set(changeset.index, changeset);
  });
  // we must offset the named versions , because that changeset is "already applied" to the named version, see this:
  // https://developer.bentley.com/tutorials/changed-elements-api/#221-using-the-api-to-get-changed-elements
  // this assuming latest is current
  const offSetNameVersions = reversedNamedVersions.map((version) => {
    version.changesetIndex = version.changesetIndex + 1;
    version.changesetId = changeSetMap.get(version.changesetIndex)?.id ?? version.changesetId;
    return version;
  });
  return offSetNameVersions;
};

type ProcessChangesetsArgs = {
  iTwinId: string;
  iModelId: string;
  namedVersionLoaderState: NamedVersionLoaderResult;
  iModelConnection: IModelConnection;
  comparisonJobClient: IComparisonJobClient;
  setResult: (result: NamedVersionLoaderResult) => void;
  getPendingJobs: () => JobAndNamedVersions[],
};

const processChangesetsAndUpdateResultState = async (args: ProcessChangesetsArgs) => {
  // wait for all pending jobs to be posted before continuing. Thi will prevent job posting running over each other.
  const loopDelayInMilliseconds = 1000;
  while (args.getPendingJobs().length > 0) { // wait for all jobs to be posted
    await new Promise((resolve) => setTimeout(resolve, loopDelayInMilliseconds));
  }
  const currentVersionId = args.namedVersionLoaderState.namedVersions.currentVersion?.version.changesetId ??
    args.iModelConnection?.changeset.id;
  const newEntries = await Promise.all(args.namedVersionLoaderState.namedVersions.entries.map(async (entry) => {
    const jobStatusAndJobProgress: JobStatusAndJobProgress = await getJobStatusAndJobProgress(args.comparisonJobClient, entry, args.iTwinId, args.iModelId, currentVersionId);
    return {
      version: entry.version,
      state: VersionProcessedState.Processed,
      jobStatus: jobStatusAndJobProgress.jobStatus,
      jobProgress: jobStatusAndJobProgress.jobProgress,
    };
  }));
  args.namedVersionLoaderState = {
    namedVersions: { currentVersion: args.namedVersionLoaderState.namedVersions.currentVersion, entries: newEntries },
  };
  args.setResult(args.namedVersionLoaderState);
};
