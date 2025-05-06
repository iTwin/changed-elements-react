/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { ChangedElementEntry } from "./ChangedElementEntryCache.js";

/** Internal structure for splitting lists of changed element entries in processed and non-processed for label querying */
interface ProcessedSplit {
  processed: ChangedElementEntry[];
  nonProcessed: ChangedElementEntry[];
}

/**
 * Abstract class for handling delay loading information required for the UI workflows on changed elements
 * It takes input entries, requests and caches the results, then returns "filled" versions of the entries
 * with said results
 * Useful for delay-loading labels, child elements, parents, etc.
 */
export abstract class ChangedElementDataCache {
  /**
   * Called whenever a request is done in bulk mode, useful for UI update of progress
   */
  public updateFunction?: (pct: number) => void;

  constructor(protected _chunkSize: number = 500) {
    // No-op
  }

  /**
   * Request whatever this data cache pertains to and updates the entries to contain such data
   * This method should do a single backend call if possible
   * @param elements ChangedElementEntry array to update with information
   */
  protected abstract _request(
    elements: ChangedElementEntry[]
  ): Promise<ChangedElementEntry[]>;

  /**
   * Bulks up in chunks so that the request function is called with a subset of the elements
   * Useful to avoid going over backend requests limits
   * @param elements Elements to request for
   */
  protected async _requestBulk(elements: ChangedElementEntry[]): Promise<ChangedElementEntry[]> {
    if (elements.length < this._chunkSize) {
      return this._request(elements);
    }

    const result: ChangedElementEntry[] = [];
    for (let i = 0; i < elements.length; i += this._chunkSize) {
      const piece = await this._request(elements.slice(i, i + this._chunkSize));
      result.push(...piece);
      if (this.updateFunction) {
        this.updateFunction(Math.floor(i / elements.length * 100));
      }
    }
    return result;
  }

  /**
   * Returns the number of requests that will be necessary to populate the given number of entries
   * @param numEntries Number of changed element entries to populate
   */
  public calculateNumberOfRequests(numEntries: number): number {
    return this._chunkSize !== 0 ? numEntries / this._chunkSize + 1 : 0;
  }

  /**
   * Should return true if all the given entries are contained in the cache already
   * @param elements ChangedElementEntry array to check
   */
  protected abstract _containedInCache(
    elements: ChangedElementEntry[]
  ): boolean;

  /**
   * Should return true if the changed element entry with the given id has already been cached
   * @param id Id of changed element entry
   */
  protected abstract _has(id: string): boolean;

  /** Get non-processed entries in this array */
  protected _splitProcessed(elements: ChangedElementEntry[]): ProcessedSplit {
    const processed: ChangedElementEntry[] = [];
    const nonProcessed: ChangedElementEntry[] = [];
    elements.forEach((entry: ChangedElementEntry) => {
      if (this._has(entry.id)) {
        processed.push(entry);
      } else {
        nonProcessed.push(entry);
      }
    });

    return { processed, nonProcessed };
  }

  /**
   * Should use the already-cached information to update the entries with the data necessary (labels, children, etc)
   * @param elements ChangedElementEntry array to update with the caches' data
   */
  protected abstract _populateEntries(
    elements: ChangedElementEntry[]
  ): ChangedElementEntry[];

  /**
   * Takes some entries, requests to load whichever entries are not cached already, and returns
   * the array with the data already updated
   * @param elements ChangedElementEntry array to update with the caches' data
   */
  public async populateEntries(elements: ChangedElementEntry[]): Promise<ChangedElementEntry[]> {
    if (elements.length <= 0)
      return [];
    // If everything has been cached already, populate the data and return
    if (this._containedInCache(elements)) {
      return this._populateEntries(elements); //@naron: loading also doesnt get here for openPlant3
    }

    // Split the entries into the ones we have already cached and the ones we haven't
    const split = this._splitProcessed(elements);
    const requested = await this._requestBulk(elements);
    const alreadyCached =
      split.processed.length !== 0
        ? this._populateEntries(split.processed)
        : [];
    return [...alreadyCached, ...requested];
  }
}
