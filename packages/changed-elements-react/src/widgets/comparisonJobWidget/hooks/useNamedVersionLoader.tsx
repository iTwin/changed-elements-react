/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { useEffect } from "react";
import { JobStatus, JobProgress, JobStatusAndJobProgress, JobAndNamedVersions } from "../models/ComparisonJobModels";
import { VersionProcessedState } from "../models/VersionProcessedState";
import { CurrentNamedVersionAndNamedVersions } from "../models/NamedVersions";
import { IComparisonJobClient } from "../../../clients/IComparisonJobClient";
import { Changeset, IModelsClient, NamedVersion } from "../../../clients/iModelsClient";
import { createJobId, getJobStatusAndJobProgress } from "../common/versionCompareV2WidgetUtils";
import { arrayToMap } from "../../../utils/utils";

const acceptMimeType = "application/vnd.bentley.itwin-platform.v2+json";

/**
 * Result type for versionLoader.
 */
export type NamedVersionLoaderState = {
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
  setNamedVersionResult: (state: NamedVersionLoaderState) => void,
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
        let currentNamedVersion: NamedVersion | undefined;
        let currentState: NamedVersionLoaderState;
        const processNamedVersions = async (namedVersions: NamedVersion[]) => {
          if (!currentNamedVersion)
            currentNamedVersion = await getOrCreateCurrentNamedVersion(namedVersions, currentChangeSetId, iModelsClient, iModelId, currentChangeSetIndex);
          const sortedAndOffsetNamedVersions = await sortAndSetIndexOfNamedVersions(namedVersions, currentNamedVersion, setResultNoNamedVersions, iModelsClient, iModelId);
          if (!sortedAndOffsetNamedVersions || sortedAndOffsetNamedVersions.length === 0) {
            setResultNoNamedVersions();
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
          return namedVersionState;
        };
        const loadNamedVersionsInPages = async () => {
          const pageSize = 10; // Set your page size
          let currentPage = 0;

          while (!disposed) {
            // Get a page of named versions
            const namedVersions = await iModelsClient.getNamedVersionsPaged({ iModelId, top: pageSize, skip: currentPage * pageSize });

            if (namedVersions.length === 0) {
              break; // No more named versions to process
            }

            // Process the named versions and update the state
            const processedNamedVersionsState = await processNamedVersions(namedVersions);

            if (processedNamedVersionsState) {
              if (currentState) {
                //todo api I giving data in reverse order we need to flip it
                // look at itwins api page on order props for url
                const blah = {
                  namedVersions: {
                    entries: [...currentState.namedVersions.entries,...processedNamedVersionsState.namedVersions.entries],
                    currentVersion: processedNamedVersionsState?.namedVersions.currentVersion,
                  },
                }
                currentState = blah;
              } else {
                currentState = processedNamedVersionsState;
              }
              //todo only check new entries not all we are querying too many times
              await processChangesetsAndUpdateResultState({
                iModelConnection: iModelConnection,
                iTwinId: iTwinId,
                iModelId: iModelId,
                namedVersionLoaderState: currentState,
                comparisonJobClient: comparisonJobClient,
                setNamedVersionLoaderState: (result: NamedVersionLoaderState) => {
                  setNamedVersionResult(result);
                },
                getPendingJobs,
              });
            }
            currentPage++;
          }
        };
        void loadNamedVersionsInPages();
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
  setNamedVersionLoaderState: (result: NamedVersionLoaderState) => void;
  getPendingJobs: () => JobAndNamedVersions[];
};

const processChangesetsAndUpdateResultState = async (args: ProcessChangesetsArgs) => {
  const pendingJobsMap = arrayToMap(args.getPendingJobs(), (job: JobAndNamedVersions) => { return createJobId(job.targetNamedVersion, job.currentNamedVersion); });
  const currentVersionId = args.namedVersionLoaderState.namedVersions.currentVersion?.version.changesetId ??
    args.iModelConnection?.changeset.id;
  const newEntries = await Promise.all(args.namedVersionLoaderState.namedVersions.entries.map(async (entry) => {
    if (entry.version.displayName === "V28") {
      console.log("V28");
    }
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
  args.setNamedVersionLoaderState(updatedState);
};
