/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BeEvent, DbOpcode, type Id64String } from "@itwin/core-bentley";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";

import { ChangesTreeDataProvider } from "../api/ChangesTreeDataProvider.js";
import { ChangedElementsChildrenCache } from "./ChangedElementsChildrenCache.js";
import { ChangedElementsLabelsCache } from "./ChangedElementsLabelCache.js";
import { mergeProperties } from "./ChangedElementsManager.js";
import {
  findTopParents, generateEntryFromQueryData, queryEntryDataBulk, type ChangedElementQueryData
} from "./ElementQueries.js";
import { VersionCompareUtils, VersionCompareVerboseMessages } from "./VerboseMessages.js";
import { VersionCompare } from "./VersionCompare.js";
import { VersionCompareManager } from "./VersionCompareManager.js";

/** Changed property for a changed element */
export interface Checksums {
  newChecksum: number | undefined;
  oldChecksum: number | undefined;
}

/** ChangedElement */
export interface ChangedElement {
  id: Id64String;
  classId: Id64String;
  opcode: DbOpcode;
  type: number;
  modelId?: Id64String;
  parent?: string;
  parentClassId?: string;
  properties?: Map<string, Checksums>;
}

export enum ChangeElementType {
  Element = 0,
  Assembly,
  TopAssembly,
}

/** Changed element entry */
export interface ChangedElementEntry extends ChangedElement {
  label?: string;
  code?: string;
  classFullName?: string;
  // Found in current iModel or not
  foundInCurrent?: boolean;
  elementType?: ChangeElementType;
  hasChangedChildren?: boolean;
  children?: string[];
  directChildren?: string[];
  loaded: boolean;
  indirect?: boolean;
}

/** Cache for changed element entries that are maintained and populated with labels as we load labels with the cache */
export class ChangedElementEntryCache {
  constructor(private _manager: VersionCompareManager) { }

  private _changedElementEntries: Map<string, ChangedElementEntry> = new Map<
    string,
    ChangedElementEntry
  >();
  public get changedElementEntries() {
    return this._changedElementEntries;
  }

  private _labels: ChangedElementsLabelsCache | undefined;
  public get labels(): ChangedElementsLabelsCache | undefined {
    return this._labels;
  }
  private _childrenCache: ChangedElementsChildrenCache | undefined;
  public get childrenCache(): ChangedElementsChildrenCache | undefined {
    return this._childrenCache;
  }
  private _uiDataProvider: ChangesTreeDataProvider | undefined;
  public get dataProvider(): ChangesTreeDataProvider | undefined {
    return this._uiDataProvider;
  }
  private _currentIModel: IModelConnection | undefined;
  private _targetIModel: IModelConnection | undefined;
  private _progressLoadingEvent?: BeEvent<(message: string) => void>;
  private _currentLoadingMessage = "";
  private _numSteps = 0;
  private _numProgress = 0;

  private readonly _findTopParentChunkSize = 1000;
  private readonly _queryEntryChunkSize = 1000;

  private _outputCurrentLoadingMessage() {
    if (this._numProgress > this._numSteps) {
      this._numProgress = this._numSteps;
    }
    const percentage = Math.floor((this._numProgress / this._numSteps) * 100);
    if (this._progressLoadingEvent) {
      this._progressLoadingEvent.raiseEvent(this._currentLoadingMessage + " (" + percentage + "%)");
    }
  }

  private _updateLoadingProgress = () => {
    this._numProgress++;
    this._outputCurrentLoadingMessage();
  };

  private _setCurrentLoadingMessage(key: string, numSteps: number) {
    this._currentLoadingMessage = IModelApp.localization.getLocalizedString("VersionCompare:versionCompare." + key);
    this._numSteps = numSteps;
    this._numProgress = 0;
  }

  /**
   * Get entries filtered by opcode
   * @param opcode Opcode for the changed element
   */
  public filterByOpcode(opcode: DbOpcode) {
    const filtered: ChangedElementEntry[] = [];
    this._changedElementEntries.forEach((entry: ChangedElementEntry) => {
      if (entry.opcode === opcode) {
        filtered.push(entry);
      }
    });
    return filtered;
  }

  /**
   * Initialize the changed elmeent entry cache with a bunch of changed elmeents
   * @param elements Map of changed elements
   */
  public initialize(
    currentIModel: IModelConnection,
    targetIModel: IModelConnection,
    elements: Map<string, ChangedElement>,
    progressLoadingEvent?: BeEvent<(message: string) => void>,
  ) {
    this._progressLoadingEvent = progressLoadingEvent;
    elements.forEach((element: ChangedElement, elementId: string) => {
      const entry: ChangedElementEntry = {
        id: elementId,
        classId: element.classId,
        opcode: element.opcode,
        type: element.type,
        modelId: element.modelId,
        properties: element.properties,
        parent: element.parent,
        parentClassId: element.parentClassId,
        loaded: false,
      };
      this._changedElementEntries.set(elementId, entry);
    });

    this._currentIModel = currentIModel;
    this._targetIModel = targetIModel;
    this._labels = new ChangedElementsLabelsCache(currentIModel, targetIModel);
    this._childrenCache = new ChangedElementsChildrenCache(
      currentIModel,
      targetIModel,
      elements,
    );
  }

  /**
   * Clean-up data
   */
  public cleanup() {
    this._labels = undefined;
    this._childrenCache = undefined;
    this._uiDataProvider = undefined;
    this._changedElementEntries.clear();
  }

  /**
   * Returns true if an entry has been fully loaded
   * (e.g. we have already loaded its child elements and label)
   * @param entry
   * @returns True if loaded
   */
  public isLoaded = (entry: ChangedElementEntry) => {
    return (
      entry.loaded &&
      entry.directChildren !== undefined &&
      entry.label !== undefined
    );
  };

  /**
   * Find which entries are not yet loaded
   * @param elementIds Ids of elements to check in cache
   */
  private _findNotLoadedEntries(elementIds: string[]): ChangedElementEntry[] {
    const needToLoad: ChangedElementEntry[] = [];
    elementIds.forEach((elementId: string) => {
      const entry = this._changedElementEntries.get(elementId);
      if (entry && !this.isLoaded(entry)) {
        needToLoad.push(entry);
      }
    });
    return needToLoad;
  }

  /**
   * Override the given entries in the cache
   * @param entries Entries to override
   * @param markLoaded Whether to mark them as loaded
   */
  private _overrideEntriesInCache(
    entries: ChangedElementEntry[],
    markLoaded?: boolean,
  ) {
    entries.forEach((entry: ChangedElementEntry) => {
      const id = entry.id;
      // We may pass in duplicate entries since we query both iModels for child elements
      // So if we find duplicates of the entries, merge them into one
      if (this._changedElementEntries.has(id)) {
        const dup = this._changedElementEntries.get(id);
        let properties: Map<string, Checksums> | undefined = mergeProperties(
          dup?.properties,
          entry.properties,
        );
        if (properties.size === 0) {
          properties = undefined;
        }
        const updatedEntry: ChangedElementEntry = {
          ...dup,
          ...entry,
          // Merge properties
          properties,
          // Merge children of entries
          children: [...(dup?.children ?? []), ...(entry.children ?? [])],
          loaded: markLoaded ? true : false,
        };

        this._changedElementEntries.set(id, updatedEntry);
      } else {
        this._changedElementEntries.set(
          id,
          markLoaded ? { ...entry, loaded: true } : entry,
        );
      }
    });
  }

  /**
   * Create a fake entry for elements that may be part of the hierarchy
   * but that do not contain changes in the change data
   * @param id
   * @returns
   */
  private _manufactureUnchangedEntry = (id: string): ChangedElementEntry => {
    return {
      id,
      opcode: DbOpcode.Update,
      classId: "",
      loaded: false,
      type: 0,
      indirect: true,
    };
  };

  /**
   * Loads the direct children of the entries passed
   * Creates faked unchanged entries and loads them
   * if necessary for elements that did not change
   * but are part of the hierarchy
   * @param entries
   * @returns true if successful
   */
  private _loadDirectChildrenEntries = async (entries: ChangedElementEntry[]): Promise<boolean> => {
    const childrenEntries = [];
    // Go through each entry and their direct children
    for (const entry of entries) {
      if (entry.directChildren) {
        for (const childId of entry.directChildren) {
          // Find the changed children
          let child = this._changedElementEntries.get(childId);
          // If this is an element that didn't change, manufacture
          // an "indirect" entry
          if (child === undefined) {
            child = this._manufactureUnchangedEntry(childId);
          }
          childrenEntries.push(child);
        }
      }
    }
    // Load the entries without their children
    return this.loadEntries(childrenEntries, false);
  };

  /**
   * Loads the given entries by querying for their labels and children
   * @param entries
   * @param loadDirectChildren whether to load the direct children of the entries too
   * @returns true if load was successful
   */
  public loadEntries = async (
    entries: ChangedElementEntry[],
    loadDirectChildren?: boolean,
  ): Promise<boolean> => {
    if (this._labels === undefined || this._childrenCache === undefined) {
      return false;
    }
    // Load entries with their labels
    const withLabels = await this._labels?.populateEntries(entries);
    // Load entries with their children
    const withChild = await this._childrenCache?.populateEntries(withLabels);
    // Update entries in cache and mark them loaded
    this._overrideEntriesInCache(withChild, true);

    // Load direct children entries if necessary
    if (loadDirectChildren) {
      return this._loadDirectChildrenEntries(withChild);
    }

    // Successful load
    return true;
  };

  /**
   * Gets whatever entries are cached for the given element Ids
   * @param elementIds
   * @returns
   */
  private _getCachedEntriesByIds = (elementIds: string[]) => {
    const loadedEntries: ChangedElementEntry[] = [];
    for (const id of elementIds) {
      const entry = this._changedElementEntries.get(id);
      if (entry !== undefined) {
        loadedEntries.push(entry);
      }
    }
    return loadedEntries;
  };

  /**
   * Get loaded changed element entries for the given element Ids. Loads them if needed.
   * @param elementIds Element Ids to obtain entries for
   */
  public async get(elementIds: string[]): Promise<ChangedElementEntry[]> {
    const entries = this._findNotLoadedEntries(elementIds);
    if (entries.length === 0) {
      return this._getCachedEntriesByIds(elementIds);
    }

    // Load the entries fully
    await this.loadEntries(entries);
    // Return the entries since they should be cached now
    return this._getCachedEntriesByIds(elementIds);
  }

  /**
   * Initially loads the given element ids to be visualized and displayed in UI
   * @param elementIds
   */
  public async initialLoad(elementIds: string[]): Promise<void> {
    const entries = this._findNotLoadedEntries(elementIds);
    // Prepare the entries for usage in UI components
    await this._prepareEntries(entries);
  }

  /**
   * Gets all entries at the moment, loaded or not loaded
   */
  public getAll(): ChangedElementEntry[] {
    const all: ChangedElementEntry[] = [];
    this._changedElementEntries.forEach((entry: ChangedElementEntry) => {
      all.push(entry);
    });
    return all;
  }

  public getCurrent(id: string): ChangedElementEntry | undefined {
    return this._changedElementEntries.get(id);
  }

  public getCached(ids: string[]): ChangedElementEntry[] {
    const entries: ChangedElementEntry[] = [];
    for (const id of ids) {
      const entry = this._changedElementEntries.get(id);
      if (entry !== undefined) {
        entries.push(entry);
      }
    }
    return entries;
  }

  /**
   * Potentially very slow, but needed if we intend to generate reports
   */
  public async loadAndGetAllWithLabels(): Promise<ChangedElementEntry[]> {
    const ids: string[] = [];
    this._changedElementEntries.forEach(
      (_entry: ChangedElementEntry, id: string) => {
        ids.push(id);
      },
    );
    const entries = await this.getCached(ids);
    if (this._labels !== undefined) {
      return this._labels.populateEntries(entries);
    }
    return entries;
  }

  /**
   * Gets Element Ids of all 'changed' elements, indirectly related changed parents
   * and unchanged child elements of a changed element
   * Useful for controlling visibility of all elements related to the comparison
   */
  public getIdsOfAllChangedElements() {
    const ids = new Set<string>();
    this._changedElementEntries.forEach((entry: ChangedElementEntry) => {
      ids.add(entry.id);
      if (entry.children !== undefined) {
        entry.children.forEach((id: string) => ids.add(id));
      }
    });
    return ids;
  }
  /**
   * Returns the ChangedElementEntry array that relates to the element Ids.
   * This will return whatever is in the cache at the moment
   * @param elementIds Set of element ids to return entries for
   * @param wantChildren If true, will also return entries for the children
   */
  public getEntries(
    elementIds: Set<string>,
    wantChildren?: boolean,
  ): ChangedElementEntry[] {
    const all = this.getAll();
    const entries: ChangedElementEntry[] = [];
    const childElementIds = new Set<string>();
    for (const elem of all) {
      if (elementIds.has(elem.id)) {
        entries.push(elem);
        if (wantChildren && elem.children) {
          for (const child of elem.children) {
            childElementIds.add(child);
          }
        }
      }
    }
    if (wantChildren) {
      for (const elem of all) {
        if (childElementIds.has(elem.id)) {
          entries.push(elem);
        }
      }
    }
    return entries;
  }

  /**
   * Returns true if the cache has this element in comparison
   * @param id Id of element to check
   */
  public has(id: string): boolean {
    return this._changedElementEntries.has(id);
  }

  /**
   * Finds the top parents in the internal entries map
   * Only useful if change data contains the parent ids
   * @returns array of parent Ids
   */
  private _findTopParentsInEntries = async (
    iModel: IModelConnection,
    elementIds: string[],
  ): Promise<string[]> => {
    const topParents = new Set<string>();
    const wantedElementIds = new Set<string>(elementIds);
    const elementsMissingParents = new Set<string>();

    for (const entry of this._changedElementEntries) {
      if (wantedElementIds.has(entry[0]) && entry[1].parent !== undefined) {
        if (entry[1].parent === "0") {
          topParents.add(entry[1].id);
        } else if (entry[1].parent === "") {
          // In the case that CELES accumulated old changesets with missing
          // parent data, ensure we find these cases and query for their parents
          elementsMissingParents.add(entry[1].id);
        } else {
          topParents.add(entry[1].parent);
        }
      }
    }

    let result: string[] = [];
    // Query for the parents of elements missing parent data
    if (elementsMissingParents.size !== 0) {
      const missingParentArray: string[] = [];
      // Do a for each instead of spread in case we have too many elements for a spread
      elementsMissingParents.forEach((id: string) =>
        missingParentArray.push(id),
      );
      // Query top parents of missing parent elements
      result = await findTopParents(
        iModel,
        missingParentArray,
        this._findTopParentChunkSize,
        this._updateLoadingProgress,
      );
    }

    // Can't use simple spread operator because we may have too long a set
    for (const parent of topParents) {
      result.push(parent);
    }

    return result;
  };

  /**
   * Find the top parents of the elements given
   * @param iModel
   * @param elementIds
   * @returns
   */
  private _findTopParents = async (
    iModel: IModelConnection,
    elementIds: string[],
  ): Promise<string[]> => {
    if (VersionCompare.manager?.wantFastParentLoad) {
      return this._findTopParentsInEntries(iModel, elementIds);
    }

    return findTopParents(
      iModel,
      elementIds,
      this._findTopParentChunkSize,
      this._updateLoadingProgress,
    );
  };

  /**
   * Populates children arrays using the top parent information available
   * in the change data
   */
  private _findChildrenOfTopParents = () => {
    // This is only necessary for fast parent load functionality
    if (!this._manager.wantFastParentLoad) {
      return;
    }

    // Go through all changed element entries
    // At this point, we should even have the "fake" entries in this set
    for (const pair of this._changedElementEntries) {
      const entry = pair[1];
      // If we have a valid parent Id, find it
      if (entry.parent && entry.parent !== "0") {
        const parentEntry = this._changedElementEntries.get(entry.parent);
        if (parentEntry) {
          // Append the child element to the parent entry
          if (parentEntry.children === undefined) {
            parentEntry.children = [];
          }
          parentEntry.children.push(entry.id);
        }
      }
    }
  };

  /**
   * Prepares all changed element entries by finding their parents
   * and creating any necessary "fake" entries for parent nodes that do not
   * exist in the change data. This gets the entry cache ready to be used
   * by our UI components
   *
   * In the case of not wanting fast parent loading, this function will
   * query for the parent elements and direct children of the elements
   * so that we may be ready to present them in the UI
   *
   * @param entries Changed Element Entries to prepare into the entry cache
   */
  private _prepareEntries = async (entries: ChangedElementEntry[]) => {
    if (!this._currentIModel || !this._targetIModel || !this._labels) {
      VersionCompareUtils.outputVerbose(VersionCompareVerboseMessages.changeElementEntryCacheErrorNotInitialized);
      return;
    }

    // Separate by entries present in current IModel and target IModel
    const currentEntryIds = entries
      .filter((elem: ChangedElementEntry) => {
        return elem.opcode !== DbOpcode.Delete;
      })
      .map((elem: ChangedElementEntry) => elem.id);
    const targetEntryIds = entries
      .filter((elem: ChangedElementEntry) => {
        return elem.opcode === DbOpcode.Delete;
      })
      .map((elem: ChangedElementEntry) => elem.id);

    // Find top parents
    const numTopParentQueries =
      (currentEntryIds.length + targetEntryIds.length) /
      this._findTopParentChunkSize +
      1;
    this._setCurrentLoadingMessage("msg_findingParents", numTopParentQueries);
    const currentTopParents = await this._findTopParents(
      this._currentIModel,
      currentEntryIds,
    );
    const targetTopParents = await this._findTopParents(
      this._targetIModel,
      targetEntryIds,
    );

    // Find which parents require querying and which ones are available in entries
    const unchangedCurrentTopParents = [];
    const unchangedTargetTopParents = [];
    const availableCurrentTopParents = [];
    const availableTargetTopParents = [];

    // TODO: Consider if we are doing fast parent loading
    for (const parent of currentTopParents) {
      if (!this._changedElementEntries.has(parent)) {
        unchangedCurrentTopParents.push(parent);
      } else {
        availableCurrentTopParents.push(parent);
      }
    }

    // TODO: Consider if we are doing fast parent loading
    for (const parent of targetTopParents) {
      if (!this._changedElementEntries.has(parent)) {
        unchangedTargetTopParents.push(parent);
      } else {
        availableTargetTopParents.push(parent);
      }
    }

    // Get entry data for parents
    const numEntryQueries =
      (unchangedCurrentTopParents.length + unchangedTargetTopParents.length) /
      this._queryEntryChunkSize +
      1;
    this._setCurrentLoadingMessage("msg_obtainingElementData", numEntryQueries);
    const currentParentEntries = await queryEntryDataBulk(
      this._currentIModel,
      VersionCompare.manager?.wantFastParentLoad
        ? unchangedCurrentTopParents
        : currentTopParents,
      this._queryEntryChunkSize,
      this._updateLoadingProgress,
    );
    const targetParentEntries = await queryEntryDataBulk(
      this._targetIModel,
      VersionCompare.manager?.wantFastParentLoad
        ? unchangedTargetTopParents
        : targetTopParents,
      this._queryEntryChunkSize,
      this._updateLoadingProgress,
    );

    // Put all data into arrays
    const currentQueryData: ChangedElementQueryData[] = [];
    const targetQueryData: ChangedElementQueryData[] = [];
    // Cannot spread because results may be too long for spread operator
    for (const entry of currentParentEntries) {
      currentQueryData.push(entry);
    }
    // Cannot spread because results may be too long for spread operator
    for (const entry of targetParentEntries) {
      targetQueryData.push(entry);
    }

    // Create changed element entries by merging all data
    let parentEntries: ChangedElementEntry[] = [];
    for (const value of currentQueryData) {
      const currentEntry = this._changedElementEntries.get(value.id);
      const entry = generateEntryFromQueryData(value, true, currentEntry);
      parentEntries.push(entry);
    }
    for (const value of targetQueryData) {
      const currentEntry = this._changedElementEntries.get(value.id);
      const entry = generateEntryFromQueryData(value, false, currentEntry);
      parentEntries.push(entry);
    }

    // If leveraging parent id data from change data, then push the available parents into our array
    if (VersionCompare.manager?.wantFastParentLoad) {
      for (const id of availableCurrentTopParents) {
        const entry = this._changedElementEntries.get(id);
        if (entry) {
          parentEntries.push(entry);
        }
      }
      for (const id of availableTargetTopParents) {
        const entry = this._changedElementEntries.get(id);
        if (entry) {
          parentEntries.push(entry);
        }
      }
    }

    // Load child elements of the root nodes if we are not using fast parent loading
    if (this._childrenCache && !VersionCompare.manager?.wantFastParentLoad) {
      // Set update function for UI updates
      this._childrenCache.updateFunction = this._updateLoadingProgress;
      const numQueries = this._childrenCache.calculateNumberOfRequests(
        parentEntries.length,
      );
      this._setCurrentLoadingMessage("msg_findingChildren", numQueries);
      // Populate parent entries with their child elements
      parentEntries = await this._childrenCache.populateEntries(parentEntries);
      // Clean-up usage of update function
      this._childrenCache.updateFunction = undefined;
    }

    // Put together all entries
    const finalEntries: ChangedElementEntry[] = [];
    const parentEntryIds = new Set(parentEntries.map((entry: ChangedElementEntry) => entry.id));
    for (const parent of parentEntries) {
      finalEntries.push({
        ...parent,
        elementType: ChangeElementType.TopAssembly,
      });
    }
    for (const value of entries) {
      // Avoid re-adding parents that exist in the entries already
      if (!parentEntryIds.has(value.id)) {
        finalEntries.push(value);
      }
    }
    // Override those entries in the cache
    this._overrideEntriesInCache(finalEntries);
    // Go through all our entries and use the top parent information
    // to create the children arrays of top parents
    this._findChildrenOfTopParents();

    // Create the data provider and load the changed model nodes
    if (this._uiDataProvider === undefined) {
      // TODO: Improve percentage feedback with query size
      // For now, use the 6 steps (3 per iModel) to get the models
      this._setCurrentLoadingMessage("loadingModelNodes", 6);
      this._updateLoadingProgress();
      this._uiDataProvider = new ChangesTreeDataProvider(this._manager);
      await this._uiDataProvider.loadChangedModelNodes(
        this._currentIModel,
        this._targetIModel,
      );
    }
  };
}
