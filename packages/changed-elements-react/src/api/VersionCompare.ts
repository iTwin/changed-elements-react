/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { getClassName } from "@itwin/appui-abstract";
import type { AccessToken, Id64String } from "@itwin/core-bentley";
import type { ModelProps, ChangesetIdWithIndex } from "@itwin/core-common";
import { FeatureSymbology, IModelApp, IModelConnection, ViewState } from "@itwin/core-frontend";
import { KeySet } from "@itwin/presentation-common";

import { ChangedElementsApiClient } from "./ChangedElementsApiClient.js";
import { ChangedElementsClientBase } from "./ChangedElementsClientBase.js";
import { VersionCompareManager } from "./VersionCompareManager.js";
import { VisualizationHandler } from "./VisualizationHandler.js";

/** Feature usage tracking callbacks for changed elements UI operations */
export interface VersionCompareFeatureTracking {
  /** Track when the user opens the version compare selector dialog to start a comparison using V2 API */
  trackVersionSelectorV2Usage: () => void;
  /** Track when the user opens the version compare selector dialog to start a comparison */
  trackVersionSelectorUsage: () => void;
  /** Tracks when the user does a property comparison and opens the side-by-side frontstage */
  trackPropertyComparisonUsage: () => void;
  /** Tracks when the user opens the change report dialog */
  trackChangeReportGenerationUsage: () => void;
  /** Tracks when the user opens the advanced filter dialog */
  trackAdvancedFiltersUsage: () => void;
}

/**
 * Interface to provide factories for clients to override where to obtain changed element data, invoke processing and
 * check whether the version compare feature is available in the iModel.
 */
interface IVersionCompareClientFactory {
  /** Return a changed elements client that will give the processed change data. */
  createChangedElementsClient: () => ChangedElementsClientBase;
}

/**
 * TODO: This should be moved to common package instead of maintained in core-backend?
 */
export interface ChangedECInstance {
    ECInstanceId: Id64String;
    ECClassId?: Id64String;
    $meta?: any;
    // Added by enricher
    $comparison?: {
      drivenBy?: { id: Id64String, relationship: { className: string, direction: "forward" | "backward" } }[];
      drives?: { id: Id64String, relationship: { className: string, direction: "forward" | "backward" } }[];
      type?: number;
    }
    [key: string]: any;
}

/**
 * Expected output of a changeset processor function.
 */
export interface ChangesProviderOutput {
  changedInstances: ChangedECInstance[];
}

export interface VersionCompareOptions {
  /**
   * Base URL for iTwin Platform Changed Elements API.
   * @default "https://api.bentley.com/changedelements"
   */
  changedElementsApiBaseUrl?: string | undefined;

  /** Enable or disable display of side by side toggle in property comparison table. */
  displaySideBySideToggle?: boolean | undefined;

  /** Feature tracking calls for applications to listen to. */
  featureTracking?: VersionCompareFeatureTracking;

  /**
   * Whether to filter version comparison results by spatial elements in the results. Should be FALSE for Version
   * Compare 2D Functionality.
   */
  filterSpatial?: boolean;

  /**
   * Controls whether to show information on tooltips when hovering elements. This information will have the type of
   * change if available for modified elements.
   */
  wantTooltipAugment?: boolean;

  /** Shows the entry to open the report generation dialog from the changed elements widget. */
  wantReportGeneration?: boolean;

  /** Whether to show all models in the results, including non-geometric. This will not include private models. */
  wantAllModels?: boolean;

  /**
   * Used to only show elements of the given model class names 'Bis.GeometricModel3d' and 'Bis.GeometricModel2d' are
   * used by default when this option is not specified wantAllModels should be undefined or false for this to work. This
   * enhances startup performance, as all other non-matching elements will be ignored.
   */
  wantedModelClasses?: string[];

  /**
   * Function to provide a view state for property compare. If not provided, it tries to maintain view state from one
   * frontstage to the next. The keys passed correspond to the element(s) being inspected in property comparison.
   */
  getPropertyComparisonViewState?: (keys: Readonly<KeySet>) => ViewState;

  /** Called when the user inspects a model through the changed elements inspector. */
  onModelInspect?: (modelProps: ModelProps, is2d: boolean) => void;

  /**
   * Use this to return a URL to open in a new tab when the user clicks on the 'Manage Named Versions' href in the
   * version compare select dialog. V1 Widget use only.
   */
  getManageNamedVersionsUrl?: (iModelConnection?: IModelConnection) => string;

  getAccessToken?: () => Promise<AccessToken>;
  createVisualizationHandler: (manager: VersionCompareManager) => VisualizationHandler;

  /**
   * If provided, this function will be called to obtain the changeset data instead of using changed elements API
   * This allows a consumer application to use its own changeset processing logic.
   * @param startChangeset Start changeset to compare (oldest)
   * @param endChangeset End changeset to compare (newest)
   * @param iModelConnection iModel connection to use
   * @returns a promise that should resolve to an object containing an array of ChangedECInstance
   */
  changesProvider?: (startChangeset: ChangesetIdWithIndex, endChangeset: ChangesetIdWithIndex, iModelConnection: IModelConnection) => Promise<ChangesProviderOutput>;

  /**
   * Allows the application to provide a color override for changed ec instances.
   * This is called each time the viewport is updated with new changed elements to be visualized.
   * (e.g. when the user toggles filters, inspects a model or an element's children, etc.)
   *
   * Example:
   *
   * ```typescript
   * (instances, overrides) => {
   *  for (const instance of instances) {
   *   // The ChangedECInstance will contain everything that was provided by `changesProvider` function in the callback
   *   if (instance.type === "Update") {
   *     // Override color for updated elements to a light blue color
   *     overrides.setFeatureOverride(instance.id, new FeatureAppearance({ color: ColorDef.from(155, 155, 255) }));
   *    }
   *  }
   * ```
   *
   * This is called *after* the `colorOverrideProvider` from `VersionCompareTiles` is called, so it can be used to override
   * default version compare behavior / coloring.
   *
   * Note: The way version compare achieves coloring unchanged elements is by using `FeatureSymbology.Overrides` and `setDefaultOverrides`
   * Clearing the overrides when received from this function may result in the emphasis of unchanged elements to be lost
   * It is recommended to only override colors for changed instances, and not clear all the overrides.
   *
   * @param visibleInstances ChangedECInstances to override colors for, will match the instances provided by `changesProvider`. Contains only the instances that are visible due to filters in the UI
   * @param hiddenInstances ChangedECInstances to override colors for, will match the instances provided by `changesProvider`. Contains only the instances that are not visible due to filters in the UI
   * @param overrides FeatureSymbology.Overrides to apply the color overrides to.
   */
  colorOverrideProvider?: (visibleInstances: ChangedECInstance[], hiddenInstances: ChangedECInstance[], overrides: FeatureSymbology.Overrides) => void;

  /**
   * Handler called when the user selects a changed instance (or multiple) in the changed elements widget.
   * This is used to allow the application to perform some custom action when the user selects an instance that contains changes.
   * This call won't be awaited by the UI.
   * @param instance
   * @returns
   */
  onInstancesSelected?: (instances: ChangedECInstance[]) => Promise<void>;
}

/** Maintains all version compare related data for the applications. */
export class VersionCompare {
  private static _manager: VersionCompareManager | undefined;
  private static _getAccessToken?: () => Promise<AccessToken>;

  private static _changesProvider?: (startChangeset: ChangesetIdWithIndex, endChangeset: ChangesetIdWithIndex, iModelConnection: IModelConnection) => Promise<{ changedInstances: ChangedECInstance[] }>;
  public static get changesProvider() {
    return VersionCompare._changesProvider;
  }

  public static get logCategory(): string {
    return "VersionCompare";
  }

  public static get manager(): VersionCompareManager | undefined {
    return VersionCompare._manager;
  }

  public static async isChangeTrackingEnabled(iTwinId: string, iModelId: string): Promise<boolean> {
    const client = VersionCompare.clientFactory.createChangedElementsClient();
    if (client instanceof ChangedElementsApiClient) {
      return client.getTracking(iTwinId, iModelId);
    }

    return false;
  }

  public static getAccessToken(): Promise<AccessToken> {
    if (!VersionCompare._getAccessToken) {
      throw new Error("AccessToken not found!");
    }

    return VersionCompare._getAccessToken();
  }

  private static defaultEndpoint = "https://api.bentley.com/changedelements";

  /** Used to create necessary clients for version compare feature */
  public static clientFactory: IVersionCompareClientFactory = {
    createChangedElementsClient: () => new ChangedElementsApiClient(this.defaultEndpoint),
  };

  /**
   * Initializes the version compare package.
   * @param options Options for comparison
   */
  public static initialize(options: VersionCompareOptions): void {
    // Initialize manager
    VersionCompare._manager = new VersionCompareManager(options);

    // Store options / callbacks
    VersionCompare._changesProvider = options.changesProvider;
    VersionCompare._getAccessToken = options.getAccessToken ?? IModelApp.getAccessToken;

    if (options.changedElementsApiBaseUrl) {
      const baseUrl = options.changedElementsApiBaseUrl;
      VersionCompare.clientFactory = {
        createChangedElementsClient: () => new ChangedElementsApiClient(baseUrl),
      };
    } else {
      // Help developers migrate away from relying on IMJS_URL_PREFIX environment variable
      let imjsPrefixIsUsed = false;
      try {
        // Some users setup their bundlers to perform simple string replacements, so we must imitate what users would
        // type and be prepared to catch ReferenceError if "process" is not defined.
        imjsPrefixIsUsed = !!process.env.IMJS_URL_PREFIX;
      } catch { }

      if (imjsPrefixIsUsed) {
        throw new Error(`IMJS_URL_PREFIX is '${process.env.IMJS_URL_PREFIX}', but VersionCompare still uses the \
default endpoint '${this.defaultEndpoint}'. To suppress this error, specify changedElementsApiBaseUrl property when \
initializing VersionCompare module, or do not define 'process.env.IMJS_URL_PREFIX'.`);
      }
    }
  }

  /** @internal */
  public static loggerCategory(obj: unknown): string {
    const className = getClassName(obj);
    return VersionCompare.packageName + (className ? `.${className}` : "");
  }

  /** @internal */
  public static get packageName(): string {
    return "version-compare";
  }
}
