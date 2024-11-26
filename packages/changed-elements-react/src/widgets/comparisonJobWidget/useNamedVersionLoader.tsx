/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp, type IModelConnection } from "@itwin/core-frontend";
import {
  useContext, useEffect, useRef, useState, type RefObject, type SetStateAction,
} from "react";

import { VersionCompare } from "../../api/VersionCompare.js";
import type {
  ComparisonJob, ComparisonJobCompleted, IComparisonJobClient,
} from "../../clients/IComparisonJobClient";
import type { IModelsClient, NamedVersion } from "../../clients/iModelsClient";
import { tryXTimes } from "../../utils/utils.js";
import { useVersionCompare } from "../../VersionCompareContext.js";
import {
  V2DialogContext, type ComparisonJobUpdateType,
} from "./VersionCompareDialogProvider.js";
import {
  VersionProcessedState, type JobAndNamedVersions, type VersionState,
} from "./NamedVersions.js";
import {
  toastComparisonJobComplete, toastComparisonJobError, toastComparisonJobProcessing,
} from "./versionCompareToasts.js";
import {
  createJobId, getJobStatusAndJobProgress, runManagerStartComparisonV2,
} from "./versionCompareV2WidgetUtils";

interface UseNamedVersionLoaderResult {
  isLoading: boolean;
  isError: boolean;
  result: {
    entries: NamedVersion[];
    currentVersion: NamedVersion | undefined;
    versionState: VersionState[];
  } | undefined;
  prepareComparison: (
    targetVersion: NamedVersion,
    currentVersion: NamedVersion,
  ) => Promise<void>;
}

/**
 * Loads name versions and their job status compared to current version iModel is
 * targeting. Returns a result object with current version and namedVersion with
 * there job status sorted from newest to oldest. This is run during the initial
 * load of the widget.
 */
export function useNamedVersionLoader(
  iModelConnection: IModelConnection,
  pageSize: number = 20,
): UseNamedVersionLoaderResult {
  const { comparisonJobClient, iModelsClient } = useVersionCompare();
  if (!comparisonJobClient) {
    throw new Error("V2 Client is not initialized in given context.");
  }

  const {
    addRunningJob, removeRunningJob, getRunningJobs, getPendingJobs, removePendingJob,
    addPendingJob, getToastsEnabled, runOnJobUpdate,
  } = useContext(V2DialogContext);

  const [state, setState] = useState<Omit<UseNamedVersionLoaderResult, "prepareComparison">>({
    isLoading: true,
    isError: false,
    result: undefined,
  });

  useInitialLoading({
    setState,
    iModelConnection,
    iModelsClient,
    pageSize,
    comparisonJobClient,
    getPendingJobs,
  });

  const isDisposedRef = useRef(false);
  useEffect(() => () => { isDisposedRef.current = true; }, []);

  useEffect(
    () => {
      let isDisposed = false;
      const getIsDisposed = () => isDisposed;
      if (state.result?.entries) {
        pollForInProgressJobs({
          iTwinId: iModelConnection.iTwinId as string,
          iModelId: iModelConnection.iModelId as string,
          namedVersionLoaderState: state.result,
          comparisonJobClient,
          iModelConnection,
          setResult: (versionState) => {
            setState((prev) => ({
              ...prev,
              result: prev.result && {
                ...prev.result,
                versionState,
              },
            }));
          },
          removeRunningJob,
          getRunningJobs,
          getIsDisposed,
          getToastsEnabled,
          runOnJobUpdate,
          iModelsClient,
        });
      }

      return () => {
        isDisposed = true;
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [state.isLoading],
  );

  return {
    ...state,
    prepareComparison: async (targetVersion, currentVersion) => {
      const startResult = await createOrRunManagerStartComparisonV2({
        targetVersion,
        comparisonJobClient,
        iModelConnection,
        currentVersion,
        isDisposedRef,
        addPendingJob,
        removePendingJob,
        getToastsEnabled,
        runOnJobUpdate,
        iModelsClient,
      });

      if (startResult?.comparisonJob) {
        addRunningJob(
          createJobId(targetVersion, currentVersion),
          {
            comparisonJob: startResult.comparisonJob,
            targetNamedVersion: targetVersion,
            currentNamedVersion: currentVersion,
          },
        );
        pollForInProgressJobs({
          iTwinId: iModelConnection.iTwinId as string,
          iModelId: iModelConnection.iModelId as string,
          namedVersionLoaderState: state.result,
          comparisonJobClient,
          iModelConnection,
          setResult: (versionState) => setState((prev) => ({
            ...prev,
            result: {
              ...prev.result ?? { currentVersion: undefined, entries: [] },
              versionState,
            },
          })),
          removeRunningJob,
          getRunningJobs,
          getIsDisposed: () => true,
          getToastsEnabled,
          runOnJobUpdate,
          iModelsClient,
        });
      }
    },
  };
}

interface UseInitialLoadingArgs {
  setState: (
    action: SetStateAction<Omit<UseNamedVersionLoaderResult, "prepareComparison">>,
  ) => void;
  iModelConnection: IModelConnection;
  iModelsClient: IModelsClient;
  pageSize: number;
  comparisonJobClient: IComparisonJobClient;
  getPendingJobs: () => JobAndNamedVersions[];
}

function useInitialLoading(args: UseInitialLoadingArgs): void {
  useEffect(
    () => {
      const setResultNoNamedVersions = () => {
        args.setState({
          isLoading: false,
          isError: false,
          result: {
            entries: [],
            currentVersion: undefined,
            versionState: [],
          },
        });
      };
      const { iTwinId, iModelId, changeset } = args.iModelConnection;
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
            const namedVersions = await args.iModelsClient.getNamedVersions({
              iModelId,
              top: args.pageSize,
              skip: currentPage * args.pageSize,
              orderby: "changesetIndex",
              ascendingOrDescending: "desc",
            });
            if (!currentNamedVersion) {
              currentNamedVersion = await getOrCreateCurrentNamedVersion(
                namedVersions,
                changeset.id,
                args.iModelsClient,
                iModelId,
                changeset.index
              );
            }

            if (namedVersions.length === 0) {
              // No more named versions to process
              args.setState((prev) => ({ ...prev, isLoading: false }));
              break;
            }

            // Process the named versions
            const processedNamedVersionsState = await processNamedVersions({
              currentNamedVersion,
              namedVersions,
              setResultNoNamedVersions,
              iModelsClient: args.iModelsClient,
              iModelId,
              updatePaging: (isPaging) => args.setState((prev) => ({ ...prev, isLoading: isPaging })),
            });

            if (processedNamedVersionsState) {
              const comparisonState = await queryComparisonState({
                namedVersions: processedNamedVersionsState.entries,
                iTwinId,
                iModelId,
                currentVersion: processedNamedVersionsState.currentVersion,
                iModelConnection: args.iModelConnection,
                comparisonJobClient: args.comparisonJobClient,
                getPendingJobs: args.getPendingJobs,
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
              args.setState((prev) => ({
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
            args.setState((prev) => ({ ...prev, isError: true, isLoading: false }));
            break;
          }
        }
      })();
      return () => {
        disposed = true;
      };
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [args.comparisonJobClient, args.iModelConnection, args.iModelsClient],
  );
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
  const pendingJobsMap = new Set(
    args.getPendingJobs().map(
      (job) => `${createJobId(job.targetNamedVersion, job.currentNamedVersion)}`,
    ),
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

interface PollForInProgressJobsArgs {
  iTwinId: string;
  iModelId: string;
  namedVersionLoaderState?: NamedVersionLoaderState;
  comparisonJobClient: IComparisonJobClient;
  iModelConnection: IModelConnection;
  setResult: (result: VersionState[]) => void;
  removeRunningJob: (jobId: string) => void;
  getRunningJobs: () => JobAndNamedVersions[];
  getIsDisposed: () => boolean;
  getToastsEnabled: () => boolean;
  runOnJobUpdate: (
    comparisonJobUpdateType: ComparisonJobUpdateType,
    jobAndNamedVersions?: JobAndNamedVersions,
  ) => Promise<void>;
  iModelsClient: IModelsClient;
}

interface NamedVersionLoaderState {
  entries: NamedVersion[];
  currentVersion: NamedVersion | undefined;
  versionState: VersionState[];
}

export function pollForInProgressJobs(args: PollForInProgressJobsArgs): void {
  void pollUntilCurrentRunningJobsCompleteAndToast(args);
  if (
    args.namedVersionLoaderState &&
    args.namedVersionLoaderState.entries.length > 0
    && !args.getIsDisposed()
  ) {
    void pollUpdateCurrentEntriesForModal(args);
  }
}

async function pollUntilCurrentRunningJobsCompleteAndToast(
  args: PollForInProgressJobsArgs,
): Promise<void> {
  let isConnectionClosed = false;
  args.iModelConnection.onClose.addListener(() => { isConnectionClosed = true; });
  while (args.getRunningJobs().length > 0 && !isConnectionClosed) {
    const loopDelayInMilliseconds = 5000;
    await new Promise((resolve) => setTimeout(resolve, loopDelayInMilliseconds));
    for (const runningJob of args.getRunningJobs()) {
      try {
        const completedJob = await args.comparisonJobClient.getComparisonJob({
          iTwinId: args.iTwinId,
          iModelId: args.iModelId,
          jobId: runningJob?.comparisonJob?.comparisonJob.jobId as string,
        });
        if (completedJob.comparisonJob.status === "Failed") {
          args.removeRunningJob(runningJob?.comparisonJob?.comparisonJob.jobId as string);
          continue;
        }

        notifyComparisonCompletion({
          isConnectionClosed: isConnectionClosed,
          getRunningJobs: args.getRunningJobs,
          getIsDisposed: args.getIsDisposed,
          runningJob,
          currentJobRsp: completedJob,
          removeRunningJob: args.removeRunningJob,
          comparisonJobClient: args.comparisonJobClient,
          iModelConnection: args.iModelConnection,
          getToastsEnabled: args.getToastsEnabled,
          runOnJobUpdate: args.runOnJobUpdate,
          iModelsClient: args.iModelsClient,
        });
      } catch (error) {
        args.removeRunningJob(runningJob?.comparisonJob?.comparisonJob.jobId as string);
        throw error;
      }
    }
  }
}

interface ConditionallyToastCompletionArgs {
  isConnectionClosed: boolean;
  getRunningJobs: () => JobAndNamedVersions[];
  getIsDisposed: () => boolean;
  runningJob: JobAndNamedVersions;
  currentJobRsp: ComparisonJob;
  removeRunningJob: (jobId: string) => void;
  comparisonJobClient: IComparisonJobClient;
  iModelConnection: IModelConnection;
  getToastsEnabled: () => boolean;
  runOnJobUpdate: (
    comparisonJobUpdateType: ComparisonJobUpdateType,
    jobAndNamedVersions?: JobAndNamedVersions,
  ) => Promise<void>;
  iModelsClient: IModelsClient;
}

function notifyComparisonCompletion(args: ConditionallyToastCompletionArgs): void {
  if (args.currentJobRsp.comparisonJob.status === "Completed") {
    args.removeRunningJob(args.runningJob?.comparisonJob?.comparisonJob.jobId as string);
    if (!VersionCompare.manager?.isComparing && !args.getIsDisposed()) {
      if (args.getToastsEnabled()) {
        toastComparisonJobComplete({
          comparisonJob: args.currentJobRsp as ComparisonJobCompleted,
          comparisonJobClient: args.comparisonJobClient,
          iModelConnection: args.iModelConnection,
          targetVersion: args.runningJob.targetNamedVersion,
          currentVersion: args.runningJob.currentNamedVersion,
          getToastsEnabled: args.getToastsEnabled,
          runOnJobUpdate: args.runOnJobUpdate,
          iModelsClient: args.iModelsClient,
        });
      }

      const jobAndNamedVersion: JobAndNamedVersions = {
        comparisonJob: args.currentJobRsp,
        targetNamedVersion: args.runningJob.targetNamedVersion,
        currentNamedVersion: args.runningJob.currentNamedVersion,
      };
      void args.runOnJobUpdate("JobComplete", jobAndNamedVersion);
    }
  }
}

async function pollUpdateCurrentEntriesForModal(args: PollForInProgressJobsArgs): Promise<void> {
  /** Mutable array of immutable VersionState elements. */
  const localState = args.namedVersionLoaderState!.versionState;

  const currentRunningJobs = new Set(
    args.getRunningJobs().map((job) => job.comparisonJob?.comparisonJob.jobId),
  );
  const currentUpdatingEntries = localState
    .map((entry, entryIndex) => ({ entry, entryIndex }))
    .filter(({ entry }) => (
      entry.jobStatus === "Processing" ||
      entry.jobStatus === "Queued" ||
      currentRunningJobs.has(entry.jobId)
    ));

  if (currentUpdatingEntries.length === 0) {
    return;
  }

  const syncState = () => {
    currentUpdatingEntries.forEach(({ entry, entryIndex }) => localState[entryIndex] = entry);
    args.setResult(localState.slice());
  };

  while (!args.getIsDisposed()) {
    syncState();

    const loopDelayInMilliseconds = 5000;
    for (let i = 0; i < currentUpdatingEntries.length; i++) {
      const { entry } = currentUpdatingEntries[i];
      if (entry.jobStatus !== "Processing" && entry.jobStatus !== "Queued") {
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, loopDelayInMilliseconds));
      const jobStatusAndJobProgress = await getJobStatusAndJobProgress({
        comparisonJobClient: args.comparisonJobClient,
        iTwinId: args.iTwinId,
        iModelId: args.iModelId,
        jobId: entry.jobId,
      });
      currentUpdatingEntries[i].entry = {
        jobId: entry.jobId,
        state: VersionProcessedState.Processed,
        jobStatus: jobStatusAndJobProgress.jobStatus,
        jobProgress: jobStatusAndJobProgress.jobProgress,
      };
      if (jobStatusAndJobProgress.jobStatus === "Available") {
        args.removeRunningJob(entry.jobId);
      }
    }
  }
}

// TODO: refactor all types in this file they are not dry. We want "type" space
// to be as clean as "value" space.
interface RunStartComparisonV2Args {
  targetVersion: NamedVersion;
  comparisonJobClient: IComparisonJobClient;
  iModelConnection: IModelConnection;
  currentVersion: NamedVersion;
  removePendingJob: (jobId: string) => void;
  addPendingJob: (jobId: string, comparisonJob: JobAndNamedVersions) => void;
  isDisposedRef: RefObject<boolean>;
  getToastsEnabled: () => boolean;
  runOnJobUpdate: (
    comparisonJobUpdateType: ComparisonJobUpdateType,
    jobAndNamedVersions?: JobAndNamedVersions,
  ) => Promise<void>;
  iModelsClient: IModelsClient;
}

interface PostOrRunComparisonJobResult {
  startedComparison: boolean;
  comparisonJob?: ComparisonJob;
}

async function createOrRunManagerStartComparisonV2(
  args: RunStartComparisonV2Args,
): Promise<PostOrRunComparisonJobResult | undefined> {
  const jobId = createJobId(args.targetVersion, args.currentVersion);
  try {
    args.addPendingJob(
      jobId,
      {
        targetNamedVersion: args.targetVersion,
        currentNamedVersion: args.currentVersion,
      },
    );
    let comparisonJob = await tryXTimes(
      async () => {
        const job = await postOrGetComparisonJob({
          changedElementsClient: args.comparisonJobClient,
          iTwinId: args.iModelConnection?.iTwinId as string,
          iModelId: args.iModelConnection?.iModelId as string,
          startChangesetId: args.targetVersion.changesetId as string,
          endChangesetId: args.currentVersion.changesetId as string,
        });
        args.removePendingJob(jobId);
        return job;
      },
      3,
    );
    if (comparisonJob.comparisonJob.status === "Failed") {
      comparisonJob = await handleJobError({ ...args, comparisonJob: comparisonJob });
    }

    if (comparisonJob.comparisonJob.status === "Completed") {
      void runManagerStartComparisonV2({
        comparisonJob: comparisonJob as ComparisonJobCompleted,
        comparisonJobClient: args.comparisonJobClient,
        iModelConnection: args.iModelConnection,
        targetVersion: args.targetVersion,
        currentVersion: args.currentVersion,
        getToastsEnabled: args.getToastsEnabled,
        runOnJobUpdate: args.runOnJobUpdate,
        iModelsClient: args.iModelsClient,
      });
      return { startedComparison: true };
    }

    if (args.getToastsEnabled() && !args.isDisposedRef.current) {
      toastComparisonJobProcessing(args.currentVersion, args.targetVersion);
    }

    void args.runOnJobUpdate(
      "JobProcessing",
      {
        comparisonJob,
        targetNamedVersion: args.targetVersion,
        currentNamedVersion: args.currentVersion,
      },
    );

    return { startedComparison: false, comparisonJob };
  } catch (error) {
    args.removePendingJob(jobId);
    if (args.getToastsEnabled()) {
      toastComparisonJobError(args.currentVersion, args.targetVersion);
    }

    void args.runOnJobUpdate(
      "JobError",
      {
        comparisonJob: undefined,
        targetNamedVersion: args.targetVersion,
        currentNamedVersion: args.currentVersion,
      },
    );
    return undefined;
  }
}

interface HandleJobErrorArgs {
  comparisonJob: ComparisonJob;
  targetVersion: NamedVersion;
  currentVersion: NamedVersion;
  addPendingJob: (jobId: string, comparisonJob: JobAndNamedVersions) => void;
  removePendingJob: (jobId: string) => void;
  comparisonJobClient: IComparisonJobClient;
  iModelConnection: IModelConnection;
}

async function handleJobError(args: HandleJobErrorArgs): Promise<ComparisonJob> {
  args.addPendingJob(args.comparisonJob.comparisonJob.jobId, {
    targetNamedVersion: args.targetVersion,
    currentNamedVersion: args.currentVersion,
  });
  await args.comparisonJobClient.deleteComparisonJob({
    iTwinId: args.comparisonJob.comparisonJob.iTwinId,
    iModelId: args.comparisonJob.comparisonJob.iModelId,
    jobId: args.comparisonJob.comparisonJob.jobId,
  });
  return tryXTimes(
    async () => {
      const job = (await postOrGetComparisonJob({
        changedElementsClient: args.comparisonJobClient,
        iTwinId: args.iModelConnection.iTwinId as string,
        iModelId: args.iModelConnection.iModelId as string,
        startChangesetId: args.targetVersion.changesetId as string,
        endChangesetId: args.currentVersion.changesetId as string,
      }));
      args.removePendingJob(job.comparisonJob.jobId);
      return job;
    },
    3,
  );
}

interface PostOrGetComparisonJobParams {
  changedElementsClient: IComparisonJobClient;
  iTwinId: string;
  iModelId: string;
  startChangesetId: string;
  endChangesetId: string;
}

async function postOrGetComparisonJob(args: PostOrGetComparisonJobParams): Promise<ComparisonJob> {
  try {
    return await args.changedElementsClient.getComparisonJob({
      iTwinId: args.iTwinId,
      iModelId: args.iModelId,
      jobId: `${args.startChangesetId}-${args.endChangesetId}`,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    if (
      error && typeof error === "object" && "code" in error && error.code === "ComparisonNotFound"
    ) {
      return args.changedElementsClient.postComparisonJob({
        iTwinId: args.iTwinId,
        iModelId: args.iModelId,
        startChangesetId: args.startChangesetId,
        endChangesetId: args.endChangesetId,
        headers: { "Content-Type": "application/json" },
      });
    }

    throw error;
  }
}
