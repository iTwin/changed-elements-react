/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BeEvent } from "@itwin/core-bentley";

import { ModelsCategoryCache } from "./ModelsCategoryCache.js";
import { SideBySideVisualizationManager } from "./SideBySideVisualizationManager.js";
import type { SimpleVisualizationOptions } from "./VersionCompare.js";
import { VersionCompareManager } from "./VersionCompareManager.js";
import { VersionCompareVisualizationManager } from "./VersionCompareVisualization.js";
import { VisualizationHandler, type MainVisualizationOptions } from "./VisualizationHandler.js";

/**
 * Handles version compare visualization for non-ninezone applications
 */
export class SimpleVisualizationHandler extends VisualizationHandler {
  private _onViewChanged?: BeEvent<(args: unknown) => void>;
  private _visualizationManager: VersionCompareVisualizationManager | undefined;
  private _sideBySideVisualizationManager:
    | SideBySideVisualizationManager
    | undefined;

  public constructor(
    public manager: VersionCompareManager,
    private _options: SimpleVisualizationOptions,
  ) {
    super();
  }

  /**
   * Enable visualization by creating either a VersionCompareVisualizationManager
   * or a SideBySideVisualizationManager based on the options provided on creation
   */
  private async _enableVisualization() {
    const currentIModel = this.manager.currentIModel;
    const targetIModel = this.manager.targetIModel;
    const currentVersion = this.manager.currentVersion;
    const targetVersion = this.manager.targetVersion;
    const changedElementsManager = this.manager.changedElementsManager;
    const changedElementEntries = changedElementsManager.entryCache.getAll();

    if (
      currentIModel === undefined ||
      targetIModel === undefined ||
      currentVersion === undefined ||
      targetVersion === undefined
    ) {
      throw new Error(
        "Could not enable visualization with SimpleVisualizationHandler without comparison being started first",
      );
    }

    await ModelsCategoryCache.load(
      currentIModel,
      targetIModel,
      changedElementEntries,
    );
    const viewport = this._options.getPrimaryViewport();
    this._visualizationManager = new VersionCompareVisualizationManager(
      targetIModel,
      changedElementEntries,
      viewport,
      changedElementsManager.changedModels,
      changedElementsManager.unchangedModels,
      this._onViewChanged,
      this._options.showBothModified,
    );
    await this._visualizationManager.attachToViewport(viewport);
  }

  public async enableVisualization(_options?: MainVisualizationOptions): Promise<void> {
    await this._enableVisualization();
  }

  public async enableSideBySideVisualization(): Promise<void> {
    throw new Error("Invalid operation with SimpleVisualizationHandler");
  }

  public startPropertyComparison(): Promise<void> {
    throw new Error("Invalid operation with SimpleVisualizationHandler");
  }

  /**
   * Clean-up visualization
   */
  public async cleanUp(): Promise<void> {
    if (this._visualizationManager) {
      await this._visualizationManager.cleanUp();
    }

    if (this._sideBySideVisualizationManager) {
      this._sideBySideVisualizationManager.cleanUp();
    }
  }

  public getSingleViewVisualizationManager():
    | VersionCompareVisualizationManager
    | undefined {
    return this._visualizationManager;
  }

  public getDualViewVisualizationManager():
    | SideBySideVisualizationManager
    | undefined {
    return this._sideBySideVisualizationManager;
  }
}
