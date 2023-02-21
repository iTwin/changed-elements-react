/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** Utilities for logging and verbose output */
export class VersionCompareUtils {
  private static _verboseFunction: ((...args: unknown[]) => void) | undefined;

  /**
   * An Application may decide to provide version compare with a verbose function that
   * will output messages of state for processing, widgets, and other parameters.
   * Useful for end-to-end testing and debugging
   */
  public static setVerboseFunction(func: (...args: unknown[]) => void) {
    VersionCompareUtils._verboseFunction = func;
  }

  /** Internally used to output verbose messages to the given verboseFunction */
  public static outputVerbose(...args: unknown[]) {
    if (undefined !== VersionCompareUtils._verboseFunction) {
      VersionCompareUtils._verboseFunction(...args);
    }
  }
}

/**
 * Enum of messages that version compare will output when provided a verbose function
 * Useful for end-to-end tests to listen to logging by the version compare feature
 * to know that certain actions succeeded, failed, or when certain actions occur
 */
export enum VersionCompareVerboseMessages {
  changeElementEntryCacheErrorNotInitialized = "ChangedElementEntryCache Error: Has not been initialized",
  changedElementsManagerErrorInvalidCombination = "Invalid combination of opcodes during accumulation of changes for element Id: ",

  versionCompareManagerStartedComparison = "Version Compare: Started comparison successfully",
  versionCompareManagerErrorStarting = "Version Compare: Error starting comparison",
  versionCompareManagerStoppedComparison = "Version Compare: Stopped comparison",

  frontstageManagerPropertyComparisonFrontstageOpened = "Version Compare: VersionCompareFrontstageManager: Property Comparison Frontstage Opened",
  frontstageManagerMainComparisonFrontstageOpened = "Version Compare: VersionCompareFrontstageManager: Main Frontstage Opened",

  propertyComparisonTableLoadedProperties = "Version Compare: PropertyComparisonTable: Loaded Properties",
  propertyComparisonTableToggleShowChangedProps = "Version Compare: PropertyComparisonTable: Toggle Show Changed",

  changedElementsTreeInvalidTreeNode = "Version Compare: Invalid Tree Node - Extended data not found",
  changedElementsTreeElementClicked = "Version Compare: ChangedElementsTree: Element Clicked",
  changedElementsTreeNodeExpanded = "Version Compare: ChangedElementsTree: Node Expanded",
  changedElementsTreeNodeCollapsed = "Version Compare: ChangedElementsTree: Node Collapsed",

  comparisonLegendWidgetShowAllSuccessful = "Version Compare: ChangedElementsWidget: Show All successful",
  comparisonLegendWidgetHideAllSuccessful = "Version Compare: ChangedElementsWidget: Hide successful",
  comparisonLegendWidgetInvertSuccessful = "Version Compare: ChangedElementsWidget: Invert successful",
  comparisonLegendWidgetHideUnchangedSuccessful = "Version Compare: ChangedElementsWidget: Toggle hide unchanged successful",
  comparisonLegendWidgetInitializeInspect = "Version Compare: ChangedElementsWidget: Initializing property comparison",
  comparisonLegendWidgetOpenedContextMenu = "Version Compare: ChangedElementsWidget: Opened Context Menu",

  footerWidgetOpenedWidget = "Version Compare: Opened footer widget",
  footerWidgetClosedWidget = "Version Compare: Closed footer widget",

  selectDialogClosed = "Version Compare: Closed Select Dialog",
  selectDialogNamedVersionSelected = "Version Compare: Named Version Selected",
  selectDialogOpened = "Version Compare: Opened Select Dialog",
}
