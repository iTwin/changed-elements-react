/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import {
  bindChangedElementsWidgetEvents, unbindChangedElementsWidgetEvents, type MainVisualizationOptions,
  type SideBySideVisualizationManager, type VersionCompareManager, type VersionCompareVisualizationManager,
  type VisualizationHandler
} from "@itwin/changed-elements-react";

import { VersionCompareFrontstageManager } from "./VersionCompareFrontstageManager";
import { PropertyComparisonFrontstage } from "./PropertyComparisonFrontstage";

export interface AppUiVisualizationOptions {
  /* Frontstage Ids where version compare will be available. */
  frontstageIds: string[];
}

/**
 * Handles setting up version compare visualization for AppUi applications. This expects that the app has frontstages
 * and adds our own property compare frontstage.
 */
export class AppUiVisualizationHandler implements VisualizationHandler {
  private _frontstageManager: VersionCompareFrontstageManager | undefined;

  public constructor(private _manager: VersionCompareManager, options: AppUiVisualizationOptions) {
    const frontstageIds = new Set(options.frontstageIds);
    this._frontstageManager = new VersionCompareFrontstageManager(
      frontstageIds,
      PropertyComparisonFrontstage.id,
      this._manager,
    );
    bindChangedElementsWidgetEvents(this._manager);
  }

  public get visualizationManager(): VersionCompareVisualizationManager | undefined {
    return this._frontstageManager?.visualizationManager;
  }

  public get propertyComparisonVisualizationManager(): SideBySideVisualizationManager | undefined {
    return this._frontstageManager?.propertyComparisonVisualizationManager;
  }

  public getSingleViewVisualizationManager(): VersionCompareVisualizationManager | undefined {
    return this.visualizationManager;
  }

  public getDualViewVisualizationManager(): SideBySideVisualizationManager | undefined {
    return this.propertyComparisonVisualizationManager;
  }

  /**
   * Enable visualization of version comparison for AppUi apps.
   * @param options Options for visualization
   */
  public async enableVisualization(options?: MainVisualizationOptions): Promise<void> {
    const changedElementsManager = this._manager.changedElementsManager;
    const currentIModel = this._manager.currentIModel;
    const targetIModel = this._manager.targetIModel;
    if (!changedElementsManager || !currentIModel || !targetIModel) {
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
        undefined,
        options?.wantTargetModified,
      );

      if (options?.focusedSelection) {
        const elementIds = new Set<string>();
        for (const instanceKeys of options.focusedSelection.instanceKeys.values()) {
          for (const id of instanceKeys) {
            elementIds.add(id);
          }
        }

        const entries = changedElementsManager.entryCache.getEntries(elementIds, true);
        await this.visualizationManager?.setFocusedElements(entries);
      }
    }
  }

  /** Enable side by side visualization for property comparison. */
  public async enableSideBySideVisualization(): Promise<void> {
    if (this._frontstageManager) {
      await this._frontstageManager.setupSideBySideVisualization();
    }
  }

  /**
   * Starts property comparison by changing the frontstage into a nested property comparison frontstage that displays a
   * property comparison table and a side by side view of the current version vs the target version.
   */
  public async startPropertyComparison(): Promise<void> {
    const currentIModel = this._manager.currentIModel;
    const targetIModel = this._manager.targetIModel;
    if (this._frontstageManager && currentIModel && targetIModel) {
      await this._frontstageManager.initializePropertyComparison(currentIModel, targetIModel);
    }
  }

  /** Clean-up managers and events. */
  public async cleanUp(): Promise<void> {
    if (this._frontstageManager) {
      await this._frontstageManager.cleanUp();
    }

    unbindChangedElementsWidgetEvents(this._manager);
  }
}
