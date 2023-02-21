/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { KeySet } from "@itwin/presentation-common";

import { SideBySideVisualizationManager } from "./SideBySideVisualizationManager";
import { VersionCompareVisualizationManager } from "./VersionCompareVisualization";

export interface MainVisualizationOptions {
  wantTargetModified?: boolean;
  focusedSelection?: KeySet;
}

/**
 * Handler for visualizing a comparison in viewports
 */
export abstract class VisualizationHandler {
  public abstract enableVisualization(
    options?: MainVisualizationOptions
  ): Promise<void>;

  public abstract enableSideBySideVisualization(): Promise<void>;

  public abstract startPropertyComparison(): Promise<void>;

  public abstract cleanUp(): Promise<void>;

  public abstract getSingleViewVisualizationManager():
    | VersionCompareVisualizationManager
    | undefined;
  public abstract getDualViewVisualizationManager():
    | SideBySideVisualizationManager
    | undefined;
}
