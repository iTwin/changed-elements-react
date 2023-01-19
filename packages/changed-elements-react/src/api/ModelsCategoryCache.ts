/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbOpcode } from "@itwin/core-bentley";
import { QueryBinder, QueryRowFormat } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";

import type { ChangedElementEntry } from "./ChangedElementEntryCache";

/**
 * Queries for the model Ids of the deleted elements passed
 * @param targetConnection Target IModel where deleted elements exist
 * @param deletedElementIds Deleted Element Ids
 */
const getElementModelsByIds = async (
  targetConnection: IModelConnection,
  elementIds: string[],
): Promise<Set<string>> => {
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

/**
 * Gets the categories that are no longer in the current iModel but are in target iModel
 * @param currentConnection Current IModel
 * @param targetConnection Target IModel
 */
const getNotCurrentCategories = async (
  currentConnection: IModelConnection,
  targetConnection: IModelConnection,
): Promise<Set<string>> => {
  const currentCategories = await getElementCategories(currentConnection);
  const targetCategories = await getElementCategories(targetConnection);
  const notPresentCategories = new Set<string>();
  for (const cat of targetCategories) {
    if (!currentCategories.has(cat)) {
      notPresentCategories.add(cat);
    }
  }
  return notPresentCategories;
};

/**
 * Gets the categories that are no longer in the current iModel but are in target iModel
 * @param currentConnection Current IModel
 * @param targetConnection Target IModel
 */
const getAllCategories = async (
  currentConnection: IModelConnection,
  targetConnection: IModelConnection,
): Promise<Set<string>> => {
  const currentCategories = await getElementCategories(currentConnection);
  const targetCategories = await getElementCategories(targetConnection);
  return new Set([...currentCategories, ...targetCategories]);
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
      // Find ids for deleted and modified elements
      const deletedElementIds: string[] = [];
      const updatedElementIds: string[] = [];
      for (const changedElement of changedElements) {
        if (changedElement.opcode === DbOpcode.Delete) {
          deletedElementIds.push(changedElement.id);
        } else if (changedElement.opcode === DbOpcode.Update) {
          updatedElementIds.push(changedElement.id);
        }
      }
      // Get model ids for deleted elements
      const deletedElementsModels = await getElementModelsByIds(
        targetIModel,
        deletedElementIds,
      );
      // Ensure categories that no longer exist in the iModel are added to the viewport
      // So that elements that used to exist in those categories are displayed
      const categories = await getAllCategories(currentIModel, targetIModel);
      const deletedCategories = await getNotCurrentCategories(
        currentIModel,
        targetIModel,
      );
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
        categories,
        deletedCategories,
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
