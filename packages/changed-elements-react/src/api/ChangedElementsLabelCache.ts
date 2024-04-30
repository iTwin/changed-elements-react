/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { DbOpcode } from "@itwin/core-bentley";
import { IModelApp, IModelConnection } from "@itwin/core-frontend";
import type { InstanceKey } from "@itwin/presentation-common";
import { PresentationLabelsProvider as LabelsProvider } from "@itwin/presentation-components";

import { ChangedElementDataCache } from "./ChangedElementDataCache.js";
import type { ChangedElementEntry } from "./ChangedElementEntryCache.js";

/** Cache for labels of changed elements, these labels may exist in either compared iModel Connections */
export class ChangedElementsLabelsCache extends ChangedElementDataCache {
  private _cache = new Map<string, string>();
  private _currentLabelsProvider: LabelsProvider;
  private _targetLabelsProvider: LabelsProvider;

  constructor(currentIModel: IModelConnection, targetIModel: IModelConnection) {
    super();
    this._currentLabelsProvider = new LabelsProvider({ imodel: currentIModel });
    this._targetLabelsProvider = new LabelsProvider({ imodel: targetIModel });
  }

  /** Request labels and cache them */
  protected async _request(elements: ChangedElementEntry[]): Promise<ChangedElementEntry[]> {
    const currentElements = elements.filter(
      (elem: ChangedElementEntry) => elem.opcode === DbOpcode.Update || elem.opcode === DbOpcode.Insert);
    const targetElements = elements.filter((elem: ChangedElementEntry) => elem.opcode === DbOpcode.Delete);
    // Create instance keys for elements in the current IModelConnection
    const currentInstanceKeys: InstanceKey[] = currentElements.map(
      (entry: ChangedElementEntry) => {
        return {
          id: entry.id,
          className:
            entry.classFullName !== undefined && entry.classFullName !== ""
              ? entry.classFullName
              : "BisCore:Element",
        };
      },
    );
    // Create instance keys for elements in the target IModelConnection
    const targetInstanceKeys: InstanceKey[] = targetElements.map(
      (entry: ChangedElementEntry) => {
        return {
          id: entry.id,
          className:
            entry.classFullName !== undefined && entry.classFullName !== ""
              ? entry.classFullName
              : "BisCore:Element",
        };
      },
    );
    const noLabel = IModelApp.localization.getLocalizedString(
      "VersionCompare:versionCompare.noLabel")
    const tryGetLabels = async (keys: InstanceKey[], labelsProvider: LabelsProvider) => {
      try {
        return await labelsProvider.getLabels(keys);
      } catch (error) {
        return keys.map(() => noLabel);
      }
    }
    const currentLabels = await tryGetLabels(currentInstanceKeys,this._currentLabelsProvider);
    const targetLabels = await tryGetLabels(targetInstanceKeys,this._targetLabelsProvider);
      currentLabels.forEach((label: string, index: number) => {
        currentElements[index].label = label;
      });
      targetLabels.forEach((label: string, index: number) => {
        targetElements[index].label = label;
      });
      const updatedElements = [...currentElements, ...targetElements];
      updatedElements.forEach((value: ChangedElementEntry) => {
        if (value.label) {
          this._cache.set(value.id, value.label);
        }
      });
      return updatedElements;
  }

  protected _has(id: string): boolean {
    return this._cache.has(id);
  }

  /** Returns true if all entries are in the cache */
  protected _containedInCache(elements: ChangedElementEntry[]): boolean {
    return elements.every((entry: ChangedElementEntry) => this._cache.has(entry.id));
  }

  protected _populateEntries(elements: ChangedElementEntry[]): ChangedElementEntry[] {
    const updatedElements: ChangedElementEntry[] = [];
    elements.forEach((entry: ChangedElementEntry) => {
      updatedElements.push({
        ...entry,
        label: this._cache.get(entry.id),
      });
    });
    return updatedElements;
  }

  /** Testing only: returns the number of labels cached so far */
  public getCachedLabelCount() {
    return this._cache.size;
  }

  /** Obtains the labels and return entries with updated labels */
  public async populateLabels(elements: ChangedElementEntry[]): Promise<ChangedElementEntry[]> {
    return this.populateEntries(elements);
  }
}
