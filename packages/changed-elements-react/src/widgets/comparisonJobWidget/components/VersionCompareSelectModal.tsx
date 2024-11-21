/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp, type IModelConnection } from "@itwin/core-frontend";
import { Button, Modal, ModalButtonBar, ModalContent } from "@itwin/itwinui-react";
import { useContext, useEffect, useState, type ReactNode, } from "react";

import { VersionCompareUtils, VersionCompareVerboseMessages } from "../../../api/VerboseMessages";
import { VersionCompare } from "../../../api/VersionCompare";
import {
  ComparisonJob, ComparisonJobCompleted, IComparisonJobClient,
} from "../../../clients/IComparisonJobClient";
import type { IModelsClient, NamedVersion } from "../../../clients/iModelsClient";
import { arrayToMap, tryXTimes } from "../../../utils/utils";
import { useVersionCompare } from "../../../VersionCompareContext";
import {
  toastComparisonJobComplete, toastComparisonJobError, toastComparisonJobProcessing,
} from "../common/versionCompareToasts";
import {
  createJobId, getJobStatusAndJobProgress, runManagerStartComparisonV2,
} from "../common/versionCompareV2WidgetUtils";
import { useNamedVersionLoader } from "../hooks/useNamedVersionLoader";
import type { JobAndNamedVersions } from "../models/ComparisonJobModels";
import { CurrentNamedVersionAndNamedVersions } from "../models/NamedVersions.js";
import { VersionProcessedState } from "../models/VersionProcessedState";
import type { VersionState } from "../models/VersionState";
import { V2DialogContext, type ComparisonJobUpdateType } from "./VersionCompareDialogProvider";
import { VersionCompareSelectComponent } from "./VersionCompareSelectComponent";

import "./styles/ComparisonJobWidget.scss";

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
    openDialog, closedDialog, getDialogOpen, addRunningJob, removeRunningJob, getRunningJobs,
    getPendingJobs, removePendingJob, addPendingJob, getToastsEnabled, runOnJobUpdate,
  } = useContext(V2DialogContext);
  const [targetVersion, setTargetVersion] = useState<NamedVersion>();
  const [currentVersion, setCurrentVersion] = useState<NamedVersion>();
  const [result, setResult] = useState<NamedVersionLoaderState>();
  const { isLoading, ...rest } = useNamedVersionLoader(
    props.iModelConnection,
    iModelsClient,
    comparisonJobClient,
    getPendingJobs,
  );

  // Synchronise with previous result store, WIP
  useEffect(
    () => {
      if (!rest.currentVersion) {
        return;
      }

      setResult((prev) => ({
        ...prev,
        namedVersions: {
          currentVersion: rest.currentVersion,
          entries: (prev?.namedVersions.entries ?? []).concat(
            rest.entries.slice(prev?.namedVersions.entries.length ?? 0),
          ),
        },
      }));
    },
    [rest.currentVersion, rest.entries],
  );

  useEffect(
    () => {
      let isDisposed = false;
      const getIsDisposed = () => isDisposed;
      openDialog();
      if (result?.namedVersions.entries) {
        pollForInProgressJobs({
          iTwinId: props.iModelConnection.iTwinId as string,
          iModelId: props.iModelConnection.iModelId as string,
          namedVersionLoaderState: result,
          comparisonJobClient,
          iModelConnection: props.iModelConnection,
          setResult,
          removeRunningJob,
          getRunningJobs,
          getDialogOpen,
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
    if (!comparisonJobClient || !result?.namedVersions || !targetVersion || !currentVersion) {
      return;
    }

    props.onClose?.();
    closedDialog();
    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.selectDialogClosed);
    const startResult = await createOrRunManagerStartComparisonV2({
      targetVersion,
      comparisonJobClient,
      iModelConnection: props.iModelConnection,
      currentVersion,
      addPendingJob,
      removePendingJob,
      getDialogOpen,
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
        getDialogOpen,
        getIsDisposed: () => true,
        getToastsEnabled,
        runOnJobUpdate,
        iModelsClient,
      });
    }
  };

  const _handleCancel = (): void => {
    props.onClose?.();
    closedDialog();
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
          namedVersions={result?.namedVersions}
          manageNamedVersionsSlot={props.manageNamedVersionsSlot}
          isLoading={isLoading}
        />
      </ModalContent>
      <ModalButtonBar>
        <Button
          styleType="high-visibility"
          disabled={targetVersion === undefined || result?.namedVersions === undefined}
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
  /** Named versions to display in the list. */
  namedVersions: CurrentNamedVersionAndNamedVersions;
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
  getDialogOpen: () => boolean;
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

    if (args.getToastsEnabled() && !args.getDialogOpen()) {
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
  setResult: (result: NamedVersionLoaderState) => void;
  removeRunningJob: (jobId: string) => void;
  getRunningJobs: () => JobAndNamedVersions[];
  getDialogOpen: () => boolean;
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
    args.namedVersionLoaderState.namedVersions.entries.length > 0 &&
    args.getDialogOpen() &&
    !args.getIsDisposed()
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
          getDialogOpen: args.getDialogOpen,
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
  getDialogOpen: () => boolean;
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
    if (!VersionCompare.manager?.isComparing && !args.getDialogOpen()) {
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
  const currentVersionId = args.iModelConnection?.changeset.id;
  let entries = args.namedVersionLoaderState!.namedVersions.entries.slice();
  const currentRunningJobsMap = arrayToMap(
    args.getRunningJobs(),
    (job) => job.comparisonJob?.comparisonJob.jobId as string,
  );
  const jobsAreInProgress = entries.some(
    ({ jobStatus }) => jobStatus === "Processing" || jobStatus === "Queued",
  ) || args.getRunningJobs().length > 0;
  if (jobsAreInProgress) {
    const idEntryMap = arrayToMap(entries, (entry) => entry.version.id);
    let updatingEntries = getUpdatingEntries(entries, currentVersionId, currentRunningJobsMap);
    const loopDelayInMilliseconds = 5000;
    while (args.getDialogOpen() && !args.getIsDisposed()) {
      for (let entry of updatingEntries) {
        await new Promise((resolve) => setTimeout(resolve, loopDelayInMilliseconds));
        const jobStatusAndJobProgress = await getJobStatusAndJobProgress({
          comparisonJobClient: args.comparisonJobClient,
          entry,
          iTwinId: args.iTwinId,
          iModelId: args.iModelId,
          currentChangesetId: currentVersionId,
        });
        entry = {
          version: entry.version,
          state: VersionProcessedState.Processed,
          jobStatus: jobStatusAndJobProgress.jobStatus,
          jobProgress: jobStatusAndJobProgress.jobProgress,
        };
        idEntryMap.set(entry.version.id, entry);
        if (jobStatusAndJobProgress.jobStatus === "Available") {
          args.removeRunningJob(`${entry.version.changesetId}-${currentVersionId}`);
        }
      }

      entries = Array.from(idEntryMap.values());
      updatingEntries = getUpdatingEntries(entries, currentVersionId, currentRunningJobsMap);

      if (args.getDialogOpen() && !args.getIsDisposed()) {
        args.setResult({
          namedVersions: {
            currentVersion: args.namedVersionLoaderState!.namedVersions.currentVersion,
            entries,
          },
        });
      }
    }
  }
}

function getUpdatingEntries(
  entries: VersionState[],
  currentVersionId: string,
  currentRunningJobsMap: Map<string, JobAndNamedVersions>,
): VersionState[] {
  return entries.filter((entry) => {
    if (entry.jobStatus === "Processing" || entry.jobStatus === "Queued") {
      return true;
    }

    const jobId = `${entry.version.changesetId}-${currentVersionId}`;
    return currentRunningJobsMap.has(jobId);
  });
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
