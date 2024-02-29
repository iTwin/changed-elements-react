/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BeEvent, Logger, type Id64String } from "@itwin/core-bentley";
import {
  IModelApp, IModelConnection, NotifyMessageDetails, OutputMessagePriority, ScreenViewport
} from "@itwin/core-frontend";
import { SvgAdd, SvgCompare, SvgExport, SvgStop } from "@itwin/itwinui-icons-react";
import { IconButton, ProgressRadial } from "@itwin/itwinui-react";
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
import InfoButton from "./InformationButton.js";
import { VersionCompareSelectDialogV2 } from "./comparisonJobWidget/components/VersionCompareSelectModal.js";
import { FeedbackButton } from "./FeedbackButton.js";
import { VersionCompareSelectDialog } from "./VersionCompareSelectWidget.js";
import { ComparisonJobUpdateType, VersionCompareSelectProviderV2 } from "./comparisonJobWidget/components/VersionCompareDialogProvider.js";
import { JobAndNamedVersions } from "./comparisonJobWidget/models/ComparisonJobModels.js";
import { ManageNamedVersionsProps } from "./comparisonJobWidget/components/VersionCompareManageNamedVersions.js";

export const changedElementsWidgetAttachToViewportEvent = new BeEvent<(vp: ScreenViewport) => void>();

/** Props for changed elements widget. */
export interface ChangedElementsWidgetProps {
  /** IModel Connection that is being visualized. */
  iModelConnection: IModelConnection;

  /** Optional manager if you don't want the default static VersionCompare.manager to be used. */
  manager?: VersionCompareManager;

  /** Used to maintain scroll positions in widget controls. */
  rootElementRef?: React.Ref<HTMLDivElement>;
  /**Optional. If true will use v2 dialog and will run comparison jobs for faster comparisons @beta.*/
  useV2Widget?: boolean;
  /** Optional. Supply a link for feedback. Should only be used if v2 is enabled*/
  feedbackUrl?: string;
  /** Optional. When enabled will toast messages regarding job status. If not defined will default to false and will not show toasts (Only for V2). */
  enableComparisonJobUpdateToasts?: boolean;
  /** On Job Update (Only for V2)
 * Optional. a call back function for handling job updates.
 * @param comparisonJobUpdateType param for the type of update:
 *  - "JobComplete" = invoked when job is completed
 *  - "JobError" = invoked on job error
 *  - "JobProgressing" = invoked on job is started
 *  - "ComparisonVisualizationStarting" = invoked on when version compare visualization is starting
 * @param jobAndNamedVersion param contain job and named version info to be passed to call back
*/
  onJobUpdate?: (comparisonJobUpdateType: ComparisonJobUpdateType, jobAndNamedVersions?: JobAndNamedVersions) => Promise<void>;

  /**
 * Props for a href that will, on a click, navigate to the provided link or invoke the provided onClick method.
 *
 * Please note if href and both on click are provided; the component will not use on click but will use href instead.
 *
 * ManageNamedVersionLabel will default to `Manage named versions` if not provided.
 */
  manageNamedVersionProps?: ManageNamedVersionsProps;
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

  private readonly _widgetInfo = IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionCompareInfo");

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
      description: this.props.useV2Widget ? IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionCompareGettingStartedV2") : IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.comparisonGetStarted"),
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
      description: this.props.useV2Widget ? IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionCompareGettingStartedV2") : IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.comparisonGetStarted"),
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
        {
          this.props.useV2Widget &&
          <InfoButton data-testid="⁠comparison-legend-widget-info" title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionCompare")} message={this._widgetInfo} />
        }
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
            data-testid="comparison-legend-widget-report-generation"
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
          <WidgetComponent.ToolBar>
            {(this.props.useV2Widget && (!!this.props.feedbackUrl)) && <FeedbackButton data-testid="⁠comparison-widget-v2-feedback-btn" feedbackUrl={this.props.feedbackUrl ?? ""}></FeedbackButton>}
          </WidgetComponent.ToolBar>
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
        {this.props.useV2Widget ?
          <VersionCompareSelectProviderV2 onJobUpdate={this.props.onJobUpdate} enableComparisonJobUpdateToasts={this.props.enableComparisonJobUpdateToasts}>
            {this.state.versionSelectDialogVisible &&
              <VersionCompareSelectDialogV2
                data-testid="⁠comparison-widget-v2-modal"
                iModelConnection={this.props.iModelConnection}
                onClose={this._handleVersionSelectDialogClose}
                manageNamedVersionProps={this.props.manageNamedVersionProps}
              />}
          </VersionCompareSelectProviderV2> :
          this.state.versionSelectDialogVisible &&
          <VersionCompareSelectDialog
            isOpen
            iModelConnection={this.props.iModelConnection}
            onClose={this._handleVersionSelectDialogClose}
          />}
      </>
    );
  }
}

/**
 * Make sure that we are not letting the user start multiple reports in parallel to avoid overwhelming backend with
 * requests.
 *  */
let reportIsBeingGenerated = false;
