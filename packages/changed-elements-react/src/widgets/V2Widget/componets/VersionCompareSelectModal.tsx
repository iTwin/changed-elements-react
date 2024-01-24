import { Modal, ModalContent, ModalButtonBar, Button } from "@itwin/itwinui-react";
import { useState } from "react";
import { IModelApp, IModelConnection, NotifyMessageDetails, OutputMessagePriority, OutputMessageType } from "@itwin/core-frontend";
import { Logger } from "@itwin/core-bentley";
import { toaster } from "@itwin/itwinui-react";
import { VersionCompareSelectComponent } from "./VersionCompareSelectComponent";
import { namedVersionLoaderResult, useNamedVersionLoader } from "../hooks/useNamedVersionLoader";
import { ComparisonJobClient, ComparisonJob, ComparisonJobCompleted } from "../../../clients/ChangedElementsClient";
import { useVersionCompare } from "../../../VersionCompareContext";
import { VersionCompareUtils, VersionCompareVerboseMessages } from "../../../api/VerboseMessages";
import { NamedVersion } from "../../../clients/iModelsClient";
import { VersionCompare } from "../../../api/VersionCompare";
import "./styles/VersionCompareSelectWidget.scss";

export interface VersionCompareSelectDialogProps {
  iModelConnection: IModelConnection;
  isOpen: boolean;
  onClose?: (() => void) | undefined;
}

export function VersionCompareSelectDialog(props: VersionCompareSelectDialogProps) {
  const { comparisonJobClient, iModelsClient } = useVersionCompare();
  if (!comparisonJobClient) {
    throw new Error("V2 Client Is Not Initialized In Given Context.");
  }
  if (!iModelsClient) {
    throw new Error("V1 Client Is Not Initialized In Given Context.");
  }
  const [targetVersion, setTargetVersion] = useState<NamedVersion | undefined>(undefined);
  const [currentVersion, setCurrentVersion] = useState<NamedVersion | undefined>(undefined);
  const result = useNamedVersionLoader(props.iModelConnection, iModelsClient, comparisonJobClient);
  const _handleOk = async (): Promise<void> => {
    if (comparisonJobClient && result?.namedVersions && targetVersion) {
      void handleStartComparison({
        targetVersion: targetVersion,
        comparisonJobClient: comparisonJobClient,
        result: result,
        iModelConnection: props.iModelConnection,
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
      title={"V2 WIP"}
      isOpen={props.isOpen}
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


type handelStartComparisonArgs = {
  targetVersion: NamedVersion;
  comparisonJobClient: ComparisonJobClient;
  result: namedVersionLoaderResult;
  iModelConnection: IModelConnection;
};

const handleStartComparison = async (args: handelStartComparisonArgs) => {
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
    }).catch((e) => {
      Logger.logError(VersionCompare.logCategory, "Could not start version comparison: " + e);
    });
  }
};

type runStartComparisonV2Args = {
  targetVersion: NamedVersion;
  comparisonJobClient: ComparisonJobClient;
  iModelConnection: IModelConnection;
  currentVersion: NamedVersion;
};

const runStartComparisonV2 = async (args: runStartComparisonV2Args) => {
  let { comparisonJob } = await postOrGetComparisonJob({
    changedElementsClient: args.comparisonJobClient,
    iTwinId: args.iModelConnection?.iTwinId as string,
    iModelId: args.iModelConnection?.iModelId as string,
    startChangesetId: args.targetVersion.changesetId as string,
    endChangesetId: args.currentVersion.changesetId as string,
  });
  if (comparisonJob.status === "Completed") {
    void runMangerStartComparisonV2({
      comparisonJob: { comparisonJob: comparisonJob },
      comparisonJobClient: args.comparisonJobClient,
      iModelConnection: args.iModelConnection,
      targetVersion: args.targetVersion,
      currentVersion: args.currentVersion,
    });
  }
  while (comparisonJob.status === "Queued" || comparisonJob.status === "Started") {
    toastComparisonProcessing(args.currentVersion, args.targetVersion);
    await new Promise((resolve) => setTimeout(resolve, 5000));
    comparisonJob = (await postOrGetComparisonJob({
      changedElementsClient: args.comparisonJobClient,
      iTwinId: args.iModelConnection?.iTwinId as string,
      iModelId: args.iModelConnection?.iModelId as string,
      startChangesetId: args.targetVersion.changesetId as string,
      endChangesetId: args.currentVersion.changesetId as string,
    })).comparisonJob;
    if (comparisonJob.status === "Completed") {
      toastComparisonComplete({
        comparisonJob: { comparisonJob: comparisonJob },
        comparisonJobClient: args.comparisonJobClient,
        iModelConnection: args.iModelConnection,
        targetVersion: args.targetVersion,
        currentVersion: args.currentVersion,
      });
    }
  }
};

interface PostOrGetComparisonJobParams {
  changedElementsClient: ComparisonJobClient;
  iTwinId: string;
  iModelId: string;
  startChangesetId: string;
  endChangesetId: string;
}

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
    if (error && typeof error === "object" && "code" in error && error.code !== "ComparisonExists") {
      throw error;
    }

    result = await args.changedElementsClient.getComparisonJob({
      iTwinId: args.iTwinId,
      iModelId: args.iModelId,
      jobId: `${args.startChangesetId}-${args.endChangesetId}`,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }

  return result;
}

type managerStartComparisonV2Args = {
  comparisonJob: ComparisonJobCompleted;
  comparisonJobClient: ComparisonJobClient;
  iModelConnection: IModelConnection;
  targetVersion: NamedVersion;
  currentVersion: NamedVersion;
};

const runMangerStartComparisonV2 = async (args: managerStartComparisonV2Args) => {
  const changedElements = await args.comparisonJobClient.getComparisonJobResult(args.comparisonJob);
  VersionCompare.manager?.startComparisonV2(args.iModelConnection, args.currentVersion, args.targetVersion, [changedElements.changedElements]).catch((e) => {
    Logger.logError(VersionCompare.logCategory, "Could not start version comparison: " + e);
  });
};


const toastComparisonProcessing = (currentVersion: NamedVersion, targetVersion: NamedVersion) => {
  IModelApp.notifications.outputMessage(
    new NotifyMessageDetails(
      OutputMessagePriority.Info,
      "iModel versions ",
      `iModel versions <${currentVersion?.displayName}> and <${targetVersion.displayName}> are being processed in the background. You will receive a notification upon completion.`,
      OutputMessageType.Toast,
    ),
  );
};

const toastComparisonComplete = (args: managerStartComparisonV2Args) => {
  toaster.setSettings({
    placement: "bottom",
  });
  toaster.positive(`iModel versions <${args.currentVersion?.displayName}> and <${args.targetVersion.displayName}> comparisons job is complete.`, {
    hasCloseButton: true,
    link: {
      title: "View The Report",
      onClick: () => {
        void runMangerStartComparisonV2({
          comparisonJob: args.comparisonJob,
          comparisonJobClient: args.comparisonJobClient,
          iModelConnection: args.iModelConnection,
          targetVersion: args.targetVersion,
          currentVersion: args.currentVersion,
        });
        toaster.closeAll();
      },
    },
    type: "persisting",
  });
};
