/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { IModelApp, type IModelConnection } from "@itwin/core-frontend";
import { Button, Modal, ModalButtonBar, ModalContent } from "@itwin/itwinui-react";
import { useState, type ReactNode } from "react";

import { VersionCompareUtils, VersionCompareVerboseMessages } from "../../../api/VerboseMessages";
import type { NamedVersion } from "../../../clients/iModelsClient";
import { useVersionCompare } from "../../../VersionCompareContext";
import { useNamedVersionLoader } from "../useNamedVersionLoader.js";
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
  const { comparisonJobClient } = useVersionCompare();
  if (!comparisonJobClient) {
    throw new Error("V2 Client is not initialized in given context.");
  }

  const { isLoading, result, prepareComparison } = useNamedVersionLoader(props.iModelConnection);

  const [targetVersion, setTargetVersion] = useState<NamedVersion>();
  const [currentVersion, setCurrentVersion] = useState<NamedVersion>();

  const _handleOk = async (): Promise<void> => {
    if (!comparisonJobClient || !result || !targetVersion || !currentVersion) {
      return;
    }

    props.onClose?.();
    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.selectDialogClosed);
    await prepareComparison(targetVersion, currentVersion);
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
          namedVersions={result}
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
