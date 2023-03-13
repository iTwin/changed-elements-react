/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Dialog, FooterPopup, TitleBar } from "@itwin/appui-layout-react";
import { FrontstageManager, Indicator, ModalDialogManager, type StatusFieldProps } from "@itwin/appui-react";
import { BeEvent } from "@itwin/core-bentley";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { Button, ButtonType } from "@itwin/core-react";
import * as React from "react";

import type { ChangedElementEntry } from "../api/ChangedElementEntryCache";
import { VersionCompareUtils, VersionCompareVerboseMessages } from "../api/VerboseMessages";
import { VersionCompare } from "../api/VersionCompare";
import { PropertyComparisonFrontstage } from "../frontstages/PropertyComparisonFrontstage";
import "./VersionCompareFooterWidget.scss";
import { VersionCompareSelectDialog } from "./VersionCompareSelectWidget";

export interface VersionCompareFooterProps {
  /** IModelConnection to use */
  iModelConnection?: IModelConnection;
  /** Hook to trigger onViewChanged when version comparison starts */
  onViewChanged?: BeEvent<(args: unknown) => void>;
  /** Hide the icon when version compare is not active */
  hideWhenUnused?: boolean;
  /** Hide the version compare icon on toolbar when toggled true */
  excludeToolbarItem?: boolean;
}

export type VersionCompareFooterWidgetProps = VersionCompareFooterProps &
  StatusFieldProps;

interface VersionCompareFooterState {
  opened: boolean;
  target: HTMLElement | null;
  numChangedElements: number;
  comparing: boolean;
  loadingMessage: string | undefined;
}

/** Widget to show which versions are being compared, the count of changed elements and the stop comparison button */
export class VersionCompareFooterWidget extends React.Component<
  VersionCompareFooterWidgetProps,
  VersionCompareFooterState
> {
  constructor(props: VersionCompareFooterWidgetProps) {
    super(props);

    this.state = {
      opened: false,
      target: null,
      numChangedElements: VersionCompare.manager?.isComparing
        ? VersionCompare.manager?.changedElementsManager.entryCache.getAll()
            .length
        : 0,
      comparing: VersionCompare.manager?.isComparing ?? false,
      loadingMessage: undefined,
    };
  }

  /** Handle opening/closing the dialog */
  public handleClick() {
    const opened = !this.state.opened;
    this.setState({
      opened,
    });
    VersionCompareUtils.outputVerbose(
      opened
        ? VersionCompareVerboseMessages.footerWidgetOpenedWidget
        : VersionCompareVerboseMessages.footerWidgetClosedWidget,
    );
  }

  private _handleComparisonStarted = (
    _currentIModel: IModelConnection,
    _targetIModel: IModelConnection,
    elements: ChangedElementEntry[],
  ) => {
    this.setState({
      comparing: true,
      numChangedElements: elements.length,
      loadingMessage: undefined,
    });
  };

  private _handleComparisonStopped = () => {
    this.setState({
      comparing: false,
      numChangedElements: 0,
      loadingMessage: undefined,
    });
  };

  private _handleProgressEvent = (message: string) => {
    this.setState({
      loadingMessage: message,
    });
  };

  public override UNSAFE_componentWillMount() {
    VersionCompare.manager?.versionCompareStarted.addListener(this._handleComparisonStarted);
    VersionCompare.manager?.versionCompareStartFailed.addListener(this._handleComparisonStopped);
    VersionCompare.manager?.versionCompareStopped.addListener(this._handleComparisonStopped);
    VersionCompare.manager?.loadingProgressEvent.addListener(this._handleProgressEvent);
  }

  public UNSAFE_componentWillUnmount() {
    VersionCompare.manager?.versionCompareStarted.removeListener(this._handleComparisonStarted);
    VersionCompare.manager?.versionCompareStartFailed.removeListener(this._handleComparisonStopped);
    VersionCompare.manager?.versionCompareStopped.removeListener(this._handleComparisonStopped);
    VersionCompare.manager?.loadingProgressEvent.removeListener(this._handleProgressEvent);
  }

  /** Clears sections */
  public handleStopComparison = async () => {
    // Do it asynchronously, we don't care about waiting
    VersionCompare.manager?.stopComparison().catch(() => {
      /* No-op */
    });
    this.setState({
      opened: false,
    });
  };

  private _handleTargetRef = (target: HTMLElement | null) => {
    this.setState({ target });
  };

  private _openDialogWithCheck = async () => {
    if (
      this.props.iModelConnection === undefined ||
      this.props.iModelConnection.iTwinId === undefined ||
      this.props.iModelConnection.iModelId === undefined
    ) {
      return;
    }

    ModalDialogManager.openDialog(
      <VersionCompareSelectDialog
        iModelConnection={this.props.iModelConnection}
        onViewOpened={this.props.onViewChanged}
      />,
    );
  };

  /** Render buttons for clear and show/hide manipulators */
  public renderContents() {
    return (
      <div className="vc-footer-widget">
        {this.state.comparing ? (
          <>
            <div className="vc-text-info-underline">
              {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.changeCount")}
            </div>
            <div className="vc-text-info">{this.state.numChangedElements}</div>
            <div className="vc-text-info-underline">
              {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.currentVersionLabel") + ":"}
            </div>
            <div className="vc-text-info">
              {VersionCompare.manager?.currentVersion?.displayName ?? ""}
            </div>
            <div className="vc-text-info-underline">
              {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.targetVersionLabel") + ":"}
            </div>
            <div className="vc-text-info">
              {VersionCompare.manager?.targetVersion?.displayName ?? ""}
            </div>
            <Button
              className={"vc-button"}
              buttonType={ButtonType.Hollow}
              onClick={this.handleStopComparison}
            >
              {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.stopComparison")}
            </Button>
          </>
        ) : (
          <div className="vc-footer-no-comparison-msg">
            {this.state.loadingMessage ? (
              <>{this.state.loadingMessage}</>
            ) : (
              <>
                {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.msg_noComparison")}
                <a className="vc-a" onClick={this._openDialogWithCheck}>
                  {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.msg_clickHere")}
                </a>
              </>
            )}
          </div>
        )}
      </div>
    );
  }

  public override render() {
    const show =
      !this.props.hideWhenUnused ||
      (this.state.comparing &&
        FrontstageManager.activeFrontstageId !==
          PropertyComparisonFrontstage.id);
    return (
      <>
        {show && (
          <>
            <div
              ref={this._handleTargetRef}
              title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionCompareBeta")}
            >
              <Indicator
                iconName="icon-compare"
                onClick={this.handleClick.bind(this)}
                opened={this.state.opened}
              ></Indicator>
            </div>
            <FooterPopup
              target={this.state.target}
              onClose={() => this.setState({ opened: false })}
              isOpen={this.state.opened}
            >
              <Dialog
                titleBar={
                  <TitleBar
                    title={IModelApp.localization.getLocalizedString(
                      "VersionCompare:versionCompare.versionCompareBeta",
                    )}
                  ></TitleBar>
                }
              >
                {this.renderContents()}
              </Dialog>
            </FooterPopup>
          </>
        )}
      </>
    );
  }
}