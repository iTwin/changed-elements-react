/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  IModelApp, NotifyMessageDetails, OutputMessagePriority, OutputMessageType, type IModelConnection
} from "@itwin/core-frontend";
import { useToaster } from "@itwin/itwinui-react";
import {
  ComparisonJobCompleted, IComparisonJobClient
} from "../../../clients/IComparisonJobClient.js";
import type { IModelsClient, NamedVersion } from "../../../clients/iModelsClient.js";
import type { ComparisonJobUpdateType } from "../components/VersionCompareDialogProvider.js";
import type { JobAndNamedVersions } from "../models/ComparisonJobModels.js";
import { runManagerStartComparisonV2 } from "./versionCompareV2WidgetUtils.js";

export type Toaster = ReturnType<typeof useToaster>;

/** Toast Comparison Job Processing.
 * Outputs toast message following the pattern:
 * Version Compare
 * iModel versions <currentVersion> and <targetVersion> are being processed in the background. You will receive a notification upon completion.
*/
export const toastComparisonJobProcessing = (currentVersion: NamedVersion, targetVersion: NamedVersion) => {
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

/** Toast Comparison Job Error.
 * Outputs toast message following the pattern:
 * Version Compare
 * An error occurred while processing changes between iModel versions <currentVersion> and <targetVersion>.
*/
export const toastComparisonJobError = (currentVersion: NamedVersion, targetVersion: NamedVersion) => {
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

export type ToastComparisonJobCompleteArgs = {
  comparisonJob: ComparisonJobCompleted;
  comparisonJobClient: IComparisonJobClient;
  iModelConnection: IModelConnection;
  targetVersion: NamedVersion;
  currentVersion: NamedVersion;
  getToastsEnabled?: () => boolean;
  runOnJobUpdate?: (comparisonEventType: ComparisonJobUpdateType, jobAndNamedVersions?: JobAndNamedVersions) => Promise<void>;
  iModelsClient: IModelsClient;
  toaster: Toaster;
};

/** Toast Comparison Job Complete.
 * Outputs toast message following the pattern:
 * Version Compare
 * iModel versions <currentVersion> and <targetVersion> comparison job is complete.
 *
 * Also has a link with the text "View The Report" and when clicked will start visualization on the comparison.
*/
export const toastComparisonJobComplete = (args: ToastComparisonJobCompleteArgs) => {
  const title = IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.viewTheReport");
  args.toaster.closeAll();
  args.toaster.setSettings({
    placement: "bottom",
  });
  args.toaster.positive(
    `${IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.iModelVersions")}<${args.currentVersion?.displayName}> ${IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.and")} <${args.targetVersion.displayName}> ${IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.jobComplete")}`, {
    hasCloseButton: true,
    link: {
      title: title,
      onClick: () => {
        args.toaster.closeAll();
        void runManagerStartComparisonV2({
          comparisonJob: args.comparisonJob,
          comparisonJobClient: args.comparisonJobClient,
          iModelConnection: args.iModelConnection,
          targetVersion: args.targetVersion,
          currentVersion: args.currentVersion,
          getToastsEnabled: args.getToastsEnabled,
          runOnJobUpdate: args.runOnJobUpdate,
          iModelsClient: args.iModelsClient,
        });
      },
    },
    type: "persisting",
  });
};

/** Toast Comparison Visualization Starting.
 * Outputs toast message following the pattern:
 * Version Compare
 * Comparison Visualization Starting.
*/
export const toastComparisonVisualizationStarting = () => {
  IModelApp.notifications.outputMessage(
    new NotifyMessageDetails(
      OutputMessagePriority.Info,
      IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionPickerTitle"),
      IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionComparisonStarting"),
      OutputMessageType.Toast,
    ),
  );
};
