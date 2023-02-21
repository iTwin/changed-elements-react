/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { WidgetState } from "@itwin/appui-abstract";
import {
  ConfigurableCreateInfo, FrontstageManager, UiFramework, Widget, WidgetControl, type FrontstageReadyEventArgs
} from "@itwin/appui-react";
import { BeEvent, Logger, type Id64String } from "@itwin/core-bentley";
import { IModelApp, IModelConnection, ScreenViewport } from "@itwin/core-frontend";
import { ScrollPositionMaintainer } from "@itwin/core-react";
import { SvgAdd, SvgCompare, SvgStop } from "@itwin/itwinui-icons-react";
import { IconButton, ProgressRadial } from "@itwin/itwinui-react";
import * as React from "react";

import { ChangeElementType, type ChangedElementEntry } from "../api/ChangedElementEntryCache";
import { VersionCompareUtils, VersionCompareVerboseMessages } from "../api/VerboseMessages";
import { VersionCompare } from "../api/VersionCompare";
import { VersionCompareManager } from "../api/VersionCompareManager";
import { CenteredDiv } from "../common/CenteredDiv";
import { EmptyStateComponent } from "../common/EmptyStateComponent";
import { Widget as WidgetComponent } from "../common/Widget/Widget";
import "./ChangedElementsWidget.scss";
import {
  ChangedElementsInspector as EnhancedInspector, ChangedElementsListComponent as EnhancedListComponent
} from "./EnhancedElementsInspector";
import { openSelectDialog } from "./VersionCompareSelectWidget";

export const changedElementsWidgetAttachToViewportEvent = new BeEvent<
  (vp: ScreenViewport) => void
>();

/** Props for changed elements widget */
export interface ChangedElementsWidgetProps {
  /** Optional manager if you don't want the default static VersionCompare.manager to be used */
  manager?: VersionCompareManager;
  /** Used to maintain scroll positions in widget controls */
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
  filterBy?: ChangeElementType;
}

/**
 * Widget to display changed elements and inspect them further
 * This widget contains functionality to hide/show type of change
 * Filter based on properties, inspect models, save visualization filters
 */
export class ChangedElementsWidget extends React.Component<
  ChangedElementsWidgetProps,
  ChangedElementsWidgetState
> {
  public static get widgetId() {
    return "ChangedElementsWidget";
  }
  private _onComparisonStarting = () => {
    this.setState({
      loading: true,
      loaded: false,
      message: IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.loadingComparison"),
      description: "",
    });
  };

  private _onComparisonStopped = () => {
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
  ) => {
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

  private _onProgressEvent = (message: string) => {
    this.setState({
      message,
      description: "",
    });
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

    //In UI 1.0, when the user starts version compare, the widget is first
    //displayed and then loading messages are updated accordingly.
    //By not setting message (or description), we prevent a quick flashing
    //of an unnecessary text string.
    //In UI 2.0, the widget is always shown, so it must have an initial
    //message (and description).

    this.state = {
      manager,
      loading: manager.isComparing,
      loaded: manager.isComparing,
      menuOpened: false,
      elements: manager.changedElementsManager.entryCache.getAll(),
      currentIModel: manager.currentIModel,
      targetIModel: manager.targetIModel,
      message: manager.wantNinezone
        ? IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.comparisonNotActive")
        : "",
      description: manager.wantNinezone
        ? IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.comparisonGetStarted")
        : "",
    };
  }

  public override componentWillUnmount() {
    this.state.manager.versionCompareStarting.removeListener(this._onComparisonStarting);
    this.state.manager.versionCompareStarted.removeListener(this._onComparisonStarted);
    this.state.manager.loadingProgressEvent.removeListener(this._onProgressEvent);
    this.state.manager.versionCompareStopped.removeListener(this._onComparisonStopped);
  }

  private getChangedElementsContent() {
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
        onShowAll={this._showAll}
        onHideAll={this._hideAll}
        onInvert={this._invert}
      />
    );
  }

  private getLoadingContent() {
    return (
      <CenteredDiv data-testid="clw-loading-content">
        {this.state.loading && (
          <>
            <ProgressRadial indeterminate size="large" />
            <span className="comparison-legend-message">
              {this.state.message}
            </span>
          </>
        )}
        {!this.state.loading && (
          <EmptyStateComponent
            icon="icon-compare"
            title={this.state.message}
            description={this.state.description}
          />
        )}
      </CenteredDiv>
    );
  }

  private _showAll = async () => {
    const set =
      this.state.manager.changedElementsManager.entryCache.getIdsOfAllChangedElements();
    const visualizationManager =
      this.state.manager.visualization?.getSingleViewVisualizationManager();
    if (visualizationManager !== undefined) {
      await visualizationManager.toggleElementsVisibility(
        true,
        set,
        false,
        false,
      );
    }
    this._refreshCheckboxesEvent.raiseEvent();
    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.comparisonLegendWidgetShowAllSuccessful);
  };

  private _hideAll = async () => {
    const set = this.state.manager.changedElementsManager.entryCache.getIdsOfAllChangedElements();
    const visualizationManager = this.state.manager.visualization?.getSingleViewVisualizationManager();
    if (visualizationManager !== undefined) {
      await visualizationManager.toggleElementsVisibility(
        false,
        set,
        true,
        true,
      );
    }
    this._refreshCheckboxesEvent.raiseEvent();
    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.comparisonLegendWidgetHideAllSuccessful);
  };

  private _invert = async () => {
    const visualizationManager =
      this.state.manager.visualization?.getSingleViewVisualizationManager();
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

  /** Go into property comparison */
  private _handleInspect = async () => {
    this.state.manager.featureTracking.trackInspectElementTool();
    await this.state.manager.initializePropertyComparison();
    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.comparisonLegendWidgetInitializeInspect);
  };

  private _handleCompare = async () => {
    const iModelConnection = UiFramework.getIModelConnection();
    if (iModelConnection) {
      await openSelectDialog(iModelConnection);
    }
  };

  private _handleStopCompare = async () => {
    VersionCompare.manager
      ?.stopComparison()
      .then()
      .catch(() => {
        /* No-op */
      });
    this.setState({ loaded: false });
  };

  private getHeader() {
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
        {this.state.loaded && (
          <IconButton
            size="small"
            styleType="borderless"
            onClick={this._handleStopCompare}
            title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.stopComparison")}
            data-testid="comparison-legend-widget-stop-comparison"
          >
            <SvgStop />
          </IconButton>
        )}
        {this.state.loaded && this.state.manager.wantNinezone && (
          <IconButton
            size="small"
            styleType="borderless"
            onClick={this._handleInspect}
            title={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.inspectProperties")}
            data-testid="comparison-legend-widget-inspectBtn"
          >
            <SvgCompare />
          </IconButton>
        )}
      </>
    );
  }

  public override render() {
    return (
      <WidgetComponent data-testid="comparison-legend-widget">
        <WidgetComponent.TitleBar>
          <WidgetComponent.TitleBar.Title>
            {IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionCompare")}
          </WidgetComponent.TitleBar.Title>
          <WidgetComponent.TitleBar.Content>
            {this.getHeader()}
          </WidgetComponent.TitleBar.Content>
        </WidgetComponent.TitleBar>
        <WidgetComponent.Content data-testid="comparison-legend-widget-content">
          {this.state.loaded
            ? this.getChangedElementsContent()
            : this.getLoadingContent()}
        </WidgetComponent.Content>
      </WidgetComponent>
    );
  }
}

export interface ChangedElementsWidgetControlOptions {
  manager?: VersionCompareManager | undefined;
}

/** ChangedElementsWidgetControl [[WidgetControl]] */
export class ChangedElementsWidgetControl extends WidgetControl {
  private _activeTreeRef = React.createRef<HTMLDivElement>();
  private _maintainScrollPosition?: ScrollPositionMaintainer;

  constructor(info: ConfigurableCreateInfo, options: ChangedElementsWidgetControlOptions) {
    super(info, options);

    // Pass in a ref object to let us maintain scroll position
    this.reactNode = (
      <ChangedElementsWidget
        manager={options?.manager}
        rootElementRef={this._activeTreeRef}
      />
    );
  }

  public override saveTransientState(): void {
    if (this._activeTreeRef.current) {
      this._maintainScrollPosition = new ScrollPositionMaintainer(this._activeTreeRef.current);
    }
  }

  /** Return true so that we maintain state when the widget is closed and do clean-up of scroll position maintainer */
  public override restoreTransientState(): boolean {
    if (this._maintainScrollPosition) {
      this._maintainScrollPosition.dispose();
      this._maintainScrollPosition = undefined;
    }

    return true;
  }
}

const onComparisonStarting = () => {
  // Open/Close comparison legend
  const activeStage = FrontstageManager.activeFrontstageDef;
  if (activeStage) {
    const propertyWidget = activeStage.findWidgetDef(ChangedElementsWidget.widgetId);
    if (propertyWidget) {
      propertyWidget.setWidgetState(WidgetState.Open);
    }
  }
};

const onComparisonStopped = () => {
  EnhancedListComponent.cleanMaintainedState();
};

const onStartFailed = () => {
  // Open/Close comparison legend
  const activeStage = FrontstageManager.activeFrontstageDef;
  if (activeStage) {
    const propertyWidget = activeStage.findWidgetDef(ChangedElementsWidget.widgetId);
    if (propertyWidget) {
      propertyWidget.setWidgetState(WidgetState.Hidden);
    }
  }
};

const onFrontstageReady = (args: FrontstageReadyEventArgs) => {
  const manager = VersionCompare.manager;
  if (manager === undefined) {
    return;
  }

  const frontstageIds = new Set(manager?.options.ninezoneOptions?.frontstageIds ?? []);
  if (frontstageIds.has(args.frontstageDef.id)) {
    const widget = args.frontstageDef.findWidgetDef(ChangedElementsWidget.widgetId);
    if (widget) {
      widget.setWidgetState(manager.isComparing ? WidgetState.Open : WidgetState.Hidden);
    }
  }
};

/**
 * Setup events for changed elements widget to react to frontstage activated and version compare events to auto-hide/show the widget
 * @param manager Version Compare Manager
 */
export const bindChangedElementsWidgetEvents = (manager: VersionCompareManager) => {
  manager.versionCompareStarting.addListener(onComparisonStarting);
  manager.versionCompareStopped.addListener(onComparisonStopped);
  manager.versionCompareStartFailed.addListener(onStartFailed);
  FrontstageManager.onFrontstageReadyEvent.addListener(onFrontstageReady);
};

/**
 * Clean-up events that make the widget automatically react to frontstage activated and version compare events
 * @param manager
 */
export const unbindChangedElementsWidgetEvents = (manager: VersionCompareManager) => {
  manager.versionCompareStarting.removeListener(onComparisonStarting);
  manager.versionCompareStopped.removeListener(onComparisonStopped);
  manager.versionCompareStartFailed.removeListener(onStartFailed);
  FrontstageManager.onFrontstageReadyEvent.removeListener(onFrontstageReady);

  // Ensure widget gets closed
  onComparisonStopped();
};

/** Returns a React element containing the ChangedElementsWidgetControl in a ui-framework Widget */
export const getChangedElementsWidget = () => {
  return (
    <Widget
      id={ChangedElementsWidget.widgetId}
      fillZone={true}
      label={IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.versionCompareLegend")}
      defaultState={WidgetState.Hidden}
      iconSpec="icon-list"
      control={ChangedElementsWidgetControl}
    />
  );
};
