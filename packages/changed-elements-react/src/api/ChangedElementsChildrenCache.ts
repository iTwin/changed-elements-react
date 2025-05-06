/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbOpcode } from "@itwin/core-bentley";
import { QueryBinder, QueryRowFormat } from "@itwin/core-common";
import { IModelConnection } from "@itwin/core-frontend";

import { ChangedElementDataCache } from "./ChangedElementDataCache.js";
import { ChangeElementType, type ChangedElement, type ChangedElementEntry } from "./ChangedElementEntryCache.js";
import type { ChangedElementQueryData } from "./ElementQueries.js";

interface ParentChildData {
  directChildren: ChangedElementQueryData[];
  allChildren: ChangedElementQueryData[];
  hasChangedChildren: boolean;
}

/** Cache for labels of changed elements, these labels may exist in either compared iModel Connections */
export class ChangedElementsChildrenCache extends ChangedElementDataCache {
  private _cache = new Map<string, ParentChildData>();

  constructor(
    private _currentIModel: IModelConnection,
    private _targetIModel: IModelConnection,
    private _changedElements: Map<string, ChangedElement>,
  ) {
    super();
  }

  /**
   * Returns the ids of the direct children of the element
   * Returns undefined if not in cache
   * @param id Id of element to get direct children for
   */
  public getDirectChildrenIds(id: string): string[] | undefined {
    const entry = this._cache.get(id);
    if (entry === undefined) {
      return undefined;
    }

    return entry.directChildren.map((data: ChangedElementQueryData) => data.id);
  }

  /**
   * Returns all children ids of the element
   * Returns undefined if not in cache
   * @param id Id of element to get direct children for
   */
  public getAllChildrenIds(id: string): string[] | undefined {
    const entry = this._cache.get(id);
    if (entry === undefined) {
      return undefined;
    }

    return entry.allChildren.map((data: ChangedElementQueryData) => data.id);
  }

  /**
   * Find the children of an element recursively
   * @param elementId Element Id to find children for
   * @param map Map of element Id -> direct children Ids
   * @param out Output set for found children
   */
  private _findRecursiveChildren = (
    elementId: string,
    map: Map<string, string[]>,
    out: Set<string>,
  ) => {
    out.add(elementId);
    const directChildren = map.get(elementId);
    if (directChildren === undefined || directChildren.length === 0) {
      return;
    }

    directChildren.forEach((id: string) => out.add(id));
    for (const child of directChildren) {
      this._findRecursiveChildren(child, map, out);
    }
  };

  /** Find recursive children from the already queried map */
  private _findRecursiveChildrenFromQueryData = (
    current: ChangedElementQueryData,
    map: Map<string, ChangedElementQueryData[]>,
    out: Set<ChangedElementQueryData>,
  ) => {
    out.add(current);
    const directChildren = map.get(current.id);
    if (directChildren === undefined || directChildren.length === 0) {
      return;
    }

    directChildren.forEach((data: ChangedElementQueryData) => out.add(data));
    for (const child of directChildren) {
      this._findRecursiveChildrenFromQueryData(child, map, out);
    }
  };

  /** Find direct children from the already queried map of children */
  private _findDirectChildren = (
    elementId: string,
    map: Map<string, ChangedElementQueryData[]>,
    out: Set<ChangedElementQueryData>,
  ) => {
    const directChildren = map.get(elementId);
    if (directChildren !== undefined && directChildren.length !== 0) {
      directChildren.forEach((data: ChangedElementQueryData) => out.add(data));
    }
  };

  /** Recursively query child elements and the necessary props to generate a map with ChangedElementQueryData arrays for each parent */
  private _queryChildElementsWithProps = async (
    iModel: IModelConnection,
    map: Map<string, ChangedElementQueryData[]>,
    elementIds: string[],
  ) => {
    if (elementIds.length === 0) {
      return;
    }

    let childElemsECSQL =
      "SELECT ECInstanceId as id, Model as model, ECClassId, ECClassId as classId, Parent as parent FROM Bis.Element child WHERE parent.id in (";
    let queryString = "";
    elementIds.forEach(() => {
      queryString = queryString + "?,";
    });
    queryString = queryString.substr(0, queryString.length - 1) + ")";
    childElemsECSQL = childElemsECSQL + queryString;

    let childrenIds: string[] = [];
    for await (const result of iModel.createQueryReader(
      childElemsECSQL,
      QueryBinder.from(elementIds),
      {
        rowFormat: QueryRowFormat.UseJsPropertyNames,
      },
    )) {
      let array = map.get(result.parent.id);
      if (array === undefined) {
        array = [];
      }
      if (
        array.find((ceqd: ChangedElementQueryData) => ceqd.id === result.id) !==
        undefined
      ) {
        continue;
      }

      const childData: ChangedElementQueryData = {
        id: result.id,
        classFullName: (result.className as string).replace(".", ":"),
        modelId: result.model.id,
        classId: result.classId,
        parent: result.parent.id,
      };
      array.push(childData);
      map.set(result.parent.id, array);
      childrenIds.push(result.id);
    }

    // Filter children that we have already discovered and queried for
    childrenIds = childrenIds.filter((id: string) => {
      return !map.has(id);
    });

    // Keep going recursively
    if (childrenIds.length !== 0) {
      await this._queryChildElementsBulk(iModel, map, childrenIds);
    }
  };

  private _queryChildElementsBulk = async (
    iModel: IModelConnection,
    map: Map<string, ChangedElementQueryData[]>,
    elementIds: string[],
  ) => {
    const chunkSize = this._chunkSize;
    if (elementIds.length < chunkSize) {
      await this._queryChildElementsWithProps(iModel, map, elementIds);
      return;
    }

    for (let i = 0; i < elementIds.length; i += chunkSize) {
      await this._queryChildElementsWithProps(
        iModel,
        map,
        elementIds.slice(i, i + chunkSize),
      );
    }
  };

  private _toId = (data: ChangedElementQueryData) => {
    return data.id;
  };

  /** Converts the entry into query data that we can use to pass to our function */
  private _toQueryData = (element: ChangedElementEntry): ChangedElementQueryData => {
    return {
      id: element.id,
      classFullName: element.classFullName ?? "Bis.Element",
      classId: element.classId,
      modelId: element.modelId ?? "",
    };
  };

  private _hasChangedChildren = (children: string[]) => {
    return children.some((id: string) => {
      return this._changedElements.has(id);
    });
  };

  private _hasChangedChildrenFromData = (children: ChangedElementQueryData[]) => {
    return children.some((data: ChangedElementQueryData) => this._changedElements.has(data.id));
  };

  /** Request children, parents, top parents */
  protected async _request(
    elements: ChangedElementEntry[],
  ): Promise<ChangedElementEntry[]> {
    const currentElements = elements
      .filter((elem: ChangedElementEntry) => elem.opcode === DbOpcode.Update || elem.opcode === DbOpcode.Insert)
      .map((elem: ChangedElementEntry) => elem.id);
    const targetElements = elements
      .filter((elem: ChangedElementEntry) => elem.opcode === DbOpcode.Update || elem.opcode === DbOpcode.Delete)
      .map((elem: ChangedElementEntry) => elem.id);

    // Query all children props into a map of Element Id -> Children Query Data Array
    const allChildrenMap = new Map<string, ChangedElementQueryData[]>();
    await this._queryChildElementsBulk(
      this._currentIModel,
      allChildrenMap,
      currentElements,
    );
    await this._queryChildElementsBulk(
      this._targetIModel,
      allChildrenMap,
      targetElements,
    );

    // Get results to return
    const updatedElements: ChangedElementEntry[] = [];
    for (const element of elements) {
      const data = this._toQueryData(element);
      const directChildrenSet = new Set<ChangedElementQueryData>();
      // Find the children information from the map
      this._findDirectChildren(data.id, allChildrenMap, directChildrenSet);
      const allChildrenSet = new Set<ChangedElementQueryData>();
      this._findRecursiveChildrenFromQueryData(
        data,
        allChildrenMap,
        allChildrenSet,
      );
      const directChildren = [...directChildrenSet];
      // Filter all children to not contain the current element as its own child element
      const allChildren = [...allChildrenSet].filter((ceqd: ChangedElementQueryData) => element.id !== ceqd.id);
      const hasChangedChildren = this._hasChangedChildrenFromData(allChildren);
      // Update cache
      this._cache.set(element.id, {
        directChildren,
        allChildren,
        hasChangedChildren,
      });
      // Push to return array
      updatedElements.push(
        this._populateEntryWith(
          element,
          directChildren.map(this._toId),
          allChildren.map(this._toId),
          hasChangedChildren,
        ),
      );
    }

    return updatedElements;
  }

  protected _has(id: string): boolean {
    return this._cache.has(id);
  }

  /** For testing purposes */
  public has(id: string): boolean {
    return this._has(id);
  }

  /** Returns true if all entries are in the cache */
  protected _containedInCache(elements: ChangedElementEntry[]): boolean {
    return elements.every((entry: ChangedElementEntry) => this._cache.has(entry.id));
  }

  private _populateEntryWith(
    element: ChangedElementEntry,
    directChildren: string[],
    allChildren: string[],
    hasChangedChildren?: boolean,
  ) {
    const elementType =
      element.elementType ??
      (hasChangedChildren
        ? ChangeElementType.Assembly
        : ChangeElementType.Element);
    return {
      ...element,
      elementType,
      children: allChildren,
      directChildren,
      hasChangedChildren,
      hasChildren: hasChangedChildren,
    };
  }

  /**
   * Returns the entry updated with children data
   * @param element ChangedElementEntry to update
   */
  private _populateEntry(element: ChangedElementEntry): ChangedElementEntry {
    const parentData = this._cache.get(element.id);
    if (parentData === undefined) {
      return element;
    }

    const directChildren = parentData?.directChildren.map((data: ChangedElementQueryData) => data.id);
    const children = [...(parentData?.allChildren ?? [])].map((data: ChangedElementQueryData) => data.id);
    const hasChangedChildren = this._hasChangedChildren(children);
    return this._populateEntryWith(
      element,
      directChildren,
      children,
      hasChangedChildren,
    );
  }

  /**
   * @param element Element to check
   * @returns True if element has changed children or has actual change in it
   */
  private _elementHasChange = (element: ChangedElementEntry) => {
    return element.indirect === false || element.hasChangedChildren === true;
  };

  /**
   * Returns an updated array with the child elements populated
   * @param elements ChangedElementEntry array to update
   */
  protected _populateEntries(elements: ChangedElementEntry[]): ChangedElementEntry[] {
    const updatedElements: ChangedElementEntry[] = [];
    elements.forEach((entry: ChangedElementEntry) => {
      const newEntry = this._populateEntry(entry);
      if (this._elementHasChange(newEntry)) {
        updatedElements.push(newEntry);
      }
    });
    return updatedElements;
  }
}
