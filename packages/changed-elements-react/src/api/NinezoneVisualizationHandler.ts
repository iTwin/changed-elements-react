/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BeEvent } from "@itwin/core-bentley";

import { PropertyComparisonFrontstage } from "../frontstages/PropertyComparisonFrontstage";
import { bindChangedElementsWidgetEvents, unbindChangedElementsWidgetEvents } from "../widgets/ChangedElementsWidget";
import { SideBySideVisualizationManager } from "./SideBySideVisualizationManager";
import type { NinezoneVisualizationOptions } from "./VersionCompare";
import { VersionCompareFrontstageManager } from "./VersionCompareFrontstageManager";
import { VersionCompareManager } from "./VersionCompareManager";
import { VersionCompareVisualizationManager } from "./VersionCompareVisualization";
import { VisualizationHandler, type MainVisualizationOptions } from "./VisualizationHandler";

/**
 * Handles setting up version compare visualization for Ninezone applications
 * This expects that the app has frontstages and adds our own property compare
 * frontstage
 */
export class NinezoneVisualizationHandler extends VisualizationHandler {
  private _frontstageManager: VersionCompareFrontstageManager | undefined;
  private _onViewChanged?: BeEvent<(args: unknown) => void>;

  public constructor(
    private _manager: VersionCompareManager,
    options: NinezoneVisualizationOptions,
  ) {
    super();
    const frontstageIds = new Set(options?.frontstageIds ?? []);
    this._frontstageManager = new VersionCompareFrontstageManager(
      frontstageIds,
      PropertyComparisonFrontstage.id,
      this._manager,
    );
    bindChangedElementsWidgetEvents(this._manager);
  }

  public get visualizationManager():
    | VersionCompareVisualizationManager
    | undefined {
    return this._frontstageManager
      ? this._frontstageManager.visualizationManager
      : undefined;
  }
  public get propertyComparisonVisualizationManager():
    | SideBySideVisualizationManager
    | undefined {
    return this._frontstageManager
      ? this._frontstageManager.propertyComparisonVisualizationManager
      : undefined;
  }

  public getSingleViewVisualizationManager() {
    return this.visualizationManager;
  }

  public getDualViewVisualizationManager() {
    return this.propertyComparisonVisualizationManager;
  }

  /**
   * Enable visualization of version comparison for ninezone apps
   * @param options Options for visualization
   */
  public async enableVisualization(options?: MainVisualizationOptions): Promise<void> {
    const changedElementsManager = this._manager.changedElementsManager;
    const currentIModel = this._manager.currentIModel;
    const targetIModel = this._manager.targetIModel;
    if (
      changedElementsManager === undefined ||
      currentIModel === undefined ||
      targetIModel === undefined
    ) {
      // TODO: Log error
      return;
    }

    const changedElementEntries = changedElementsManager.entryCache.getAll();
    if (this._frontstageManager) {
      await this._frontstageManager.initializeSingleViewComparison(
        currentIModel,
        targetIModel,
        changedElementEntries,
        changedElementsManager.changedModels,
        changedElementsManager.unchangedModels,
        this._onViewChanged,
        options?.wantTargetModified,
      );

      if (options?.focusedSelection !== undefined) {
        const elementIds = new Set<string>();
        options?.focusedSelection.instanceKeys.forEach((ids: Set<string>) => {
          for (const id of ids) {
            elementIds.add(id);
          }
        });
        const entries = await changedElementsManager.entryCache.getEntries(
          elementIds,
          true,
        );
        await this.visualizationManager?.setFocusedElements(entries);
      }
    }
  }

  /** Enable side by side visualization for property comparison */
  public async enableSideBySideVisualization(): Promise<void> {
    if (this._frontstageManager) {
      await this._frontstageManager.setupSideBySideVisualization();
    }
  }

  /**
   * Starts property comparison by changing the frontstage into a nested
   * property comparison frontstage that displays a property comparison table
   * and a side by side view of the current version vs the target version
   */
  public async startPropertyComparison(): Promise<void> {
    const currentIModel = this._manager.currentIModel;
    const targetIModel = this._manager.targetIModel;
    if (this._frontstageManager && currentIModel && targetIModel) {
      await this._frontstageManager.initializePropertyComparison(
        currentIModel,
        targetIModel,
      );
    }
  }

  /**
   * Clean-up managers and events
   */
  public async cleanUp(): Promise<void> {
    if (this._frontstageManager) {
      await this._frontstageManager.cleanUp();
    }
    unbindChangedElementsWidgetEvents(this._manager);
  }
}
