/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp, type IModelConnection } from "@itwin/core-frontend";
import { useEffect, useState } from "react";

import type { IComparisonJobClient } from "../../../clients/IComparisonJobClient.js";
import type { IModelsClient, NamedVersion } from "../../../clients/iModelsClient.js";
import { arrayToMap } from "../../../utils/utils.js";
import { createJobId, getJobStatusAndJobProgress } from "../common/versionCompareV2WidgetUtils.js";
import type {
  JobAndNamedVersions, JobProgress, JobStatus, JobStatusAndJobProgress
} from "../models/ComparisonJobModels.js";
import type { CurrentNamedVersionAndNamedVersions } from "../models/NamedVersions.js";
import { VersionProcessedState } from "../models/VersionProcessedState.js";

/**
 * Result type for versionLoader.
 */
export type NamedVersionLoaderState = {
  /** Named versions to display in the list. */
  namedVersions: CurrentNamedVersionAndNamedVersions;
};

interface UseNamedVersionLoaderResult {
  isLoading: boolean;
}

/**
 * Loads name versions and their job status compared to current version iModel is targeting.
 * Returns a result object with current version and namedVersion with there job status sorted from newest to oldest.
 * This is run during the initial load of the widget.
 */
export const useNamedVersionLoader = (
  iModelConnection: IModelConnection,
  iModelsClient: IModelsClient,
  comparisonJobClient: IComparisonJobClient,
  setNamedVersionResult: (state: NamedVersionLoaderState) => void,
  getPendingJobs: () => JobAndNamedVersions[],
  pageSize: number = 20,
): UseNamedVersionLoaderResult => {
  const [isLoading, setIsLoading] = useState(true);
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
        let currentNamedVersion: NamedVersion | undefined;
        let currentState: NamedVersionLoaderState | undefined = undefined;
        let currentPage = 0;
        while (!disposed) {
          try {
            // Get a page of named versions
            const namedVersions = await iModelsClient.getNamedVersions(
              {
                iModelId,
                top: pageSize,
                skip: currentPage * pageSize,
                orderby: "changesetIndex",
                ascendingOrDescending: "desc",
              });

            if (currentPage === 0 && namedVersions.length === 0) {
              setResultNoNamedVersions();
              break;
            }
            
            if (!currentNamedVersion)
              currentNamedVersion = await getOrCreateCurrentNamedVersion(namedVersions, currentChangeSetId, iModelsClient, iModelId, currentChangeSetIndex);

            if (namedVersions.length === 0) {
              setIsLoading(false);
              break; // No more named versions to process
            }
            // Process the named versions
            const processedNamedVersionsState = await processNamedVersions({
              currentNamedVersion: currentNamedVersion,
              namedVersions: namedVersions,
              setResultNoNamedVersions: setResultNoNamedVersions,
              iModelsClient: iModelsClient,
              iModelId: iModelId,
              updatePaging: setIsLoading,
              iTwinId: iTwinId,
              iModelConnection: iModelConnection,
              comparisonJobClient: comparisonJobClient,
              getPendingJobs: getPendingJobs,
            });

            if (processedNamedVersionsState) {
              if (currentState) {
                const updatedState: NamedVersionLoaderState = {
                  namedVersions: {
                    entries: currentState.namedVersions.entries.concat(processedNamedVersionsState.namedVersions.entries),
                    currentVersion: processedNamedVersionsState?.namedVersions.currentVersion,
                  },
                };
                currentState = updatedState;
              } else {
                currentState = processedNamedVersionsState;
              }
              setNamedVersionResult(currentState);
            }
            currentPage++;
          } catch (error) {
            setIsLoading(false);
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
  return { isLoading };
};

type ProcessNamedVersionsArgs = {
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
};


const processNamedVersions = async (args: ProcessNamedVersionsArgs) => {
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
  const sortedAndOffsetNamedVersions = await sortAndSetIndexOfNamedVersions(namedVersions, currentNamedVersion, setResultNoNamedVersions, iModelsClient, iModelId);
  if (!sortedAndOffsetNamedVersions || sortedAndOffsetNamedVersions.length === 0) {
    setResultNoNamedVersions();
    updatePaging(false);
    return;
  }
  const initialComparisonJobStatus: JobStatus = "Unknown";
  const initialJobProgress: JobProgress = {
    currentProgress: 0,
    maxProgress: 0,
  };
  const namedVersionState: NamedVersionLoaderState = {
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
  return getComparisonJobInfoForNamedVersions({
    iModelConnection: iModelConnection,
    iTwinId: iTwinId,
    iModelId: iModelId,
    namedVersionLoaderState: namedVersionState,
    comparisonJobClient: comparisonJobClient,
    getPendingJobs,
  });
};

// create faked named version if current version is not a named version
const getOrCreateCurrentNamedVersion = async (namedVersions: NamedVersion[], currentChangeSetId: string, iModelsClient: IModelsClient, iModelId?: string, currentChangeSetIndex?: number): Promise<NamedVersion> => {
  const currentFromNamedVersion = getCurrentFromNamedVersions(namedVersions, currentChangeSetId, currentChangeSetIndex);
  if (currentFromNamedVersion)
    return currentFromNamedVersion;
  const currentFromChangeSet = await getCurrentFromChangeSet(currentChangeSetId, iModelsClient, iModelId);
  if (currentFromChangeSet)
    return currentFromChangeSet;
  return {
    id: currentChangeSetId,
    displayName: IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.currentChangeset"),
    changesetId: currentChangeSetId,
    changesetIndex: currentChangeSetIndex ?? 0,
    description: "",
    createdDateTime: "",
  };
};

const getCurrentFromNamedVersions = (namedVersions: NamedVersion[], currentChangeSetId: string, currentChangeSetIndex?: number) => {
  const currentNamedVersion = namedVersions.find(version => (version.changesetId === currentChangeSetId || version.changesetIndex === currentChangeSetIndex));
  if (currentNamedVersion) {
    return currentNamedVersion;
  }
  return undefined;
};

const getCurrentFromChangeSet = async (currentChangeSetId: string, iModelsClient: IModelsClient, iModelId?: string): Promise<NamedVersion | undefined> => {
  if (!iModelId)
    return undefined;
  const currentChangeSet = await iModelsClient.getChangeset({ iModelId: iModelId, changesetId: currentChangeSetId });
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
  return undefined;
};

const sortAndSetIndexOfNamedVersions = async (namedVersions: NamedVersion[], currentNamedVersion: NamedVersion, onError: () => void, iModelsClient: IModelsClient, iModelId: string) => {
  //if current index is 0 then no need to filter. All change sets are older than current.
  const namedVersionsOlderThanCurrentVersion = currentNamedVersion.changesetIndex !== 0 ? namedVersions.filter(version => version.changesetIndex <= currentNamedVersion.changesetIndex) :
    namedVersions;
  if (namedVersionsOlderThanCurrentVersion.length === 0) {
    onError();
    return;
  }
  const reversedNamedVersions = namedVersionsOlderThanCurrentVersion;
  if (reversedNamedVersions[0].changesetIndex === currentNamedVersion.changesetIndex) {
    reversedNamedVersions.shift(); //remove current named version
  }
  // we must offset the named versions , because that changeset is "already applied" to the named version, see this:
  // https://developer.bentley.com/tutorials/changed-elements-api/#221-using-the-api-to-get-changed-elements
  // this assuming latest is current
  const promises = reversedNamedVersions.map(async (nameVersion) => {
    nameVersion.changesetIndex = nameVersion.changesetIndex + 1;
    const changesetId = nameVersion.changesetIndex.toString();
    const changeSet = await iModelsClient.getChangeset({ iModelId: iModelId, changesetId: changesetId });
    nameVersion.changesetId = changeSet?.id ?? nameVersion.changesetId;
    return nameVersion;
  });

  return Promise.all(promises);
};

type ProcessChangesetsArgs = {
  iTwinId: string;
  iModelId: string;
  namedVersionLoaderState: NamedVersionLoaderState;
  iModelConnection: IModelConnection;
  comparisonJobClient: IComparisonJobClient;
  getPendingJobs: () => JobAndNamedVersions[];
};

const getComparisonJobInfoForNamedVersions = async (args: ProcessChangesetsArgs) => {
  const pendingJobsMap = arrayToMap(args.getPendingJobs(), (job: JobAndNamedVersions) => { return createJobId(job.targetNamedVersion, job.currentNamedVersion); });
  const currentVersionId = args.namedVersionLoaderState.namedVersions.currentVersion?.version.changesetId ??
    args.iModelConnection?.changeset.id;
  const newEntries = await Promise.all(args.namedVersionLoaderState.namedVersions.entries.map(async (entry) => {
    const jobStatusAndJobProgress: JobStatusAndJobProgress = await getJobStatusAndJobProgress({
      comparisonJobClient: args.comparisonJobClient,
      entry: entry,
      iTwinId: args.iTwinId,
      iModelId: args.iModelId,
      currentChangesetId: currentVersionId,
    });
    if (pendingJobsMap.has(`${entry.version.changesetId}-${currentVersionId}`)) {
      const jobStatus: JobStatus = "Processing";
      return {
        version: entry.version,
        state: VersionProcessedState.Processed,
        jobStatus: jobStatus,
        jobProgress: {
          currentProgress: 0,
          maxProgress: 1,
        },
      };
    }
    return {
      version: entry.version,
      state: VersionProcessedState.Processed,
      jobStatus: jobStatusAndJobProgress.jobStatus,
      jobProgress: jobStatusAndJobProgress.jobProgress,
    };
  }));
  const updatedState = {
    namedVersions: { currentVersion: args.namedVersionLoaderState.namedVersions.currentVersion, entries: newEntries },
  };
  return updatedState;
};
