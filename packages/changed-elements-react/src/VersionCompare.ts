/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { ModelProps } from "@itwin/core-common";
import { VersionCompareManager } from "./VersionCompareManager";

export interface VersionCompareOptions {
  /**
   * Whether to filter version comparison results by spatial elements in the results. Should be FALSE for Version
   * Compare 2D Functionality.
   */
  filterSpatial?: boolean;

  /**
   * Controls displaying UI elements to display the type of a modification that occurred on each element.
   *
   * Note: If you have older iModels, it's possible you will need to re-process the version compare data. By clearing
   * the Changed Elements Service and invoking the Changed Elements Agent.
   */
  wantTypeOfChange?: boolean;

  /**
   * Controls whether to show information on tooltips when hovering elements. This information will have the type of
   * change if available for modified elements.
   */
  wantTooltipAugment?: boolean;

  /**
   * Allows property filtering dialog to be used and visibility to be filtered based on changed properties in elements.
   *
   * Note: If you have older iModels, it's possible you will need to re-process the version compare data. By clearing
   * the Changed Elements Service and invoking the Changed Elements Agent.
   */
  wantPropertyFiltering?: boolean;

  /** Shows advanced filter dialog functionality for saving and sharing filter options. */
  wantSavedFilters?: boolean;

  /** Whether to show all models in the results, including non-geometric. This will not include private models. */
  wantAllModels?: boolean;

  /**
   * Used to only show elements of the given model class names. 'Bis.GeometricModel3d' and 'Bis.GeometricModel2d' are
   * used by default when this option is not specified. wantAllModels should be undefined or false for this to work.
   * This enhances startup performance, as all other non-matching elements will be ignored.
   */
  wantedModelClasses?: string[];

  /**
   * Enforces using a hard-coded presentation rules based algorithm to ensure that the elements are re-parented in the
   * tree to a Subject instead of a model if necessary based on the Model Tree's presentation rules.
   */
  reparentModelNodes?: boolean;

  /** Called when the user inspects a model through the changed elements inspector. */
  onModelInspect?: (modelProps: ModelProps, is2d: boolean) => void;
}

/** Maintains all version compare related data for the applications. */
export class VersionCompare {
  public static get logCategory(): string {
    return "VersionCompare";
  }

  public static manager: VersionCompareManager | undefined;

  /**
   * Initializes the version compare package.
   * @param options Options for comparison
   */
  public static initialize(options: VersionCompareOptions): void {
    // Initialize manager
    VersionCompare.manager = new VersionCompareManager(options);
  }
}
