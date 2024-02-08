/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Modal, ModalContent, ModalButtonBar, Button } from "@itwin/itwinui-react";
import { useEffect, useState } from "react";
import { IModelApp, IModelConnection, NotifyMessageDetails, OutputMessagePriority, OutputMessageType } from "@itwin/core-frontend";
import { Logger } from "@itwin/core-bentley";
import { toaster } from "@itwin/itwinui-react";
import { VersionCompareSelectComponent } from "./VersionCompareSelectComponent";
import { NamedVersionLoaderResult, useNamedVersionLoader } from "../hooks/useNamedVersionLoader";
import { IComparisonJobClient, ComparisonJob, ComparisonJobCompleted } from "../../../clients/IComparisonJobClient";
import { useVersionCompare } from "../../../VersionCompareContext";
import { VersionCompareUtils, VersionCompareVerboseMessages } from "../../../api/VerboseMessages";
import { NamedVersion } from "../../../clients/iModelsClient";
import { VersionCompare } from "../../../api/VersionCompare";
import "./styles/VersionCompareSelectWidget.scss";
import React from "react";

/** Options for VersionCompareSelectDialogV2. */
export interface VersionCompareSelectDialogProps {
  /** IModel Connection that is being visualized. */
  iModelConnection: IModelConnection;
  /** onClose triggered when user clicks start comparison or closes dialog.*/
  onClose: (() => void) | undefined;
}

type V2Context = {
  getDialogOpen: () => boolean;
  openDialog: () => void;
  closedDialog: () => void;
};

const V2DialogContext = React.createContext<V2Context>({} as V2Context);
type V2DialogProviderProps = {
  children: React.ReactNode;
};

/** V2DialogProvider use comparison jobs for processing.
 * Used for tracking if the dialog is open or closed.
 * This is useful for managing toast messages associated with dialog
 * example:
 *<V2DialogProvider>
 *   <VersionCompareSelectDialogV2
 *    isOpen
 *    iModelConnection={this.props.iModelConnection}
 *    onClose={this._handleVersionSelectDialogClose}
 *   />
 *</V2DialogProvider>
*/
export function V2DialogProvider({ children }: V2DialogProviderProps) {
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
    <V2DialogContext.Provider value={{ openDialog, getDialogOpen: getDialogOpen, closedDialog }}>
      {children}
    </V2DialogContext.Provider>
  );
}

/** VersionCompareSelectDialogV2 use comparison jobs for processing.
 * Requires context of:
 *<VersionCompareContext iModelsClient={iModelsClient} comparisonJobClient={comparisonJobClient}>
 * ...
 *</VersionCompareContext>
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
export function VersionCompareSelectDialogV2(props: VersionCompareSelectDialogProps) {
  const { comparisonJobClient, iModelsClient } = useVersionCompare();
  if (!comparisonJobClient) {
    throw new Error("V2 Client Is Not Initialized In Given Context.");
  }
  if (!iModelsClient) {
    throw new Error("V1 Client Is Not Initialized In Given Context.");
  }
  const { openDialog, closedDialog, getDialogOpen } = React.useContext(V2DialogContext);
  const [targetVersion, setTargetVersion] = useState<NamedVersion | undefined>(undefined);
  const [currentVersion, setCurrentVersion] = useState<NamedVersion | undefined>(undefined);
  const result = useNamedVersionLoader(props.iModelConnection, iModelsClient, comparisonJobClient);
  useEffect(() => {
    openDialog();
    return () => {
      closedDialog();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const _handleOk = async (): Promise<void> => {
    if (comparisonJobClient && result?.namedVersions && targetVersion && currentVersion) {
      void handleStartComparison({
        targetVersion: targetVersion,
        comparisonJobClient: comparisonJobClient,
        result: result,
        iModelConnection: props.iModelConnection,
        getDialogOpen,
      });
      props.onClose?.();
      VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.selectDialogClosed);
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
      className="version-compare-dialog"
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

type HandleStartComparisonArgs = {
  targetVersion: NamedVersion;
  comparisonJobClient: IComparisonJobClient;
  result: NamedVersionLoaderResult;
  iModelConnection: IModelConnection;
  getDialogOpen: () => boolean;
};

const handleStartComparison = async (args: HandleStartComparisonArgs) => {
  if (VersionCompare.manager?.isComparing) {
    await VersionCompare.manager?.stopComparison();
  }
  const currentVersion = args.result.namedVersions.currentVersion?.version;
  if (args.targetVersion && currentVersion) {
    runStartComparisonV2({
      targetVersion: args.targetVersion,
      comparisonJobClient: args.comparisonJobClient,
      iModelConnection: args.iModelConnection,
      currentVersion: currentVersion,
      getDialogOpen: args.getDialogOpen,
    }).catch((e) => {
      Logger.logError(VersionCompare.logCategory, "Could not start version comparison: " + e);
    });
  }
};

type RunStartComparisonV2Args = {
  targetVersion: NamedVersion;
  comparisonJobClient: IComparisonJobClient;
  iModelConnection: IModelConnection;
  currentVersion: NamedVersion;
  getDialogOpen: () => boolean;
};

const runStartComparisonV2 = async (args: RunStartComparisonV2Args) => {
  let { comparisonJob } = await postOrGetComparisonJob({
    changedElementsClient: args.comparisonJobClient,
    iTwinId: args.iModelConnection?.iTwinId as string,
    iModelId: args.iModelConnection?.iModelId as string,
    startChangesetId: args.targetVersion.changesetId as string,
    endChangesetId: args.currentVersion.changesetId as string,
  });
    if (comparisonJob.status === "Error") {
    toastComparisonJobError(args.currentVersion, args.targetVersion);
    return;
  }
  if (comparisonJob.status === "Completed") {
    void runManagerStartComparisonV2({
      comparisonJob: { comparisonJob: comparisonJob },
      comparisonJobClient: args.comparisonJobClient,
      iModelConnection: args.iModelConnection,
      targetVersion: args.targetVersion,
      currentVersion: args.currentVersion,
    });
    return;
  }
  toastComparisonJobProcessing(args.currentVersion, args.targetVersion);
  while (comparisonJob.status !== "Error") {
    await new Promise((resolve) => setTimeout(resolve, 5000)); // run loop every 5 seconds
    if (VersionCompare.manager?.isComparing) {
      return;
    }
    comparisonJob = (await args.comparisonJobClient.getComparisonJob({
      iTwinId: args.iModelConnection?.iTwinId as string,
      iModelId: args.iModelConnection?.iModelId as string,
      jobId: `${args.targetVersion.changesetId}-${args.currentVersion.changesetId}`,
      headers: {
        "Content-Type": "application/json",
      },
    })).comparisonJob;
    if (comparisonJob.status === "Completed") {
      if (!args.getDialogOpen() && !VersionCompare.manager?.isComparing) {
        toastComparisonJobComplete({
          comparisonJob: { comparisonJob: comparisonJob },
          comparisonJobClient: args.comparisonJobClient,
          iModelConnection: args.iModelConnection,
          targetVersion: args.targetVersion,
          currentVersion: args.currentVersion,
        });
      }
      return;
    }
  }
  if (comparisonJob.status === "Error") {
    toastComparisonJobError(args.currentVersion, args.targetVersion);
    return;
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

const toastComparisonJobComplete = (args: ManagerStartComparisonV2Args) => {
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
