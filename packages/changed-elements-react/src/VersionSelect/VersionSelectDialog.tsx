/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./VersionSelectDialog.css";
import { Component, ReactElement } from "react";
import { BeEvent } from "@itwin/core-bentley";
import { Localization } from "@itwin/core-common";
import { Button, Modal, ModalButtonBar } from "@itwin/itwinui-react";
import { GetChangesetsResult } from "../api/changedElementsApi";
import { NamedVersion, VersionSelectComponent } from "./VersionSelectComponent";

export interface VersionSelectDialogProps {
  localization: Localization;
  iTwinId: string;
  iModelId: string;
  changesetId: string;
  changesets: string[];
  changesetStatus: GetChangesetsResult["changesetStatus"];
  namedVersions: NamedVersion[];
  onViewOpened?: BeEvent<(args?: unknown) => void>;
  onOk: (currentVersion: NamedVersion, targetVersion: NamedVersion) => void;
  onCancel: () => void;
}

interface VersionSelectDialogState {
  targetVersion: NamedVersion | undefined;
  currentVersion: NamedVersion | undefined;
}

export class VersionSelectDialog extends Component<VersionSelectDialogProps, VersionSelectDialogState> {
  constructor(props: VersionSelectDialogProps) {
    super(props);
    this.state = {
      targetVersion: undefined,
      currentVersion: undefined,
    };
  }
  private _onVersionSelected = (currentVersion: NamedVersion | undefined, targetVersion: NamedVersion) => {
    this.setState({
      ...this.state,
      targetVersion,
      currentVersion,
    });
  };

  public override render(): ReactElement {
    const handleCompareClick = () => {
      if (!this.state.currentVersion || !this.state.targetVersion) {
        return;
      }

      this.props.onOk(this.state.currentVersion, this.state.targetVersion);
    }

    return (
      <Modal
        className="itwin-changed-elements__version-select-dialog"
        title={this.props.localization.getLocalizedString("VersionCompare:title")}
        isOpen
        onClose={this.props.onCancel}
      >
        <VersionSelectComponent
          localization={this.props.localization}
          changesetId={this.props.changesetId}
          changesets={this.props.changesets}
          changesetStatus={this.props.changesetStatus}
          namedVersions={this.props.namedVersions}
          onVersionSelected={this._onVersionSelected}
        />
        <ModalButtonBar>
          <Button styleType="high-visibility" disabled={!this.state.targetVersion} onClick={handleCompareClick}>
            {this.props.localization.getLocalizedString("VersionCompare:compare")}
          </Button>
          <Button onClick={this.props.onCancel}>
            {this.props.localization.getLocalizedString("UiCore:dialog.cancel")}
          </Button>
        </ModalButtonBar>
      </Modal>
    );
  }
}
