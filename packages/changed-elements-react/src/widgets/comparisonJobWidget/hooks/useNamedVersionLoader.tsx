/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp, type IModelConnection } from "@itwin/core-frontend";
import { useEffect, useState } from "react";

import type { IComparisonJobClient } from "../../../clients/IComparisonJobClient";
import type { IModelsClient, NamedVersion } from "../../../clients/iModelsClient";
import { arrayToMap } from "../../../utils/utils";
import { createJobId, getJobStatusAndJobProgress } from "../common/versionCompareV2WidgetUtils";
import type {
  JobAndNamedVersions, JobProgress, JobStatus, JobStatusAndJobProgress,
} from "../models/ComparisonJobModels";
import { VersionProcessedState } from "../models/VersionProcessedState";
import type { VersionState } from "../models/VersionState.js";

interface UseNamedVersionLoaderResult {
  isLoading: boolean;
  isError: boolean;
  entries: VersionState[];
  currentVersion: VersionState | undefined;
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
  const [result, setResult] = useState<UseNamedVersionLoaderResult>({
    isLoading: true,
    isError: false,
    entries: [],
    currentVersion: undefined,
  });
  useEffect(
    () => {
      const setResultNoNamedVersions = () => {
        setResult({
          isLoading: false,
          isError: false,
          entries: [],
          currentVersion: undefined,
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
        let currentState: Pick<UseNamedVersionLoaderResult, "currentVersion" | "entries"> | undefined = undefined;
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
              setResult((prev) => ({ ...prev, isLoading: false }));
              break;
            }

            // Process the named versions
            const processedNamedVersionsState = await processNamedVersions({
              currentNamedVersion,
              namedVersions,
              setResultNoNamedVersions,
              iModelsClient,
              iModelId,
              updatePaging: (isPaging) => setResult((prev) => ({ ...prev, isLoading: isPaging })),
              iTwinId,
              iModelConnection,
              comparisonJobClient,
              getPendingJobs,
            });

            if (processedNamedVersionsState) {
              if (currentState) {
                currentState = {
                  entries: currentState.entries.concat(processedNamedVersionsState.entries),
                  currentVersion: processedNamedVersionsState?.currentVersion,
                };
              } else {
                currentState = processedNamedVersionsState;
              }

              const localCurrentState = currentState;
              setResult((prev) => ({
                ...prev,
                currentVersion: localCurrentState.currentVersion,
                entries: localCurrentState.entries,
              }));
            }

            currentPage++;
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(error);
            setResult((prev) => ({ ...prev, isError: true, isLoading: false }));
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
  return result;
}

interface ProcessNamedVersionsArgs {
  namedVersions: NamedVersion[];
  currentNamedVersion: NamedVersion;
  setResultNoNamedVersions: () => void;
  iModelsClient: IModelsClient;
  iModelId: string;
  updatePaging: (isPaging: boolean) => void;
  iTwinId: string;
  iModelConnection: IModelConnection;
  comparisonJobClient: IComparisonJobClient;
  getPendingJobs: () => JobAndNamedVersions[];
}

async function processNamedVersions(
  args: ProcessNamedVersionsArgs,
): Promise<Pick<UseNamedVersionLoaderResult, "currentVersion" | "entries"> | undefined> {
  const {
    namedVersions,
    setResultNoNamedVersions,
    iModelsClient,
    iModelId,
    updatePaging,
    comparisonJobClient,
    iTwinId,
    iModelConnection,
    getPendingJobs,
    currentNamedVersion,
  } = args;
  const sortedAndOffsetNamedVersions = await sortAndSetIndexOfNamedVersions(
    namedVersions,
    currentNamedVersion,
    setResultNoNamedVersions,
    iModelsClient,
    iModelId,
  );
  if (!sortedAndOffsetNamedVersions || sortedAndOffsetNamedVersions.length === 0) {
    setResultNoNamedVersions();
    updatePaging(false);
    return undefined;
  }

  const initialComparisonJobStatus: JobStatus = "Unknown";
  const initialJobProgress: JobProgress = {
    currentProgress: 0,
    maxProgress: 0,
  };
  const namedVersionState: Pick<UseNamedVersionLoaderResult, "currentVersion" | "entries"> = {
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
  };
  return getComparisonJobInfoForNamedVersions({
    iModelConnection,
    iTwinId,
    iModelId,
    namedVersionLoaderState: namedVersionState,
    comparisonJobClient,
    getPendingJobs,
  });
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

interface ProcessChangesetsArgs {
  iTwinId: string;
  iModelId: string;
  namedVersionLoaderState: Pick<UseNamedVersionLoaderResult, "currentVersion" | "entries">;
  iModelConnection: IModelConnection;
  comparisonJobClient: IComparisonJobClient;
  getPendingJobs: () => JobAndNamedVersions[];
}

async function getComparisonJobInfoForNamedVersions(
  args: ProcessChangesetsArgs,
): Promise<Pick<UseNamedVersionLoaderResult, "currentVersion" | "entries">> {
  const pendingJobsMap = arrayToMap(
    args.getPendingJobs(),
    (job) => createJobId(job.targetNamedVersion, job.currentNamedVersion),
  );
  const currentVersionId = args.namedVersionLoaderState.currentVersion?.version.changesetId
    ?? args.iModelConnection?.changeset.id;
  const newEntries = await Promise.all(
    args.namedVersionLoaderState.entries.map(async (entry) => {
      const jobStatusAndJobProgress: JobStatusAndJobProgress = await getJobStatusAndJobProgress({
        comparisonJobClient: args.comparisonJobClient,
        entry,
        iTwinId: args.iTwinId,
        iModelId: args.iModelId,
        currentChangesetId: currentVersionId,
      });
      if (pendingJobsMap.has(`${entry.version.changesetId}-${currentVersionId}`)) {
        return {
          version: entry.version,
          state: VersionProcessedState.Processed,
          jobStatus: "Processing",
          jobProgress: { currentProgress: 0, maxProgress: 1 },
        } as const;
      }

      return {
        version: entry.version,
        state: VersionProcessedState.Processed,
        jobStatus: jobStatusAndJobProgress.jobStatus,
        jobProgress: jobStatusAndJobProgress.jobProgress,
      };
    }),
  );
  return {
    currentVersion: args.namedVersionLoaderState.currentVersion,
    entries: newEntries,
  };
}
