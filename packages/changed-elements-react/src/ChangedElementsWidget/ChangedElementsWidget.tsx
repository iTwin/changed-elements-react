/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import "./ChangedElementsWidget.css";
import { Component, ReactElement } from "react";
import { Logger } from "@itwin/core-bentley";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import { SvgAdd, SvgCompare, SvgStop } from "@itwin/itwinui-icons-react";
import { IconButton, ProgressRadial, Text } from "@itwin/itwinui-react";
import { VersionCompareUtils, VersionCompareVerboseMessages } from "../VerboseMessages";
import { VersionCompare } from "../VersionCompare";
import { VersionCompareManager } from "../VersionCompareManager";
import { ChangedElementEntry } from "./ChangedElementEntryCache";
import { ChangedElementsInspector } from "./EnhancedElementsInspector";

export interface ChangedElementsWidgetProps {
  handleCompare: () => void;
}

interface ChangedElementsWidgetState {
  loading: boolean;
  loaded: boolean;
  manager: VersionCompareManager;
  currentIModel: IModelConnection | undefined;
  targetIModel: IModelConnection | undefined;
  elements: ChangedElementEntry[];
  message: string;
  description?: string;
  menuOpened: boolean;
}

export class ChangedElementsWidget extends Component<ChangedElementsWidgetProps, ChangedElementsWidgetState> {
  private _onComparisonStarting = (): void => {
    this.setState({
      loading: true,
      loaded: false,
      message: IModelApp.localization.getLocalizedString("VersionCompare:changedElementsWidget.loadingComparison"),
      description: "",
    });
  };

  private _onComparisonStopped = (): void => {
    this.setState({
      message: IModelApp.localization.getLocalizedString("VersionCompare:changedElementsWidget.comparisonNotActive"),
      description: IModelApp.localization.getLocalizedString("VersionCompare:changedElementsWidget.comparisonGetStarted"),
      loading: false,
      loaded: false,
    });
  };

  private _onComparisonStarted = (
    currentIModel: IModelConnection,
    targetIModel: IModelConnection,
    elements: ChangedElementEntry[],
  ): void => {
    this.setState({
      message: "",
      description: "",
      loading: false,
      loaded: true,
      currentIModel,
      targetIModel,
      elements,
    });
  };

  private _onProgressEvent = (message: string): void => {
    this.setState({ message, description: "" });
  };

  constructor(props: ChangedElementsWidgetProps) {
    super(props);

    const manager = VersionCompare.manager;
    if (manager === undefined) {
      Logger.logError(
        VersionCompare.logCategory,
        "Cannot create ChangedElementsWidget without a properly initialized or passed VersionCompareManager",
      );
      throw new Error(
        "Cannot create ChangedElementsWidget without a properly initialized or passed VersionCompareManager",
      );
    }

    manager.versionCompareStarting.addListener(this._onComparisonStarting);
    manager.versionCompareStarted.addListener(this._onComparisonStarted);
    manager.loadingProgressEvent.addListener(this._onProgressEvent);
    manager.versionCompareStopped.addListener(this._onComparisonStopped);

    this.state = {
      manager,
      loading: manager.isComparing,
      loaded: manager.isComparing,
      menuOpened: false,
      elements: manager.changedElementsManager.entryCache.getAll(),
      currentIModel: manager.currentIModel,
      targetIModel: manager.targetIModel,
      message: IModelApp.localization.getLocalizedString("VersionCompare:changedElementsWidget.comparisonNotActive"),
      description: IModelApp.localization.getLocalizedString("VersionCompare:changedElementsWidget.getStarted"),
    };
  }

  public override componentWillUnmount(): void {
    this.state.manager.versionCompareStarting.removeListener(this._onComparisonStarting);
    this.state.manager.versionCompareStarted.removeListener(this._onComparisonStarted);
    this.state.manager.loadingProgressEvent.removeListener(this._onProgressEvent);
    this.state.manager.versionCompareStopped.removeListener(this._onComparisonStopped);
  }

  private _onFilterChange = () => { };

  private getChangedElementsContent(): ReactElement {
    if (!this.state.currentIModel || !this.state.targetIModel) {
      Logger.logError(
        VersionCompare.logCategory,
        "Current and target IModelConnection not set in the ChangedElementsWidget's state",
      );
      throw new Error("Current and target IModelConnection not set in the ChangedElementsWidget's state");
    }

    return (
      <ChangedElementsInspector
        localization={IModelApp.localization}
        manager={this.state.manager}
        onFilterChange={this._onFilterChange}
      />
    );
  }

  private getLoadingContent(): ReactElement {
    if (this.state.loading) {
      return (
        <div className="itwin-changed-elements-react__cew-empty-component-container">
          <ProgressRadial indeterminate size="large" />
          {this.state.message}
        </div>
      );
    }

    return (
      <div className="itwin-changed-elements-react__cew-empty-component-container">
        <SvgCompare />
        <Text variant="leading">{this.state.message}</Text>
        {this.state.description && <Text isMuted>{this.state.description}</Text>}
      </div>
    );
  }

  private _handleInspect = async (): Promise<void> => {
    await this.state.manager.initializePropertyComparison();
    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.comparisonLegendWidgetInitializeInspect);
  };

  private _handleStopCompare = async (): Promise<void> => {
    VersionCompare.manager?.stopComparison().catch(() => { });
    this.setState({ loaded: false });
  };

  private getHeader(): ReactElement {
    return (
      <div>
        <IconButton
          size="small"
          styleType="borderless"
          onClick={this.props.handleCompare}
          title={IModelApp.localization.getLocalizedString("VersionCompare:compare")}
          data-testid="comparison-legend-widget-compare"
        >
          <SvgAdd />
        </IconButton>
        {
          this.state.loaded &&
          <IconButton
            size="small"
            styleType="borderless"
            onClick={this._handleStopCompare}
            title={IModelApp.localization.getLocalizedString("VersionCompare:changedElementsWidget.stopComparison")}
            data-testid="comparison-legend-widget-stop-comparison"
          >
            <SvgStop />
          </IconButton>
        }
        {
          this.state.loaded && this.state.manager.wantNinezone &&
          <IconButton
            size="small"
            styleType="borderless"
            onClick={this._handleInspect}
            title={IModelApp.localization.getLocalizedString("VersionCompare:changedElementsWidget.inspectProperties")}
            data-testid="comparison-legend-widget-inspectBtn"
          >
            <SvgCompare />
          </IconButton>
        }
      </div>
    );
  }

  public override render(): ReactElement {
    return (
      <div className="itwin-changed-elements-react__widget">
        <div className="itwin-changed-elements-react__widget-title-bar">
          <Text variant="leading">
            {IModelApp.localization.getLocalizedString("VersionCompare:changedElementsWidget.title")}
          </Text>
          {this.getHeader()}
        </div>
        {this.state.loaded ? this.getChangedElementsContent() : this.getLoadingContent()}
      </div>
    );
  }
}
