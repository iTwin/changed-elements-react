/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BeEvent, Logger, type Id64String } from "@itwin/core-bentley";
import {
  IModelApp, IModelConnection, NotifyMessageDetails, OutputMessagePriority, ScreenViewport
} from "@itwin/core-frontend";
import { SvgAdd, SvgCamera, SvgCompare, SvgDocumentation, SvgExport, SvgInfo, SvgStop, SvgWindowPopout } from "@itwin/itwinui-icons-react";
import { Anchor, DropdownMenu, Flex, IconButton, InformationPanel, InformationPanelBody, InformationPanelContent, InformationPanelHeader, InformationPanelWrapper, MenuDivider, MenuExtraContent, MenuItem, ProgressRadial, Text } from "@itwin/itwinui-react";
import { Component, ReactElement } from "react";
import { FilterOptions } from "../SavedFiltersManager.js";
import { type ChangedElementEntry } from "../api/ChangedElementEntryCache.js";
import { ReportProperty } from "../api/ReportGenerator.js";
import { VersionCompareUtils, VersionCompareVerboseMessages } from "../api/VerboseMessages.js";
import { VersionCompare } from "../api/VersionCompare.js";
import { VersionCompareManager } from "../api/VersionCompareManager.js";
import { CenteredDiv } from "../common/CenteredDiv.js";
import { EmptyStateComponent } from "../common/EmptyStateComponent.js";
import { Widget as WidgetComponent } from "../common/Widget/Widget.js";
import { PropertyLabelCache } from "../dialogs/PropertyLabelCache.js";
import { ReportGeneratorDialog } from "../dialogs/ReportGeneratorDialog.js";
import { ChangedElementsInspector } from "./EnhancedElementsInspector.js";

import "./ChangedElementsWidget.scss";
import InformationDialog from "../dialogs/InformationDialog.js";
import InfoButton from "../common/InformationButton.js";
import { VersionCompareSelectDialogV2 } from "./V2Widget/componets/VersionCompareSelectModal.js";

export const changedElementsWidgetAttachToViewportEvent = new BeEvent<(vp: ScreenViewport) => void>();

/** Props for changed elements widget. */
export interface ChangedElementsWidgetProps {
  /** IModel Connection that is being visualized. */
  iModelConnection: IModelConnection;

  /** Optional manager if you don't want the default static VersionCompare.manager to be used. */
  manager?: VersionCompareManager;

  /** Used to maintain scroll positions in widget controls. */
  rootElementRef?: React.Ref<HTMLDivElement>;
}

export interface ChangedElementsWidgetState {
  loading: boolean;
  loaded: boolean;
  manager: VersionCompareManager;
  currentIModel: IModelConnection | undefined;
  targetIModel: IModelConnection | undefined;
  elements: ChangedElementEntry[];
  message: string;
  description?: string;
  menuOpened: boolean;
  versionSelectDialogVisible: boolean;
  informationDialogVisible: boolean;
  reportDialogVisible: boolean;
  reportProperties: ReportProperty[] | undefined;
}

/**
 * Widget to display changed elements and inspect them further. This widget contains functionality to hide/show type of
 * change. Filter based on properties, inspect models, save visualization filters.
 */
export class ChangedElementsWidget extends Component<ChangedElementsWidgetProps, ChangedElementsWidgetState> {
  public static readonly widgetId = "ChangedElementsWidget";

  private readonly WidgetInfo = `
    Discover what has changed between the two iModel versions. To get started, click
    + button. Then choose the version to compare with ,
    and the data processing will begin in the background. Processing time may vary based on the data complexity.A notification will appear when results are available.`;


  private _onComparisonStarting = (): void => {
    this.setState({
      loading: true,
      loaded: false,
      message: IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.loadingComparison"),
      description: "",
    });
  };

  private _onComparisonStopped = (): void => {
    this.setState({
      message: IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.comparisonNotActive"),
      description: IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.comparisonGetStarted"),
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
      versionSelectDialogVisible: false,
      informationDialogVisible: false,
      reportDialogVisible: false,
      reportProperties: undefined,
    });
  };

  private _onProgressEvent = (message: string): void => {
    this.setState({ message, description: "" });
  };

  private _refreshCheckboxesEvent = new BeEvent<() => void>();

  constructor(props: ChangedElementsWidgetProps) {
    super(props);

    const manager = props.manager ?? VersionCompare.manager;
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
      message: IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.comparisonNotActive"),
      description: IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.comparisonGetStarted"),
      versionSelectDialogVisible: false,
      informationDialogVisible: false,
      reportDialogVisible: false,
      reportProperties: undefined,
    };
  }

  public override componentWillUnmount(): void {
    this.state.manager.versionCompareStarting.removeListener(this._onComparisonStarting);
    this.state.manager.versionCompareStarted.removeListener(this._onComparisonStarted);
    this.state.manager.loadingProgressEvent.removeListener(this._onProgressEvent);
    this.state.manager.versionCompareStopped.removeListener(this._onComparisonStopped);
    reportIsBeingGenerated = false;
  }

  private _currentFilterOptions: FilterOptions | undefined;

  private _onFilterChange = (options: FilterOptions): void => {
    this._currentFilterOptions = options;
  };

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
        listRef={this.props.rootElementRef}
        manager={this.state.manager}
        onFilterChange={this._onFilterChange}
        onShowAll={this._showAll}
        onHideAll={this._hideAll}
        onInvert={this._invert}
      />
    );
  }

  private getLoadingContent(): ReactElement {
    return (
      <CenteredDiv data-testid="clw-loading-content">
        {
          this.state.loading &&
          <>
            <ProgressRadial indeterminate size="large" />
            <span className="comparison-legend-message">
              {this.state.message}
            </span>
          </>
        }
        {
          !this.state.loading &&
          <EmptyStateComponent icon="icon-compare" title={this.state.message} description={this.state.description} />
        }
      </CenteredDiv>
    );
  }

  private _showAll = async (): Promise<void> => {
    const set = this.state.manager.changedElementsManager.entryCache.getIdsOfAllChangedElements();
    const visualizationManager = this.state.manager.visualization?.getSingleViewVisualizationManager();
    await visualizationManager?.toggleElementsVisibility(true, set, false, false);

    this._refreshCheckboxesEvent.raiseEvent();
    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.comparisonLegendWidgetShowAllSuccessful);
  };

  private _hideAll = async (): Promise<void> => {
    const set = this.state.manager.changedElementsManager.entryCache.getIdsOfAllChangedElements();
    const visualizationManager = this.state.manager.visualization?.getSingleViewVisualizationManager();
    await visualizationManager?.toggleElementsVisibility(false, set, true, true);

    this._refreshCheckboxesEvent.raiseEvent();
    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.comparisonLegendWidgetHideAllSuccessful);
  };

  private _invert = async (): Promise<void> => {
    const visualizationManager = this.state.manager.visualization?.getSingleViewVisualizationManager();
    if (visualizationManager) {
      // Get all element Ids that are in "comparison"
      const set = this.state.manager.changedElementsManager.entryCache.getIdsOfAllChangedElements();
      const hiddenElements = visualizationManager.getNeverDrawn();
      // Show hidden elements
      await visualizationManager.showElements(hiddenElements);
      // Take the elements that were not hidden
      const difference = new Set<Id64String>([...set].filter((value: string) => !hiddenElements.has(value)));
      // Hide them
      await visualizationManager.setHiddenElements(difference);
      this._refreshCheckboxesEvent.raiseEvent();
      VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.comparisonLegendWidgetInvertSuccessful);
    }
  };

  /** Go into property comparison. */
  private _handleInspect = async (): Promise<void> => {
    this.state.manager.featureTracking.trackInspectElementTool();
    await this.state.manager.initializePropertyComparison();
    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.comparisonLegendWidgetInitializeInspect);
  };

  private _handleCompare = async (): Promise<void> => {
    this.setState({ versionSelectDialogVisible: true });
  };

  private _handleInfo = (): void => {
    this.setState({ informationDialogVisible: true });
  };

  private _handleInfoDialogClose = (): void => {
    this.setState({ informationDialogVisible: false });
  };

  private _handleVersionSelectDialogClose = (): void => {
    this.setState({ versionSelectDialogVisible: false });
  };

  private _handleStopCompare = async (): Promise<void> => {
    VersionCompare.manager?.stopComparison().catch(() => { });
    this.setState({ loaded: false });
  };

  private _handleReportGeneration = async (): Promise<void> => {
    let properties: ReportProperty[] = [];
    if (this._currentFilterOptions !== undefined && this.state.manager.currentIModel) {
      const propertyNames: string[] = [];
      for (const property of this._currentFilterOptions.wantedProperties) {
        // Get all enabled properties
        if (property[1]) {
          propertyNames.push(property[0]);
        }
      }

      // Load labels for properties to be displayed
      if (!PropertyLabelCache.labelsLoaded(propertyNames)) {
        await PropertyLabelCache.loadLabels(
          this.state.manager.currentIModel,
          propertyNames.map((propertyName) => ({ classId: "", propertyName })),
        );
      }

      properties = propertyNames.map((propertyName) => ({
        propertyName,
        label: PropertyLabelCache.getLabel("", propertyName) ?? propertyName,
      }));
    }

    this.openReportDialog(properties.length > 0 ? properties : undefined);
  };

  private getHeader(): ReactElement {
    return (
      <>
        <IconButton
          size="small"
          styleType="borderless"
          onClick={this._handleCompare}
          title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.compare")}
          data-testid="comparison-legend-widget-compare"
        >
          <SvgAdd />
        </IconButton>
        <InfoButton title={"Version Comparison"} message={this.WidgetInfo} />
        {
          this.state.loaded &&
          <IconButton
            size="small"
            styleType="borderless"
            onClick={this._handleStopCompare}
            title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.stopComparison")}
            data-testid="comparison-legend-widget-stop-comparison"
          >
            <SvgStop />
          </IconButton>
        }
        {
          this.state.manager.wantReportGeneration &&
          this.state.loaded &&
          <IconButton
            size="small"
            styleType="borderless"
            onClick={this._handleReportGeneration}
            title={IModelApp.localization.getLocalizedString("VersionCompare:report.reportGeneration")}
          >
            <SvgExport />
          </IconButton>
        }
        {
          this.state.loaded &&
          <IconButton
            size="small"
            styleType="borderless"
            onClick={this._handleInspect}
            title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.inspectProperties")}
            data-testid="comparison-legend-widget-inspectBtn"
          >
            <SvgCompare />
          </IconButton>
        }
      </>
    );
  }

  private openReportDialog = (properties: ReportProperty[] | undefined): void => {
    if (reportIsBeingGenerated) {
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(
          OutputMessagePriority.Error,
          IModelApp.localization.getLocalizedString("VersionCompare:report.reportInProgressError_brief"),
        ),
      );
      return;
    }

    reportIsBeingGenerated = true;
    this.setState({ reportDialogVisible: true, reportProperties: properties });
  };

  private closeReportDialog = (): void => {
    reportIsBeingGenerated = false;
    this.setState({ reportDialogVisible: false, reportProperties: undefined });
  };

  public override render(): ReactElement {
    return (
      <>
        <WidgetComponent data-testid="comparison-legend-widget">
          <WidgetComponent.Header>
            <WidgetComponent.Header.Label>
              {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionCompare")}
            </WidgetComponent.Header.Label>
            <WidgetComponent.Header.Actions>
              {this.getHeader()}
            </WidgetComponent.Header.Actions>
          </WidgetComponent.Header>
          <WidgetComponent.Body data-testid="comparison-legend-widget-content">
            {this.state.loaded ? this.getChangedElementsContent() : this.getLoadingContent()}
          </WidgetComponent.Body>
        </WidgetComponent>
        {
          this.state.reportDialogVisible &&
          <ReportGeneratorDialog
            isOpen
            onClose={this.closeReportDialog}
            manager={this.state.manager}
            initialProperties={this.state.reportProperties}
          />
        }
        {
          this.state.versionSelectDialogVisible &&
          <VersionCompareSelectDialogV2
            isOpen
            iModelConnection={this.props.iModelConnection}
            onClose={this._handleVersionSelectDialogClose}
          />
        }
      </>
    );
  }
}

/**
 * Make sure that we are not letting the user start multiple reports in parallel to avoid overwhelming backend with
 * requests.
 *  */
let reportIsBeingGenerated = false;
