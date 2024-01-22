import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Modal, ModalContent, ModalButtonBar, Button } from "@itwin/itwinui-react";
import { createRef, useState } from "react";
import { VersionCompareUtils, VersionCompareVerboseMessages, NamedVersion, VersionCompare } from "../..";
import { ChangedElementsClient } from "../../clients/ChangedElementsClient";
import { VersionCompareSelectComponent } from "../VersionCompareSelectWidget";

export interface VersionCompareSelectDialogProps {
  iModelConnection: IModelConnection;
  isOpen: boolean;
  onClose?: (() => void) | undefined;
}

interface VersionCompareSelectComponentAttributes {
  startComparison: () => void;
}

function VersionCompareSelectDialog(props: VersionCompareSelectDialogProps) {

  const [targetVersion, setTargetVersion] = useState<NamedVersion|undefined>(undefined);
  const [currentVersion, setCurrentVersion] = useState<NamedVersion | undefined>(undefined);
 const versionSelectComponentRef = createRef<VersionCompareSelectComponentAttributes>();

  const _handleOk = async (comparisonJobClient?: ChangedElementsClient): Promise<void> => {
    if (!comparisonJobClient) {
      versionSelectComponentRef.current?.startComparison();
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
      isOpen={props.isOpen}
      onClose={_handleCancel}
    >
      <ModalContent>
        <VersionCompareSelectComponent
          ref={versionSelectComponentRef}
          iModelConnection={props.iModelConnection}
          onVersionSelected={_onVersionSelected}
          getManageVersionsUrl={VersionCompare.manager?.options.getManageNamedVersionsUrl}
        />
      </ModalContent>
      <ModalButtonBar>
        <Button
          styleType="high-visibility"
          disabled={targetVersion === undefined}
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
