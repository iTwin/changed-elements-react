/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbOpcode } from "@itwin/core-bentley";
import { QueryBinder, QueryRowFormat } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";

import type { ChangedElementEntry } from "./ChangedElementEntryCache.js";

/**
 * Queries for the model Ids of the deleted elements passed
 * @param targetConnection Target IModel where deleted elements exist
 * @param deletedElementIds Deleted Element Ids
 */
const getElementModelsByIds = async (
  targetConnection: IModelConnection,
  elementIds: string[],
): Promise<Set<string>> => {
  // Don't try to query if we have an empty array
  if (elementIds.length === 0) {
    return new Set();
  }

  const modelIds = new Set<string>();
  const chunkSize = 800;
  // TODO: Check if distinct works properly here
  let ecsql =
    "SELECT DISTINCT Model as model FROM BisCore.Element WHERE ECInstanceId IN (";
  for (let i = 0; i < chunkSize; i++) {
    ecsql += "?,";
  }
  ecsql = ecsql.substr(0, ecsql.length - 1);
  ecsql += ")";
  for (let i = 0; i < elementIds.length; i += chunkSize) {
    let max = i + chunkSize;
    if (max > elementIds.length) {
      max = elementIds.length;
    }
    const current = elementIds.slice(i, max);
    for await (const row of targetConnection.query(
      ecsql,
      QueryBinder.from(current),
      {
        rowFormat: QueryRowFormat.UseJsPropertyNames,
      },
    )) {
      modelIds.add(row.model.id);
    }
  }
  return modelIds;
};

/**
 * Queries for the model Ids of the deleted elements passed
 * @param targetConnection Target IModel where deleted elements exist
 * @param elementIds Element Ids
 */
const getCategoriesByIds = async (
  targetConnection: IModelConnection,
  elementIds: string[],
): Promise<Set<string>> => {
  // Don't try to query if we have an empty array
  if (elementIds.length === 0) {
    return new Set();
  }

  const categoryId = new Set<string>();
  const chunkSize = 800;
  // TODO: Check if distinct works properly here
  let ecsql =
    "SELECT DISTINCT Category.Id as catId FROM BisCore.GeometricElement3d WHERE ECInstanceId IN (";
  for (let i = 0; i < chunkSize; i++) {
    ecsql += "?,";
  }
  ecsql = ecsql.substr(0, ecsql.length - 1);
  ecsql += ")";
  for (let i = 0; i < elementIds.length; i += chunkSize) {
    let max = i + chunkSize;
    if (max > elementIds.length) {
      max = elementIds.length;
    }
    const current = elementIds.slice(i, max);
    for await (const row of targetConnection.query(
      ecsql,
      QueryBinder.from(current),
      {
        rowFormat: QueryRowFormat.UseJsPropertyNames,
      },
    )) {
      categoryId.add(row.catId);
    }
  }
  return categoryId;
};

/**
 * Queries for the model Ids of the deleted elements passed
 * @param targetConnection Target IModel where deleted elements exist
 * @param deletedElementIds Deleted Element Ids
 */
const getElementCategories = async (targetConnection: IModelConnection): Promise<Set<string>> => {
  // Simply get all categories in the target iModel to show deleted elements properly
  const categoryIds = new Set<string>();
  const ecsql =
    "SELECT DISTINCT Category.Id as catId FROM BisCore.GeometricElement3d";
  for await (const row of targetConnection.query(ecsql, undefined, {
    rowFormat: QueryRowFormat.UseJsPropertyNames,
  })) {
    categoryIds.add(row.catId);
  }
  return categoryIds;
};

/** Interface to maintain category information for comparison. */
export interface ComparisonCategorySets {
  allCategories: Set<string>;
  deletedCategories: Set<string>;
}

/**
 * Get all categories and deleted categories based on both iModel connections.
 * @param currentConnection Current IModel
 * @param targetConnection Target IModel
 */
const getCategorySets = async (
  currentConnection: IModelConnection,
  targetConnection: IModelConnection,
): Promise<ComparisonCategorySets> => {
  const currentCategories = await getElementCategories(currentConnection);
  const targetCategories = await getElementCategories(targetConnection);
  const deletedCategories = new Set<string>();
  // Find categories that got deleted
  for (const cat of targetCategories) {
    if (!currentCategories.has(cat)) {
      deletedCategories.add(cat);
    }
  }

  // Put together all categories
  const allCategories = new Set<string>(currentCategories);
  for (const category of targetCategories) {
    allCategories.add(category);
  }

  return { allCategories, deletedCategories };
};

export interface ModelsCategoryData {
  deletedElementsModels: Set<string>;
  categories: Set<string>;
  deletedCategories: Set<string>;
  updatedElementsModels: Set<string>;
  addedElementsModels: Set<string>;
}

/**
 * Used to maintain models and category ids that are in the target compared connection
 * and are used and visualized by the visualization provider
 * This is to avoid re-querying the same information multiple times
 */
export class ModelsCategoryCache {
  private static _cache: ModelsCategoryData | undefined;
  private static _currentChangeSetId: string;
  private static _targetChangeSetId: string;

  private static _isDirty(
    currentIModel: IModelConnection,
    targetIModel: IModelConnection,
  ) {
    return (
      currentIModel.changeset.id !== ModelsCategoryCache._currentChangeSetId ||
      targetIModel.changeset.id !== ModelsCategoryCache._targetChangeSetId
    );
  }

  /**
   * Loads the models and categories of deleted elements and modified elements
   * This information is necessary for proper visualization of version compare
   * @param currentIModel
   * @param targetIModel
   * @param changedElements
   */
  public static async load(
    currentIModel: IModelConnection,
    targetIModel: IModelConnection,
    changedElements: ChangedElementEntry[],
  ) {
    if (
      ModelsCategoryCache._cache === undefined ||
      ModelsCategoryCache._isDirty(currentIModel, targetIModel)
    ) {
      // Find ids for deleted and modified elements
      const deletedElementIds: string[] = [];
      const deletedElementModelIds: string[] = [];
      const updatedElementIds: string[] = [];
      const addedModelIds:Set<string>=new Set<string>();
      for (const changedElement of changedElements) {
        if (changedElement.opcode === DbOpcode.Delete) {
          // Only load the ones that we don't have model Ids for, as these model Ids will be the appropriate old version
          // model Id.
          if (!changedElement.modelId) {
            deletedElementIds.push(changedElement.id);
          } else {
            deletedElementModelIds.push(changedElement.modelId);
          }
        } else if (changedElement.opcode === DbOpcode.Update) {
          updatedElementIds.push(changedElement.id);
        } else {
          addedModelIds.add(changedElement.modelId ??"");
        }
      }
      // Get model ids for deleted elements
      const deletedElementsModels = await getElementModelsByIds(
        targetIModel,
        deletedElementIds,
      );
      // Add all the model Ids we already had on change info
      for (const modelId of deletedElementModelIds) {
        deletedElementsModels.add(modelId);
      }

      // Ensure categories that no longer exist in the iModel are added to the viewport
      // So that elements that used to exist in those categories are displayed
      const categoryInfo = await getCategorySets(currentIModel, targetIModel);
      // Get model ids for updated models
      const updatedElementsModels = await getElementModelsByIds(
        targetIModel,
        updatedElementIds,
      );
      // Load the models so that visualization can occur
      await targetIModel.models.load(deletedElementsModels);
      await targetIModel.models.load(updatedElementsModels);
      ModelsCategoryCache._currentChangeSetId =
        currentIModel.changeset.id ?? "";
      ModelsCategoryCache._targetChangeSetId = targetIModel.changeset.id ?? "";
      // Store it in cache
      this._cache = {
        deletedElementsModels,
        updatedElementsModels,
        categories: categoryInfo.allCategories,
        deletedCategories: categoryInfo.deletedCategories,
        addedElementsModels:addedModelIds,
      };
    }
  }

  /** Get cached data */
  public static getModelsCategoryData(): ModelsCategoryData | undefined {
    return ModelsCategoryCache._cache;
  }

  /** Clear cached data */
  public static clear(): void {
    ModelsCategoryCache._cache = undefined;
  }
}
