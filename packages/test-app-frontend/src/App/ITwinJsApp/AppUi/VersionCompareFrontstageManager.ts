/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  StateManager, SyncUiEventDispatcher, UiFramework
} from "@itwin/appui-react";
import {
  changedElementsWidgetAttachToViewportEvent,
  enableVersionCompareVisualizationCaching, ModelsCategoryCache, SideBySideVisualizationManager,
  VersionCompare, VersionCompareVisualizationManager, type ChangedElementEntry,
  type VersionCompareManager
} from "@itwin/changed-elements-react";
import { DbOpcode, Logger, type BeEvent, type Id64String } from "@itwin/core-bentley";
import {
  FeatureSymbology,
  IModelApp, NotifyMessageDetails, OutputMessagePriority, type IModelConnection,
  type ScreenViewport, type ViewState
} from "@itwin/core-frontend";
import { KeySet, type InstanceKey } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";

import { getUnifiedSelectionStorage } from "./presentation/SelectionStorage.js";
import { PropertyComparisonFrontstage } from "./PropertyComparisonFrontstage.js";
import { VersionCompareActionTypes } from "./redux/VersionCompareStore.js";

/** Manages version compare workflows based on design review's use case. */
export class VersionCompareFrontstageManager {
  private _mainViewportState: ViewState | undefined;
  private _targetViewportState: ViewState | undefined;
  private _focusedElementKey: InstanceKey | undefined;
  private _emphasizedElements: Set<Id64String> | undefined;
  private _changedElementEntries: ChangedElementEntry[] | undefined;

  public visualizationManager: VersionCompareVisualizationManager | undefined;
  public propertyComparisonVisualizationManager: SideBySideVisualizationManager | undefined;

  /**
   * Constructor.
   * @param _mainComparisonStageIds Frontstage Ids used to host the version compare visualization
   * @param _propertyComparisonStageId Frontstage Id used for Side-by-Side Property Comparison
   * @param _manager Version Compare Manager object
   */
  constructor(
    private _mainComparisonStageIds: Set<string>,
    private _propertyComparisonStageId: string,
    private _manager: VersionCompareManager,
  ) {
    IModelApp.viewManager.onViewOpen.addListener(this._onViewOpen);
  }

  /**
   * Attaches itself to the current viewport and initializes the version comparison visualization.
   * @param _currentIModel Current IModelConnection
   * @param targetIModel Target IModelConnection being compared against
   * @param changedElementEntries Changed Element Entries to initialize comparison visualization
   * @param changedModels [optional] Changed Model Ids used for optimization
   * @param unchangedModels [optional] Unchanged Model Ids used for optimization
   * @param onViewChanged [optional] The application may raise this event to let version compare UI components know they
   *                      need to refresh
   * @param showTargetModified [optional] Show the modified elements on the secondary connection
   * @param colorOverrideProvider [optional] Function to provide color overrides for changed elements, this can be created by using VersionCompareManager.getColorOverrideProvider(), this will wrap the colorOverrideProvider provided to the initialization options for usage by the internal visualization
   */
  public async initializeSingleViewComparison(
    _currentIModel: IModelConnection,
    targetIModel: IModelConnection,
    changedElementEntries: ChangedElementEntry[],
    changedModels?: Set<string>,
    unchangedModels?: Set<string>,
    onViewChanged?: BeEvent<(args: unknown) => void>,
    showTargetModified?: boolean,
    colorOverrideProvider?: (visibleEntries: ChangedElementEntry[], hiddenEntries: ChangedElementEntry[], overrides: FeatureSymbology.Overrides) => void,
  ) {
    this._changedElementEntries = changedElementEntries;
    const viewport = IModelApp.viewManager.getFirstOpenView();
    if (!viewport) {
      throw new Error("Could not start comparison. Viewport not found");
    }

    // Start visualization of comparison
    this.visualizationManager = new VersionCompareVisualizationManager(
      targetIModel,
      changedElementEntries,
      viewport,
      changedModels,
      unchangedModels,
      onViewChanged,
      showTargetModified,
      colorOverrideProvider,
    );
    await ModelsCategoryCache.load(_currentIModel, targetIModel, changedElementEntries);
    await this.visualizationManager.attachToViewport(viewport);
  }

  /** Cleans up the visualization managers. */
  public async cleanUp() {
    ModelsCategoryCache.clear();
    if (this.visualizationManager) {
      await this.visualizationManager.cleanUp();
      this.visualizationManager = undefined;
    }

    if (this.propertyComparisonVisualizationManager) {
      this.propertyComparisonVisualizationManager.cleanUp();
      this.propertyComparisonVisualizationManager = undefined;
    }
  }

  /** Cleans up and dettaches from Frontstage events to trigger comparison visualization. */
  public async detach() {
    await this.cleanUp();
    IModelApp.viewManager.onViewOpen.removeListener(this._onViewOpen);
  }

  /** Handler for frontstage ready */
  private _onViewOpen = async (_: ScreenViewport) => {
    const frontstageDef = UiFramework.frontstages.activeFrontstageDef;
    if (!frontstageDef) {
      return;
    }

    if (
      frontstageDef.id !== this._propertyComparisonStageId &&
      !this._mainComparisonStageIds.has(frontstageDef.id)
    ) {
      await this._manager.stopComparison();
    } else {
      if (frontstageDef.id === this._propertyComparisonStageId) {
        this._setupSideBySideViewStates();
        await this._onPropertyComparisonViewOpened();
      } else {
        // Stop property comparison
        this.stopPropertyComparison();
      }

      if (this._mainComparisonStageIds.has(frontstageDef.id)) {
        await this._onMainComparisonViewOpened();
      }
    }
  };

  /** Sets the initial view states of property comparison frontstage. */
  private _setupSideBySideViewStates() {
    if (!this._targetViewportState || !this._mainViewportState) {
      return;
    }

    const vps: ScreenViewport[] = [];
    for (const vp of IModelApp.viewManager) {
      vps.push(vp);
    }
    if (vps.length < 2) {
      // Nothing to do, as this will get called again when the viewports are appropriately ready
      return;
    }

    vps[0].applyViewState(this._mainViewportState);
    vps[1].applyViewState(this._targetViewportState);
  }

  /**
   * Opens the side by side property comparison frontstage and maintains selection to zoom to the given element on open.
   * @param currentIModel Current IModelConnection
   * @param targetIModel Target IModelConnection being compared against
   */
  public async openSideBySideFrontstage(
    currentIModel: IModelConnection,
    targetIModel: IModelConnection,
    currentSelection: Readonly<KeySet>,
  ) {
    // Reset
    this._mainViewportState = undefined;
    // Get view state from options if passed
    const appViewState = this._manager.options.getPropertyComparisonViewState?.(currentSelection);
    if (appViewState === undefined) {
      const vp = IModelApp.viewManager.selectedView;
      if (vp) {
        this._mainViewportState = vp.view.clone();
      }
    } else {
      this._mainViewportState = appViewState.clone();
    }

    // Create a view state for the target connection
    if (this._mainViewportState) {
      this._targetViewportState = await SideBySideVisualizationManager.cloneViewState(
        this._mainViewportState,
        targetIModel,
      );
    }

    // Set elements to emphasize during property comparison
    this._emphasizedElements = await SideBySideVisualizationManager.getHiliteElements(currentIModel, targetIModel);

    // Make read-write key set
    const keys: InstanceKey[] = [];
    for (const pair of currentSelection.instanceKeys) {
      const className = pair[0];
      const ids = pair[1];
      const currentKeys: InstanceKey[] = [...ids].map((id: string) => ({ id, className }));
      keys.push(...currentKeys);
    }

    StateManager.store.dispatch({ type: VersionCompareActionTypes.SET_SELECTION_KEYS, payload: new KeySet(keys) });
    SyncUiEventDispatcher.dispatchSyncUiEvent(VersionCompareActionTypes.SET_SELECTION_KEYS);

    const stage = new PropertyComparisonFrontstage(
      this._manager,
      currentIModel,
      targetIModel,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      () => this._mainViewportState!,
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      () => this._targetViewportState!,
    );
    UiFramework.frontstages.addFrontstage(stage.frontstageConfig());

    // Clear selection before we start property comparison
    getUnifiedSelectionStorage().clearSelection({ source: "SideBySideVisualizationManager", imodelKey: currentIModel.key });
    getUnifiedSelectionStorage().clearSelection({ source: "SideBySideVisualizationManager", imodelKey: targetIModel.key });


    const frontstageDef = await UiFramework.frontstages.getFrontstageDef(this._propertyComparisonStageId);
    if (undefined !== frontstageDef) {
      // Activate property comparison frontstage which should trigger the version compare frontstage manager to start
      // the visualization
      await UiFramework.frontstages.openNestedFrontstage(frontstageDef);
    }
  }

  /**
   * Checks if the element is an element relevant for side by side comparison (modified element).
   * @param currentSelection Current KeySet for selection set to check
   */
  private _canDoPropertyComparison(currentSelection: Readonly<KeySet>): boolean {
    const selectionHas = (keySet: Readonly<KeySet>, id: string) => {
      let found = false;
      keySet.forEach((key) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if (undefined !== (key as any).id && (key as any).id === id) {
          found = true;
        }
      });
      return found;
    };

    const currentFocusedElement = this._manager.changedElementsManager.entryCache
      .getAll()
      .find((value) => value.opcode === DbOpcode.Update && selectionHas(currentSelection, value.id));

    // We can only do property comparison on modified elements, so both elements should've been found
    return currentFocusedElement !== undefined;
  }

  /**
   * Finds the focused element in comparison based on selection of current and target iModel.
   * @param currentSelection KeySet to use
   */
  private _findFocusedElementFromSelection(currentSelection: Readonly<KeySet>): boolean {
    this._focusedElementKey = undefined;
    currentSelection.forEach((value) => {
      if (
        this._focusedElementKey === undefined &&
        Object.prototype.hasOwnProperty.call(value, "id") &&
        Object.prototype.hasOwnProperty.call(value, "className")
      ) {
        this._focusedElementKey = value as InstanceKey;
      }
    });
    return this._focusedElementKey !== undefined;
  }

  /**
   * Opens property comparison frontstage if possible. If not, uses IModelApp.notifications to show errors.
   * @param currentConnection Current IModelConnection
   * @param targetConnection Target IModelConnection being compared against
   */
  public async initializePropertyComparison(currentConnection: IModelConnection, targetConnection: IModelConnection) {
    const currentSelection = Presentation.selection.getSelection(currentConnection);
    // const currentSelection = getUnifiedSelectionStorage().getSelection({imodelKey: createIModelKey(currentConnection)});

    // Check if there's any selected elements
    if (currentSelection.instanceKeysCount === 0) {
      const brief = IModelApp.localization.getLocalizedString(
        "VersionCompare:versionCompare.error_brief_propertyComparisonNoElement",
      );
      const detailed = IModelApp.localization.getLocalizedString(
        "VersionCompare:versionCompare.error_propertyComparisonNoElement",
      );
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, brief, detailed));
      return;
    }

    // Check if we can do property comparison given our selection set (only modified elements are permitted)
    if (!this._canDoPropertyComparison(currentSelection)) {
      const brief = IModelApp.localization.getLocalizedString(
        "VersionCompare:versionCompare.error_brief_propertyComparisonOnModifyOnly",
      );
      const detailed = IModelApp.localization.getLocalizedString(
        "VersionCompare:versionCompare.error_propertyComparisonOnModifyOnly",
      );
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, brief, detailed));
      return;
    }

    // Find the element to focus during property comparison and set it internally
    if (!this._findFocusedElementFromSelection(currentSelection)) {
      const brief = IModelApp.localization.getLocalizedString(
        "VersionCompare:versionCompare.error_brief_elementNotInComparison",
      );
      const detailed = IModelApp.localization.getLocalizedString(
        "VersionCompare:versionCompare.error_elementNotInComparison",
      );
      IModelApp.notifications.outputMessage(new NotifyMessageDetails(OutputMessagePriority.Error, brief, detailed));
      return;
    }

    // Cache display settings in current view to be restored when coming back from property comparison
    if (this.visualizationManager) {
      enableVersionCompareVisualizationCaching(true);
      this.visualizationManager.cacheComparisonDisplay();
    }

    // Initialize actual property comparison
    await this.openSideBySideFrontstage(currentConnection, targetConnection, currentSelection);
  }

  /** Setups side by side visualization. */
  public setupSideBySideVisualization = async () => {
    if (
      !this._manager.currentIModel ||
      !this._manager.targetIModel ||
      !this._changedElementEntries ||
      !this._manager.currentVersion ||
      !this._manager.targetVersion
    ) {
      return;
    }

    const vps: ScreenViewport[] = [];
    for (const vp of IModelApp.viewManager) {
      vps.push(vp);
    }

    if (vps.length < 2) {
      Logger.logError(VersionCompare.logCategory, "Expected 2 viewports to initialize side by side visualization");
      return;
    }

    // Start property comparison visualization
    this.propertyComparisonVisualizationManager =
      new SideBySideVisualizationManager(
        this._manager.currentIModel,
        this._manager.targetIModel,
        this._manager.currentVersion,
        this._manager.targetVersion,
        this._focusedElementKey,
        this._changedElementEntries,
        vps[0],
        vps[1],
        this._manager.options.getPropertyComparisonViewState === undefined,
        getUnifiedSelectionStorage(),
      );
    await this.propertyComparisonVisualizationManager.initialize(this._emphasizedElements);
  };

  /** Handler for when property comparison frontstage is opened */
  private async _onPropertyComparisonViewOpened() {
    // Avoid caching any changes to the view state made during property compare overview mode
    enableVersionCompareVisualizationCaching(false);
    await this.setupSideBySideVisualization();
  }

  /**
   * Handler for when the main comparison frontstage is opened. Used to set colorization and overrides if we are in an
   * active version compare session.
   */
  private async _onMainComparisonViewOpened() {
    // Ensure we are using the cached provider props so that we restore visualization properly
    enableVersionCompareVisualizationCaching(true);

    // Raise event to attach changed elements widget to the viewports
    const vp = IModelApp.viewManager.getFirstOpenView();
    if (vp) {
      changedElementsWidgetAttachToViewportEvent.raiseEvent(vp);
    }

    // If we had a viewport state for the main frontstage before, apply it
    if (this._mainViewportState) {
      vp?.changeView(this._mainViewportState);
      this._mainViewportState = undefined;
    }

    // Enable visualization again after we have set the appropriate view state
    await this._manager.enableVisualization();
  }

  /** Stops property comparison */
  public stopPropertyComparison() {
    if (this._emphasizedElements) {
      this._emphasizedElements = undefined;
    }

    if (this.propertyComparisonVisualizationManager) {
      this.propertyComparisonVisualizationManager.cleanUp();
      this.propertyComparisonVisualizationManager = undefined;
    }
  }
}
