/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  ConfigurableCreateInfo, UiFramework, WidgetControl, WidgetState, type FrontstageReadyEventArgs, type WidgetConfig
} from "@itwin/appui-react";
import { BeEvent, Logger, type Id64String } from "@itwin/core-bentley";
import { IModelApp, IModelConnection, ScreenViewport } from "@itwin/core-frontend";
import { ScrollPositionMaintainer } from "@itwin/core-react";
import { SvgAdd, SvgCompare, SvgExport, SvgStop } from "@itwin/itwinui-icons-react";
import { IconButton, ProgressRadial } from "@itwin/itwinui-react";
import { Component, ReactElement, createRef } from "react";

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
import { openReportGeneratorDialog } from "../dialogs/ReportGeneratorDialog.js";
import "./ChangedElementsWidget.scss";
import {
  ChangedElementsInspector as EnhancedInspector, ChangedElementsListComponent as EnhancedListComponent
} from "./EnhancedElementsInspector.js";
import { openSelectDialog } from "./VersionCompareSelectWidget.js";

export const changedElementsWidgetAttachToViewportEvent = new BeEvent<(vp: ScreenViewport) => void>();

/** Props for changed elements widget. */
export interface ChangedElementsWidgetProps {
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
}

/**
 * Widget to display changed elements and inspect them further. This widget contains functionality to hide/show type of
 * change. Filter based on properties, inspect models, save visualization filters.
 */
export class ChangedElementsWidget extends Component<ChangedElementsWidgetProps, ChangedElementsWidgetState> {
  public static readonly widgetId = "ChangedElementsWidget";

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
    };
  }

  public override componentWillUnmount(): void {
    this.state.manager.versionCompareStarting.removeListener(this._onComparisonStarting);
    this.state.manager.versionCompareStarted.removeListener(this._onComparisonStarted);
    this.state.manager.loadingProgressEvent.removeListener(this._onProgressEvent);
    this.state.manager.versionCompareStopped.removeListener(this._onComparisonStopped);
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
      <EnhancedInspector
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
    const iModelConnection = UiFramework.getIModelConnection();
    if (iModelConnection) {
      await openSelectDialog(iModelConnection);
    }
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

    openReportGeneratorDialog(this.state.manager, properties.length !== 0 ? properties : undefined);
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
          this.state.manager.wantAppUi &&
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
          this.state.loaded && this.state.manager.wantAppUi &&
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

  public override render(): ReactElement {
    return (
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
    );
  }
}

export interface ChangedElementsWidgetControlOptions {
  manager?: VersionCompareManager | undefined;
}

export class ChangedElementsWidgetControl extends WidgetControl {
  private _activeTreeRef = createRef<HTMLDivElement>();
  private _maintainScrollPosition?: ScrollPositionMaintainer;

  constructor(info: ConfigurableCreateInfo, options: ChangedElementsWidgetControlOptions) {
    super(info, options);

    // Pass in a ref object to let us maintain scroll position
    this.reactNode = <ChangedElementsWidget manager={options?.manager} rootElementRef={this._activeTreeRef} />;
  }

  public override saveTransientState(): void {
    if (this._activeTreeRef.current) {
      this._maintainScrollPosition = new ScrollPositionMaintainer(this._activeTreeRef.current);
    }
  }

  /** Return true so that we maintain state when the widget is closed and do clean-up of scroll position maintainer. */
  public override restoreTransientState(): boolean {
    this._maintainScrollPosition?.dispose();
    this._maintainScrollPosition = undefined;
    return true;
  }
}

const onComparisonStarting = (): void => {
  // Open/Close comparison legend
  UiFramework.frontstages.activeFrontstageDef
    ?.findWidgetDef(ChangedElementsWidget.widgetId)
    ?.setWidgetState(WidgetState.Open);
};

const onComparisonStopped = (): void => {
  EnhancedListComponent.cleanMaintainedState();
};

const onStartFailed = (): void => {
  // Open/Close comparison legend
  UiFramework.frontstages.activeFrontstageDef
    ?.findWidgetDef(ChangedElementsWidget.widgetId)
    ?.setWidgetState(WidgetState.Hidden);
};

const onFrontstageReady = (args: FrontstageReadyEventArgs): void => {
  const manager = VersionCompare.manager;
  if (manager === undefined) {
    return;
  }

  const frontstageIds = new Set(manager.options.appUiOptions?.frontstageIds ?? []);
  if (frontstageIds.has(args.frontstageDef.id)) {
    const widget = args.frontstageDef.findWidgetDef(ChangedElementsWidget.widgetId);
    widget?.setWidgetState(manager.isComparing ? WidgetState.Open : WidgetState.Hidden);
  }
};

/**
 * Setup events for changed elements widget to react to frontstage activated and version compare events to
 * auto-hide/show the widget.
 */
export const bindChangedElementsWidgetEvents = (manager: VersionCompareManager): void => {
  manager.versionCompareStarting.addListener(onComparisonStarting);
  manager.versionCompareStopped.addListener(onComparisonStopped);
  manager.versionCompareStartFailed.addListener(onStartFailed);
  UiFramework.frontstages.onFrontstageReadyEvent.addListener(onFrontstageReady);
};

/** Clean-up events that make the widget automatically react to frontstage activated and version compare events. */
export const unbindChangedElementsWidgetEvents = (manager: VersionCompareManager): void => {
  manager.versionCompareStarting.removeListener(onComparisonStarting);
  manager.versionCompareStopped.removeListener(onComparisonStopped);
  manager.versionCompareStartFailed.removeListener(onStartFailed);
  UiFramework.frontstages.onFrontstageReadyEvent.removeListener(onFrontstageReady);

  // Ensure widget gets closed
  onComparisonStopped();
};

/** Returns a React element containing the ChangedElementsWidgetControl in a ui-framework Widget. */
export const getChangedElementsWidget = (): WidgetConfig => {
  return {
    id: ChangedElementsWidget.widgetId,
    label: IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionCompareLegend"),
    defaultState: WidgetState.Hidden,
    icon: "icon-list",
  };
};
