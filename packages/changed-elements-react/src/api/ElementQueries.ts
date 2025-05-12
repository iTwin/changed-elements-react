/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbOpcode } from "@itwin/core-bentley";
import { QueryBinder, QueryRowFormat } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";
import { KeySet, type InstanceKey, type Key } from "@itwin/presentation-common";
import { Presentation } from "@itwin/presentation-frontend";

import { ChangeElementType, type ChangedElementEntry } from "./ChangedElementEntryCache.js";

/**
 * Interface for query data
 */
export interface ChangedElementQueryData {
  id: string;
  userLabel?: string;
  code?: string;
  modelId: string;
  classFullName: string;
  classId: string;
  children?: string[];
  parent?: string;
}

/**
 * Generates the changed element entry based on the given query data and existing
 * information in the given map
 * @param data Data to use for entry
 * @param foundInCurrent Whether the entry is found in current iModel or not
 * @param existingEntries Map of existing entries
 * @returns
 */
export const generateEntryFromQueryData = (
  data: ChangedElementQueryData,
  foundInCurrent: boolean,
  existingEntry: ChangedElementEntry | undefined,
): ChangedElementEntry => {
  const getType = (parent?: string, children?: string[]) => {
    if (parent === undefined) {
      return ChangeElementType.TopAssembly;
    }
    if (children === undefined) {
      return ChangeElementType.Element;
    }
    return ChangeElementType.Assembly;
  };

  return {
    id: data.id ?? "",
    classId: data.classId ?? "",
    classFullName: data.classFullName,
    label: data.userLabel,
    modelId: data.modelId,
    code: data.code ?? "",
    opcode:
      existingEntry && existingEntry.opcode
        ? existingEntry.opcode
        : DbOpcode.Update,
    type: existingEntry?.type ?? 0, // TODO: Do we need to mark these as indirect ?
    indirect: existingEntry === undefined,
    foundInCurrent,
    loaded: false,
    elementType: getType(data.parent, data.children),
    properties:
      existingEntry !== undefined && existingEntry.opcode === DbOpcode.Update
        ? existingEntry.properties
        : undefined,
    children:
      data.children && data.children.length !== 0 ? data.children : undefined,
    parent: data.parent !== undefined ? data.parent : undefined,
  };
};

/**
 * Queries specific element data from the iModel used for version compare visualization
 * @param iModel IModel to query
 * @param elementIds Ids of element to query for
 * @returns Array of query data
 */
export const queryEntryData = async (
  iModel: IModelConnection,
  elementIds: string[],
): Promise<ChangedElementQueryData[]> => {
  if (elementIds.length === 0) {
    return [];
  }

  let elemECSQL =
    "SELECT ECInstanceId as id, Model as model, ECClassId as classId, ECClassId, Parent as parent FROM Bis.Element child WHERE ECInstanceId in (";
  let queryString = "";
  elementIds.forEach(() => {
    queryString = queryString + "?,";
  });
  queryString = queryString.substr(0, queryString.length - 1) + ")";
  elemECSQL = elemECSQL + queryString;
  const result: ChangedElementQueryData[] = [];
  for await (const row of iModel.query(
    elemECSQL,
    QueryBinder.from(elementIds),
    {
      rowFormat: QueryRowFormat.UseJsPropertyNames,
    },
  )) {
    const data: ChangedElementQueryData = {
      id: row.id,
      classFullName: (row.className as string).replace(".", ":"),
      modelId: row.model.id,
      classId: row.classId,
      parent: row.parent ? row.parent.id : undefined,
    };
    result.push(data);
  }
  return result;
};

/**
 * Queries specific element data from the iModel used for version compare visualization
 * Chunks up requests to the given chunkSize
 * @param iModel IModel to query
 * @param elementIds Ids of element to query for
 * @param chunkSize Chunk size for each query. Defaults to 1000
 * @param updateFunc [optional] called after each processed chunk with cumulative percent complete (0–100)
 * @returns Array of query data
 */
export const queryEntryDataBulk = async (
  iModel: IModelConnection,
  elementIds: string[],
  chunkSize = 1000,
  updateFunc?: (pct: number) => void,
): Promise<ChangedElementQueryData[]> => {
  if (elementIds.length < chunkSize) {
    return queryEntryData(iModel, elementIds);
  }

  const final: ChangedElementQueryData[] = [];
  for (let i = 0; i < elementIds.length; i += chunkSize) {
    const data = await queryEntryData(
      iModel,
      elementIds.slice(i, i + chunkSize),
    );
    final.push(...data);
    if (updateFunc) {
      const processed = Math.min(i + chunkSize, elementIds.length);
      const pct = Math.floor((processed / elementIds.length) * 100);
      updateFunc(pct);
    }
  }
  return final;
};

/**
 * Transforms a KeySet to an array of element ids
 * @param keys KeySet to transform
 * @returns Array of strings with the element Ids
 */
const keysToIds = (keys: KeySet) => {
  const ids: string[] = [];
  keys.forEach((key: Key) => {
    ids.push((key as InstanceKey).id);
  });
  return ids;
};

/**
 * Gets the top parent element Ids via presentation computeSelection
 * @param iModel IModelConnection
 * @param elementIds
 * @returns
 */
const getParentsPresentation = async (
  iModel: IModelConnection,
  elementIds: string[],
): Promise<string[]> => {
  const parentKeys = await Presentation.selection.scopes.computeSelection(
    iModel,
    elementIds,
    "top-assembly",
  );
  return keysToIds(parentKeys);
};

/**
 * Finds the top parent element Ids of the given element Ids
 * @param iModel IModelConnection
 * @param elementIds Children elements
 * @param chunkSize Chunk size for queries
 * @param updateFunc Function called to show progress
 * @returns Array of parent Ids
 */
export const findTopParents = async (
  iModel: IModelConnection,
  elementIds: string[],
  chunkSize = 1000,
  updateFunc?: () => void,
): Promise<string[]> => {
  if (elementIds.length < chunkSize) {
    return getParentsPresentation(iModel, elementIds);
  }

  const parentIds: string[] = [];
  for (let i = 0; i < elementIds.length; i += chunkSize) {
    const slice = elementIds.slice(
      i,
      i + chunkSize > elementIds.length ? undefined : i + chunkSize,
    );
    const tempIds = await getParentsPresentation(iModel, slice);
    parentIds.push(...tempIds);
    if (updateFunc) {
      updateFunc();
    }
  }
  return parentIds;
};
