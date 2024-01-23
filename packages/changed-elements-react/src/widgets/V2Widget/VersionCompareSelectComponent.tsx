import { IModelApp, IModelConnection, NotifyMessageDetails, OutputMessagePriority, OutputMessageType } from "@itwin/core-frontend";
import { ReactNode, forwardRef, useEffect, useMemo, useState } from "react";
import { NamedVersion, ChangesetChunk, VersionState, Changeset, VersionCompare, ChangedElementsApiClient, ChangesetStatus } from "../..";
import { useVersionCompare } from "../../VersionCompareContext";
import { UsePagedNamedVersionLoaderResult, usePagedNamedVersionLoader } from "./usePagedNamedVersionLoader";
import { ChangedElementsClient, ComparisonJob, ComparisonJobCompleted } from "../../clients/ChangedElementsClient";
import { Logger } from "@itwin/core-bentley";
import { ProgressRadial, toaster } from "@itwin/itwinui-react";
import { VersionCompareSelectorInner } from "./VersionCompareSelectorInner";
import "./VersionCompareSelectWidget.scss";

/** Options for VersionCompareSelectComponent. */
export interface VersionCompareSelectorProps {
  /** IModel Connection that is being visualized. */
  iModelConnection: IModelConnection;

  /** Optional handler for when a version is selected. */
  onVersionSelected: (currentVersion: NamedVersion, targetVersion: NamedVersion, chunks?: ChangesetChunk[]) => void;

  /** Whether to show a title for the component or not. */
  wantTitle?: boolean;

  /** Configure the 'Manage Named Versions' URL. */
  getManageVersionsUrl?: (iModelConnection?: IModelConnection) => string;

}



/**
 * Component that let's the user select which named version to compare to. Will automatically call
 * VersionCompare.manager.startComparison with the proper inputs when user presses OK.
 */
export function VersionCompareSelectComponent(props: VersionCompareSelectorProps) {
  // Throw if context is not provided
  const { comparisonJobClient } = useVersionCompare();

  const [targetVersion, setTargetVersion] = useState<NamedVersion>();

  const versionsUrl = useMemo(
    () => (0, props.getManageVersionsUrl)?.(props.iModelConnection),
    [props.getManageVersionsUrl, props.iModelConnection],
  );
  const result = usePagedNamedVersionLoader(props.iModelConnection);
  const onStartComparison = () => {
    if (comparisonJobClient && result)
      void handleStartComparison({
        comparisonJobClient: comparisonJobClient,
        result: result,
        iModelConnection: props.iModelConnection
      });
  };
  const handleVersionClicked = (targetVersion: NamedVersion) => {
    setTargetVersion(targetVersion);
    if (result) {
      props.onVersionSelected?.(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        result.namedVersions.currentVersion!.version,
        targetVersion,
      );
    }
  };

  return result && result.namedVersions ? <VersionCompareSelectorInner
    entries={result.namedVersions.entries}
    currentVersion={result.namedVersions.currentVersion}
    selectedVersionChangesetId={targetVersion?.changesetId ?? undefined}
    onVersionClicked={handleVersionClicked}
    onStartComparison={onStartComparison}
    wantTitle={props.wantTitle}
    versionsUrl={versionsUrl}
  /> : <div className="vc-spinner">
    <ProgressRadial size="large" indeterminate />
  </div>;
}


type handelStartComparisonArgs = {
  targetVersion?: NamedVersion;
  comparisonJobClient: ChangedElementsClient;
  result: UsePagedNamedVersionLoaderResult;
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
  comparisonJobClient: ChangedElementsClient;
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
  changedElementsClient: ChangedElementsClient;
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

type runManagerStartComparisonV2Args = {
  comparisonJob: ComparisonJobCompleted;
  comparisonJobClient: ChangedElementsClient;
  iModelConnection: IModelConnection;
  targetVersion: NamedVersion;
  currentVersion: NamedVersion;
};
const runMangerStartComparisonV2 = async (args: runManagerStartComparisonV2Args) => {
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

const toastComparisonComplete = (args: runManagerStartComparisonV2Args) => {
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
