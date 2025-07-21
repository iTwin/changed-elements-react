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

  /**
   * Creates a key for the ChangedECInstance based on its Id and Class Id
   * @param instance ChangedECInstance to create a key for
   * @returns Key string for the ChangedECInstance in the cache, formatted as "instanceId:classId"
   */
  private _getKey(instance: ChangedECInstance): string {
    return `${instance.ECInstanceId}:${instance.ECClassId}`;
  }

  /**
   * Initializes the cache with the given ChangedECInstances
   * The cache will be cleared before adding the instances
   * @param instances
   */
  public initialize(instances: ChangedECInstance[]): void {
    this._cache.clear();
    for (const instance of instances) {
      this._cache.set(this._getKey(instance), instance);
    }
  }

  /**
   * Add instance to the cache
   * @param instance ChangedECInstance to add to the cache
   */
  public add(instance: ChangedECInstance): void {
    this._cache.set(this._getKey(instance), instance);
  }

  /**
   * Gets the ChangedECInstance from the cache based on the instanceId and classId
   * @param instanceId Id of the instance to get
   * @param classId Class Id of the instance to get
   * @returns ChangedECInstance if found, undefined otherwise
   */
  public get(instanceId: Id64String, classId: Id64String): ChangedECInstance | undefined {
    const key = `${instanceId}:${classId}`;
    return this._cache.get(key);
  }

  /**
   * Returns whether the cache contains the ChangedECInstance with the given instanceId and classId
   * @param instanceId Id of the instance to check
   * @param classId Class Id of the instance to check
   * @returns true if the cache contains the instance, false otherwise
   */
  public has(instanceId: Id64String, classId: Id64String): boolean {
    const key = `${instanceId}:${classId}`;
    return this._cache.has(key);
  }

  /**
   * Similar to get, but uses the ChangedElementEntry to find the instance
   * @param entry ChangedElementEntry to use for finding the instance
   * @returns ChangedECInstance if found, undefined otherwise
   */
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

  /**
   * Clears the cache of all ChangedECInstances
   */
  public clear(): void {
    this._cache.clear();
  }
}
