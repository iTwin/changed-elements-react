/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Button, Modal, ModalButtonBar, ModalContent, useToaster } from "@itwin/itwinui-react";
import React, { useEffect, useState, type ReactNode } from "react";

import { VersionCompareUtils, VersionCompareVerboseMessages } from "../../../api/VerboseMessages.js";
import { VersionCompare } from "../../../api/VersionCompare.js";
import type {
  ComparisonJob, ComparisonJobCompleted, IComparisonJobClient
} from "../../../clients/IComparisonJobClient.js";
import type { IModelsClient, NamedVersion } from "../../../clients/iModelsClient.js";
import { arrayToMap, tryXTimes } from "../../../utils/utils.js";
import { useVersionCompare } from "../../../VersionCompareContext.js";
import {
  toastComparisonJobComplete, toastComparisonJobError, toastComparisonJobProcessing,
  Toaster
} from "../common/versionCompareToasts.js";
import {
  createJobId, getJobStatusAndJobProgress, runManagerStartComparisonV2
} from "../common/versionCompareV2WidgetUtils.js";
import { useNamedVersionLoader, type NamedVersionLoaderState } from "../hooks/useNamedVersionLoader.js";
import type { JobAndNamedVersions, JobStatusAndJobProgress } from "../models/ComparisonJobModels.js";
import { VersionProcessedState } from "../models/VersionProcessedState.js";
import type { VersionState } from "../models/VersionState.js";
import { V2DialogContext, type ComparisonJobUpdateType } from "./VersionCompareDialogProvider.js";
import { VersionCompareSelectComponent } from "./VersionCompareSelectComponent.js";

import "./styles/ComparisonJobWidget.scss";

/** Options for VersionCompareSelectDialogV2. */
export interface VersionCompareSelectDialogV2Props {
  /** IModel Connection that is being visualized. */
  iModelConnection: IModelConnection;
  /** onClose triggered when user clicks start comparison or closes dialog.*/
  onClose: (() => void) | undefined;
  "data-testid"?: string;
  /** Optional prop for a user supplied component to handle managing named versions.*/
  manageNamedVersionsSlot?: ReactNode | undefined;
}

/** VersionCompareSelectDialogV2 use comparison jobs for processing.
 * Requires context of:
 *<VersionCompareContext iModelsClient={iModelsClient} comparisonJobClient={comparisonJobClient}>
 * ...
 *</VersionCompareContext>
 *------------------------------------------------------------------------------------------------
 * Should be used with provider. Example:
 *<V2DialogProvider>
 *{(isOpenCondition) &&
 * <VersionCompareSelectDialogV2
 *   iModelConnection={this.props.iModelConnection}
 *   onClose={this._handleVersionSelectDialogClose}
 * />}
 *</V2DialogProvider>
 * provider should be supplied with new dialog based on condition in order to keep track of toast and polling information.
 * @throws Exception if context does not include iModelsClient and comparisonJobClient.
*/
export function VersionCompareSelectDialogV2(props: VersionCompareSelectDialogV2Props) {
  const { comparisonJobClient, iModelsClient } = useVersionCompare();
  if (!comparisonJobClient) {
    throw new Error("V2 Client Is Not Initialized In Given Context.");
  }
  if (!iModelsClient) {
    throw new Error("V1 Client Is Not Initialized In Given Context.");
  }
  const { openDialog, closedDialog, getDialogOpen, addRunningJob, removeRunningJob, getRunningJobs
    , getPendingJobs, removePendingJob, addPendingJob, getToastsEnabled, runOnJobUpdate } = React.useContext(V2DialogContext);
  const [targetVersion, setTargetVersion] = useState<NamedVersion | undefined>(undefined);
  const [currentVersion, setCurrentVersion] = useState<NamedVersion | undefined>(undefined);
  const [result, setResult] = useState<NamedVersionLoaderState>();
  const { isLoading } = useNamedVersionLoader(props.iModelConnection, iModelsClient, comparisonJobClient, setResult, getPendingJobs);
  const toaster = useToaster();
  useEffect(() => {
    let isDisposed = false;
    const getIsDisposed = () => {
      return isDisposed;
    };
    openDialog();
    if (result && result?.namedVersions.entries) {
      void pollForInProgressJobs({
        iTwinId: props.iModelConnection.iTwinId as string,
        iModelId: props.iModelConnection.iModelId as string,
        namedVersionLoaderState: result,
        comparisonJobClient: comparisonJobClient,
        iModelConnection: props.iModelConnection,
        setResult: setResult,
        removeRunningJob: removeRunningJob,
        getRunningJobs: getRunningJobs,
        getDialogOpen: getDialogOpen,
        getIsDisposed,
        getToastsEnabled,
        runOnJobUpdate,
        iModelsClient,
        toaster,
      });
    }
    return () => {
      isDisposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading]);
  const _handleOk = async (): Promise<void> => {
    if (comparisonJobClient && result?.namedVersions && targetVersion && currentVersion) {
      const getIsDisposed = () => true;
      props.onClose?.();
      closedDialog();
      VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.selectDialogClosed);
      const startResult = await createOrRunManagerStartComparisonV2({
        targetVersion: targetVersion,
        comparisonJobClient: comparisonJobClient,
        iModelConnection: props.iModelConnection,
        currentVersion: currentVersion,
        addPendingJob,
        removePendingJob,
        getDialogOpen,
        getToastsEnabled,
        runOnJobUpdate,
        iModelsClient,
      });
      if (startResult?.comparisonJob) {
        addRunningJob(createJobId(targetVersion, currentVersion), {
          comparisonJob: startResult.comparisonJob,
          targetNamedVersion: {
            id: targetVersion.id,
            displayName: targetVersion.displayName,
            changesetId: targetVersion.changesetId,
            changesetIndex: targetVersion.changesetIndex,
            description: targetVersion.description,
            createdDateTime: targetVersion.createdDateTime,
          },
          currentNamedVersion: {
            id: currentVersion.id,
            displayName: currentVersion.displayName,
            changesetId: currentVersion.changesetId,
            changesetIndex: currentVersion.changesetIndex,
            description: currentVersion.description,
            createdDateTime: currentVersion.createdDateTime,
          },
        });
        void pollForInProgressJobs({
          iTwinId: props.iModelConnection.iTwinId as string,
          iModelId: props.iModelConnection.iModelId as string,
          namedVersionLoaderState: result,
          comparisonJobClient: comparisonJobClient,
          iModelConnection: props.iModelConnection,
          setResult: setResult,
          removeRunningJob: removeRunningJob,
          getRunningJobs: getRunningJobs,
          getDialogOpen: getDialogOpen,
          getIsDisposed,
          getToastsEnabled,
          runOnJobUpdate,
          iModelsClient,
          toaster,
        });
      }
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
      title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionPickerTitle")}
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
          onClick={() => {
            void _handleOk();
          }}
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

//todo refactor all types in this file they are not dry. We want "type" space to be as clean as "value" space.
type RunStartComparisonV2Args = {
  targetVersion: NamedVersion;
  comparisonJobClient: IComparisonJobClient;
  iModelConnection: IModelConnection;
  currentVersion: NamedVersion;
  removePendingJob: (jobId: string) => void;
  addPendingJob: (jobId: string, comparisonJob: JobAndNamedVersions) => void;
  getDialogOpen: () => boolean;
  getToastsEnabled: () => boolean;
  runOnJobUpdate: (comparisonJobUpdateType: ComparisonJobUpdateType, jobAndNamedVersions?: JobAndNamedVersions) => Promise<void>;
  iModelsClient: IModelsClient;
};

type PostOrRunComparisonJobResult = {
  startedComparison: boolean;
  comparisonJob?: ComparisonJob;
};

const createOrRunManagerStartComparisonV2 = async (args: RunStartComparisonV2Args): Promise<PostOrRunComparisonJobResult | undefined> => {
  const jobId = createJobId(args.targetVersion, args.currentVersion);
  try {
    args.addPendingJob(jobId, {
      targetNamedVersion: args.targetVersion,
      currentNamedVersion: args.currentVersion,
    });
    let comparisonJob = await tryXTimes(async () => {
      const job = (await postOrGetComparisonJob({
        changedElementsClient: args.comparisonJobClient,
        iTwinId: args.iModelConnection?.iTwinId as string,
        iModelId: args.iModelConnection?.iModelId as string,
        startChangesetId: args.targetVersion.changesetId as string,
        endChangesetId: args.currentVersion.changesetId as string,
      }));
      args.removePendingJob(jobId);
      return job;
    }, 3);
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
    const jobAndNamedVersion: JobAndNamedVersions = {
      comparisonJob: comparisonJob,
      targetNamedVersion: args.targetVersion,
      currentNamedVersion: args.currentVersion,
    };
    void args.runOnJobUpdate("JobProcessing", jobAndNamedVersion);

    return { startedComparison: false, comparisonJob: comparisonJob };
  } catch (error) {
    args.removePendingJob(jobId);
    if (args.getToastsEnabled()) {
      toastComparisonJobError(args.currentVersion, args.targetVersion);
    }
    const jobAndNamedVersion: JobAndNamedVersions = {
      comparisonJob: undefined,
      targetNamedVersion: args.targetVersion,
      currentNamedVersion: args.currentVersion,
    };
    void args.runOnJobUpdate("JobError", jobAndNamedVersion);
    return undefined;
  }
};

type handleJobErrorArgs = Omit<RunStartComparisonV2Args, "getDialogOpen" | "getToastsEnabled" | "runOnJobUpdate" | "iModelsClient"> & {
  comparisonJob: ComparisonJob;
};

const handleJobError: (args: handleJobErrorArgs) => Promise<ComparisonJob> = async (args) => {
  args.addPendingJob(args.comparisonJob.comparisonJob.jobId, {
    targetNamedVersion: args.targetVersion,
    currentNamedVersion: args.currentVersion,
  });
  await args.comparisonJobClient.deleteComparisonJob({
    iTwinId: args.comparisonJob.comparisonJob.iTwinId,
    iModelId: args.comparisonJob.comparisonJob.iModelId,
    jobId: args.comparisonJob.comparisonJob.jobId,
  });
  return tryXTimes(async () => {
    const job = (await postOrGetComparisonJob({
      changedElementsClient: args.comparisonJobClient,
      iTwinId: args.iModelConnection?.iTwinId as string,
      iModelId: args.iModelConnection?.iModelId as string,
      startChangesetId: args.targetVersion.changesetId as string,
      endChangesetId: args.currentVersion.changesetId as string,
    }));
    args.removePendingJob(job.comparisonJob.jobId);
    return job;
  }, 3);
};

type PollForInProgressJobsArgs = {
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
  targetVersion?: NamedVersion;
  getToastsEnabled: () => boolean;
  runOnJobUpdate: (comparisonJobUpdateType: ComparisonJobUpdateType, jobAndNamedVersions?: JobAndNamedVersions) => Promise<void>;
  iModelsClient: IModelsClient;
  toaster: Toaster;
};

export const pollForInProgressJobs: (args: PollForInProgressJobsArgs) => Promise<void> = async (args: PollForInProgressJobsArgs) => {
  void pollUntilCurrentRunningJobsCompleteAndToast(args);
  if (args.namedVersionLoaderState && args.namedVersionLoaderState.namedVersions.entries.length > 0 && args.getDialogOpen() && !args.getIsDisposed())
    void pollUpdateCurrentEntriesForModal(args);
};

const pollUntilCurrentRunningJobsCompleteAndToast = async (args: PollForInProgressJobsArgs) => {
  let isConnectionClosed = false;
  args.iModelConnection.onClose.addListener(() => { isConnectionClosed = true; });
  const loopDelayInMilliseconds = 5000;
  while (shouldProcessRunningJobs({ getRunningJobs: args.getRunningJobs, isConnectionClosed })) {
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
          runningJob: runningJob,
          currentJobRsp: completedJob,
          removeRunningJob: args.removeRunningJob,
          comparisonJobClient: args.comparisonJobClient,
          iModelConnection: args.iModelConnection,
          getToastsEnabled: args.getToastsEnabled,
          runOnJobUpdate: args.runOnJobUpdate,
          iModelsClient: args.iModelsClient,
          toaster: args.toaster,
        });
      } catch (error) {
        args.removeRunningJob(runningJob?.comparisonJob?.comparisonJob.jobId as string);
        throw error;
      }
    }
  }
};

type ShouldProcessRunningJobArgs = {
  isConnectionClosed: boolean;
  getRunningJobs: () => JobAndNamedVersions[];
};

const shouldProcessRunningJobs = (args: ShouldProcessRunningJobArgs) => {
  return args.getRunningJobs().length > 0 && !args.isConnectionClosed;
};

type ConditionallyToastCompletionArgs = {
  isConnectionClosed: boolean;
  getRunningJobs: () => JobAndNamedVersions[];
  getDialogOpen: () => boolean;
  runningJob: JobAndNamedVersions;
  currentJobRsp: ComparisonJob;
  removeRunningJob: (jobId: string) => void;
  comparisonJobClient: IComparisonJobClient;
  iModelConnection: IModelConnection;
  getToastsEnabled: () => boolean;
  runOnJobUpdate: (comparisonJobUpdateType: ComparisonJobUpdateType, jobAndNamedVersions?: JobAndNamedVersions) => Promise<void>;
  iModelsClient: IModelsClient;
  toaster: Toaster;
};
const notifyComparisonCompletion = (args: ConditionallyToastCompletionArgs) => {
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
          toaster: args.toaster,
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
};

const pollUpdateCurrentEntriesForModal = async (args: PollForInProgressJobsArgs) => {
  const currentVersionId = args.iModelConnection?.changeset.id;
  let entries = args.namedVersionLoaderState!.namedVersions.entries.slice();
  const currentRunningJobsMap = arrayToMap(args.getRunningJobs(), (job: JobAndNamedVersions) => { return job.comparisonJob?.comparisonJob.jobId as string; });
  if (areJobsInProgress(entries, args.getRunningJobs)) {
    const idEntryMap = arrayToMap(entries, (entry: VersionState) => { return entry.version.id; });
    let updatingEntries = getUpdatingEntries(entries, currentVersionId, currentRunningJobsMap);
    const loopDelayInMilliseconds = 5000;
    while (isDialogOpenAndNotDisposed(args.getDialogOpen, args.getIsDisposed)) {
      for (let entry of updatingEntries) {
        await new Promise((resolve) => setTimeout(resolve, loopDelayInMilliseconds));
        const jobStatusAndJobProgress: JobStatusAndJobProgress = await getJobStatusAndJobProgress({
          comparisonJobClient: args.comparisonJobClient,
          entry: entry,
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
      entries = [...idEntryMap.values()];
      updatingEntries = getUpdatingEntries(entries, currentVersionId, currentRunningJobsMap);

      if (isDialogOpenAndNotDisposed(args.getDialogOpen, args.getIsDisposed)) {
        const updatedState = {
          namedVersions: { currentVersion: args.namedVersionLoaderState!.namedVersions.currentVersion, entries: entries },
        };
        args.setResult(updatedState);
      }
    }
  }
};

const isDialogOpenAndNotDisposed = (getDialogOpen: () => boolean, getIsDisposed: () => boolean) => {
  return getDialogOpen() && !getIsDisposed();
};

const areJobsInProgress = (entries: VersionState[], getRunningJobs: () => JobAndNamedVersions[]) => {
  return entries.find(entry => entry.jobStatus === "Processing" || entry.jobStatus === "Queued") !== undefined || getRunningJobs().length > 0;
};

const getUpdatingEntries = (entries: VersionState[], currentVersionId: string, currentRunningJobsMap: Map<string, JobAndNamedVersions>) => {
  return entries.filter((entry) => {
    if (entry.jobStatus === "Processing" || entry.jobStatus === "Queued")
      return true;
    const jobId = `${entry.version.changesetId}-${currentVersionId}`;
    return currentRunningJobsMap.has(jobId);
  });
};

type PostOrGetComparisonJobParams = {
  changedElementsClient: IComparisonJobClient;
  iTwinId: string;
  iModelId: string;
  startChangesetId: string;
  endChangesetId: string;
};

/**
* post or gets comparison job.
* @returns ComparisonJob
* @throws on a non 2XX response.
*/
async function postOrGetComparisonJob(args: PostOrGetComparisonJobParams): Promise<ComparisonJob> {
  let result: ComparisonJob;
  try {
    result = await args.changedElementsClient.getComparisonJob({
      iTwinId: args.iTwinId,
      iModelId: args.iModelId,
      jobId: `${args.startChangesetId}-${args.endChangesetId}`,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "ComparisonNotFound") {
      result = await args.changedElementsClient.postComparisonJob({
        iTwinId: args.iTwinId,
        iModelId: args.iModelId,
        startChangesetId: args.startChangesetId,
        endChangesetId: args.endChangesetId,
        headers: { "Content-Type": "application/json" },
      });
      return result;
    }
    throw error;
  }
  return result;
}
