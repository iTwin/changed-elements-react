/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { BeEvent } from "@itwin/core-bentley";
import { IModelConnection } from "@itwin/core-frontend";
import { Opcode } from "../api/changedElementsApi";
import { VersionCompareManager } from "../VersionCompareManager";
import { ChangesTreeDataProvider } from "./ChangesTreeDataProvider";

export interface ChangedElementEntry extends ChangedElement {
  label?: string;
  elementType?: ChangeElementType;
  hasChangedChildren?: boolean;
  children?: string[];
  directChildren?: string[];
  loaded: boolean;
  indirect?: boolean;
}

export enum ChangeElementType {
  Element,
  Assembly,
  TopAssembly,
}

export interface ChangedElement {
  id: string;
  classId: string;
  opcode: Opcode;
  type: number;
  modelId?: string;
  parent?: string;
  parentClassId?: string;
  properties?: Map<string, Checksums>;
}

export interface Checksums {
  newChecksum: number | undefined;
  oldChecksum: number | undefined;
}

/** Cache for changed element entries that are maintained and populated with labels as we load labels with the cache */
export class ChangedElementEntryCache {
  constructor(private _manager: VersionCompareManager) { }

  public changedElementEntries = new Map<string, ChangedElementEntry>();
  public dataProvider: ChangesTreeDataProvider | undefined = undefined;

  /**
   * Initialize the changed elmeent entry cache with a bunch of changed elmeents.
   * @param elements Map of changed elements
   */
  public initialize(
    _currentIModel: IModelConnection,
    _targetIModel: IModelConnection,
    _elements: Map<string, ChangedElement>,
    _progressLoadingEvent?: BeEvent<(message: string) => void>,
  ): void { }

  public cleanup(): void { }

  /** Returns true if an entry has been fully loaded (e.g. we have already loaded its child elements and label). */
  public isLoaded = (entry: ChangedElementEntry): boolean => {
    return entry.loaded && entry.directChildren !== undefined && entry.label !== undefined;
  };

  /**
   * Loads the given entries by querying for their labels and children.
   * @param loadDirectChildren whether to load the direct children of the entries too
   * @returns true if load was successful
   */
  public loadEntries = async (_entries: ChangedElementEntry[], _loadDirectChildren?: boolean): Promise<boolean> => {
    return true;
  };

  /**
   * Initially loads the given element ids to be visualized and displayed in UI.
   * @param elementIds
   */
  public async initialLoad(_elementIds: string[]): Promise<void> {
    this.dataProvider = new ChangesTreeDataProvider(this._manager);
  }

  /** Gets all entries at the moment, loaded or not loaded. */
  public getAll(): ChangedElementEntry[] {
    return [];
  }

  public getCached(_ids: string[]): ChangedElementEntry[] {
    return [];
  }

  /**
   * Returns the ChangedElementEntry array that relates to the element Ids. This will return whatever is in the cache at
   * the moment.
   * @param elementIds Set of element ids to return entries for
   * @param wantChildren If true, will also return entries for the children
   */
  public getEntries(elementIds: Set<string>, wantChildren?: boolean): ChangedElementEntry[] {
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
}
