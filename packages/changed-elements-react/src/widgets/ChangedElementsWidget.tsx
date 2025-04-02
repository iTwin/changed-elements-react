/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BeEvent, Logger, type Id64String } from "@itwin/core-bentley";
import {
  IModelApp, NotifyMessageDetails, OutputMessagePriority, type IModelConnection, type ScreenViewport
} from "@itwin/core-frontend";
import { SvgAdd, SvgCompare, SvgExport, SvgStop } from "@itwin/itwinui-icons-react";
import { IconButton, ProgressRadial, Text, useToaster } from "@itwin/itwinui-react";
import { Component, type ReactElement, type ReactNode } from "react";

import { namedVersionSelectorContext } from "../NamedVersionSelector/NamedVersionSelectorContext.js";
import type { FilterOptions } from "../SavedFiltersManager.js";
import type { ChangedElementEntry } from "../api/ChangedElementEntryCache.js";
import type { ReportProperty } from "../api/ReportGenerator.js";
import { VersionCompareUtils, VersionCompareVerboseMessages } from "../api/VerboseMessages.js";
import { VersionCompare } from "../api/VersionCompare.js";
import { VersionCompareManager } from "../api/VersionCompareManager.js";
import { CenteredDiv } from "../common/CenteredDiv.js";
import { EmptyStateComponent } from "../common/EmptyStateComponent.js";
import { Widget as WidgetComponent } from "../common/Widget/Widget.js";
import { PropertyLabelCache } from "../dialogs/PropertyLabelCache.js";
import { ReportGeneratorDialog } from "../dialogs/ReportGeneratorDialog.js";
import { ChangedElementsInspector } from "./EnhancedElementsInspector.js";
import { FeedbackButton } from "./FeedbackButton.js";
import InfoButton from "./InformationButton.js";
import { VersionCompareSelectDialog } from "./VersionCompareSelectWidget.js";
import {
  ComparisonJobUpdateType, VersionCompareSelectProviderV2
} from "./comparisonJobWidget/components/VersionCompareDialogProvider.js";
import {
  VersionCompareSelectDialogV2
} from "./comparisonJobWidget/components/VersionCompareSelectModal.js";
import { JobAndNamedVersions } from "./comparisonJobWidget/models/ComparisonJobModels.js";

import "./ChangedElementsWidget.scss";
import { EventActionTuple } from "../common/types.js";

export const changedElementsWidgetAttachToViewportEvent = new BeEvent<(vp: ScreenViewport) => void>();

/** Props for changed elements widget. */
export interface ChangedElementsWidgetProps {
  /** IModel Connection that is being visualized. */
  iModelConnection: IModelConnection;

  /**
   * Optional manager if you don't want the default static VersionCompare.manager
   * to be used.
   */
  manager?: VersionCompareManager;

  /** Used to maintain scroll positions in widget controls. */

  rootElementRef?: React.Ref<HTMLDivElement>;

  /**
   * Optional. If true will use v2 dialog and will run comparison jobs for faster
   * comparisons.
   * @beta
   */
  useV2Widget?: boolean;

  /**
 * Optional. Only true if the new named version selector is being used.
 * Do not provide if not running experimental selector.
 * @alpha
 */
  usingExperimentalSelector?: boolean;

  /** Optional. Supply a link for feedback. Should only be used if v2 is enabled. */
  feedbackUrl?: string;

  /**
   * Optional. When enabled will toast messages regarding job status. If not defined
   * will default to false and will not show toasts (Only for V2).
   */
  enableComparisonJobUpdateToasts?: boolean;

  /**
   * On Job Update (Only for V2). Optional. A callback function for handling job
   * updates.
   *
   * @param comparisonJobUpdateType param for the type of update:
   *  - "JobComplete" = invoked when job is completed
   *  - "JobError" = invoked on job error
   *  - "JobProgressing" = invoked on job is started
   *  - "ComparisonVisualizationStarting" = invoked on when version compare visualization is starting
   * @param toaster from iTwin Ui's useToaster hook. This is necessary for showing toast messages.
   * @param jobAndNamedVersion param contain job and named version info to be passed to call back
   */
  onJobUpdate?: (
    comparisonJobUpdateType: ComparisonJobUpdateType,
    toaster: ReturnType<typeof useToaster>,
    jobAndNamedVersions?: JobAndNamedVersions,
  ) => Promise<void>;

  /** Optional prop for a user supplied component to handle managing named versions. */
  manageNamedVersionsSlot?: ReactNode | undefined;

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
 * Widget to display changed elements and inspect them further. This widget contains
 * functionality to hide/show type of change. Filter based on properties, inspect
 * models, save visualization filters.
 */
export class ChangedElementsWidget extends Component<ChangedElementsWidgetProps, ChangedElementsWidgetState> {
  public static readonly widgetId = "ChangedElementsWidget";
  private readonly eventListeners: EventActionTuple[] = [];

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
      description: this.props.useV2Widget
        ? IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionCompareGettingStartedV2")
        : IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.comparisonGetStarted"),
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
    this.setState({ message, loading: true, description: "" });
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
    this.state = {
      manager,
      loading: false,
      loaded: false,
      menuOpened: false,
      elements: manager.changedElementsManager.entryCache.getAll(),
      currentIModel: manager.currentIModel,
      targetIModel: manager.targetIModel,
      message: IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.comparisonNotActive"),
      description: this.props.useV2Widget
        ? IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionCompareGettingStartedV2")
        : IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.comparisonGetStarted"),
      versionSelectDialogVisible: false,
      informationDialogVisible: false,
      reportDialogVisible: false,
      reportProperties: undefined,
    };
  }

  public override componentDidMount() {
    const { manager } = this.state;
    this.addListeners([
      { event: manager.versionCompareStarting, action: this._onComparisonStarting },
      { event: manager.versionCompareStarted, action: this._onComparisonStarted },
      { event: manager.loadingProgressEvent, action: this._onProgressEvent },
      { event: manager.versionCompareStopped, action: this._onComparisonStopped },
    ]);
    this.setState({
      loading: this.props.usingExperimentalSelector ? !manager.isComparisonReady : manager.isComparing,
      loaded: this.props.usingExperimentalSelector ? manager.isComparisonReady : manager.isComparing,
      message: this.props.usingExperimentalSelector ? IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.loadingComparison")
        : IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.comparisonNotActive"),
    });
  }


  public override componentWillUnmount(): void {
    this.removeListeners();
    reportIsBeingGenerated = false;
  }

  private addListeners(eventActionTuples: EventActionTuple[]): void {
    eventActionTuples.forEach((tuple) => {
      tuple.event.addListener(tuple.action);
      this.eventListeners.push(tuple);
    });
  }

  private removeListeners(): void {
    this.eventListeners.forEach((tuple) => {
      tuple.event.removeListener(tuple.action);
    });
    this.eventListeners.length = 0;
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

  public openReportDialog = async (): Promise<void> => {
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

    VersionCompare.manager?.featureTracking?.trackChangeReportGenerationUsage();
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
    this.setState({
      reportDialogVisible: true,
      reportProperties: properties.length > 0 ? properties : undefined,
    });
  };

  private closeReportDialog = (): void => {
    reportIsBeingGenerated = false;
    this.setState({ reportDialogVisible: false, reportProperties: undefined });
  };

  public override render(): ReactElement {
    return (
      <>
        <WidgetComponent data-testid="comparison-legend-widget">
          <namedVersionSelectorContext.Consumer>
            {
              ({ contextExists }) => (
                !contextExists &&
                <WidgetComponent.Header>
                  <WidgetComponent.Header.Label>
                    {IModelApp.localization.getLocalizedString(
                      "VersionCompare:versionCompare.versionCompare",
                    )}
                  </WidgetComponent.Header.Label>
                  <WidgetComponent.Header.Actions>
                    <ChangedElementsHeaderButtons
                      loaded={this.state.loaded}
                      useV2Widget={this.props.useV2Widget}
                      onOpenVersionSelector={this._handleCompare}
                      onStopComparison={this._handleStopCompare}
                      onOpenReportDialog={
                        this.state.manager.wantReportGeneration ? this.openReportDialog : undefined
                      }
                      onInspect={this._handleInspect}
                    />
                  </WidgetComponent.Header.Actions>
                </WidgetComponent.Header>
              )
            }
          </namedVersionSelectorContext.Consumer>
          <WidgetComponent.Body data-testid="comparison-legend-widget-content">
            {
              this.state.loaded
                ? this.getChangedElementsContent()
                : this.state.loading
                  ? <LoadingContent>{this.state.message}</LoadingContent>
                  : (
                    <EmptyStateComponent
                      icon="icon-compare"
                      title={this.state.message}
                      description={this.state.description}
                    />
                  )
            }
          </WidgetComponent.Body>
          {
            this.props.useV2Widget && this.props.feedbackUrl &&
            <WidgetComponent.ToolBar>
              <FeedbackButton
                data-testid="comparison-widget-v2-feedback-btn"
                feedbackUrl={this.props.feedbackUrl ?? ""}
              />
            </WidgetComponent.ToolBar>
          }
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
          this.props.useV2Widget
            ? (
              <VersionCompareSelectProviderV2
                onJobUpdate={this.props.onJobUpdate}
                enableComparisonJobUpdateToasts={this.props.enableComparisonJobUpdateToasts}
              >
                {
                  this.state.versionSelectDialogVisible &&
                  <VersionCompareSelectDialogV2
                    data-testid="comparison-widget-v2-modal"
                    iModelConnection={this.props.iModelConnection}
                    onClose={this._handleVersionSelectDialogClose}
                    manageNamedVersionsSlot={this.props.manageNamedVersionsSlot}
                  />
                }
              </VersionCompareSelectProviderV2>
            ) : (
              this.state.versionSelectDialogVisible &&
              <VersionCompareSelectDialog
                isOpen
                iModelConnection={this.props.iModelConnection}
                onClose={this._handleVersionSelectDialogClose}
              />
            )
        }
      </>
    );
  }
}

/**
 * Make sure that we are not letting the user start multiple reports in parallel
 * to avoid overwhelming backend with requests.
 */
let reportIsBeingGenerated = false;

interface ChangedElementsHeaderButtonsProps {
  loaded?: boolean | undefined;
  useV2Widget?: boolean | undefined;
  useNewNamedVersionSelector?: boolean | undefined;
  onlyInfo?: boolean | undefined;
  onOpenVersionSelector?: (() => void) | undefined;
  onStopComparison?: (() => void) | undefined;
  onOpenReportDialog?: (() => void) | undefined;
  onInspect?: (() => void) | undefined;
}

export function ChangedElementsHeaderButtons(props: ChangedElementsHeaderButtonsProps): ReactElement {
  const t = (key: string) => IModelApp.localization.getLocalizedString(key);

  const paragraphs = t("VersionCompare:versionCompare.versionCompareInfoV2").split("\n");
  const infoButton = (
    <InfoButton>
      <Text variant="leading">
        {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionCompare")}
      </Text>
      {paragraphs.map((paragraph, i) => <p key={i}>{paragraph}</p>)}
    </InfoButton>
  );

  if (props.onlyInfo) {
    return infoButton;
  }

  return (
    <>
      {
        !props.useNewNamedVersionSelector &&
        <IconButton
          size="small"
          styleType="borderless"
          onClick={props.onOpenVersionSelector}
          title={t("VersionCompare:versionCompare.compare")}
          data-testid="comparison-legend-widget-compare"
        >
          <SvgAdd />
        </IconButton>
      }
      {
        props.useNewNamedVersionSelector &&
        infoButton
      }
      {
        !props.useNewNamedVersionSelector && props.useV2Widget &&
        <InfoButton data-testid="comparison-legend-widget-info" >
          <Text variant="leading">{t("VersionCompare:versionCompare.versionCompare")}</Text>
          <Text>{t("VersionCompare:versionCompare.versionCompareInfo")}</Text>
        </InfoButton>
      }
      {
        !props.useNewNamedVersionSelector && props.loaded &&
        <IconButton
          size="small"
          styleType="borderless"
          onClick={props.onStopComparison}
          title={t("VersionCompare:versionCompare.stopComparison")}
          data-testid="comparison-legend-widget-stop-comparison"
        >
          <SvgStop />
        </IconButton>
      }
      {
        props.onOpenReportDialog && props.loaded &&
        <IconButton
          size="small"
          styleType="borderless"
          onClick={props.onOpenReportDialog}
          title={t("VersionCompare:report.reportGeneration")}
          data-testid="comparison-legend-widget-report-generation"
        >
          <SvgExport />
        </IconButton>
      }
      {
        props.loaded &&
        <IconButton
          size="small"
          styleType="borderless"
          onClick={props.onInspect}
          title={t("VersionCompare:versionCompare.inspectProperties")}
          data-testid="comparison-legend-widget-inspectBtn"
        >
          <SvgCompare />
        </IconButton>
      }
    </>
  );
}

interface LoadingContentProps {
  progress?: { current: number; max: number; } | undefined;
  children?: ReactNode | undefined;
}

export function LoadingContent(props: LoadingContentProps): ReactElement {
  const { progress, children } = props;
  const value = progress && Math.floor(100.0 * progress.current / (progress.max || 1));
  return (
    <CenteredDiv data-testid="clw-loading-content">
      <ProgressRadial indeterminate={!value} value={value} size="large" />
      <Text className="comparison-legend-message">
        {children}
      </Text>
    </CenteredDiv>
  );
}
