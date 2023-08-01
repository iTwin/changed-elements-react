/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { PropertyRecord, type PrimitiveValue } from "@itwin/appui-abstract";
import type {
  DelayLoadedTreeNodeItem, ITreeDataProvider, ImmediatelyLoadedTreeNodeItem, TreeNodeItem
} from "@itwin/components-react";
import { BeEvent, DbOpcode, Id64, Logger } from "@itwin/core-bentley";
import { QueryRowFormat, type ModelProps } from "@itwin/core-common";
import {
  GeometricModel2dState, GeometricModel3dState, IModelApp, IModelConnection, ScreenViewport
} from "@itwin/core-frontend";
import { PresentationLabelsProvider } from "@itwin/presentation-components";

import { ChangeElementType, type ChangedElementEntry } from "../api/ChangedElementEntryCache.js";
import { VersionCompare } from "../api/VersionCompare.js";
import { VersionCompareManager } from "../api/VersionCompareManager.js";

enum ModelNodeType {
  Geometric3d,
  Geometric2d,
  NonGeometric,
}

/**
 * Provider for changed elements tree that contains even unchanged elements
 * The roots of the tree are all the changed top assembly (elements without parents) found in the changes
 */
export class ChangesTreeDataProvider implements ITreeDataProvider {
  private _rootElements: Set<string>;
  private _models: TreeNodeItem[] | undefined;
  private _currentLabelProvider: PresentationLabelsProvider | undefined;
  private _targetLabelProvider: PresentationLabelsProvider | undefined;
  private _baseModelId: string | undefined;
  private _search: string | undefined;
  private _isSearching = false;
  private _isProcessingSearch = false;

  // Sent while loading search results
  public searchUpdate = new BeEvent<() => void>();
  // Called when new nodes have been updated due to inspection or delay loads
  public nodesUpdated = new BeEvent<() => void>();

  constructor(private _manager: VersionCompareManager) {
    this._rootElements = new Set(
      this._manager.changedElementsManager.entryCache
        .getAll()
        .filter((value: ChangedElementEntry) => {
          return (
            value.elementType !== undefined &&
            value.elementType === ChangeElementType.TopAssembly
          );
        })
        .map((value: ChangedElementEntry) => value.id),
    );
    if (this._manager.currentIModel) {
      this._currentLabelProvider = new PresentationLabelsProvider({
        imodel: this._manager.currentIModel,
      });
    }
    if (this._manager.targetIModel) {
      this._targetLabelProvider = new PresentationLabelsProvider({
        imodel: this._manager.targetIModel,
      });
    }
  }

  private get _elements() {
    return this._manager.changedElementsManager.entryCache
      .changedElementEntries;
  }

  /**
   * Returns the base model Id being inspected
   */
  public getViewedBaseModelId(): string | undefined {
    return this._baseModelId;
  }

  /**
   * Makes the data provider filter by viewport's view type
   * @param vp Viewport to use for filtering
   * @returns True if filtering has changed
   */
  public filterBasedOnView(vp: ScreenViewport): boolean {
    let changed = false;
    // Update options for base models
    if (vp.view.isSpatialView()) {
      // Handle Spatial
      if (this._baseModelId !== undefined) {
        // Reload models
        this._models = undefined;
        changed = true;
      }
      this._baseModelId = undefined;
    } else if (vp.view.is2d()) {
      if (this._baseModelId !== vp.view.baseModelId) {
        this._baseModelId = vp.view.baseModelId;
        // Delete the cached models
        this._models = undefined;
        changed = true;
      }
    }
    return changed;
  }

  public numberOfChangedElements() {
    return this._elements.values.length;
  }

  private _getElementsNotLoadedYet = (): ChangedElementEntry[] => {
    const elements: ChangedElementEntry[] = [];
    for (const pair of this._elements) {
      const element = pair[1];
      if (!this._isLoaded(element)) {
        elements.push(element);
      }
    }
    return elements;
  };

  private _splitEntries(
    entries: ChangedElementEntry[],
    splitSize: number,
  ): ChangedElementEntry[][] {
    const split: ChangedElementEntry[][] = [];
    for (let i = 0; i < entries.length; i += splitSize) {
      split.push(entries.slice(i, i + splitSize));
    }
    return split;
  }

  public stopSearching = () => {
    this._isSearching = false;
  };

  public isSearchingInBackground = () => {
    return this._isProcessingSearch;
  };

  private _backgroundSearchLoad = async () => {
    // Ensure we don't do the work to search more than once
    if (this._isProcessingSearch) {
      return;
    }

    this._isProcessingSearch = true;

    const toLoad = this._getElementsNotLoadedYet();
    if (toLoad.length === 0) {
      return;
    }

    // Chunks of 900
    const workloads = this._splitEntries(toLoad, 900);
    // Do work until the work load is done or the caller makes the provider stop searching
    while (this._isSearching && workloads.length !== 0) {
      const currentWorkload = workloads.splice(0, 1);
      if (currentWorkload.length === 0) {
        // Shouldn't happen...
        continue;
      }
      await this._loadEntries(currentWorkload[0]);
      this.searchUpdate.raiseEvent();
    }

    this._isProcessingSearch = false;
  };

  public numberOfChangedElementsToLoad() {
    let count = 0;
    for (const pair of this._elements) {
      const element = pair[1];
      if (!this._isLoaded(element)) {
        count++;
      }
    }
    return count;
  }

  public getEntriesFromIds(set: Set<string>): ChangedElementEntry[] {
    return this._manager.changedElementsManager.entryCache.getEntries(set);
  }

  private _getNode = (element: ChangedElementEntry): DelayLoadedTreeNodeItem => {
    const label =
      element.label !== undefined && element.label !== ""
        ? element.label
        : IModelApp.localization.getLocalizedString("VersionCompare:versionCompare.loading");
    return {
      id: element.id,
      label: PropertyRecord.fromString(label),
      hasChildren: element.hasChangedChildren,
      extendedData: {
        element,
      },
    };
  };

  private async _getUnchangedNodes(elementIds: string[]): Promise<ImmediatelyLoadedTreeNodeItem[]> {
    const keys = elementIds.map((id: string) => {
      return {
        id,
        className: "BisCore:Element",
      };
    });

    const labels =
      this._currentLabelProvider !== undefined
        ? await this._currentLabelProvider.getLabels(keys)
        : [];
    const nodes: ImmediatelyLoadedTreeNodeItem[] = [];
    for (let i = 0; i < elementIds.length; ++i) {
      nodes.push({
        id: elementIds[i],
        label: PropertyRecord.fromString(labels.length > i ? labels[i] : ""),
        children: [],
      });
    }
    return nodes;
  }

  public async getNodesCount(parent?: TreeNodeItem | undefined): Promise<number> {
    if (parent === undefined) {
      if (
        this._manager.currentIModel === undefined ||
        this._manager.targetIModel === undefined
      ) {
        return 0;
      }

      return (
        await this._getAllChangedModelNodes(
          this._manager.currentIModel,
          this._manager.targetIModel,
        )
      ).length;
    }

    if (this._isModelNode(parent)) {
      return this._getChangedModelChildrenCount(parent);
    }

    const parentElem = this._elements.get(parent.id);
    if (parentElem) {
      return parentElem.children !== undefined ? parentElem.children.length : 0;
    }

    return 0;
  }

  private _getNodes = async (elementIds: string[]): Promise<TreeNodeItem[]> => {
    const changedElementIds: string[] = [];
    const unchangedElementIds: string[] = [];

    elementIds.forEach((elementId: string) => {
      if (this._elements.has(elementId)) {
        changedElementIds.push(elementId);
      } else {
        unchangedElementIds.push(elementId);
      }
    });

    const changedElements: TreeNodeItem[] = [];
    for (const celemId of changedElementIds) {
      const elem = this._elements.get(celemId);
      if (elem !== undefined) {
        changedElements.push(this._getNode(elem));
      }
    }

    const unchangedElements = await this._getUnchangedNodes(unchangedElementIds);
    return [...changedElements, ...unchangedElements];
  };

  /**
   * Goes through all nodes and their children nodes and adds them
   * @param nodes
   * @returns
   */
  private _getAllChildrenOfNodes = (nodes: TreeNodeItem[]) => {
    const allChild: string[] = [];
    for (const child of nodes) {
      allChild.push(child.id);
      if (child.extendedData?.element.children?.length > 0) {
        for (const childOfChild of child.extendedData?.element.children ?? []) {
          allChild.push(childOfChild);
        }
      }
    }
    return allChild;
  };

  /**
   * Create the tree node item for the model
   * @param props
   * @param childrenNodes
   * @param modelType
   * @param markAsDelete
   * @param modelLabel
   * @returns
   */
  private _createNodeFromModel(
    props: ModelProps,
    childrenNodes: TreeNodeItem[],
    modelType: ModelNodeType,
    markAsDelete?: boolean,
    modelLabel?: string,
  ): DelayLoadedTreeNodeItem {
    // Direct children of the model
    const childrenEntries = childrenNodes.map(
      (node: TreeNodeItem): ChangedElementEntry => {
        return node.extendedData?.element.id ?? "";
      },
    );
    // All children of the model
    const allChild = this._getAllChildrenOfNodes(childrenNodes);
    // Default label to the props names or class name if we don't have a name
    const label = modelLabel ?? props.name ?? props.classFullName;
    // Return a node that has a fake "element" with all the children elements of the model
    return {
      id: props.id !== undefined ? props.id : "unknown-model-id",
      label: PropertyRecord.fromString(label),
      hasChildren: true,
      extendedData: {
        isModel: true,
        is2d: modelType === ModelNodeType.Geometric2d,
        modelProps: props,
        modelId: props.id,
        childrenEntries,
        element: {
          id: props.id,
          opcode: markAsDelete ? DbOpcode.Delete : DbOpcode.Update,
          label,
          children: allChild,
        },
      },
    };
  }

  /**
   * Find which model ids provided match the given class name
   * Also enforces to only find public models
   * @param iModel IModel to query
   * @param modelIds Model Ids to query
   * @param className Class name of model
   * @param filterIsPrivate Whether ato check for IsPrivate = false in the query
   * @returns Array of ids that are of the given class
   */
  private _getModelsOfClass = async (
    iModel: IModelConnection,
    modelIds: string[],
    className: string,
    filterIsPrivate?: boolean,
  ): Promise<string[]> => {
    if (modelIds.length === 0) {
      return [];
    }
    const models = modelIds.reduce((a: string, b: string) => a + "," + b);
    const ecsql =
      "SELECT ECInstanceId FROM " +
      className +
      " WHERE ECInstanceId in (" +
      models +
      ")" +
      (filterIsPrivate ? " AND IsPrivate = false" : "");
    const response = iModel.query(ecsql, undefined, {
      rowFormat: QueryRowFormat.UseJsPropertyNames,
    });
    const idsOfClass: string[] = [];
    for await (const row of response) {
      if (row.id) {
        idsOfClass.push(row.id);
      }
    }
    return idsOfClass;
  };

  private _getModels3dInArray = async (
    iModel: IModelConnection,
    modelIds: string[],
  ): Promise<string[]> => {
    return this._getModelsOfClass(
      iModel,
      modelIds,
      GeometricModel3dState.classFullName,
      true,
    );
  };

  private _getModels2dInArray = async (
    iModel: IModelConnection,
    modelIds: string[],
  ): Promise<string[]> => {
    return this._getModelsOfClass(
      iModel,
      modelIds,
      GeometricModel2dState.classFullName,
      true,
    );
  };

  /**
   * Load all changed model nodes and cache in data provider
   * @param currentIModel Current IModel
   * @param targetIModel Target IModel
   */
  public async loadChangedModelNodes(
    currentIModel: IModelConnection,
    targetIModel: IModelConnection,
    updateFunc?: () => void,
  ) {
    if (this._models === undefined) {
      await this._getAllChangedModelNodes(
        currentIModel,
        targetIModel,
        updateFunc,
      );
    }
  }

  /**
   * Gets all changed model nodes once and returns cached nodes afterwards
   * @param currentIModel
   * @param targetIModel
   * @param updateFunc
   * @returns
   */
  private async _getAllChangedModelNodes(
    currentIModel: IModelConnection,
    targetIModel: IModelConnection,
    updateFunc?: () => void,
  ): Promise<TreeNodeItem[]> {
    if (this._models !== undefined) {
      return this._models;
    }

    const onlyDeleted = (entry: ChangedElementEntry) => {
      return entry.opcode === DbOpcode.Delete;
    };
    const notDeleted = (entry: ChangedElementEntry) => {
      return entry.opcode !== DbOpcode.Delete;
    };

    const currentNodes = await this._getChangedModelOrSubjectNodes(
      currentIModel,
      notDeleted,
      false,
      updateFunc,
    );

    let targetNodes = await this._getChangedModelOrSubjectNodes(
      targetIModel,
      onlyDeleted,
      true,
      updateFunc,
    );

    const currentModelIds = new Set(currentNodes.map((node: TreeNodeItem) => node.id));
    targetNodes = targetNodes.filter((entry: TreeNodeItem) => !currentModelIds.has(entry.id));

    this._models = [...currentNodes, ...targetNodes];
    return this._models;
  }

  /**
   * Load model labels into a map
   * @param props props of models
   * @param current whether to load from current iModel or target
   * @returns Map of model Id -> label
   */
  private async _getModelLabels(
    props: ModelProps[],
    current: boolean,
  ): Promise<Map<string, string>> {
    const labelMap = new Map<string, string>();
    try {
      const labels = await (current
        ? this._currentLabelProvider
        : this._targetLabelProvider
      )?.getLabels(
        props.map((prop: ModelProps) => ({
          id: prop.id ?? "",
          className: prop.classFullName ?? "",
        })),
      );
      if (labels) {
        props.forEach((prop: ModelProps, index: number) => {
          if (prop.id && labels.length > index) {
            labelMap.set(prop.id, labels[index]);
          }
        });
      }
    } catch (ex) {
      let error = "Unknown Error";
      if (ex instanceof Error) {
        error = ex.message;
      } else if (typeof ex === "string") {
        error = ex;
      }
      Logger.logWarning(
        VersionCompare.logCategory,
        `Could not load labels for models: ${error}`,
      );
    }
    return labelMap;
  }

  /**
   * Finds all the relevant model ids of the top node/root entry elements
   * that are relevant in the comparison session
   */
  private _getModelIdsFromRootEntries(filterFunc?: (entry: ChangedElementEntry) => boolean): Set<string> {
    const rootEntries = this.getEntriesFromIds(this._rootElements);
    const modelIds = new Set<string>();
    rootEntries.forEach((entry: ChangedElementEntry) => {
      if (entry.modelId && (filterFunc === undefined || filterFunc(entry))) {
        if (Id64.isValid(entry.modelId)) {
          modelIds.add(entry.modelId);
        }
      }
    });
    return modelIds;
  }

  /**
   * Create the TreeNodeItem for model nodes
   * @param props
   * @param labelMap
   * @param models3d
   * @param models2d
   */
  private _createModelNodes(
    props: ModelProps[],
    labelMap: Map<string, string>,
    models3d: Set<string>,
    models2d: Set<string>,
    markAsDelete?: boolean,
  ) {
    // Go through all models and create the tree nodes
    const models = [];
    for (const prop of props) {
      if (prop.isPrivate || prop.id === undefined) {
        continue;
      }

      let modelType: ModelNodeType = ModelNodeType.NonGeometric;
      if (models3d.has(prop.id)) {
        modelType = ModelNodeType.Geometric3d;
      } else if (models2d.has(prop.id)) {
        modelType = ModelNodeType.Geometric2d;
      }

      // Only add the node related to either all models or the specific
      // 2d model being viewed
      if (this._baseModelId === undefined || prop.id === this._baseModelId) {
        const labelId =
          this._manager.changedElementsManager.modelToParentModelMap?.get(
            prop.id,
          ) ?? prop.id;
        const modelNode = this._createNodeFromModel(
          prop,
          this._getChangedModelChildrenById(prop.id),
          modelType,
          markAsDelete,
          labelMap.get(labelId),
        );
        models.push(modelNode);
      }
    }

    return models;
  }

  /**
   * Loads model node labels into a label map
   * @param labelMap
   * @param modelIds
   * @param className
   * @param current
   */
  private async _loadLabelsIntoMap(
    labelMap: Map<string, string>,
    modelIds: string[],
    className: string,
    current: boolean,
  ): Promise<void> {
    try {
      const labels = await (current
        ? this._currentLabelProvider
        : this._targetLabelProvider
      )?.getLabels(
        modelIds.map((id: string) => ({
          id,
          className,
        })),
      );
      if (labels) {
        modelIds.forEach((id: string, index: number) => {
          if (labels.length > index) {
            labelMap.set(id, labels[index]);
          }
        });
      }
    } catch (ex) {
      let error = "Unknown Error";
      if (ex instanceof Error) {
        error = ex.message;
      } else if (typeof ex === "string") {
        error = ex;
      }
      Logger.logWarning(
        VersionCompare.logCategory,
        `Could not load labels for models: ${error}`,
      );
    }
  }

  /**
   * Load labels for any parent models found during loading
   * @param labelMap
   */
  private async _loadParentModelLabelsOfClass(
    labelMap: Map<string, string>,
    iModel: IModelConnection,
    className: string,
    current: boolean,
    filterIsPrivate: boolean,
  ): Promise<void> {
    const models = await this._getModelsOfClass(
      iModel,
      [...this._manager.changedElementsManager.getParentModels()],
      className,
      filterIsPrivate,
    );
    await this._loadLabelsIntoMap(labelMap, models, className, current);
  }

  /**
   * Load all labels for parent models into a map
   * @param labelMap
   * @param iModel
   * @param current
   */
  private async _loadParentModelLabels(
    labelMap: Map<string, string>,
    iModel: IModelConnection,
    current: boolean,
  ): Promise<void> {
    await this._loadParentModelLabelsOfClass(
      labelMap,
      iModel,
      GeometricModel3dState.classFullName,
      current,
      true,
    );
    await this._loadParentModelLabelsOfClass(
      labelMap,
      iModel,
      GeometricModel2dState.classFullName,
      current,
      true,
    );
    await this._loadParentModelLabelsOfClass(
      labelMap,
      iModel,
      "BisCore:Subject",
      current,
      false,
    );
  }

  /**
   * Get relevant changed models and/or subjects for comparison
   * @param iModel
   * @param filterFunc
   * @param markAsDelete
   * @param updateFunc
   * @returns
   */
  private async _getChangedModelOrSubjectNodes(
    iModel: IModelConnection,
    filterFunc?: (entry: ChangedElementEntry) => boolean,
    markAsDelete?: boolean,
    updateFunc?: () => void,
  ): Promise<TreeNodeItem[]> {
    // Get all changed model ids using the root entries
    const modelIds = [...this._getModelIdsFromRootEntries(filterFunc)];
    // Get the model props
    const props = await iModel.models.getProps(modelIds);
    // Get the labels for all models
    const labelMap = await this._getModelLabels(props, !markAsDelete);

    // Load labels for all parent models
    const parentLabelMap = new Map<string, string>();
    await this._loadParentModelLabels(parentLabelMap, iModel, !markAsDelete);

    // Re-map labels to parent nodes
    if (this._manager.changedElementsManager.modelToParentModelMap) {
      for (const pair of this._manager.changedElementsManager
        .modelToParentModelMap) {
        const parentLabel = parentLabelMap.get(pair[1]);
        if (parentLabel) {
          labelMap.set(pair[0], parentLabel);
        }
      }
    }

    // Find the 3D models
    const found3dModels = new Set(
      await this._getModels3dInArray(
        iModel,
        props.map((prop: ModelProps) => prop.id ?? ""),
      ),
    );

    // Update event for UI loading
    if (updateFunc) {
      updateFunc();
    }

    // Find the 2D models
    const found2dModels = new Set(
      await this._getModels2dInArray(
        iModel,
        props.map((prop: ModelProps) => prop.id ?? ""),
      ),
    );

    // Update event for UI loading
    if (updateFunc) {
      updateFunc();
    }

    // Create the model nodes from all the necessary data
    const nodes = this._createModelNodes(
      props,
      labelMap,
      found3dModels,
      found2dModels,
      markAsDelete,
    );
    // TODO: Remove duplicates and handle multi-nodes
    return nodes.sort((a: TreeNodeItem, b: TreeNodeItem) =>
      a.label.property.displayLabel.localeCompare(b.label.property.displayLabel),
    );
  }

  private _getChangedModelChildrenById(modelId: string): TreeNodeItem[] {
    return this.getEntriesFromIds(this._rootElements)
      .filter(
        (entry: ChangedElementEntry) =>
          entry.modelId !== undefined && entry.modelId === modelId,
      )
      .map((entry: ChangedElementEntry) => this._getNode(entry));
  }

  private _getChangedModelChildrenCount(modelNode: TreeNodeItem): number {
    if (
      modelNode.extendedData === undefined ||
      modelNode.extendedData.modelId === undefined
    ) {
      return 0;
    }

    return modelNode.extendedData.childrenEntries.length;
  }

  private async _getChangedModelChildren(modelNode: TreeNodeItem): Promise<TreeNodeItem[]> {
    if (
      modelNode.extendedData === undefined ||
      modelNode.extendedData.modelId === undefined ||
      modelNode.extendedData.childrenEntries === undefined
    ) {
      return [];
    }

    const entries = this.getEntriesFromIds(new Set(modelNode.extendedData.childrenEntries));
    return entries.map(this._getNode);
  }

  private _isModelNode(node: TreeNodeItem): boolean {
    return node.extendedData?.isModel;
  }

  public static isModelNode = (node: TreeNodeItem): boolean => {
    return node.extendedData?.isModel;
  };

  public static isElementNode = (node: TreeNodeItem): boolean => {
    return (
      node.extendedData?.element !== undefined &&
      node.extendedData?.isModel === undefined
    );
  };

  public static isFakeNode = (node: TreeNodeItem): boolean => {
    return node.extendedData?.element === undefined;
  };

  private _getModelNodeRelatedElementIds = (node: TreeNodeItem): string[] => {
    const childrenIds: string[] = node.extendedData?.childrenEntries ?? [];
    return childrenIds;
  };

  private _getElementNodeRelatedElementIds = (node: TreeNodeItem): string[] => {
    const children: string[] =
      node.extendedData?.element?.children !== undefined
        ? [...node.extendedData.element.children, node.extendedData.element.id]
        : node.extendedData?.element?.id !== undefined
          ? [node.extendedData.element.id]
          : [];
    return children;
  };

  private _getModelNodeRelatedElements = (node: TreeNodeItem): ChangedElementEntry[] => {
    const children: string[] = node.extendedData?.childrenEntries ?? [];
    return this.getEntriesFromIds(new Set(children));
  };

  private _getElementNodeRelatedElements = (node: TreeNodeItem): ChangedElementEntry[] => {
    if (
      node.extendedData === undefined ||
      node.extendedData.element === undefined
    ) {
      return [];
    }

    const related: ChangedElementEntry[] = [node.extendedData.element];
    const childrenIds: string[] = node.extendedData?.element?.children ?? [];
    for (const id of childrenIds) {
      const elem = this._elements.get(id);
      if (elem) {
        related.push(elem);
      }
    }
    return related;
  };

  /** Sets the search string to find all changed elements with given labels */
  public setSearch = (search: string | undefined) => {
    if (search === "" || search === undefined) {
      this._search = undefined;
      this._isSearching = false;
    } else {
      this._search = search;
      this._isSearching = true;
      // Load entries in the background for search to work
      this._backgroundSearchLoad()
        .then()
        .catch(() => {
          /* No-op */
        });
    }
  };

  public isSearching = () => {
    return this._search !== undefined;
  };

  private _matches = (search: string, label: string) => {
    // TODO: Maybe want support for reg exp?
    return label.toLowerCase().includes(search.toLowerCase());
  };

  private _getSearchResultNodes = async (search: string): Promise<TreeNodeItem[]> => {
    if (
      this._manager.currentIModel === undefined ||
      this._manager.targetIModel === undefined
    ) {
      throw new Error("Cannot search with an uninitialized version compare manager");
    }

    const ids: string[] = [];
    this._elements.forEach((entry: ChangedElementEntry) => {
      // Filter the element entries
      if (entry.label !== undefined && this._matches(search, entry.label)) {
        ids.push(entry.id);
      }
    });

    const modelNodes = await this._getAllChangedModelNodes(
      this._manager.currentIModel,
      this._manager.targetIModel,
    );
    // Filter model nodes
    const filteredModels = modelNodes.filter((node: TreeNodeItem) => {
      const primVal = node.label.value;
      if (primVal === undefined) {
        return false;
      }
      const value: string =
        (primVal as PrimitiveValue).displayValue ??
        ((primVal as PrimitiveValue).value as string);
      if (value === undefined) {
        return false;
      }
      return this._matches(search, value);
    });

    const allNodes = await this._getNodes(ids);
    allNodes.push(...filteredModels);
    return allNodes;
  };

  public getRelatedElementIds = (node: TreeNodeItem): string[] => {
    if (ChangesTreeDataProvider.isModelNode(node)) {
      return this._getModelNodeRelatedElementIds(node);
    } else if (ChangesTreeDataProvider.isElementNode(node)) {
      return this._getElementNodeRelatedElementIds(node);
    } else {
      return [node.id];
    }
  };

  public getRelatedElements = (node: TreeNodeItem): ChangedElementEntry[] => {
    if (ChangesTreeDataProvider.isModelNode(node)) {
      return this._getModelNodeRelatedElements(node);
    } else if (ChangesTreeDataProvider.isElementNode(node)) {
      return this._getElementNodeRelatedElements(node);
    } else {
      return [];
    }
  };

  private _isLoaded(entry: ChangedElementEntry) {
    return this._manager.changedElementsManager.entryCache.isLoaded(entry);
  }

  public isLoaded(node: TreeNodeItem): boolean {
    if (this._isModelNode(node)) {
      return true;
    }

    if (node.extendedData?.element === undefined) {
      return false;
    }

    const entry: ChangedElementEntry = node.extendedData.element;
    return this._isLoaded(entry);
  }

  public load = async (nodes: TreeNodeItem[]): Promise<void> => {
    const ids = nodes.map((node: TreeNodeItem) => node.id);
    const entries = ids
      .map((id: string) => this._elements.get(id))
      .filter(
        (entry: ChangedElementEntry | undefined) => entry !== undefined,
      ) as ChangedElementEntry[];
    await this._loadEntries(entries);
  };

  private _loadEntries = async (
    entries: ChangedElementEntry[],
  ): Promise<void> => {
    // Load entries in the entry cache and load their children
    await this._manager.changedElementsManager.entryCache.loadEntries(
      entries,
      true,
    );
    // Raise event that new nodes where updated/added to the elements result
    // So that components may re-load and force updates
    this.nodesUpdated.raiseEvent();
  };

  public getModelElementEntries(modelId: string): ChangedElementEntry[] {
    const entries: ChangedElementEntry[] = [];
    for (const pair of this._elements) {
      if (pair[1].modelId !== undefined && pair[1].modelId === modelId) {
        entries.push(pair[1]);
      }
    }
    return entries;
  }

  public getModelAllChildElementEntries(modelId: string): ChangedElementEntry[] {
    const entries: ChangedElementEntry[] = [];
    for (const pair of this._elements) {
      // NOTE: If we ever move to delayed loading again w.r.t. children elements, we will need changes
      // for this to work properly
      if (pair[1].modelId !== undefined && pair[1].modelId === modelId) {
        entries.push(pair[1]);
      }
    }

    return entries;
  }

  public async getNodes(parent?: TreeNodeItem | undefined): Promise<DelayLoadedTreeNodeItem[]> {
    if (
      this._manager.currentIModel === undefined ||
      this._manager.targetIModel === undefined
    ) {
      throw new Error("Cannot get change nodes if comparison is not properly initialized");
    }

    if (parent === undefined && this._search !== undefined) {
      return this._getSearchResultNodes(this._search);
    }

    if (parent === undefined) {
      return this._getAllChangedModelNodes(
        this._manager.currentIModel,
        this._manager.targetIModel,
      );
    }

    if (this._isModelNode(parent)) {
      return this._getChangedModelChildren(parent);
    }

    if (this._elements.has(parent.id)) {
      const entry = this._elements.get(parent.id);
      if (
        entry?.directChildren !== undefined &&
        entry?.directChildren?.length !== 0
      ) {
        return this._getNodes(entry.directChildren);
      } else {
        return [];
      }
    } else {
      // TODO: Handle an unchanged child element
    }

    throw new Error("Method not implemented.");
  }
}
