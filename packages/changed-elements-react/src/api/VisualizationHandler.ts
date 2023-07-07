/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { KeySet } from "@itwin/presentation-common";

import { SideBySideVisualizationManager } from "./SideBySideVisualizationManager.js";
import { VersionCompareVisualizationManager } from "./VersionCompareVisualization.js";

export interface MainVisualizationOptions {
  wantTargetModified?: boolean;
  focusedSelection?: KeySet;
}

/** Handler for visualizing a comparison in viewports. */
export interface VisualizationHandler {
  enableVisualization(options?: MainVisualizationOptions): Promise<void>;
  enableSideBySideVisualization(): Promise<void>;
  startPropertyComparison(): Promise<void>;
  cleanUp(): Promise<void>;
  getSingleViewVisualizationManager(): VersionCompareVisualizationManager | undefined;
  getDualViewVisualizationManager(): SideBySideVisualizationManager | undefined;
}
