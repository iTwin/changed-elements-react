/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BeEvent, Logger } from "@itwin/core-bentley";
import { IModelVersion, type ChangedElements } from "@itwin/core-common";
import {
  CheckpointConnection, GeometricModel2dState, GeometricModel3dState, IModelApp, IModelConnection, NotifyMessageDetails,
  OutputMessagePriority
} from "@itwin/core-frontend";
import { KeySet } from "@itwin/presentation-common";
import type { NamedVersion } from "../clients/iModelsClient.js";
import { PropertyLabelCache } from "../dialogs/PropertyLabelCache.js";
import type { ChangedElementEntry } from "./ChangedElementEntryCache.js";
import { ChangedElementsApiClient, type ChangesetChunk } from "./ChangedElementsApiClient.js";
import { ChangedElementsManager } from "./ChangedElementsManager.js";
import { ChangesTooltipProvider } from "./ChangesTooltipProvider.js";
import { VersionCompareUtils, VersionCompareVerboseMessages } from "./VerboseMessages.js";
import { VersionCompare, type VersionCompareFeatureTracking, type VersionCompareOptions } from "./VersionCompare.js";
import { VisualizationHandler } from "./VisualizationHandler.js";

const LOGGER_CATEGORY = "Version-Compare";

/**
 * Main orchestrator for version compare functionality and workflows. This class does the following:
 *
 * 1. Handles the Design Review focused workflow of version compare by providing difference visualization via coloring
 *    elements in the view and displaying removed elements from older versions in the current application's viewport.
 * 2. Provides Property Comparison by starting up a special frontstage bundled with the version compare functionality.
 *    This frontstage provides side-by-side comparison and a property compare table.
 * 3. Handles obtaining the changed elements via Changed Elements Service.
 * 4. Provides the ITwinLocalization localization namespace for all version compare UI components.
 */
export class VersionCompareManager {
  /** Changed Elements Manager responsible for maintaining the elements obtained from the service */
  public changedElementsManager: ChangedElementsManager;

  private _visualizationHandler: VisualizationHandler | undefined;
  private _hasTypeOfChange = false;
  private _hasPropertiesForFiltering = false;
  private _hasParentIds = false;
  private _skipParentChildRelationships = false;

  /** Version Compare ITwinLocalization Namespace */
  public static namespace = "VersionCompare";

  /**
   * Constructor for VersionCompareManager. Registers the localization namespace for version compare.
   * @param frontstageIds Set of frontstage Ids where version compare should display visualization
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

  /** Create the proper visualization handler based on options */
  private _initializeVisualizationHandler(): void {
    this._visualizationHandler = this.options.createVisualizationHandler(this);
  }

  /** Visualization Handler for comparison */
  public get visualization(): VisualizationHandler | undefined {
    return this._visualizationHandler;
  }

  public get featureTracking(): VersionCompareFeatureTracking | undefined {
    return this.options.featureTracking;
  }

  public get filterSpatial(): boolean {
    return this.options.filterSpatial ?? this.options.changesetProcessor === undefined;
  }

  public get skipParentChildRelationships(): boolean {
    return this._skipParentChildRelationships;
  }

  public get wantPropertyFiltering(): boolean {
    return this._hasPropertiesForFiltering;
  }

  public get wantTypeOfChange(): boolean {
    return this._hasTypeOfChange;
  }

  public get wantFastParentLoad(): boolean {
    return this._hasParentIds;
  }

  public get wantAllModels(): boolean {
    return this.options.wantAllModels ?? false;
  }

  public get wantReportGeneration(): boolean {
    return this.options.wantReportGeneration ?? false;
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

  /** Triggers when starting version compare failed. */
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
  private _isComparisonStarted: boolean = false;

  /** Get current IModelConnection being compared against. */
  public get currentIModel(): IModelConnection | undefined {
    return this._currentIModel;
  }

  /** Get target IModelConnection used to compare against. */
  public get targetIModel(): IModelConnection | undefined {
    return this._targetIModel;
  }
  /** Returns true if version compare manager is ready to show loaded comparison.*/
  public get isComparisonReady(): boolean {
    return this._isComparisonStarted;
  }

  /** Returns true if version compare manager is currently engaged in comparison.*/
  public get isComparing(): boolean {
    return this._targetIModel !== undefined;
  }

  /**
   * Elements that should be ignored during initialization. Helpful for editing applications that may not want to
   * compare locally changed elements.
   */
  public ignoredElementIds: Set<string> | undefined;

  /** Filter the data with the ignoredElementIds. */
  private _filterIgnoredElementsFromChangeset = (changeset: ChangedElements): ChangedElements => {
    if (this.ignoredElementIds === undefined) {
      // Nothing to filter
      return changeset;
    }

    const filtered: ChangedElements = {
      elements: [],
      classIds: [],
      type: [],
      properties: changeset.properties !== undefined ? [] : undefined,
      opcodes: [],
      modelIds: changeset.modelIds !== undefined ? [] : undefined,
    };

    for (let i = 0; i < changeset.elements.length; ++i) {
      if (!this.ignoredElementIds.has(changeset.elements[i])) {
        filtered.elements.push(changeset.elements[i]);
        filtered.classIds.push(changeset.classIds[i]);
        filtered.opcodes.push(changeset.opcodes[i]);
        if (changeset.modelIds !== undefined && i < changeset.modelIds.length) {
          filtered.modelIds?.push(changeset.modelIds[i]);
        }

        if (changeset.type !== undefined && i < changeset.type.length) {
          filtered.type.push(changeset.type[i]);
        }

        if (changeset.properties !== undefined && i < changeset.properties.length) {
          filtered.properties?.push(changeset.properties[i]);
        }
      }
    }

    return filtered;
  };

  /** Filter the data array using the ignoredElementIds */
  private _filterIgnoredElementsFromChangesets = (changesets: ChangedElements[]): ChangedElements[] => {
    const filteredResults: ChangedElements[] = [];
    for (const cs of changesets) {
      filteredResults.push(this._filterIgnoredElementsFromChangeset(cs));
    }

    return filteredResults;
  };

  /**
   * Request changed elements between two versions given from the Changed Elements Service.
   * @param currentIModel Current IModelConnection
   * @param current Current Version
   * @param target Target Version TODO
   * @param changesetChunks [optional] If present, the provided chunks will be used to load changed element data
   */
  public async getChangedElements(
    currentIModel: IModelConnection,
    current: NamedVersion,
    target: NamedVersion,
    changesetChunks?: ChangesetChunk[],
  ): Promise<ChangedElements[]> {
    const projectId = currentIModel.iTwinId;
    const iModelId = currentIModel.iModelId;
    const client = VersionCompare.clientFactory?.createChangedElementsClient();
    if (!projectId || !iModelId || !current.changesetId || !target.changesetId || !client) {
      return [];
    }

    const changedElements = await (client instanceof ChangedElementsApiClient && changesetChunks
      ? client.getChangedElementsInChunks(projectId, iModelId, changesetChunks)
      : client.getChangedElements(projectId, iModelId, current.changesetId, target.changesetId));
    // Ignored the given element ids for editing apps to avoid comparing against locally modified elements
    if (this.ignoredElementIds !== undefined) {
      return this._filterIgnoredElementsFromChangesets(changedElements);
    }

    return changedElements;
  }

  /**
   * Starts comparison by opening a new iModelConnection and setting up the store.
   * @param currentIModel Current IModelConnection to be used to compare against
   * @param currentVersion Current Version of the iModel
   * @param targetVersion Target Version of the iModel, an IModelConnection is opened to it
   * @param _onViewChanged [optional] this event serves as a communication channel to let version compare frontstage
   *                       manager know about changes in categories/models/emphasize elements. The app should raise this
   *                       event whenever it changes anything related to view.
   * @param changesetChunks [optional] If present, the provided chunks will be used to load changed element data
   */
  public async startComparison(
    currentIModel: IModelConnection,
    currentVersion: NamedVersion,
    targetVersion: NamedVersion,
    _onViewChanged?: BeEvent<(args: unknown) => void>,
    changesetChunks?: ChangesetChunk[],
  ): Promise<boolean> {
    this._currentIModel = currentIModel;
    let success = true;
    try {
      if (!targetVersion.changesetId) {
        throw new Error("Cannot compare to a version if it doesn't contain a changeset Id");
      }

      // Setup visualization handler
      this._initializeVisualizationHandler();
      // Raise event that comparison is starting
      this.versionCompareStarting.raiseEvent();

      if (!this._currentIModel.iModelId || !this._currentIModel.iTwinId) {
        throw new Error("Cannot compare with an iModel lacking iModelId or iTwinId (aka projectId)");
      }

      this.loadingProgressEvent.raiseEvent(
        IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.msg_openingTarget"),
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
        IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.msg_getChangedElements"),
      );
      const changedElements = await this.getChangedElements(
        this._currentIModel,
        currentVersion,
        targetVersion,
        changesetChunks,
      );

      this.loadingProgressEvent.raiseEvent(
        IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.msg_initializingComparison"),
      );

      let wantedModelClasses = [
        GeometricModel2dState.classFullName,
        GeometricModel3dState.classFullName,
      ];
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

      // We have parent Ids available if any entries contain undefined parent data
      this._hasParentIds = changedElementEntries.some(
        (entry) => entry.parent !== undefined && entry.parentClassId !== undefined,
      );
      // We have type of change available if any of the entries has a valid type of change value
      this._hasTypeOfChange = changedElementEntries.some((entry) => entry.type !== 0);
      // We have property filtering available if any of the entries has a valid array of changed properties
      this._hasPropertiesForFiltering = changedElementEntries.some(
        (entry) => entry.properties !== undefined && entry.properties.size !== 0,
      );

      // Get the entries
      this.loadingProgressEvent.raiseEvent(
        IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.msg_findingAssemblies"),
      );
      await this.changedElementsManager.entryCache.initialLoad(changedElementEntries.map((entry) => entry.id));

      // Reset the select tool to allow external iModels to be located
      await IModelApp.toolAdmin.startDefaultTool();

      // Enable visualization of version comparison
      await this.enableVisualization(false);

      // Raise event
      this.versionCompareStarted.raiseEvent(this._currentIModel, this._targetIModel, changedElementEntries);
      VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.versionCompareManagerStartedComparison);
      this._isComparisonStarted = true;
      VersionCompare.manager?.featureTracking?.trackVersionSelectorUsage();
    } catch (ex) {
      // Let user know comparison failed - TODO: Give better errors
      const briefError = IModelApp.localization.getLocalizedString(
        "VersionCompare:versionCompare.error_versionCompare",
      );
      const detailed = IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.error_cantStart");
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
      this._isComparisonStarted = false;
      success = false;
      VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.versionCompareManagerErrorStarting);
    }

    return success;
  }

  /**
   * Uses the changeset processor to get the changed elements between two versions.
   * @param currentIModel
   * @param currentVersion
   * @param targetVersion
   * @returns
   */
  public async startDirectComparison(
    currentIModel: IModelConnection,
    currentVersion: NamedVersion,
    targetVersion: NamedVersion): Promise<boolean> {
    this._currentIModel = currentIModel;
    let success = true;
    this._skipParentChildRelationships = true;
    const startTime = new Date();
    try {
      const changesetProcessor = VersionCompare.changesetProcessor;
      if (!changesetProcessor) {
        throw new Error("Cannot do direct comparison without a changeset processor");
      }

      // Setup visualization handler
      this._initializeVisualizationHandler();
      // Raise event that comparison is starting
      this.versionCompareStarting.raiseEvent();

      if (!this._currentIModel.iModelId || !this._currentIModel.iTwinId) {
        throw new Error("Cannot compare with an iModel lacking iModelId or iTwinId (aka projectId)");
      }

      this.loadingProgressEvent.raiseEvent(
        IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.msg_openingTarget"),
      );

      // Open the target version IModel
      const changesetId = targetVersion.changesetId;
      this._targetIModel = await CheckpointConnection.openRemote(
        this._currentIModel.iTwinId,
        this._currentIModel.iModelId,
        IModelVersion.asOfChangeSet(changesetId!),
      );
      const changedElements = [await changesetProcessor(
        { id: targetVersion.changesetId ?? "", index: targetVersion.changesetIndex ?? 0 },
        {
          id: currentVersion.changesetId ?? "", index: currentVersion.changesetIndex ?? 0,
        }, currentIModel)];
      if (!targetVersion.changesetId) {
        throw new Error("Cannot compare to a version if it doesn't contain a changeset Id");
      }

      // Keep metadata around for UI uses and other queries
      this.currentVersion = currentVersion;
      this.targetVersion = targetVersion;

      this.loadingProgressEvent.raiseEvent(
        IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.msg_getChangedElements"),
      );

      this.loadingProgressEvent.raiseEvent(
        IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.msg_initializingComparison"),
      );

      let wantedModelClasses = [
        GeometricModel2dState.classFullName,
        GeometricModel3dState.classFullName,
      ];
      if (this.options.wantedModelClasses) {
        wantedModelClasses = this.options.wantedModelClasses;
      }
      let filteredChangedElements = changedElements;
      if (this.ignoredElementIds !== undefined) {
        filteredChangedElements = this._filterIgnoredElementsFromChangesets(changedElements);
      }
      await this.changedElementsManager.initialize(
        this._currentIModel,
        this._targetIModel,
        filteredChangedElements,
        this.wantAllModels ? undefined : wantedModelClasses,
        false,
        this.filterSpatial,
        this.loadingProgressEvent,
      );
      const changedElementEntries = this.changedElementsManager.entryCache.getAll();

      // We have parent Ids available if any entries contain undefined parent data
      this._hasParentIds = false;
      // We have type of change available if any of the entries has a valid type of change value
      this._hasTypeOfChange = changedElementEntries.some((entry) => entry.type !== 0);
      // We have property filtering available if any of the entries has a valid array of changed properties
      this._hasPropertiesForFiltering = changedElementEntries.some(
        (entry) => entry.properties !== undefined && entry.properties.size !== 0,
      );

      // Get the entries
      this.loadingProgressEvent.raiseEvent(
        IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.msg_findingAssemblies"),
      );
      await this.changedElementsManager.entryCache.initialLoad(changedElementEntries.map((entry) => entry.id), true);

      // Reset the select tool to allow external iModels to be located
      await IModelApp.toolAdmin.startDefaultTool();

      // Enable visualization of version comparison
      await this.enableVisualization(false);

      // Raise event
      this.versionCompareStarted.raiseEvent(this._currentIModel, this._targetIModel, changedElementEntries);
      VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.versionCompareManagerStartedComparison);
      VersionCompare.manager?.featureTracking?.trackVersionSelectorV2Usage();
      const endTime = new Date();
      console.log(`Direct Comparison started at: ${startTime.toISOString()}`);
      console.log(`Direct Comparison ended at: ${endTime.toISOString()}`);
      console.log(`Direct Comparison Duration: ${endTime.getTime() - startTime.getTime()} milliseconds`);
    } catch (ex) {
      // Let user know comparison failed - TODO: Give better errors
      const briefError = IModelApp.localization.getLocalizedString(
        "VersionCompare:versionCompare.error_versionCompare",
      );
      const detailed = IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.error_cantStart");
      let errorMessage = "Unknown Error";
      if (ex instanceof Error) {
        errorMessage = ex.message;
      } else if (typeof ex === "string") {
        errorMessage = ex;
      }

      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(OutputMessagePriority.Error, briefError, `${detailed}: ${errorMessage}`),
      );
      try {
        this.versionCompareStartFailed.raiseEvent();
      } finally {
        this._currentIModel = undefined;
        this._targetIModel = undefined;
        success = false;
        this._skipParentChildRelationships = false;
        VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.versionCompareManagerErrorStarting);

        await this.stopComparison();
      }
    }

    return success;
  }
  /**
   * Starts comparison by opening a new iModelConnection and setting up the store.
   * @param currentIModel Current IModelConnection to be used to compare against
   * @param currentVersion Current Version of the iModel
   * @param targetVersion Target Version of the iModel, an IModelConnection is opened to it
   * @param changedElements Array of elements that have changed and need to be visualized
   */
  public async startComparisonV2(
    currentIModel: IModelConnection,
    currentVersion: NamedVersion,
    targetVersion: NamedVersion,
    changedElements: ChangedElements[],
  ): Promise<boolean> {
    this._currentIModel = currentIModel;
    let success = true;
    const startTime = new Date();
    try {
      if (!targetVersion.changesetId) {
        throw new Error("Cannot compare to a version if it doesn't contain a changeset Id");
      }

      // Setup visualization handler
      this._initializeVisualizationHandler();
      // Raise event that comparison is starting
      this.versionCompareStarting.raiseEvent();

      if (!this._currentIModel.iModelId || !this._currentIModel.iTwinId) {
        throw new Error("Cannot compare with an iModel lacking iModelId or iTwinId (aka projectId)");
      }

      this.loadingProgressEvent.raiseEvent(
        IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.msg_openingTarget"),
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
        IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.msg_getChangedElements"),
      );

      this.loadingProgressEvent.raiseEvent(
        IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.msg_initializingComparison"),
      );

      let wantedModelClasses = [
        GeometricModel2dState.classFullName,
        GeometricModel3dState.classFullName,
      ];
      if (this.options.wantedModelClasses) {
        wantedModelClasses = this.options.wantedModelClasses;
      }
      let filteredChangedElements = changedElements;
      if (this.ignoredElementIds !== undefined) {
        filteredChangedElements = this._filterIgnoredElementsFromChangesets(changedElements);
      }
      await this.changedElementsManager.initialize(
        this._currentIModel,
        this._targetIModel,
        filteredChangedElements,
        this.wantAllModels ? undefined : wantedModelClasses,
        false,
        this.filterSpatial,
        this.loadingProgressEvent,
      );
      const changedElementEntries = this.changedElementsManager.entryCache.getAll();

      // We have parent Ids available if any entries contain undefined parent data
      this._hasParentIds = changedElementEntries.some(
        (entry) => entry.parent !== undefined && entry.parentClassId !== undefined,
      );
      // We have type of change available if any of the entries has a valid type of change value
      this._hasTypeOfChange = changedElementEntries.some((entry) => entry.type !== 0);
      // We have property filtering available if any of the entries has a valid array of changed properties
      this._hasPropertiesForFiltering = changedElementEntries.some(
        (entry) => entry.properties !== undefined && entry.properties.size !== 0,
      );

      // Get the entries
      this.loadingProgressEvent.raiseEvent(
        IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.msg_findingAssemblies"),
      );
      await this.changedElementsManager.entryCache.initialLoad(changedElementEntries.map((entry) => entry.id));

      // Reset the select tool to allow external iModels to be located
      await IModelApp.toolAdmin.startDefaultTool();

      // Enable visualization of version comparison
      await this.enableVisualization(false);

      // Raise event
      this.versionCompareStarted.raiseEvent(this._currentIModel, this._targetIModel, changedElementEntries);
      VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.versionCompareManagerStartedComparison);
      this._isComparisonStarted = true;
      VersionCompare.manager?.featureTracking?.trackVersionSelectorV2Usage();
      const endTime = new Date();
      console.log(`V2 Comparison started at: ${startTime.toISOString()}`);
      console.log(`V2 Comparison ended at: ${endTime.toISOString()}`);
      console.log(`V2 Comparison Duration: ${endTime.getTime() - startTime.getTime()} milliseconds`);
    } catch (ex) {
      // Let user know comparison failed - TODO: Give better errors
      const briefError = IModelApp.localization.getLocalizedString(
        "VersionCompare:versionCompare.error_versionCompare",
      );
      const detailed = IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.error_cantStart");
      let errorMessage = "Unknown Error";
      if (ex instanceof Error) {
        errorMessage = ex.message;
      } else if (typeof ex === "string") {
        errorMessage = ex;
      }

      IModelApp.notifications.outputMessage(
        new NotifyMessageDetails(OutputMessagePriority.Error, briefError, `${detailed}: ${errorMessage}`),
      );
      try {
        this.versionCompareStartFailed.raiseEvent();
      } finally {
        this._currentIModel = undefined;
        this._targetIModel = undefined;
        this._isComparisonStarted = false;
        success = false;
        VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.versionCompareManagerErrorStarting);

        await this.stopComparison();
      }
    }

    return success;
  }

  /**
   * Enable visualization of version comparison.
   * @param wantTargetModified Show modified elements from target comparison in single viewport
   */
  public async enableVisualization(wantTargetModified?: boolean, focusedSelection?: KeySet): Promise<void> {
    // TODO: Handle proper viewports
    await this._visualizationHandler?.enableVisualization({ wantTargetModified, focusedSelection });
  }

  /** Enable side by side visualization and viewport syncing. */
  public async enableSideBySideVisualization(): Promise<void> {
    await this._visualizationHandler?.enableSideBySideVisualization();
  }

  /** Stops version compare and releases resources. */
  public async stopComparison(): Promise<void> {
    // Let listeners know we are cleaning up comparison
    this.versionCompareStopping.raiseEvent();
    try {
      if (this._targetIModel) {
        await this._targetIModel.close();
        this._targetIModel = undefined;
        this._isComparisonStarted = false;
      }

      this.changedElementsManager.cleanup();

      // Reset the select tool to allow external iModels to be located
      await IModelApp.toolAdmin.startDefaultTool();
    } catch (ex) {
      this._isComparisonStarted = false;
      // Log anything not a string or we don't handle
      Logger.logError(LOGGER_CATEGORY, "Failed to stop comparison", () => ({ ex }));
    }

    // Clean-up version data
    this.currentVersion = undefined;
    this.targetVersion = undefined;
    this._currentIModel = undefined;
    this._targetIModel = undefined;
    this._isComparisonStarted = false;
    this._skipParentChildRelationships = false;

    // Clean-up visualization handler
    await this._visualizationHandler?.cleanUp();

    // Clear property label cache
    PropertyLabelCache.clearCache();

    // Let listeners know we fully stopped comparison visualization
    this.versionCompareStopped.raiseEvent();

    VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.versionCompareManagerStoppedComparison);
  }

  /**
   * Initialize property comparison using the visualization handler
   */
  public async initializePropertyComparison(): Promise<void> {
    VersionCompare.manager?.featureTracking?.trackPropertyComparisonUsage();
    await this._visualizationHandler?.startPropertyComparison();
  }
}
