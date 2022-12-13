/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BeEvent, Logger } from "@itwin/core-bentley";
import { IModelVersion } from "@itwin/core-common";
import {
  CheckpointConnection, GeometricModel2dState, GeometricModel3dState, IModelApp, IModelConnection, NotifyMessageDetails,
  OutputMessagePriority,
} from "@itwin/core-frontend";
import { KeySet } from "@itwin/presentation-common";
import { ChangedElements } from "./api/changedElementsApi";
import { ChangedElementsManager } from "./ChangedElementsManager";
import { ChangedElementEntry } from "./ChangedElementsWidget/ChangedElementEntryCache";
import { ChangesTooltipProvider } from "./ChangedElementsWidget/ChangesTooltipProvider";
import { VersionCompareUtils, VersionCompareVerboseMessages } from "./VerboseMessages";
import { VersionCompareOptions } from "./VersionCompare";
import { NamedVersion } from "./VersionSelect/VersionSelectComponent";

const LOGGER_CATEGORY = "Version-Compare";

export class VersionCompareManager {
  /** Changed Elements Manager responsible for maintaining the elements obtained from the service. */
  public changedElementsManager: ChangedElementsManager;

  private _hasTypeOfChange = false;
  private _hasPropertiesForFiltering = false;

  /** Version Compare ITwinLocalization Namespace */
  public static namespace = "VersionCompare";

  /**
   * Constructor for VersionCompareManager. Registers the localization namespace for version compare.
   * @param options VersionCompareOptions interface for customizing the experience
   */
  constructor(public options: VersionCompareOptions) {
    // Only register namespace once
    void IModelApp.localization.registerNamespace(VersionCompareManager.namespace);

    this.changedElementsManager = new ChangedElementsManager(this);

    // Tooltip provider for type of change
    if (options.wantTooltipAugment) {
      const tooltipProvider = new ChangesTooltipProvider(this);
      IModelApp.viewManager.addToolTipProvider(tooltipProvider);
    }
  }

  public get filterSpatial(): boolean {
    return this.options.filterSpatial ?? true;
  }

  public get wantSavedFilters(): boolean {
    return this.wantPropertyFiltering && (this.options.wantSavedFilters ?? false);
  }
  public get wantPropertyFiltering(): boolean {
    return this.options.wantPropertyFiltering !== undefined && this.options.wantPropertyFiltering
      && this._hasPropertiesForFiltering;
  }
  public get wantTypeOfChange(): boolean {
    return this.options.wantTypeOfChange !== undefined && this.options.wantTypeOfChange && this._hasTypeOfChange;
  }
  public get reparentModelNodes(): boolean {
    return this.options.reparentModelNodes ?? false;
  }
  public get wantAllModels(): boolean {
    return this.options.wantAllModels ?? false;
  }
  public get wantNinezone(): boolean {
    return false;
  }

  /** Triggers when version compare processing is starting. */
  public versionCompareStarting = new BeEvent<() => void>();

  /**
   * Triggers when version compare startup finished successfully and provides a way to obtain the current IModel, the
   * target IModel for the version compared against and the changedElements retrieved from the service.
   */
  public versionCompareStarted = new BeEvent<(
    currentConnection: IModelConnection,
    targetConnection: IModelConnection,
    changedElements: ChangedElementEntry[],
  ) => void>();

  /** Triggers when starting version compare failed */
  public versionCompareStartFailed = new BeEvent<() => void>();

  /** Triggers when version compare visualization is stopped and visualization handlers are still available. */
  public versionCompareStopping = new BeEvent<() => void>();

  /** Triggers when version compare visualization is stopped. */
  public versionCompareStopped = new BeEvent<() => void>();

  /** Triggers during startup to show progress messages to any listener. */
  public loadingProgressEvent = new BeEvent<(message: string) => void>();

  /** Current Version for comparison. */
  public currentVersion: NamedVersion | undefined;

  /** Target Version for comparison. */
  public targetVersion: NamedVersion | undefined;

  private _currentIModel: IModelConnection | undefined;
  private _targetIModel: IModelConnection | undefined;

  /** Get current IModelConnection being compared against. */
  public get currentIModel() {
    return this._currentIModel;
  }

  /** Get target IModelConnection used to compare against. */
  public get targetIModel() {
    return this._targetIModel;
  }

  /** Returns true if version compare manager is currently engaged in comparison. */
  public get isComparing() {
    return this._targetIModel !== undefined;
  }

  /**
   * Request changed elements between two versions given from the Changed Elements Service.
   * @param currentIModel Current IModelConnection
   * @param current Current Version
   * @param target Target Version TODO
   */
  public async getChangedElements(
    _currentIModel: IModelConnection,
    _current: NamedVersion,
    _target: NamedVersion,
  ): Promise<ChangedElements[]> {
    return [];
  }

  /**
   * Starts comparison by opening a new iModelConnection and setting up the store.
   * @param currentIModel Current IModelConnection to be used to compare against
   * @param currentVersion Current Version of the iModel
   * @param targetVersion Target Version of the iModel, an IModelConnection is opened to it
   */
  public async startComparison(
    currentIModel: IModelConnection,
    currentVersion: NamedVersion,
    targetVersion: NamedVersion,
  ): Promise<boolean> {
    this._currentIModel = currentIModel;

    let success = true;
    try {
      if (!targetVersion.changesetId) {
        throw new Error("Cannot compare to a version if it doesn't contain a changeset Id");
      }

      // Raise event that comparison is starting
      this.versionCompareStarting.raiseEvent();

      if (!this._currentIModel.iModelId || !this._currentIModel.iTwinId) {
        throw new Error("Cannot compare with an iModel lacking iModelId or iTwinId (aka projectId)");
      }

      this.loadingProgressEvent.raiseEvent(
        IModelApp.localization.getLocalizedString("VersionCompare:versionCompareManager.msg_openingTarget"),
      );

      // Open the target version IModel
      const changesetId = targetVersion.changesetId;
      this._targetIModel = await CheckpointConnection.openRemote(
        this._currentIModel.iTwinId,
        this._currentIModel.iModelId,
        IModelVersion.asOfChangeSet(changesetId),
      );

      // Keep metadata around for UI uses and other queries
      this.currentVersion = currentVersion;
      this.targetVersion = targetVersion;

      this.loadingProgressEvent.raiseEvent(
        IModelApp.localization.getLocalizedString("VersionCompare:versionCompareManager.msg_getChangedElements"),
      );
      const changedElements = await this.getChangedElements(this._currentIModel, currentVersion, targetVersion);

      this.loadingProgressEvent.raiseEvent(
        IModelApp.localization.getLocalizedString("VersionCompare:versionCompareManager.msg_initializingComparison"),
      );

      let wantedModelClasses = [GeometricModel2dState.classFullName, GeometricModel3dState.classFullName];
      if (this.options.wantedModelClasses) {
        wantedModelClasses = this.options.wantedModelClasses;
      }

      await this.changedElementsManager.initialize(
        this._currentIModel,
        this._targetIModel,
        changedElements,
        this.wantAllModels ? undefined : wantedModelClasses,
        false,
        this.filterSpatial,
        this.loadingProgressEvent,
      );

      const changedElementEntries = this.changedElementsManager.entryCache.getAll();

      // We have type of change available if any of the entries has a valid type of change value
      this._hasTypeOfChange = changedElementEntries.some((entry) => entry.type !== 0);
      // We have property filtering available if any of the entries has a valid array of changed properties
      this._hasPropertiesForFiltering = changedElementEntries.some(
        (entry) => entry.properties !== undefined && entry.properties.size !== 0,
      );

      // Get the entries
      this.loadingProgressEvent.raiseEvent(
        IModelApp.localization.getLocalizedString("VersionCompare:versionCompareManager.msg_findingAssemblies"),
      );
      await this.changedElementsManager.entryCache.initialLoad(changedElementEntries.map((entry) => entry.id));

      // Reset the select tool to allow external iModels to be located
      await IModelApp.toolAdmin.startDefaultTool();

      // Enable visualization of version comparison
      await this.enableVisualization(false);

      // Raise event
      this.versionCompareStarted.raiseEvent(this._currentIModel, this._targetIModel, changedElementEntries);
      VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.versionCompareManagerStartedComparison);
    } catch (ex) {
      // Let user know comparison failed - TODO: Give better errors
      const briefError = IModelApp.localization.getLocalizedString(
        "VersionCompare:versionCompareManager.error_versionCompare",
      );
      const detailed = IModelApp.localization.getLocalizedString(
        "VersionCompare:versionCompareManager.error_cantStart",
      );
      let errorMessage = "Unknown Error";
      if (ex instanceof Error) {
        errorMessage = ex.message;
      } else if (typeof ex === "string") {
        errorMessage = ex;
      }
      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(OutputMessagePriority.Error, briefError, `${detailed}: ${errorMessage}`),
      );
      // Notify failure on starting comparison
      this.versionCompareStartFailed.raiseEvent();
      this._currentIModel = undefined;
      this._targetIModel = undefined;

      success = false;
      VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.versionCompareManagerErrorStarting);
    }

    return success;
  }

  /**
   * Enable visualization of version comparison.
   * @param wantTargetModified Show modified elements from target comparison in single viewport
   */
  public async enableVisualization(_wantTargetModified?: boolean, _focusedSelection?: KeySet): Promise<void> { }

  /** Stops version compare and releases resources */
  public async stopComparison(): Promise<void> {
    // Let listeners know we are cleaning up comparison
    this.versionCompareStopping.raiseEvent();

    try {
      if (this._targetIModel) {
        await this._targetIModel.close();
        this._targetIModel = undefined;
      }

      this.changedElementsManager.cleanup();

      // Reset the select tool to allow external iModels to be located
      await IModelApp.toolAdmin.startDefaultTool();
    } catch (ex) {
      // Log anything not a string or we don't handle
      Logger.logError(LOGGER_CATEGORY, "Failed to stop comparison", () => ({ ex }));
    }

    // Clean-up version data
    this.currentVersion = undefined;
    this.targetVersion = undefined;
    this._currentIModel = undefined;
    this._targetIModel = undefined;

    // Let listeners know we fully stopped comparison visualization
    this.versionCompareStopped.raiseEvent();

    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.versionCompareManagerStoppedComparison);
  }

  /** Initialize property comparison using the visualization handler. */
  public async initializePropertyComparison(): Promise<void> { }
}
