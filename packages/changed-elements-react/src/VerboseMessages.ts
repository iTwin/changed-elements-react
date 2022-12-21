/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/

/** Utilities for logging and verbose output */
export class VersionCompareUtils {
  private static _verboseFunction: ((...args: unknown[]) => void) | undefined;

  /**
   * An Application may decide to provide version compare with a verbose function that will output messages of state for
   * processing, widgets, and other parameters. Useful for end-to-end testing and debugging.
   */
  public static setVerboseFunction(func: (...args: unknown[]) => void) {
    VersionCompareUtils._verboseFunction = func;
  }

  /** Internally used to output verbose messages to the given verboseFunction. */
  public static outputVerbose(...args: unknown[]) {
    VersionCompareUtils._verboseFunction?.(...args);
  }
}

/**
 * Enum of messages that version compare will output when provided a verbose function. Useful for end-to-end tests to
 * listen to logging by the version compare feature to know that certain actions succeeded, failed, or when certain
 * actions occur.
 */
export enum VersionCompareVerboseMessages {
  versionCompareManagerStartedComparison = "Version Compare: Started comparison successfully",
  versionCompareManagerErrorStarting = "Version Compare: Error starting comparison",
  versionCompareManagerStoppedComparison = "Version Compare: Stopped comparison",

  comparisonLegendWidgetInitializeInspect = "Version Compare: ChangedElementsWidget: Initializing property comparison",
}
