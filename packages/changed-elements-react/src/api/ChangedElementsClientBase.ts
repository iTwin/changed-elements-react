/*---------------------------------------------------------------------------------------------
* Copyright (c) Bentley Systems, Incorporated. All rights reserved.
* See LICENSE.md in the project root for license terms and full copyright notice.
*--------------------------------------------------------------------------------------------*/
import type { ChangedElements } from "@itwin/core-common";

/**
 * Base class that can be used to inject a different type of Changed Elements Client
 * to be used for version comparison
 */
export abstract class ChangedElementsClientBase {
  /**
   * Should return an array of ChangedElements for each changeset Id ordered
   * from newest to oldest
   * @param contextId Context Id of iModel
   * @param iModelId iModel Id
   * @param startChangeSetId Start Changeset to query
   * @param endChangeSetId End changeset to query
   */
  public abstract getChangedElements(
    contextId: string,
    iModelId: string,
    startChangeSetId: string,
    endChangeSetId: string
  ): Promise<ChangedElements[]>;

  /**
   * Should return an array of changeset Ids that are available in the service for the
   * given iModel
   * @param contextId Context Id of iModel
   * @param iModelId iModel Id
   */
  public abstract getProcessedChangesets(
    contextId: string,
    iModelId: string
  ): Promise<string[]>;

  /**
   * [optional] Should check if the changeset data is already processed
   * This is only used when calling "prepareComparison" function
   * to ensure if the current changeset is processed
   * @param contextId Context Id of iModel
   * @param iModelId iModel Id
   * @param changesetId ChangeSet Id
   * @returns true if the changeset is processed already
   */
  public async isProcessed(
    _contextId: string,
    _iModelId: string,
    _changesetId: string,
  ): Promise<boolean> {
    return true;
  }
}
