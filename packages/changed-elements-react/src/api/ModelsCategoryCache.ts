/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbOpcode } from "@itwin/core-bentley";
import { QueryBinder, QueryRowFormat } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";

import type { ChangedElementEntry } from "./ChangedElementEntryCache.js";

/**
 * Queries the model Ids of the given elements in a single round trip
 * @param targetConnection Target IModel where the elements exist
 * @param elementIds Element Ids
 */
const getElementModelsByIds = async (
  targetConnection: IModelConnection,
  elementIds: string[],
): Promise<Set<string>> => {
  const modelIds = new Set<string>();
  // Don't try to query if we have an empty array
  if (elementIds.length === 0) {
    return modelIds;
  }

  const ecsql = "SELECT DISTINCT Model.Id as model FROM BisCore.Element WHERE InVirtualSet(?, ECInstanceId)";
  const binder = new QueryBinder();
  binder.bindIdSet(1, elementIds);
  for await (const row of targetConnection.createQueryReader(ecsql, binder, {
    rowFormat: QueryRowFormat.UseECSqlPropertyNames,
  })) {
    modelIds.add(row.model);
  }
  return modelIds;
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
  for await (const row of targetConnection.createQueryReader(ecsql, undefined, {
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
      // Deleted elements only exist in the target iModel, where the change data's modelId already names
      // their model. Updated elements may have moved models between versions, so their target-side model
      // is queried rather than taken from the (current-side) change data.
      const deletedElementIds: string[] = [];
      const deletedElementModelIds: string[] = [];
      const updatedElementIds: string[] = [];
      for (const changedElement of changedElements) {
        if (changedElement.opcode === DbOpcode.Delete) {
          if (!changedElement.modelId) {
            deletedElementIds.push(changedElement.id);
          } else {
            deletedElementModelIds.push(changedElement.modelId);
          }
        } else if (changedElement.opcode === DbOpcode.Update) {
          updatedElementIds.push(changedElement.id);
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

      // Set currently cached data changeset ids
      ModelsCategoryCache._currentChangeSetId =
        currentIModel.changeset.id ?? "";
      ModelsCategoryCache._targetChangeSetId = targetIModel.changeset.id ?? "";
      // Store it in cache
      this._cache = {
        deletedElementsModels,
        updatedElementsModels,
        categories: categoryInfo.allCategories,
        deletedCategories: categoryInfo.deletedCategories,
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
