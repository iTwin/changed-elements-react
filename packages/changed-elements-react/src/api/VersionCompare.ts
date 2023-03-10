/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { getClassName, UiError } from "@itwin/appui-abstract";
import { ReducerRegistryInstance, StateManager, SyncUiEventDispatcher, type FrontstageProps } from "@itwin/appui-react";
import type { AccessToken } from "@itwin/core-bentley";
import type { ModelProps } from "@itwin/core-common";
import { IModelApp, IModelConnection, ScreenViewport, ViewState } from "@itwin/core-frontend";
import { IModelsClient } from "@itwin/imodels-client-management";
import { KeySet } from "@itwin/presentation-common";
import { ReactNode } from "react";
import type { Store } from "redux";

import { VersionCompareReducer } from "../store/VersionCompareStore.js";
import { ChangedElementsApiClient } from "./ChangedElementsApiClient.js";
import { ChangedElementsClientBase } from "./ChangedElementsClientBase.js";
import { VersionCompareManager } from "./VersionCompareManager.js";

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

/** Options for the property comparison frontstage. */
export interface PropertyComparisonOptions {
  /** Override for the tile loading indicator used in the property comparison stage. */
  tileLoadingIndicator?: ReactNode;

  /**
   * Partial frontstage props to change the property comparison stage as apps desire.
   *
   * Note: Property compare defines the top-left zone to have some version compare specific isolate and clear tool. If
   * you want to maintain that functionality, but want to append tools to that zone, use verticalTools and
   * horizontalTools options instead.
   */
  frontstageProps?: Partial<FrontstageProps>;

  /** Vertical tools to add to the property comparison frontstage. */
  verticalTools?: JSX.Element[];

  /** Horizontal tools to add to the property comparison frontstage. */
  horizontalTools?: JSX.Element[];
}

/** Options for ninezone applications version compare visualization. */
export interface NinezoneVisualizationOptions {
  /* frontstageIds Frontstage Ids where version compare will be available. */
  frontstageIds?: string[];

  /** Options for property comparison frontstage. */
  propertyComparisonOptions?: PropertyComparisonOptions;
}

/** Options for simple visualization for non-ninezone applications. */
export interface SimpleVisualizationOptions {
  /**
   * Should return the main viewport your application wants to display the comparison in. If using side-by-side display,
   * this will be the "current version" viewport.
   */
  getPrimaryViewport: () => ScreenViewport;

  /** Whether to show modified elements in both before and after states. */
  showBothModified?: boolean;
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

  /** Whether or not to use ninezone handling for visualization. True by default. */
  wantNinezone?: boolean;

  /** Visualization options for ninezone applications. */
  ninezoneOptions?: NinezoneVisualizationOptions;

  /** Visualization options for applications without ninezone support. */
  simpleVisualizationOptions?: SimpleVisualizationOptions;

  getAccessToken?: () => Promise<AccessToken>;
}

/** Maintains all version compare related data for the applications. */
export class VersionCompare {
  private static _options: VersionCompareOptions | undefined;
  private static _manager: VersionCompareManager | undefined;
  private static _getAccessToken?: () => Promise<AccessToken>;
  private static _versionCompareStateKeyInStore = "versionCompareState"; // default name
  private static _complaint = "Version Compare Data is not initialized";

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
   * @param frontstageIds Frontstage Ids where version compare will be available
   * @param options Options for comparison
   * @param propertyComparisonOptions [optional] options for property comparison
   */
  public static initialize(options: VersionCompareOptions): void {
    // Store options
    VersionCompare._options = options;

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

    ReducerRegistryInstance.registerReducer(VersionCompare._versionCompareStateKeyInStore, VersionCompareReducer);
  }

  /**
   * Update the options for the property comparison frontstage. Only useful for nine-zone applications using the
   * property comparison stage.
   */
  public static setPropertyComparisonOptions(propertyComparisonOptions?: PropertyComparisonOptions): void {
    // Update optiions
    if (VersionCompare._options) {
      if (VersionCompare._options.ninezoneOptions === undefined) {
        VersionCompare._options.ninezoneOptions = { propertyComparisonOptions };
      } else {
        VersionCompare._options.ninezoneOptions.propertyComparisonOptions = propertyComparisonOptions;
      }

      // Re-create manager with new options
      VersionCompare._manager = new VersionCompareManager(VersionCompare._options);
    }
  }

  public static dispatchActionToStore(type: string, payload: unknown, immediateSync = false): void {
    VersionCompare.store.dispatch({ type, payload });
    if (immediateSync) {
      SyncUiEventDispatcher.dispatchImmediateSyncUiEvent(type);
    } else {
      SyncUiEventDispatcher.dispatchSyncUiEvent(type);
    }
  }

  public static get store(): Store<unknown> {
    if (!StateManager.isInitialized(true)) {
      throw new UiError(VersionCompare.loggerCategory(this), VersionCompare._complaint);
    }

    return StateManager.store;
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
