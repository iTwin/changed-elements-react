/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import { Id64String } from "@itwin/core-bentley";
import { ChangedECInstance } from "./VersionCompare.js";
import { ChangedElementEntry } from "./ChangedElementEntryCache.js";

/**
 * Used to maintain the ChangedECInstances when using a custom changesProvider
 * Useful to correlate the ChangedElementEntry with the ChangedECInstance
 */
export class ChangedECInstanceCache {
  private readonly _cache: Map<Id64String, ChangedECInstance>;

  constructor() {
    this._cache = new Map<Id64String, ChangedECInstance>();
  }

  private _getKey(instance: ChangedECInstance): string{
    return `${instance.ECInstanceId}:${instance.ECClassId}`;
  }

  public initialize(instances: ChangedECInstance[]): void {
    this._cache.clear();
    for (const instance of instances) {
      this._cache.set(this._getKey(instance), instance);
    }
  }

  public add(instance: ChangedECInstance): void {
    this._cache.set(this._getKey(instance), instance);
  }

  public get(instanceId: Id64String, classId: Id64String): ChangedECInstance | undefined {
    const key = `${instanceId}:${classId}`;
    return this._cache.get(key);
  }

  public has(instanceId: Id64String, classId: Id64String): boolean {
    const key = `${instanceId}:${classId}`;
    return this._cache.has(key);
  }

  public getFromEntry(entry: ChangedElementEntry): ChangedECInstance | undefined {
    return this.get(entry.id, entry.classId);
  }

  /**
   * Returns all ChangedECInstances that are present in the cache that match the entries
   * @param entries
   * @returns
   */
  public mapFromEntries(entries: ChangedElementEntry[]): ChangedECInstance[] {
    const instances: ChangedECInstance[] = [];
    for (const entry of entries) {
      const instance = this.get(entry.id, entry.classId);
      if (instance) {
        instances.push(instance);
      }
    }
    return instances;
  }

  public clear(): void {
    this._cache.clear();
  }
}
