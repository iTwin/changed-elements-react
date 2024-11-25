/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp, type IModelConnection } from "@itwin/core-frontend";
import { useEffect, useState } from "react";

import type { IComparisonJobClient } from "../../clients/IComparisonJobClient";
import type { IModelsClient, NamedVersion } from "../../clients/iModelsClient";
import { arrayToMap } from "../../utils/utils";
import {
  VersionProcessedState, type JobAndNamedVersions, type VersionState,
} from "./NamedVersions.js";
import { createJobId, getJobStatusAndJobProgress } from "./versionCompareV2WidgetUtils";

interface UseNamedVersionLoaderResult {
  isLoading: boolean;
  isError: boolean;
  result: {
    entries: NamedVersion[];
    currentVersion: NamedVersion | undefined;
    versionState: VersionState[];
  } | undefined;
  setResult: (value: VersionState[]) => void;
}

/**
 * Loads name versions and their job status compared to current version iModel is
 * targeting. Returns a result object with current version and namedVersion with
 * there job status sorted from newest to oldest. This is run during the initial
 * load of the widget.
 */
export function useNamedVersionLoader(
  iModelConnection: IModelConnection,
  iModelsClient: IModelsClient,
  comparisonJobClient: IComparisonJobClient,
  getPendingJobs: () => JobAndNamedVersions[],
  pageSize: number = 20,
): UseNamedVersionLoaderResult {
  const [state, setState] = useState<Omit<UseNamedVersionLoaderResult, "setResult">>({
    isLoading: true,
    isError: false,
    result: undefined,
  });

  useEffect(
    () => {
      const setResultNoNamedVersions = () => {
        setState({
          isLoading: false,
          isError: false,
          result: {
            entries: [],
            currentVersion: undefined,
            versionState: [],
          },
        });
      };
      const { iTwinId, iModelId, changeset } = iModelConnection;
      if (!iTwinId || !iModelId) {
        setResultNoNamedVersions();
        return;
      }

      let disposed = false;
      void (async () => {
        let currentNamedVersion: NamedVersion | undefined;
        let currentState: EntriesAndCurrent | undefined = undefined;
        let currentPage = 0;
        while (!disposed) {
          try {
            // Get a page of named versions
            const namedVersions = await iModelsClient.getNamedVersions({
              iModelId,
              top: pageSize,
              skip: currentPage * pageSize,
              orderby: "changesetIndex",
              ascendingOrDescending: "desc",
            });
            if (!currentNamedVersion) {
              currentNamedVersion = await getOrCreateCurrentNamedVersion(
                namedVersions,
                changeset.id,
                iModelsClient,
                iModelId,
                changeset.index,
              );
            }

            if (namedVersions.length === 0) {
              // No more named versions to process
              setState((prev) => ({ ...prev, isLoading: false }));
              break;
            }

            // Process the named versions
            const processedNamedVersionsState = await processNamedVersions({
              currentNamedVersion,
              namedVersions,
              setResultNoNamedVersions,
              iModelsClient,
              iModelId,
              updatePaging: (isPaging) => setState((prev) => ({ ...prev, isLoading: isPaging })),
            });

            if (processedNamedVersionsState) {
              const comparisonState = await queryComparisonState({
                namedVersions: processedNamedVersionsState.entries,
                iTwinId,
                iModelId,
                currentVersion: processedNamedVersionsState.currentVersion,
                iModelConnection,
                comparisonJobClient,
                getPendingJobs,
              });

              if (currentState) {
                currentState = {
                  entries: currentState.entries.concat(processedNamedVersionsState.entries),
                  currentVersion: processedNamedVersionsState?.currentVersion,
                };
              } else {
                currentState = processedNamedVersionsState;
              }

              const localCurrentState = currentState;
              setState((prev) => ({
                ...prev,
                result: {
                  currentVersion: localCurrentState.currentVersion,
                  entries: localCurrentState.entries,
                  versionState: comparisonState,
                },
              }));
            }

            currentPage++;
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(error);
            setState((prev) => ({ ...prev, isError: true, isLoading: false }));
            break;
          }
        }
      })();
      return () => {
        disposed = true;
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [comparisonJobClient, iModelConnection, iModelsClient],
  );

  return {
    ...state,
    setResult: (versionState) => setState((prev) => ({
      ...prev,
      result: {
        ...prev.result ?? { currentVersion: undefined, entries: [] },
        versionState,
      },
    })),
  };
}

interface EntriesAndCurrent {
  entries: NamedVersion[];
  currentVersion: NamedVersion | undefined;
}

interface ProcessNamedVersionsArgs {
  namedVersions: NamedVersion[];
  currentNamedVersion: NamedVersion;
  setResultNoNamedVersions: () => void;
  iModelsClient: IModelsClient;
  iModelId: string;
  updatePaging: (isPaging: boolean) => void;
}

async function processNamedVersions(
  args: ProcessNamedVersionsArgs,
): Promise<EntriesAndCurrent | undefined> {
  const sortedAndOffsetNamedVersions = await sortAndSetIndexOfNamedVersions(
    args.namedVersions,
    args.currentNamedVersion,
    args.setResultNoNamedVersions,
    args.iModelsClient,
    args.iModelId,
  );
  if (!sortedAndOffsetNamedVersions || sortedAndOffsetNamedVersions.length === 0) {
    args.setResultNoNamedVersions();
    args.updatePaging(false);
    return undefined;
  }

  return {
    entries: sortedAndOffsetNamedVersions,
    currentVersion: args.currentNamedVersion,
  };
}

// create faked named version if current version is not a named version
async function getOrCreateCurrentNamedVersion(
  namedVersions: NamedVersion[],
  currentChangeSetId: string,
  iModelsClient: IModelsClient,
  iModelId?: string,
  currentChangeSetIndex?: number,
): Promise<NamedVersion> {
  const currentFromNamedVersion = namedVersions.find((version) => (
    version.changesetId === currentChangeSetId ||
    version.changesetIndex === currentChangeSetIndex
  ));
  if (currentFromNamedVersion) {
    return currentFromNamedVersion;
  }

  const currentFromChangeSet = await getCurrentFromChangeSet(
    currentChangeSetId,
    iModelsClient,
    iModelId,
  );
  if (currentFromChangeSet) {
    return currentFromChangeSet;
  }

  return {
    id: currentChangeSetId,
    displayName: IModelApp.localization.getLocalizedString(
      "VersionCompare:versionCompare.currentChangeset",
    ),
    changesetId: currentChangeSetId,
    changesetIndex: currentChangeSetIndex ?? 0,
    description: "",
    createdDateTime: "",
  };
}

async function getCurrentFromChangeSet(
  currentChangeSetId: string,
  iModelsClient: IModelsClient,
  iModelId?: string,
): Promise<NamedVersion | undefined> {
  if (!iModelId) {
    return undefined;
  }

  const currentChangeSet = await iModelsClient.getChangeset({
    iModelId,
    changesetId: currentChangeSetId,
  });
  if (!currentChangeSet) {
    return undefined;
  }

  return {
    id: currentChangeSet.id,
    displayName: currentChangeSet.displayName,
    changesetId: currentChangeSet.id,
    changesetIndex: currentChangeSet.index,
    description: currentChangeSet.description,
    createdDateTime: currentChangeSet.pushDateTime,
  };
}

async function sortAndSetIndexOfNamedVersions(
  namedVersions: NamedVersion[],
  currentNamedVersion: NamedVersion,
  onError: () => void,
  iModelsClient: IModelsClient,
  iModelId: string,
): Promise<NamedVersion[] | undefined> {
  // If current index is 0, then no need to filter. All change sets are older than current.
  const namedVersionsOlderThanCurrentVersion = currentNamedVersion.changesetIndex === 0
    ? namedVersions
    : namedVersions.filter(
      (version) => version.changesetIndex <= currentNamedVersion.changesetIndex,
    );
  if (namedVersionsOlderThanCurrentVersion.length === 0) {
    onError();
    return undefined;
  }

  const reversedNamedVersions = namedVersionsOlderThanCurrentVersion;
  if (reversedNamedVersions[0].changesetIndex === currentNamedVersion.changesetIndex) {
    reversedNamedVersions.shift(); // Remove current named version
  }

  // We must offset the named versions, because that changeset is "already applied"
  // to the named version, see this:
  // https://developer.bentley.com/tutorials/changed-elements-api/#221-using-the-api-to-get-changed-elements
  // This assuming latest is current
  return Promise.all(
    reversedNamedVersions.map(async (nameVersion) => {
      nameVersion.changesetIndex = nameVersion.changesetIndex + 1;
      const changesetId = nameVersion.changesetIndex.toString();
      const changeSet = await iModelsClient.getChangeset({ iModelId, changesetId });
      nameVersion.changesetId = changeSet?.id ?? nameVersion.changesetId;
      return nameVersion;
    }),
  );
}

interface QueryComparisonState {
  namedVersions: NamedVersion[];
  iTwinId: string;
  iModelId: string;
  currentVersion: NamedVersion | undefined;
  iModelConnection: IModelConnection;
  comparisonJobClient: IComparisonJobClient;
  getPendingJobs: () => JobAndNamedVersions[];
}

async function queryComparisonState(
  args: QueryComparisonState,
): Promise<VersionState[]> {
  const pendingJobsMap = arrayToMap(
    args.getPendingJobs(),
    (job) => createJobId(job.targetNamedVersion, job.currentNamedVersion),
  );
  const currentVersionId = args.currentVersion?.changesetId ?? args.iModelConnection?.changeset.id;
  return Promise.all(
    args.namedVersions.map(async (entry) => {
      const jobId = `${entry.changesetId}-${currentVersionId}`;
      if (pendingJobsMap.has(jobId)) {
        return {
          jobId,
          state: VersionProcessedState.Processed,
          jobStatus: "Processing",
          jobProgress: { currentProgress: 0, maxProgress: 1 },
        };
      }

      const { jobStatus, jobProgress } = await getJobStatusAndJobProgress({
        comparisonJobClient: args.comparisonJobClient,
        iTwinId: args.iTwinId,
        iModelId: args.iModelId,
        jobId,
      });
      return { jobId, state: VersionProcessedState.Processed, jobStatus, jobProgress };
    }),
  );
}
