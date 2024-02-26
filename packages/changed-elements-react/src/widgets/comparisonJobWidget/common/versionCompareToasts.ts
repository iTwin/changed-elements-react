/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp, NotifyMessageDetails, OutputMessagePriority, OutputMessageType } from "@itwin/core-frontend";
import { NamedVersion } from "../../../clients/iModelsClient";
import { toaster } from "@itwin/itwinui-react";
import { ManagerStartComparisonV2Args, runManagerStartComparisonV2 } from "./versionCompareV2WidgetUtils";

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

/** Toast Comparison Job Complete.
 * Outputs toast message following the pattern:
 * Version Compare
 * iModel versions <currentVersion> and <targetVersion> comparison job is complete.
 *
 * Also has a link with the text "View The Report" and when clicked will start visualization on the comparison.
*/
export const toastComparisonJobComplete = (args: ManagerStartComparisonV2Args) => {
  const title = IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.viewTheReport");
  toaster.closeAll();
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
          getToastsEnabled: args.getToastsEnabled,
          runOnJobUpdate: args.runOnJobUpdate,
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
