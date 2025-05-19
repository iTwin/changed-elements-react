/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BeEvent, DbOpcode } from "@itwin/core-bentley";
import { QueryBinder, QueryRowFormat, TypeOfChange, type ChangedElements } from "@itwin/core-common";
import { IModelApp, IModelConnection, ModelState } from "@itwin/core-frontend";

import { ChangedElementEntry, ChangedElementEntryCache, type ChangedElement, type Checksums } from "./ChangedElementEntryCache.js";
import { ChangedElementsChildrenCache } from "./ChangedElementsChildrenCache.js";
import { ChangedElementsLabelsCache } from "./ChangedElementsLabelCache.js";
import { VersionCompareManager } from "./VersionCompareManager.js";

/** Properties that are not shown but still found by the agent */
const ignoredProperties = ["Checksum", "Version"];

/** Returns true if the element has the given type of change. */
export const hasTypeOfChange = (element: ChangedElement, toc: TypeOfChange) => {
  return (element.type & toc) !== 0;
};

/** Cleans properties that should be ignored in an element */
export const cleanIgnoredProperties = (element: ChangedElement): void => {
  if (element.properties === undefined) {
    return;
  }

  for (const prop of ignoredProperties) {
    element.properties?.delete(prop);
  }
};

/**
 * Goes through all elements and cleans up the type of change in case their properties
 * got flipped back and forth to the same values
 * @param changedElements
 */
export const cleanMergedElements = (changedElements: Map<string, ChangedElement>): void => {
  // Clone Ids to be able to work on map without side-effects
  const elementIds = [];
  // Need to do it in a loop in case there are too many elements
  // for the spread operator to be used instead
  for (const key of changedElements.keys()) {
    elementIds.push(key);
  }

  // Go through the elements and clean-up type of change
  for (const id of elementIds) {
    const currentElement = changedElements.get(id);
    if (currentElement === undefined) {
      // Shouldn't happen...
      continue;
    }

    // Clean properties that are hidden by presentation rules
    cleanIgnoredProperties(currentElement);

    if (
      (hasTypeOfChange(currentElement, TypeOfChange.Property) ||
        hasTypeOfChange(currentElement, TypeOfChange.Indirect)) &&
      (currentElement.properties === undefined ||
        currentElement.properties.size === 0)
    ) {
      // Properties got cleaned up due to checksums matching, change type of change
      currentElement.type &= ~TypeOfChange.Property;
      currentElement.type &= ~TypeOfChange.Indirect;
    }

    // If we have an update and the type of change is now 0 after clean-up, delete it
    if (
      currentElement.opcode === DbOpcode.Update &&
      currentElement.type === 0
    ) {
      changedElements.delete(id);
    }
  }
};

/**
 * Accumulates a single changed element in our changed elements map
 * @param changedElements Changed elements map to populate
 * @param elementId
 * @param opcode
 * @param classId
 * @param type
 * @param properties
 * @param modelId
 * @param forward Whether we are accumulating forward or backward
 * @param throwErrorOnInvalidOpcode Throw an error if we find an invalid opcode pairing
 */
export const accumulateChange = (
  changedElements: Map<string, ChangedElement>,
  elementId: string,
  opcode: DbOpcode,
  classId: string,
  type: number,
  properties: Map<string, Checksums> | undefined,
  modelId?: string,
  parent?: string,
  parentClassId?: string,
  forward?: boolean,
  throwErrorOnInvalidOpcode?: boolean,
): void => {
  if (!changedElements.has(elementId)) {
    changedElements.set(elementId, {
      id: elementId,
      opcode,
      classId,
      modelId,
      type,
      properties,
      parent,
      parentClassId,
    });
    return;
  }

  // Get current element
  const current = changedElements.get(elementId);
  if (!current) {
    throw new Error("Should be defined if we got here");
  }

  // Accumulate changes forward
  if (forward) {
    // If element was inserted in older changesets
    if (
      (current.opcode === DbOpcode.Insert && opcode === DbOpcode.Update) ||
      // Support Insert + Insert - happens due to schema change + overflow tables
      (current.opcode === DbOpcode.Insert && opcode === DbOpcode.Insert)
    ) {
      return;
    }

    // Accumulate type of change on updates when there's another update incoming
    if (
      (current.opcode === DbOpcode.Update && opcode === DbOpcode.Update) ||
      // Support Update + Insert - happens due to schema change + overflow tables - keep as update
      (current.opcode === DbOpcode.Update && opcode === DbOpcode.Insert)
    ) {
      // Merge type of change
      changedElements.set(elementId, {
        ...current,
        type: type | current.type,
        // When going forwards, the "current" value contains the older values of the element
        // So prioritize the passed properties
        properties: mergeProperties(properties, current.properties),
      });
      return;
    }

    // Got inserted and then got deleted, shouldn't show in results
    if (current.opcode === DbOpcode.Insert && opcode === DbOpcode.Delete) {
      changedElements.delete(elementId);
      return;
    }

    // Updated element then it was deleted, accumulate as a deletion
    if (current.opcode === DbOpcode.Update && opcode === DbOpcode.Delete) {
      changedElements.set(elementId, {
        ...current,
        // Don't care about changed properties for a deleted element
        properties: undefined,
        opcode: DbOpcode.Delete,
      });
      return;
    }

    // Delete + Insert may happen due to connectors logic, accept for now
    if (current.opcode === DbOpcode.Delete && opcode === DbOpcode.Insert) {
      changedElements.set(elementId, {
        ...current,
        // Merge properties in case some properties remained from updates before the delete
        properties: mergeProperties(properties, current.properties),
        opcode: DbOpcode.Update,
      });
      return;
    }
  } else {
    // Modified then found inserted in older version, keep it as an insert
    if (
      (opcode === DbOpcode.Insert && current.opcode === DbOpcode.Update) ||
      // Support Insert + Insert - happens due to schema change + overflow tables
      (opcode === DbOpcode.Insert && current.opcode === DbOpcode.Insert)
    ) {
      changedElements.set(elementId, {
        ...current,
        // Don't care about changed properties for an inserted element
        properties: undefined,
        opcode: DbOpcode.Insert,
      });
      return;
    }

    // Two updates, keep as is
    if (
      (opcode === DbOpcode.Update && current.opcode === DbOpcode.Update) ||
      // Support Update + Insert - happens due to schema change + overflow tables - keep as update
      (opcode === DbOpcode.Update && current.opcode === DbOpcode.Insert)
    ) {
      // Merge type of change
      changedElements.set(elementId, {
        ...current,
        opcode: DbOpcode.Update,
        type: type | current.type,
        // When going backwards, the "current" value contains the newest values of the element
        // So prioritize it
        properties: mergeProperties(current.properties, properties),
      });
      return;
    }

    // Element was inserted then deleted, should not show up
    if (opcode === DbOpcode.Insert && current.opcode === DbOpcode.Delete) {
      changedElements.delete(elementId);
      return;
    }

    // Update and then delete, we accumulate as a deletion
    if (opcode === DbOpcode.Update && current.opcode === DbOpcode.Delete) {
      changedElements.set(elementId, {
        ...current,
        // Don't care about changed properties for a deleted element
        properties: undefined,
        opcode: DbOpcode.Delete,
      });
      return;
    }

    // Delete + Insert may happen due to connectors logic, accept for now
    if (opcode === DbOpcode.Delete && current.opcode === DbOpcode.Insert) {
      changedElements.set(elementId, {
        ...current,
        // Merge properties in case some properties remained from updates before the delete
        properties: mergeProperties(current.properties, properties),
        opcode: DbOpcode.Update,
      });
    }
  }

  if (throwErrorOnInvalidOpcode) {
    throw new Error("Invalid combination of opcodes");
  }
};

/**
 * Merge property maps into single one
 * and ensure that checksums are different
 * @param newProps
 * @param oldProps
 */
export const mergeProperties = (
  newProps: Map<string, Checksums> | undefined,
  oldProps: Map<string, Checksums> | undefined,
): Map<string, Checksums> => {
  const allProps = new Set([
    ...(newProps?.keys() ?? []),
    ...(oldProps?.keys() ?? []),
  ]);
  const merged = new Map<string, Checksums>();
  for (const prop of allProps) {
    // Keep the old checksum if the new one is undefined
    const newChecksum: number | undefined =
      newProps?.get(prop)?.newChecksum ?? oldProps?.get(prop)?.newChecksum;
    // Keep the current new prop's old checksum if we are seeing this property for the first time
    // and no checksum is currently available in our old props
    const oldChecksum: number | undefined =
      oldProps?.get(prop)?.oldChecksum ?? newProps?.get(prop)?.oldChecksum;
    // Maintain changed properties that have checksum changes
    // If checksums are not provided by service, just accumulate all found props
    if (
      (newChecksum === undefined && oldChecksum === undefined) ||
      newChecksum !== oldChecksum
    ) {
      merged.set(prop, {
        newChecksum,
        oldChecksum,
      });
    }
  }
  return merged;
};

/**
 * Extract a map of properties for a given element
 * @param changeset
 * @param index
 * @returns
 */
export const extractProperties = (
  changeset: ChangedElements,
  index: number,
): Map<string, Checksums> | undefined => {
  if (changeset.opcodes[index] === DbOpcode.Update && changeset.properties) {
    const map: Map<string, Checksums> = new Map<string, Checksums>();
    if (changeset.properties[index] === undefined)
      return undefined;
    for (
      let propIndex = 0;
      propIndex < changeset.properties[index].length;
      ++propIndex
    ) {
      const property = changeset.properties[index][propIndex];
      // Checksums may or may not be available in change data
      // So handle them properly for out-of-date data
      const newChecksum = changeset.newChecksums
        ? changeset.newChecksums[index][propIndex]
        : undefined;
      const oldChecksum = changeset.oldChecksums
        ? changeset.oldChecksums[index][propIndex]
        : undefined;
      map.set(property, {
        newChecksum,
        oldChecksum,
      });
    }
    return map;
  }

  return undefined;
};

/**
 * Accumulate the changed elements from the given ChangedElements into the final entries map
 * @param changedElements Changed Elements Map to be populated
 * @param changeset ChangedElements for a given changeset
 * @param forward Accumulate forward or backwards
 */
export const accumulateChanges = (
  changedElements: Map<string, ChangedElement>,
  changeset: ChangedElements,
  forward?: boolean,
): void => {
  changeset.elements.forEach((elementId: string, index: number) => {
    const opcode = changeset.opcodes[index];
    const classId = changeset.classIds[index];
    const parentId =
      changeset.parentIds !== undefined
        ? changeset.parentIds[index]
        : undefined;
    const parentClassId =
      changeset.parentClassIds !== undefined
        ? changeset.parentClassIds[index]
        : undefined;
    const modelId =
      changeset.modelIds !== undefined ? changeset.modelIds[index] : undefined;
    const properties = extractProperties(changeset, index);
    let type = changeset.type[index] ?? 0;
    if (properties === undefined) {
      type &= ~TypeOfChange.Property;
    }
    accumulateChange(
      changedElements,
      elementId,
      opcode,
      classId,
      type,
      properties,
      modelId,
      parentId,
      parentClassId,
      forward,
    );
  });
};

/**
 * Maintains the changed elements of a comparison
 */
export class ChangedElementsManager {
  /** Computed entries of changed elements for given comparison */
  private _changedElements: Map<string, ChangedElement> = new Map<
    string,
    ChangedElement
  >();
  public get changedElements() {
    return this._changedElements;
  }

  public modelToParentModelMap: Map<string, string> | undefined;

  public elementToDrivenElement: Map<string, string[]> = new Map<string, string[]>();
  public setElementToDrivenElementMap(_map: Map<string, string[]>) {
    this.elementToDrivenElement = _map;
  }

  public elementDrivesElement: Map<string, string[]> = new Map<string, string[]>();
  public setElementDrivesElementMap(_map: Map<string, string[]>) {
    this.elementDrivesElement = _map;
  }

  /**
   *
   * @returns Set of parent model ids used to parent elements in UI tree
   */
  public getParentModels(): Set<string> {
    const set = new Set<string>();
    if (this.modelToParentModelMap === undefined) {
      return set;
    }

    for (const pair of this.modelToParentModelMap) {
      set.add(pair[1]);
    }
    return set;
  }

  private _changedModels: Set<string> | undefined;
  public get changedModels(): Set<string> | undefined {
    return this._changedModels;
  }

  private _unchangedModels: Set<string> | undefined;
  public get unchangedModels(): Set<string> | undefined {
    return this._unchangedModels;
  }

  private _entryCache: ChangedElementEntryCache;
  public get entryCache() {
    return this._entryCache;
  }

  private readonly _queryModelsChunkSize = 1000;

  private _progressLoadingEvent?: BeEvent<(message: string) => void>;

  /** Cache for labels of elements */
  public get labels(): ChangedElementsLabelsCache | undefined {
    return this.entryCache.labels;
  }

  /** Cache for child elements */
  public get childrenCache(): ChangedElementsChildrenCache | undefined {
    return this.entryCache.childrenCache;
  }

  constructor(private _manager: VersionCompareManager) {
    this._entryCache = new ChangedElementEntryCache(this._manager);
  }

  /**
   * Gets all changed property names found in all changed elements in the comparison
   */
  public getAllChangedPropertyNames(): Set<string> {
    const allProps = new Set<string>();
    this.changedElements.forEach((element: ChangedElement) => {
      if (element.properties !== undefined) {
        for (const prop of element.properties) {
          allProps.add(prop[0]);
        }
      }
    });
    return allProps;
  }

  /**
   * Generates entries for the accumulated changed elements by initializing the entry cache
   * @param currentIModel Current IModelConnection
   * @param targetIModel Target IModelConnection being compared against
   */
  public async generateEntries(
    currentIModel: IModelConnection,
    targetIModel: IModelConnection,
  ): Promise<void> {
    this._entryCache.initialize(
      currentIModel,
      targetIModel,
      this._changedElements,
      this._progressLoadingEvent,
    );
  }

  /** Query the geometric element 3d classes' id */
  private async _getGeometricElement3dClassId(iModel: IModelConnection): Promise<string | undefined> {
    const ecsql =
      "SELECT ECClassDef.ECInstanceId as geomId FROM meta.ECClassDef INNER JOIN meta.ECSchemaDef ON ECSchemaDef.ECInstanceId = ECClassDef.Schema.Id WHERE ECClassDef.Name = 'GeometricElement3d' AND ECSchemaDef.Name ='BisCore'";
    for await (const row of iModel.query(ecsql, undefined, {
      rowFormat: QueryRowFormat.UseJsPropertyNames,
    })) {
      return row.geomId;
    }

    return undefined;
  }

  /**
   * Find the elements that are in the current Db
   * @param forward Whether we are comparing forward or backwards
   */
  private _getElementsInCurrent(forward: boolean): ChangedElement[] {
    const array = [...this._changedElements]
      .filter((entry: [string, ChangedElement]) => {
        return forward
          ? entry[1].opcode !== DbOpcode.Update
          : entry[1].opcode !== DbOpcode.Delete;
      })
      .map((entry: [string, ChangedElement]) => entry[1]);
    return array;
  }

  /**
   * Find the elements that are in the target Db
   * @param forward Whether we are comparing forward or backwards
   */
  private _getElementsInTarget(forward: boolean): ChangedElement[] {
    const array = [...this._changedElements]
      .filter((entry: [string, ChangedElement]) => {
        return forward
          ? entry[1].opcode === DbOpcode.Update
          : entry[1].opcode === DbOpcode.Delete;
      })
      .map((entry: [string, ChangedElement]) => entry[1]);
    return array;
  }

  private _getIds(changedElements: ChangedElement[]): string[] {
    return changedElements.map((entry: ChangedElement) => entry.id);
  }

  /**
   * Returns true if the change data already has model ids
   */
  private _dataHasModelIds = (): boolean => {
    for (const pair of this._changedElements) {
      if (pair[1].modelId !== undefined) {
        return true;
      }
    }
    return false;
  };

  /**
   * Returns a set of strings containing the model ids of the changed elements data
   */
  private _getModelsFromElements = (): Set<string> => {
    const models = new Set<string>();
    for (const pair of this._changedElements) {
      const modelId = pair[1].modelId;
      if (modelId !== undefined) {
        models.add(modelId);
      }
    }
    return models;
  };

  private _getDirectlyDrivenElements = (entries: ChangedElementEntry[]): ChangedElementEntry[] => {
    const relevantChangedElements = [];
    for (const entry of entries) {
      const key = `${entry.id}`;
      // const drivenElements = this.elementToDrivenElement.get(key);
      const drivenElements = this.elementDrivesElement.get(key);
      if (drivenElements) {
        // TODO: Seems like everything is using instance id without class id, that seems wrong...
        for (const instanceId of drivenElements) {
          const changedElement = this._entryCache.changedElementEntries.get(instanceId);
          if (changedElement) {
            relevantChangedElements.push(changedElement);
          }
        }
      }
    }
    return relevantChangedElements;
  }

  /**
   * Returns any elements (recursively) that were changed by direct changes of the given instances with multiple jumps
   * @param entries
   * @returns
   */
  public getDrivenElementsRecursive = (entries: ChangedElementEntry[]): ChangedElementEntry[] => {
    const relevantChangedElements = [];
    let currentElements = entries;
    while (currentElements.length > 0) {
      const drivenElements = this._getDirectlyDrivenElements(currentElements);
      if (drivenElements.length === 0) {
        break;
      }
      currentElements = drivenElements;
      relevantChangedElements.push(...drivenElements);
    }

    return relevantChangedElements;
  }

  /**
   * Returns any elements that were changed by direct changes of the given instances with multiple jumps
   * @param entries
   * @returns
   */
  public getDrivenElements = (entries: ChangedElementEntry[]): ChangedElementEntry[] => {
    return this._getDirectlyDrivenElements(entries);
  }

  /**
   * Get props for all elements and get changed models. Later on this data will be provided in the Changed Elements Service
   * @param currentIModel Current IModelConnection
   * @param targetIModel Target IModelConnection being compared to
   * @param forward Whether we are comparing a newer iModel or older
   * @param progressLoadingEvent Progress Loading event that will be raised whenever progress is done finding the changed models
   */
  private async findChangedModels(
    currentIModel: IModelConnection,
    targetIModel: IModelConnection,
    forward: boolean,
    progressLoadingEvent?: BeEvent<(message: string) => void>,
  ): Promise<Set<string>> {
    // If we have model ids in the data already, simply accumulate the models from it instead of querying
    if (this._dataHasModelIds()) {
      return this._getModelsFromElements();
    }

    // Query the changed models if not available
    const chunkSize = 800;
    const currentIds = this._getIds(this._getElementsInCurrent(forward));
    const targetIds = this._getIds(this._getElementsInTarget(forward));
    const allModelIds: Set<string> = new Set<string>();

    const steps: number =
      Math.floor(currentIds.length / chunkSize) +
      Math.floor(targetIds.length / chunkSize);
    const message =
      IModelApp.localization.getLocalizedString(
        "VersionCompare:versionCompare.msg_computingChangedModels",
      ) + " (";
    const outputProgressMessage = (current: number, max: number) => {
      const percentage = Math.floor((current / (max === 0 ? 1 : max)) * 100.0);
      if (progressLoadingEvent) {
        progressLoadingEvent.raiseEvent(message + percentage + "%)");
      }
    };

    const getModels = async (
      elementIds: string[],
      iModel: IModelConnection,
      modelIds: Set<string>,
      lastStep?: number,
    ) => {
      let ecsql =
        "SELECT Model as model, ECInstanceId as elemId FROM BisCore.Element WHERE ECInstanceId IN (";
      for (let i = 0; i < chunkSize; i++) {
        ecsql += "?,";
      }
      ecsql = ecsql.substr(0, ecsql.length - 1);
      ecsql += ")";

      for (let i = 0; i < elementIds.length; i += chunkSize) {
        let currentMax = i + chunkSize;
        if (currentMax > elementIds.length) {
          currentMax = elementIds.length;
        }
        const piece = elementIds.slice(i, currentMax);

        const currentStep = Math.floor(i / chunkSize);
        outputProgressMessage(
          lastStep ? lastStep + currentStep : currentStep,
          steps,
        );

        for await (const row of iModel.query(ecsql, QueryBinder.from(piece), {
          rowFormat: QueryRowFormat.UseJsPropertyNames,
        })) {
          modelIds.add(row.model.id);
        }
      }
    };

    await getModels(currentIds, currentIModel, allModelIds);
    await getModels(
      targetIds,
      targetIModel,
      allModelIds,
      Math.floor(currentIds.length / chunkSize),
    );
    return allModelIds;
  }

  /**
   * Finds models that didn't change in the iModel
   * @param currentIModel Current IModelConnection
   * @param changedModels Changed models
   */
  private async findUnchangedModels(
    currentIModel: IModelConnection,
    changedModels: Set<string>,
  ) {
    const unchangedModels = new Set<string>();
    currentIModel.models.loaded.forEach((state: ModelState) => {
      if (!changedModels.has(state.id)) {
        unchangedModels.add(state.id);
      }
    });
    return unchangedModels;
  }

  /**
   * Returns all model ids of the given model classFullName array
   * @param iModel
   * @param modelClasses
   */
  private async _getModelsOfClasses(
    iModel: IModelConnection,
    modelClasses: string[],
  ): Promise<Set<string>> {
    const modelIds: string[] = [];
    for (const modelClass of modelClasses) {
      const ecsql = "SELECT ECInstanceId as modelId FROM " + modelClass;
      for await (const row of iModel.query(ecsql, undefined, {
        rowFormat: QueryRowFormat.UseJsPropertyNames,
      })) {
        modelIds.push(row.modelId);
      }
    }
    return new Set(modelIds);
  }

  /**
   * Filters out the internal changed elements by the given model classes
   * @param currentIModel
   * @param targetIModel
   * @param modelClasses
   */
  private async _filterChangedElementsByModelClass(
    currentIModel: IModelConnection,
    targetIModel: IModelConnection,
    modelClasses: string[],
  ): Promise<void> {
    const currentModels = await this._getModelsOfClasses(
      currentIModel,
      modelClasses,
    );
    const targetModels = await this._getModelsOfClasses(
      targetIModel,
      modelClasses,
    );

    const toRemove: string[] = [];
    for (const pair of this._changedElements) {
      const elemModelId = pair[1].modelId;
      if (elemModelId !== undefined) {
        if (!currentModels.has(elemModelId) && !targetModels.has(elemModelId)) {
          toRemove.push(pair[0]);
        }
      }
    }
    for (const id of toRemove) {
      this._changedElements.delete(id);
    }
  }

  /**
   * Does the querying for the model Id of the given elements and update the entries in the map
   * @param iModel iModel to query
   * @param elementIds Element Ids to query for
   */
  private _queryAndUpdateModelIds = async (
    iModel: IModelConnection,
    elementIds: string[],
  ) => {
    let ecsql =
      "SELECT ECInstanceId as id, Model FROM Bis.Element WHERE ECInstanceId in (";
    elementIds.forEach(() => {
      ecsql = ecsql + "?,";
    });
    ecsql = ecsql.substr(0, ecsql.length - 1) + ")";
    for await (const row of iModel.query(ecsql, QueryBinder.from(elementIds), {
      rowFormat: QueryRowFormat.UseJsPropertyNames,
    })) {
      const entry = this._changedElements.get(row.id);
      if (entry !== undefined) {
        entry.modelId = row.model.id;
      }
    }
  };

  /**
   * Obtains models and update the entries in bulk
   * @param iModel iModel to query
   * @param elementIds Element Ids to query for
   */
  private _queryAndUpdateModelsBulk = async (
    iModel: IModelConnection,
    elementIds: string[],
  ) => {
    const chunkSize = this._queryModelsChunkSize;
    if (elementIds.length < chunkSize) {
      await this._queryAndUpdateModelIds(iModel, elementIds);
      return;
    }

    for (let i = 0; i < elementIds.length; i += chunkSize) {
      const slice = elementIds.slice(
        i,
        i + chunkSize > elementIds.length ? undefined : i + chunkSize,
      );
      await this._queryAndUpdateModelIds(iModel, slice);
    }
  };

  /**
   * Query for the model Ids of elements that don't have it
   * This is a band-aid fix until we fix the addon to contain
   * deleted element model ids properly
   */
  private _fixModelIds = async (
    currentIModel: IModelConnection,
    targetIModel: IModelConnection,
  ) => {
    const currentElementsWithoutModels = [];
    const targetElementsWithoutModels = [];
    for (const pair of this._changedElements) {
      const entry = pair[1];
      const id = pair[0];
      if (entry.modelId === undefined || entry.modelId === "0") {
        if (entry.opcode === DbOpcode.Delete) {
          targetElementsWithoutModels.push(id);
        } else {
          currentElementsWithoutModels.push(id);
        }
      }
    }

    if (currentIModel && currentElementsWithoutModels.length !== 0) {
      await this._queryAndUpdateModelsBulk(
        currentIModel,
        currentElementsWithoutModels,
      );
    }
    if (targetIModel && targetElementsWithoutModels.length !== 0) {
      await this._queryAndUpdateModelsBulk(
        targetIModel,
        targetElementsWithoutModels,
      );
    }
  };

  /**
   * Whether or not the changed element data for a changeset contains type of change info
   * @param changeset
   * @returns
   */
  private _changesetContainsTypeOfChangeData = (changeset: ChangedElements) => {
    return changeset.type.some((toc: number) => toc !== 0);
  };

  /**
   * Whether or not the changed element data for a changeset contains property info
   * @param changeset
   * @returns
   */
  private _changesetContainsPropertyData = (changeset: ChangedElements) => {
    if (changeset.properties === undefined) {
      return false;
    }

    return changeset.properties.some((props: string[]) => props.length !== 0);
  };

  /**
   * Whether or not we should do clean up of merged elements depending on the data
   * present on the changed elements data
   * @param changesets
   * @returns
   */
  private _dataAllowsCleanupOfMergedElements = (changesets: ChangedElements[]) => {
    for (const changeset of changesets) {
      // If any of our changesets contain property data and type of change data
      // we are good to do cleanup
      if (
        this._changesetContainsPropertyData(changeset) &&
        this._changesetContainsTypeOfChangeData(changeset)
      ) {
        return true;
      }
    }
    return false;
  };

  /**
   * Takes an array of ChangedElements and computes the changed elements entries
   * The computation is done by accumulating change
   * @param changesets Array of Changed Elements
   * @param forward Pass true if comparison is forward (e.g. current iModel is older than the compared one)
   */
  public async setChangeSets(
    currentIModel: IModelConnection,
    targetIModel: IModelConnection,
    inputChangesets: ChangedElements[],
    wantedModelClasses?: string[],
    forward?: boolean,
    filterSpatial?: boolean,
  ): Promise<void> {
    this._changedElements.clear();

    const changesets = inputChangesets;
    changesets.forEach((changeset: ChangedElements) => {
      accumulateChanges(this._changedElements, changeset, forward);
    });

    // Clean merged elements that resulted in properties having the same checksums
    // Only do this if we have proper type of change data and properties
    if (this._dataAllowsCleanupOfMergedElements(changesets)) {
      cleanMergedElements(this._changedElements);
    }

    if (!this._manager.skipParentChildRelationships) {
      // Fix missing model Ids before we filter by model class
      await this._fixModelIds(currentIModel, targetIModel);
    }

    // Filter out changed elements that we don't care about given the model classes
    if (wantedModelClasses) {
      await this._filterChangedElementsByModelClass(
        currentIModel,
        targetIModel,
        wantedModelClasses,
      );
    }

    // Filter by spatial elements if we want
    if (filterSpatial && !this._manager.skipParentChildRelationships) {
      const geom3dId = await this._getGeometricElement3dClassId(currentIModel);
      if (!geom3dId) {
        return;
      }

      // Filter out elements that are not GeometricElement3d
      const ecsql =
        "SELECT SourceECInstanceId FROM meta.ClasshasAllBaseClasses WHERE TargetECInstanceId = " +
        geom3dId;
      const validClassIds = new Set<string>();
      for await (const row of currentIModel.query(ecsql, undefined, {
        rowFormat: QueryRowFormat.UseJsPropertyNames,
      })) {
        validClassIds.add(row.sourceId);
      }
      // Filter elements that contain any class Id that has GeometricElement3d as base class
      const filteredElements = [...this._changedElements]
        .map((pair: [string, ChangedElement]) => pair[1])
        .filter((entry: ChangedElement) => validClassIds.has(entry.classId));
      this._changedElements.clear();
      for (const element of filteredElements) {
        this._changedElements.set(element.id, element);
      }
    }

    if (!this._manager.skipParentChildRelationships) {
      // Find proper models to display elements under
      await this._findParentModels(currentIModel, targetIModel);
    }
  }

  /**
   * Returns true if the given subject is valid to be used as the model node
   * @param jsonProps String containing JsonProperties of the subject
   * @returns
   */
  private _isModelSubject = (jsonProps?: string) => {
    // If subject does not have specific Json Properties, we have the proper subject Id
    if (jsonProps === undefined) {
      return true;
    }
    const parsedJson = JSON.parse(jsonProps);
    return (
      parsedJson?.Subject?.Job?.Bridge === undefined &&
      parsedJson?.Subject?.Model?.Type !== "Hierarchy"
    );
  };

  /**
   * Find the parent subject of the subjects passed in the map
   * @param iModel
   * @param subjectToModel Map of subjects to related child models
   * @returns map of parent subject to related child model
   */
  private _findParentSubjectOfModels = async (
    iModel: IModelConnection,
    subjectToModel: Map<string, string>,
  ): Promise<Map<string, string>> => {
    if (subjectToModel.size === 0) {
      return new Map<string, string>();
    }

    let ecsql =
      "SELECT childsub.ECInstanceId as childId, sub.JsonProperties as jsonProps, sub.ECInstanceId as parentId FROM Bis.Subject sub JOIN Bis.Subject childsub ON sub.ECInstanceId = childsub.Parent.Id AND childsub.ECInstanceId IN (";
    const subjectIds: string[] = [];
    for (const id of subjectToModel.keys()) {
      subjectIds.push(id);
      ecsql += "?,";
    }
    ecsql = ecsql.substring(0, ecsql.length - 1) + ")";

    const subjectToModelMap = new Map<string, string>();
    const subjectToModelMapToQuery = new Map<string, string>();
    for await (const row of iModel.query(ecsql, QueryBinder.from(subjectIds), {
      rowFormat: QueryRowFormat.UseJsPropertyNames,
    })) {
      const relatedModelId = subjectToModel.get(row.childId);
      if (relatedModelId === undefined) {
        // Should not happen ever
        throw new Error("Related model Id is not in SubjectToModel map");
      }

      // Check if the subject is a "model node" in the model tree
      if (this._isModelSubject(row.jsonProps)) {
        subjectToModelMap.set(row.parentId, relatedModelId);
      } else {
        // If we got here it means we need to query for parent subjects of the current subject
        // So store in map to query for parent subjects after this query finishes
        subjectToModelMapToQuery.set(row.parentId, relatedModelId);
      }
    }

    // Query for parent subjects if necessary
    if (subjectToModelMapToQuery.size !== 0) {
      const parentSubjectToModelMap = await this._findParentSubjectOfModels(
        iModel,
        subjectToModelMapToQuery,
      );
      // Accumulate results
      for (const pair of parentSubjectToModelMap) {
        subjectToModelMap.set(pair[0], pair[1]);
      }
    }

    return subjectToModelMap;
  };

  /**
   * Finds the subjects related to the InformationPartitionElement
   * @param iModel
   * @param ipeToModel
   * @returns a map of model Id to subject Id
   */
  private _findSubjectsOfModels = async (
    iModel: IModelConnection,
    ipeToModel: Map<string, string>,
  ): Promise<Map<string, string>> => {
    if (ipeToModel.size === 0) {
      return new Map<string, string>();
    }

    let ecsql =
      "SELECT el.ECInstanceId as ipeId, sub.JsonProperties as jsonProps, sub.ECInstanceId as subjectId FROM Bis.Subject sub JOIN Bis.InformationPartitionElement el ON sub.ECInstanceId = el.Parent.Id AND el.ECInstanceId IN (";

    const ipeIds: string[] = [];
    for (const id of ipeToModel.keys()) {
      ipeIds.push(id);
      ecsql += "?,";
    }
    ecsql = ecsql.substring(0, ecsql.length - 1) + ")";

    const subjectToModelMap = new Map<string, string>();
    const subjectToModelMapToQuery = new Map<string, string>();
    for await (const row of iModel.query(ecsql, QueryBinder.from(ipeIds), {
      rowFormat: QueryRowFormat.UseJsPropertyNames,
    })) {
      const relatedModelId = ipeToModel.get(row.ipeId);
      if (relatedModelId === undefined) {
        // Should not happen ever
        throw new Error("Related model Id is not in InformationPartitionElement map");
      }

      // Check if the subject is a "model node" in the model tree
      if (this._isModelSubject(row.jsonProps)) {
        subjectToModelMap.set(row.subjectId, relatedModelId);
      } else {
        // If we got here it means we need to query for parent subjects of the current subject
        // So store in map to query for parent subjects after this query finishes
        subjectToModelMapToQuery.set(row.subjectId, relatedModelId);
      }
    }

    // Find parent subjects if necessary
    if (subjectToModelMapToQuery.size !== 0) {
      const parentSubjects = await this._findParentSubjectOfModels(
        iModel,
        subjectToModelMapToQuery,
      );
      // Accumulate in result map
      for (const pair of parentSubjects) {
        subjectToModelMap.set(pair[0], pair[1]);
      }
    }

    // Create the resulting model to subject map
    const modelToSubjectMap = new Map<string, string>();
    for (const pair of subjectToModelMap) {
      modelToSubjectMap.set(pair[1], pair[0]);
    }
    return modelToSubjectMap;
  };

  /**
   * Returns true if the JsonProperties of the partition element are related to a model
   * @param jsonProps
   */
  private _isModelPartition = (jsonProps?: string) => {
    // If we don't have specific Json Props, we have the proper model Id already
    if (jsonProps === undefined) {
      return false;
    }

    // If we don't have specific Json Props, we have the proper model Id already
    const parsedJson = JSON.parse(jsonProps);
    return (
      parsedJson.PhysicalPartition?.Model?.Content !== undefined ||
      parsedJson.GraphicalPartition3d?.Model?.Content !== undefined
    );
  };

  /**
   * Finds the parent models of the given model Ids based on model tree hiding logic
   * @param iModel
   * @param modelIds
   * @returns map of model Id to subject Ids
   */
  private _findModelParentModels = async (
    iModel: IModelConnection,
    modelIds: string[],
  ): Promise<Map<string, string>> => {
    if (modelIds.length === 0) {
      return new Map<string, string>();
    }

    let ecsql =
      "SELECT m.ECInstanceId as modelId, ipe.ECInstanceId as ipeId, ipe.JsonProperties as jsonProps FROM BisCore.InformationPartitionElement ipe JOIN BisCore.Model m ON ipe.ECInstanceId = m.ModeledElement.Id AND m.ECInstanceId IN (";
    modelIds.forEach((_: string) => (ecsql += "?,"));
    ecsql = ecsql.substring(0, ecsql.length - 1) + ")";

    const ipeToModel = new Map<string, string>();
    for await (const row of iModel.query(ecsql, QueryBinder.from(modelIds), {
      rowFormat: QueryRowFormat.UseJsPropertyNames,
    })) {
      // If we don't have specific Json Props, we have the proper model Id already
      if (this._isModelPartition(row.jsonProps)) {
        // Store the InformationPartitionElement Id of the model
        ipeToModel.set(row.ipeId, row.modelId);
      }
    }

    return this._findSubjectsOfModels(iModel, ipeToModel);
  };

  /**
   * Find the map of model to parent models/subjects for changed elements
   */
  private _findParentModels = async (
    currentIModel: IModelConnection,
    targetIModel: IModelConnection,
  ) => {
    const currentModelIdSet = new Set<string>();
    const targetModelIdSet = new Set<string>();
    for (const pair of this._changedElements) {
      if (pair[1].modelId !== undefined) {
        if (pair[1].opcode === DbOpcode.Delete) {
          targetModelIdSet.add(pair[1].modelId);
        } else {
          currentModelIdSet.add(pair[1].modelId);
        }
      }
    }

    this.modelToParentModelMap = new Map<string, string>();
    const chunkSize = 200;
    const currentModelIds = [...currentModelIdSet];
    const targetModelIds = [...targetModelIdSet];

    // Find parent models in chunks so that we may not generate huge queries
    for (let i = 0; i < currentModelIds.length; i += chunkSize) {
      const currentParentModels = await this._findModelParentModels(
        currentIModel,
        currentModelIds.slice(i, i + chunkSize),
      );
      for (const pair of currentParentModels) {
        this.modelToParentModelMap.set(pair[0], pair[1]);
      }
    }

    for (let i = 0; i < targetModelIds.length; i += chunkSize) {
      const targetParentModels = await this._findModelParentModels(
        targetIModel,
        targetModelIds.slice(i, i + chunkSize),
      );
      for (const pair of targetParentModels) {
        this.modelToParentModelMap.set(pair[0], pair[1]);
      }
    }
  };

  /** Clean-up changed elements manager */
  public cleanup() {
    this._changedElements.clear();
    this._entryCache.cleanup();

    if (this._changedModels) {
      this._changedModels.clear();
    }
    if (this._unchangedModels) {
      this._unchangedModels.clear();
    }
  }

  /**
   * Initializes the manager with the passed changed element data
   * @param currentIModel Current IModelConnection
   * @param targetIModel Target IModelConnection being compared against
   * @param changedElements Changed Elements to use to initialize the manager
   * @param forward Whether we are comparing to a newer iModel or an older one (normally the older)
   * @param filterSpatial Whether to filter out non-spatial elements from the results
   * @param progressLoadingEvent Event raised every time the processing continues to provide UI messages to the user
   */
  public async initialize(
    currentIModel: IModelConnection,
    targetIModel: IModelConnection,
    changedElements: ChangedElements[],
    wantedModelClasses?: string[],
    forward?: boolean,
    filterSpatial?: boolean,
    progressLoadingEvent?: BeEvent<(message: string) => void>,
  ): Promise<void> {
    this._progressLoadingEvent = progressLoadingEvent;

    await this.setChangeSets(
      currentIModel,
      targetIModel,
      changedElements,
      wantedModelClasses,
      forward,
      filterSpatial,
    );

    if (progressLoadingEvent) {
      progressLoadingEvent.raiseEvent(
        IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.msg_computingChangedModels"),
      );
    }
    if (!this._manager.skipParentChildRelationships) {
      // Find changed models
      this._changedModels = await this.findChangedModels(
        currentIModel,
        targetIModel,
        forward ?? false,
        progressLoadingEvent,
      );

      if (progressLoadingEvent) {
        progressLoadingEvent.raiseEvent(
          IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.msg_computingUnchangedModels"),
        );
      }

      // Find unchanged models
      this._unchangedModels = await this.findUnchangedModels(
        currentIModel,
        this._changedModels,
      );

    }

    await this.generateEntries(currentIModel, targetIModel);
  }
}

export interface ChangedElementsWithChangeset extends ChangedElements {
  changeSetId?: string;
}
