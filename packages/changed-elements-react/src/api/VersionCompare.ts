/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { getClassName } from "@itwin/appui-abstract";
import type { AccessToken } from "@itwin/core-bentley";
import type { ModelProps } from "@itwin/core-common";
import { IModelApp, IModelConnection, ViewState } from "@itwin/core-frontend";
import { IModelsClient } from "@itwin/imodels-client-management";
import { KeySet } from "@itwin/presentation-common";

import { ChangedElementsApiClient } from "./ChangedElementsApiClient.js";
import { ChangedElementsClientBase } from "./ChangedElementsClientBase.js";
import { VersionCompareManager } from "./VersionCompareManager.js";
import { VisualizationHandler } from "./VisualizationHandler.js";

export interface VersionCompareFeatureTracking {
  trackInspectElementTool: () => void;
}

/**
 * Interface to provide factories for clients to override where to obtain changed element data, invoke processing and
 * check whether the version compare feature is available in the iModel.
 */
interface IVersionCompareClientFactory {
  /** Return a changed elements client that will give the processed change data. */
  createChangedElementsClient: () => ChangedElementsClientBase;
}

export interface VersionCompareOptions {
  /** Client that gives access to iTwin Platform iModels API. */
  iModelsClient: IModelsClient;

  /**
   * Base URL for iTwin Platform Changed Elements API.
   * @default "https://api.bentley.com/changedelements"
   */
  changedElementsApiBaseUrl?: string | undefined;

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
   * version compare select dialog.
   */
  getManageNamedVersionsUrl?: (iModelConnection?: IModelConnection) => string;

  getAccessToken?: () => Promise<AccessToken>;
  createVisualizationHandler: (manager: VersionCompareManager) => VisualizationHandler;
}

/** Maintains all version compare related data for the applications. */
export class VersionCompare {
  private static _manager: VersionCompareManager | undefined;
  private static _getAccessToken?: () => Promise<AccessToken>;

  public static get logCategory(): string {
    return "VersionCompare";
  }

  public static get manager(): VersionCompareManager | undefined {
    return VersionCompare._manager;
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

    // get the access token
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
