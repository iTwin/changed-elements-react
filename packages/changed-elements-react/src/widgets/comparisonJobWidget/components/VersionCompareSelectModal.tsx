/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Modal, ModalContent, ModalButtonBar, Button } from "@itwin/itwinui-react";
import { useEffect, useState } from "react";
import { IModelApp, IModelConnection, NotifyMessageDetails, OutputMessagePriority, OutputMessageType } from "@itwin/core-frontend";
import { Logger } from "@itwin/core-bentley";
import { toaster } from "@itwin/itwinui-react";
import React from "react";
import { VersionCompareSelectComponent } from "./VersionCompareSelectComponent";
import { NamedVersionLoaderResult, useNamedVersionLoader } from "../hooks/useNamedVersionLoader";
import { IComparisonJobClient, ComparisonJob, ComparisonJobCompleted, ComparisonJobStarted } from "../../../clients/IComparisonJobClient";
import { useVersionCompare } from "../../../VersionCompareContext";
import { VersionCompareUtils, VersionCompareVerboseMessages } from "../../../api/VerboseMessages";
import { NamedVersion } from "../../../clients/iModelsClient";
import { VersionCompare } from "../../../api/VersionCompare";
import "./styles/ComparisonJobWidget.scss";
import { tryXTimes } from "../../../utils/utils";
import { VersionState } from "../models/VersionState";
import { JobStatusAndJobProgress } from "../models/ComparisonJobModels";
import { VersionProcessedState } from "../models/VersionProcessedState";


/** Options for VersionCompareSelectDialogV2. */
export interface VersionCompareSelectDialogV2Props {
  /** IModel Connection that is being visualized. */
  iModelConnection: IModelConnection;
  /** onClose triggered when user clicks start comparison or closes dialog.*/
  onClose: (() => void) | undefined;
}

type JobAndNamedVersions = {
  comparisonJob: ComparisonJob;
  targetNamedVersion: NamedVersion;
  currentNamedVersion: NamedVersion;
};

type V2Context = {
  getDialogOpen: () => boolean;
  openDialog: () => void;
  closedDialog: () => void;
  addRunningJob: (jobId: JobId, comparisonJob: JobAndNamedVersions) => void;
  removeRunningJob: (jobId: JobId) => void;
  getRunningJobs: () => JobAndNamedVersions[];
};

const V2DialogContext = React.createContext<V2Context>({} as V2Context);
export type V2DialogProviderProps = {
  children: React.ReactNode;
};

/** V2DialogProvider use comparison jobs for processing.
 * Used for tracking if the dialog is open or closed.
 * This is useful for managing toast messages associated with dialog
 * Example:
 *<V2DialogProvider>
 *{(isOpenCondition) &&
 * <VersionCompareSelectDialogV2
 *   iModelConnection={this.props.iModelConnection}
 *   onClose={this._handleVersionSelectDialogClose}
 * />}
 *</V2DialogProvider>
*/
export function V2DialogProvider({ children }: V2DialogProviderProps) {
  const dialogRunningJobs = React.useRef<Map<JobId, JobAndNamedVersions>>(new Map<JobId, JobAndNamedVersions>()); //todo make into set of Job Id
  const addRunningJob = (jobId: JobId, jobAndNamedVersions: JobAndNamedVersions) => {
    dialogRunningJobs.current.set(jobId, {
      comparisonJob: jobAndNamedVersions.comparisonJob,
      targetNamedVersion: jobAndNamedVersions.targetNamedVersion,
      currentNamedVersion: jobAndNamedVersions.currentNamedVersion,
    });
  };
  const removeRunningJob = (jobId: JobId) => {
    dialogRunningJobs.current.delete(jobId);
  };
  const getRunningJobs = () => {
    return Array.from(dialogRunningJobs.current.values());
  };
  const dialogOpenRef = React.useRef(false);
  const openDialog = () => {
    dialogOpenRef.current = true;
  };
  const closedDialog = () => {
    dialogOpenRef.current = false;
  };
  const getDialogOpen = () => {
    return dialogOpenRef.current;
  };
  return (
    <V2DialogContext.Provider value={{ openDialog, getDialogOpen: getDialogOpen, closedDialog, addRunningJob, removeRunningJob, getRunningJobs }}>
      {children}
    </V2DialogContext.Provider>
  );
}

export type JobId = string;
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
  const { openDialog, closedDialog, getDialogOpen, addRunningJob, removeRunningJob, getRunningJobs } = React.useContext(V2DialogContext);
  const [targetVersion, setTargetVersion] = useState<NamedVersion | undefined>(undefined);
  const [currentVersion, setCurrentVersion] = useState<NamedVersion | undefined>(undefined);
  const [result, setResult] = useState<NamedVersionLoaderResult>();
  const updateResult = (updatedState: NamedVersionLoaderResult) => {
    setResult(updatedState);
  };
  useEffect(() => {
    let isDisposed = false;
    const getIsDisposed = () => {
      return isDisposed;
    };
    openDialog();
    void pollForInProgressJobs({
      iTwinId: props.iModelConnection.iTwinId as string,
      iModelId: props.iModelConnection.iModelId as string,
      namedVersionLoaderState: result,
      comparisonJobClient: comparisonJobClient,
      iModelConnection: props.iModelConnection,
      setResult: updateResult,
      removeRunningJob: removeRunningJob,
      getRunningJobs: getRunningJobs,
      getDialogOpen: getDialogOpen,
      getIsDisposed,
    });
    return () => {
      isDisposed = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result]);
  useNamedVersionLoader(props.iModelConnection, iModelsClient, comparisonJobClient, updateResult);
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
      });
      if (startResult.comparisonJob) {
        addRunningJob(`${targetVersion.changesetId}-${currentVersion.changesetId}`, {
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
          setResult: updateResult,
          removeRunningJob: removeRunningJob,
          getRunningJobs: getRunningJobs,
          getDialogOpen: getDialogOpen,
          getIsDisposed,
        });
      }
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
      className="comparison-job-dialog"
      title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionPickerTitle")}
      isOpen
      onClose={_handleCancel}
    >
      <ModalContent>
        <VersionCompareSelectComponent
          iModelConnection={props.iModelConnection}
          onVersionSelected={_onVersionSelected}
          getManageVersionsUrl={VersionCompare.manager?.options.getManageNamedVersionsUrl}
          namedVersions={result?.namedVersions}
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

type RunStartComparisonV2Args = {
  targetVersion: NamedVersion;
  comparisonJobClient: IComparisonJobClient;
  iModelConnection: IModelConnection;
  currentVersion: NamedVersion;
};

type PostOrRunComparisonJobResult = {
  startedComparison: boolean;
  comparisonJob?: ComparisonJob;
};

const createOrRunManagerStartComparisonV2 = async (args: RunStartComparisonV2Args): Promise<PostOrRunComparisonJobResult> => {
  try {
    const comparisonJob = await tryXTimes(async () => {
      const job = (await postOrGetComparisonJob({
        changedElementsClient: args.comparisonJobClient,
        iTwinId: args.iModelConnection?.iTwinId as string,
        iModelId: args.iModelConnection?.iModelId as string,
        startChangesetId: args.targetVersion.changesetId as string,
        endChangesetId: args.currentVersion.changesetId as string,
      }));
      return job;
    }, 3);
    if (comparisonJob.comparisonJob.status === "Completed") {
      void runManagerStartComparisonV2({
        comparisonJob: comparisonJob as ComparisonJobCompleted,
        comparisonJobClient: args.comparisonJobClient,
        iModelConnection: args.iModelConnection,
        targetVersion: args.targetVersion,
        currentVersion: args.currentVersion,
      });
      return { startedComparison: true };
    }
    toastComparisonJobProcessing(args.currentVersion, args.targetVersion);
    return { startedComparison: false, comparisonJob: comparisonJob };
  } catch (error) {
    toastComparisonJobError(args.currentVersion, args.targetVersion);
    throw error;
  }
};

type PollForInProgressJobsArgs = {
  iTwinId: string;
  iModelId: string;
  namedVersionLoaderState?: NamedVersionLoaderResult;
  comparisonJobClient: IComparisonJobClient;
  iModelConnection: IModelConnection;
  setResult: (result: NamedVersionLoaderResult) => void;
  removeRunningJob: (jobId: JobId) => void;
  getRunningJobs: () => JobAndNamedVersions[];
  getDialogOpen: () => boolean;
  getIsDisposed: () => boolean;
  targetVersion?: NamedVersion;
};

export const pollForInProgressJobs: (args: PollForInProgressJobsArgs) => Promise<void> = async (args: PollForInProgressJobsArgs) => {
  void pollUntilCurrentRunningJobsCompleteAndToast(args);
  if (args.namedVersionLoaderState && !args.getIsDisposed())
    void pollUpdateCurrentEntriesForModal(args);
};

const pollUntilCurrentRunningJobsCompleteAndToast = async (args: PollForInProgressJobsArgs) => {
  let isConnectionClosed = false;
  args.iModelConnection.onClose.addListener(() => { isConnectionClosed = true; });
  while (!args.getDialogOpen() && args.getRunningJobs().length > 0 && !isConnectionClosed) {
    for (const pendingJob of args.getRunningJobs()) {
      const completedJob = await args.comparisonJobClient.getComparisonJob({
        iTwinId: args.iTwinId,
        iModelId: args.iModelId,
        jobId: pendingJob?.comparisonJob.comparisonJob.jobId,
      });
      if (completedJob.comparisonJob.status === "Error") {
        args.removeRunningJob(pendingJob.comparisonJob.comparisonJob.jobId);
      }

      if (completedJob.comparisonJob.status === "Completed" && !VersionCompare.manager?.isComparing) {
        toastComparisonJobComplete({
          comparisonJob: completedJob as ComparisonJobCompleted,
          comparisonJobClient: args.comparisonJobClient,
          iModelConnection: args.iModelConnection,
          targetVersion: pendingJob.targetNamedVersion,
          currentVersion: pendingJob.currentNamedVersion,
        });
        args.removeRunningJob(pendingJob.comparisonJob.comparisonJob.jobId);
      }
    }
  }
};

const pollUpdateCurrentEntriesForModal = async (args: PollForInProgressJobsArgs) => {
  const currentVersionId = args.iModelConnection?.changeset.id;
  let entries = args.namedVersionLoaderState!.namedVersions.entries.slice();
  if (entries.length === 0)
    return;
  const areJobsInProgress = (entries: VersionState[]) => {
    return entries.find(entry => entry.jobStatus === "Processing" || entry.jobStatus === "Queued") !== undefined || args.getRunningJobs.length > 0;
  };
  const currentRunningJobsMap = new Map<JobId, JobAndNamedVersions>();
  args.getRunningJobs().forEach((job) => {
    currentRunningJobsMap.set(job.comparisonJob.comparisonJob.jobId, job);
  });
  if (areJobsInProgress(entries)) {
    const idEntryMap = new Map<string, VersionState>();
    entries.forEach((entry) => idEntryMap.set(entry.version.id, entry));
    let updatingEntries = entries.filter((entry) => {
      if (entry.jobStatus === "Processing" || entry.jobStatus === "Queued")
        return true;
      const jobId = `${entry.version.changesetId}-${currentVersionId}`;
      return currentRunningJobsMap.has(jobId);
    });
    const loopDelayInMilliseconds = 5000;
    while (!args.getIsDisposed()) {
      for (let entry of updatingEntries) {
        await new Promise((resolve) => setTimeout(resolve, loopDelayInMilliseconds));
        const jobStatusAndJobProgress: JobStatusAndJobProgress = await getJobStatusAndJobProgress(args.comparisonJobClient, entry, args.iTwinId, args.iModelId, currentVersionId);
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
      updatingEntries = entries.filter((entry) => entry.jobStatus === "Processing" || entry.jobStatus === "Queued");
      args.namedVersionLoaderState = {
        namedVersions: { currentVersion: args.namedVersionLoaderState!.namedVersions.currentVersion, entries: entries },
      };
      args.setResult(args.namedVersionLoaderState);
    }
  }
};

const getJobStatusAndJobProgress = async (comparisonJobClient: IComparisonJobClient, entry: VersionState, iTwinId: string, iModelId: string, currentChangesetId: string): Promise<JobStatusAndJobProgress> => {
  try {
    const res = await comparisonJobClient.getComparisonJob({
      iTwinId: iTwinId,
      iModelId: iModelId,
      jobId: `${entry.version.changesetId}-${currentChangesetId}`,
    });
    if (res) {
      switch (res.comparisonJob.status) {
        case "Completed": {
          return {
            jobStatus: "Available",
            jobProgress: {
              currentProgress: 0,
              maxProgress: 0,
            },
          };
        }
        case "Queued": {
          return {
            jobStatus: "Queued",
            jobProgress: {
              currentProgress: 0,
              maxProgress: 0,
            },
          };
        }
        case "Started": {
          const progressingJob = res as ComparisonJobStarted;
          return {
            jobStatus: "Processing",
            jobProgress: {
              // todo job is still processing but may be max out on progress so should show still progressing for current job progress. This is most likely an API error and will need to
              // be fix
              currentProgress: progressingJob.comparisonJob.currentProgress === progressingJob.comparisonJob.maxProgress
                ? progressingJob.comparisonJob.maxProgress - 1 : progressingJob.comparisonJob.currentProgress,
              maxProgress: progressingJob.comparisonJob.maxProgress,
            },
          };
        }
        case "Error":
          return {
            jobStatus: "Error",
            jobProgress: {
              currentProgress: 0,
              maxProgress: 0,
            },
          };
      }
    }
    return {
      jobStatus: "Unknown",
      jobProgress: {
        currentProgress: 0,
        maxProgress: 0,
      },
    };
  } catch (_) {
    return {
      jobStatus: "Not Processed",
      jobProgress: {
        currentProgress: 0,
        maxProgress: 0,
      },
    };
  }
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
    result = await args.changedElementsClient.postComparisonJob({
      iTwinId: args.iTwinId,
      iModelId: args.iModelId,
      startChangesetId: args.startChangesetId,
      endChangesetId: args.endChangesetId,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && error.code === "ComparisonExists") {
      result = await args.changedElementsClient.getComparisonJob({
        iTwinId: args.iTwinId,
        iModelId: args.iModelId,
        jobId: `${args.startChangesetId}-${args.endChangesetId}`,
        headers: {
          "Content-Type": "application/json",
        },
      });
      return result;
    }
    throw error;
  }
  return result;
}

type ManagerStartComparisonV2Args = {
  comparisonJob: ComparisonJobCompleted;
  comparisonJobClient: IComparisonJobClient;
  iModelConnection: IModelConnection;
  targetVersion: NamedVersion;
  currentVersion: NamedVersion;
};

const runManagerStartComparisonV2 = async (args: ManagerStartComparisonV2Args) => {
  if (VersionCompare.manager?.isComparing) {
    return;
  }
  toastComparisonVisualizationStarting();
  const changedElements = await args.comparisonJobClient.getComparisonJobResult(args.comparisonJob);
  VersionCompare.manager?.startComparisonV2(args.iModelConnection, args.currentVersion, args.targetVersion, [changedElements.changedElements]).catch((e) => {
    Logger.logError(VersionCompare.logCategory, "Could not start version comparison: " + e);
  });
};

const toastComparisonJobProcessing = (currentVersion: NamedVersion, targetVersion: NamedVersion) => {
  IModelApp.notifications.outputMessage(
    new NotifyMessageDetails(
      OutputMessagePriority.Info,
      IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionPickerTitle"),
      `${IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.iModelVersions")}
 <${currentVersion?.displayName}> ${IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.and")} <${targetVersion.displayName}>
 ${IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.jobProcessing")}`,
      OutputMessageType.Toast,
    ),
  );
};

const toastComparisonJobError = (currentVersion: NamedVersion, targetVersion: NamedVersion) => {
  IModelApp.notifications.outputMessage(
    new NotifyMessageDetails(
      OutputMessagePriority.Error,
      IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionPickerTitle"),
      `${IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.jobError")}
 ${IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.iModelVersions")}
 <${currentVersion?.displayName}> ${IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.and")} <${targetVersion.displayName}>`,
      OutputMessageType.Toast,
    ),
  );
};

export const toastComparisonJobComplete = (args: ManagerStartComparisonV2Args) => {
  const title = IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.viewTheReport");
  toaster.setSettings({
    placement: "bottom",
  });
  toaster.positive(
    `${IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.iModelVersions")}<${args.currentVersion?.displayName}> ${IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.and")} <${args.targetVersion.displayName}> ${IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.jobComplete")}`, {
    hasCloseButton: true,
    link: {
      title: title,
      onClick: () => {
        toaster.closeAll();
        void runManagerStartComparisonV2({
          comparisonJob: args.comparisonJob,
          comparisonJobClient: args.comparisonJobClient,
          iModelConnection: args.iModelConnection,
          targetVersion: args.targetVersion,
          currentVersion: args.currentVersion,
        });
      },
    },
    type: "persisting",
  });
};

const toastComparisonVisualizationStarting = () => {
  IModelApp.notifications.outputMessage(
    new NotifyMessageDetails(
      OutputMessagePriority.Info,
      IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionPickerTitle"),
      IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionComparisonStarting"),
      OutputMessageType.Toast,
    ),
  );
};
