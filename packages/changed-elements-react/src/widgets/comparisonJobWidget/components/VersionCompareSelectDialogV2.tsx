/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp, type IModelConnection } from "@itwin/core-frontend";
import { Button, Modal, ModalButtonBar, ModalContent } from "@itwin/itwinui-react";
import { useContext, useEffect, useRef, useState, type ReactNode, type RefObject, } from "react";

import { VersionCompareUtils, VersionCompareVerboseMessages } from "../../../api/VerboseMessages";
import { VersionCompare } from "../../../api/VersionCompare";
import {
  ComparisonJob, ComparisonJobCompleted, IComparisonJobClient,
} from "../../../clients/IComparisonJobClient";
import type { IModelsClient, NamedVersion } from "../../../clients/iModelsClient";
import { tryXTimes } from "../../../utils/utils";
import { useVersionCompare } from "../../../VersionCompareContext";
import {
  VersionProcessedState, type JobAndNamedVersions, type VersionState
} from "../NamedVersions.js";
import { useNamedVersionLoader } from "../useNamedVersionLoader.js";
import {
  toastComparisonJobComplete, toastComparisonJobError, toastComparisonJobProcessing,
} from "../versionCompareToasts";
import {
  createJobId, getJobStatusAndJobProgress, runManagerStartComparisonV2,
} from "../versionCompareV2WidgetUtils";
import { V2DialogContext, type ComparisonJobUpdateType } from "./VersionCompareDialogProvider";
import { VersionCompareSelectComponent } from "./VersionCompareSelectComponent";

import "./VersionCompareSelectDialogV2.scss";

/** Options for VersionCompareSelectDialogV2. */
export interface VersionCompareSelectDialogV2Props {
  /** IModel Connection that is being visualized. */
  iModelConnection: IModelConnection;

  /** onClose triggered when user clicks start comparison or closes dialog. */
  onClose: (() => void) | undefined;

  "data-testid"?: string;

  /** Optional prop for a user supplied component to handle managing named versions. */
  manageNamedVersionsSlot?: ReactNode | undefined;
}

/**
 * VersionCompareSelectDialogV2 use comparison jobs for processing. Requires context of:
 * <VersionCompareContext iModelsClient={iModelsClient} comparisonJobClient={comparisonJobClient}>
 *   ...
 * </VersionCompareContext>
 * ------------------------------------------------------------------------------------------------
 * Should be used with provider. Example:
 * <V2DialogProvider>
 *   {
 *     (isOpenCondition) &&
 *     <VersionCompareSelectDialogV2
 *       iModelConnection={this.props.iModelConnection}
 *       onClose={this._handleVersionSelectDialogClose}
 *     />
 *   }
 * </V2DialogProvider>
 *
 * Provider should be supplied with new dialog based on condition in order to keep
 * track of toast and polling information.
 *
 * @throws Exception if context does not include iModelsClient and comparisonJobClient.
*/
export function VersionCompareSelectDialogV2(props: VersionCompareSelectDialogV2Props) {
  const { comparisonJobClient, iModelsClient } = useVersionCompare();
  if (!comparisonJobClient) {
    throw new Error("V2 Client is not initialized in given context.");
  }

  const {
    addRunningJob, removeRunningJob, getRunningJobs, getPendingJobs, removePendingJob,
    addPendingJob, getToastsEnabled, runOnJobUpdate,
  } = useContext(V2DialogContext);
  const [targetVersion, setTargetVersion] = useState<NamedVersion>();
  const [currentVersion, setCurrentVersion] = useState<NamedVersion>();
  const { isLoading, result, setResult } = useNamedVersionLoader(
    props.iModelConnection,
    iModelsClient,
    comparisonJobClient,
    getPendingJobs,
  );

  const isDisposedRef = useRef(false);
  useEffect(() => () => { isDisposedRef.current = true; }, []);

  useEffect(
    () => {
      let isDisposed = false;
      const getIsDisposed = () => isDisposed;
      if (result?.entries) {
        pollForInProgressJobs({
          iTwinId: props.iModelConnection.iTwinId as string,
          iModelId: props.iModelConnection.iModelId as string,
          namedVersionLoaderState: result,
          comparisonJobClient,
          iModelConnection: props.iModelConnection,
          setResult,
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
    [isLoading],
  );
  const _handleOk = async (): Promise<void> => {
    if (!comparisonJobClient || !result || !targetVersion || !currentVersion) {
      return;
    }

    props.onClose?.();
    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.selectDialogClosed);
    const startResult = await createOrRunManagerStartComparisonV2({
      targetVersion,
      comparisonJobClient,
      iModelConnection: props.iModelConnection,
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
        iTwinId: props.iModelConnection.iTwinId as string,
        iModelId: props.iModelConnection.iModelId as string,
        namedVersionLoaderState: result,
        comparisonJobClient,
        iModelConnection: props.iModelConnection,
        setResult,
        removeRunningJob,
        getRunningJobs,
        getIsDisposed: () => true,
        getToastsEnabled,
        runOnJobUpdate,
        iModelsClient,
      });
    }
  };

  const _handleCancel = (): void => {
    props.onClose?.();
    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.selectDialogClosed);
  };

  const _onVersionSelected = (currentVersion: NamedVersion, targetVersion: NamedVersion) => {
    setTargetVersion(targetVersion);
    setCurrentVersion(currentVersion);
    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.selectDialogOpened);
  };
  return (
    <Modal
      data-testid={props["data-testid"]}
      className="comparison-job-dialog"
      title={IModelApp.localization.getLocalizedString(
        "VersionCompare:versionCompare.versionPickerTitle",
      )}
      isOpen
      onClose={_handleCancel}
    >
      <ModalContent>
        <VersionCompareSelectComponent
          iModelConnection={props.iModelConnection}
          onVersionSelected={_onVersionSelected}
          namedVersions={result && {
            currentVersion: result.currentVersion,
            entries: result.entries,
            versionState: result.versionState,
          }}
          manageNamedVersionsSlot={props.manageNamedVersionsSlot}
          isLoading={isLoading}
        />
      </ModalContent>
      <ModalButtonBar>
        <Button
          styleType="high-visibility"
          disabled={targetVersion === undefined || result === undefined}
          onClick={_handleOk}
        >
          {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.compare")}
        </Button>
        <Button onClick={_handleCancel}>
          {IModelApp.localization.getLocalizedString("UiCore:dialog.cancel")}
        </Button>
      </ModalButtonBar>
    </Modal>
  );
}

interface NamedVersionLoaderState {
  entries: NamedVersion[];
  currentVersion: NamedVersion | undefined;
  versionState: VersionState[];
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

type handleJobErrorArgs = Omit<
  RunStartComparisonV2Args,
  "getDialogOpen" | "getToastsEnabled" | "runOnJobUpdate" | "iModelsClient"
> & {
  comparisonJob: ComparisonJob;
};

async function handleJobError(args: handleJobErrorArgs): Promise<ComparisonJob> {
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
        iTwinId: args.iModelConnection?.iTwinId as string,
        iModelId: args.iModelConnection?.iModelId as string,
        startChangesetId: args.targetVersion.changesetId as string,
        endChangesetId: args.currentVersion.changesetId as string,
      }));
      args.removePendingJob(job.comparisonJob.jobId);
      return job;
    },
    3,
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
      headers: {
        "Content-Type": "application/json",
      },
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
